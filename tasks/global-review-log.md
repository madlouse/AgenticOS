# Global Review Log

| PR | Agents | Recommendation | Findings | Date |
|---|---|---|---|---|
---
## PR #369 — 2026-05-08T06:58:00.803Z

**Agents:** Code Reviewer, Architecture Reviewer, QA Expert | **Overall:** REQUEST_CHANGES | **Duration:** 169154ms

### ✅ Code Reviewer

**Summary:** The design document provides a solid conceptual framework for modeling bootstrap as a verifiable transaction, directly addressing the issue of silent partial failures. However, several technical gaps need clarification before implementation—particularly around Phase 5's semantic meaning, MCP handshake verification mechanics, transaction scope across workspaces, and storage lifecycle management. Resolving these will ensure the implementation can handle real-world edge cases like concurrent agents

**Findings (9):**
- ??Phase 5 naming inconsistency?? ?line 36?: ?client?restart?required? is labeled as a phase but represents a state/flag rather than a verification step. It doesn't have a clear verification criterion—what specifically indicates "restart required"?
- ??Redundant status tracking?? ?line 68-77?: ?PhaseId? includes ?'complete'? as a phase, but the parent ?BootstrapTransaction? already has a ?status? field with ?'complete'? value. This creates ambiguity—is ?complete? a phase outcome or a transaction-level status?
- ??Transaction scope ambiguity?? ?line 84-88?: Storage path uses ?{agent?id}/latest.json?, but a transaction is per-agent-per-workspace. If users switch workspaces, should transactions be namespaced by workspace? The current path doesn't account for workspace isolation.
- ??No cleanup strategy??: Transaction history grows indefinitely at ?{transaction?id}.json?. No TTL, max count, or size-based cleanup policy is specified.
- ??MCP handshake verification gap?? ?Phase 2, line 149-150?: The design mentions ?verifyMcpTransport?agentId?? to "attempt MCP handshake" but provides no technical details on HOW this verification works—which client commands exist, how to interpret results, what constitutes a successful handshake.
- ??Inconsistent agent identifiers?? ?line 101-125?: Example output shows "Claude Code:" with a space, but the ?PhaseId? type uses ?'claude-code'? with a hyphen. No mapping between display labels and internal IDs.
- ??Unresolved ?codex restart? assumption?? ?line 113?: The example shows ?codex restart? as recovery, but this command may not exist for all agents. Cursor especially lacks standard restart mechanisms.
- ??Edge case: corrupted config files?? ?missing?: No handling specified for when agent config files contain malformed JSON during ?client?config?verified?.
- ??Concurrency not addressed?? ?missing?: If ?--verify? runs simultaneously across multiple agents, no locking or atomic write strategy is defined for transaction storage.

**Recommendations (8):**
- Rename Phase 5 to something like ?client?restart?pending? and define explicit verification criteria ?e.g., checking if config timestamp ? last process start time, or existence of restart signal file?.
- Remove ?'complete'? from ?PhaseId? union; use the transaction-level ?status: 'complete'? to indicate final state.
- Add workspace to transaction storage path: ?{agent?id}/{workspace?hash}/latest.json? or require workspace as a transaction field.
- Add an Implementation Note section explaining MCP transport verification implementation—for example, using ?mcp get? for Claude Code, testing stdio connection with a ping/pong handshake for others.
- Define a cleanup policy: "Transactions older than 30 days are pruned" or "Keep last 100 transactions per agent."
- Add explicit agent label mapping in the Data Model section: ?type AgentLabel = { ?K in SupportedAgentId?: string }? or document the display convention.
- Add error handling section for corrupted config files with specific recovery commands.
- Add concurrency handling: use file locking or write to temp file + atomic rename for transaction writes.

### ✅ Architecture Reviewer

**Summary:** This design document is well-structured and addresses a real pain point ?silent partial bootstrap failures?, but from a QA perspective it is incomplete. The lack of test scenarios, rollback semantics, concurrent-access safeguards, and timeout/error handling creates significant regression risk and edge-case gaps. Before implementation, the open questions should be resolved with explicit behavioral specs, not deferred as implementation details.

**Findings (10):**
- ??Missing test strategy??: The design document defines acceptance criteria but does not include test scenarios, test levels ?unit/integration/e2e?, or coverage targets for the ?BootstrapTransactionManager? and verification logic.
- ??No rollback plan for transactions??: The design lacks a mechanism to roll back a failed phase or abort the transaction cleanly. If phase 3 ??client?config?written?? succeeds but phase 4 ??client?config?verified?? fails, there's no spec for whether phase 3's side effects should be undone.
- ??Concurrent access not addressed??: Multiple concurrent bootstrap runs targeting the same agent could race when writing ?latest.json?. The design stores transactions in flat JSON files without file locking or optimistic concurrency control.
- ??Disk-full / write failure handling missing??: If the transaction cannot be written to ?${AGENTICOS?HOME}/.agent-workspace/bootstrap-transactions/?, the behavior is undefined — verification could silently pass or fail.
- ??Open question ?2 is an edge case with no fallback??: "How to handle clients that don't expose verification commands?" is deferred, but the design should specify a graceful degradation path ?e.g., mark ?mcp?transport?verified? as ?skipped? with evidence showing the limitation?.
- ??Partial upgrade state is ambiguous??: The design mentions "partial upgrades ?package upgraded but client not restarted?" but doesn't define the transaction status for a client stuck in that state — it could be reported as ?in?progress? or ?partial?failure?, and downstream tools ??agenticos?switch?, ?agenticos?preflight?? would behave differently.
- ??No validation of retry?command??: The ?retry?command? field in ?PhaseResult? is user-facing and could be a shell command injection vector if the evidence comes from external sources. The design does not specify sanitization or allowlisting requirements.
- ??Migration path lacks rollback safety??: The backwards-compatible read of ?bootstrap-state.yaml? could be a one-way door — if the new format diverges semantically from the old one, old data may be misinterpreted without a version compatibility layer.
- ??No timeout or deadline for phase verification??: ?verifyMcpTransport?agentId?? could hang indefinitely if the client is unresponsive. The design should specify a timeout and failure behavior.
- ??Transaction history retention policy missing??: ?latest.json? and ?{transaction?id}.json? accumulate indefinitely. No lifecycle policy ?TTL, rotation, size cap? is defined, which could cause storage bloat.

**Recommendations (9):**
- Add explicit test scenarios for each ?PhaseId? status transition, including ?skipped?, ?failed?, and ?in?progress? states, before implementation.
- Define a transaction state machine diagram with explicit rollback rules for each phase — specify which phases are idempotent vs. have persistent side effects.
- Add file locking ?e.g., ?flock?? or atomic rename ??mv?? when writing ?latest.json? to prevent concurrent-writer corruption.
- Add explicit error handling for disk-full and permission-denied scenarios in the transaction write path; surface these as actionable errors rather than silent failures.
- For clients without verification commands, explicitly define the fallback: set ?mcp?transport?verified? status to ?skipped? with ?evidence: "verification command not available for {agent}"? and ?requires?user?action: false?.
- Add a version field to the transaction JSON schema so forward/backward compatibility can be validated when reading ?bootstrap-state.yaml?.
- Specify a configurable timeout ?default 30s? for ?verifyMcpTransport?; on timeout, set ?mcp?transport?verified? to ?failed? with a retry command.
- Define a retention policy: keep last 10 transactions per agent, or 7 days, whichever is smaller; prune older files automatically.
- Sanitize ?retry?command? before surfacing to users — treat it as potentially untrusted input and escape shell metacharacters.

### ✅ QA Expert

**Summary:** This design introduces a well-structured transaction model for bootstrap operations with clear acceptance criteria and a logical phase breakdown. However, it lacks critical specifications for test coverage, atomicity/rollback behavior, and edge case handling—particularly around clients without verification commands and concurrent execution safety. The migration path and transaction cleanup are underspecified, creating regression and maintenance risks. Before implementation, the design should be 

**Findings (8):**
- ??Missing test coverage specification??: The design document defines data models ??BootstrapTransaction?, ?PhaseResult?? and acceptance criteria, but contains no test scenarios, edge case coverage, or verification strategies for the transaction model itself. A design document for a stateful system like this should include test vectors for partial failure recovery, concurrent bootstrap attempts, and corrupted transaction state.
- ??No rollback/atomicity guarantees??: The design lists 9 sequential phases but provides no specification for transaction rollback if a phase fails mid-execution. If phase 3 ??client?config?written?? succeeds but phase 4 ??client?config?verified?? fails, there's no defined cleanup for the partially written config. This is a critical regression risk for users who experience partial failures.
- ??Open Question ?2 is an unmitigated edge case??: "How to handle clients that don't expose verification commands?" is marked as open but represents a fundamental capability gap. If a client ?e.g., future agent? cannot be verified, the entire verification workflow becomes unreliable. The design should specify a graceful fallback ?e.g., config-file existence check? rather than leaving this undefined.
- ??Race condition risk unaddressed??: Multiple concurrent ?agenticos-bootstrap? runs could produce conflicting transaction records. The storage model uses ?{transaction?id}.json? for history but doesn't specify locking or idempotency mechanisms. Concurrent first-run and verify operations could corrupt transaction state.
- ??Migration path has implicit regression risk??: The design states new transactions "supersede" ?bootstrap-state.yaml? and will be removed in v0.5.x, but doesn't specify how downgrade scenarios are handled. Users who upgrade to v0.4.x then downgrade to v0.3.x would lose transaction history that ?bootstrap-state? no longer receives updates for.
- ??Transaction expiration/cleanup unspecified??: Transactions accumulate in ?{agent?id}/{transaction?id}.json? indefinitely. No TTL, size limit, or cleanup policy is defined. Over time, the ?.agent-workspace? directory could grow unbounded, and historical transaction data may interfere with debugging current state.
- ??Incomplete retry command semantics??: ?PhaseResult.retry?command? is defined as a string, but the design doesn't specify: ?1? shell quoting/escaping strategy for complex commands, ?2? whether retry is automated or manual, ?3? how retry state is tracked across attempts. This ambiguity could lead to security issues if user-controlled values are embedded without sanitization.
- ??No specification for MCP handshake timeout??: Phase 6 ??mcp?transport?verified?? attempts an "MCP handshake" but doesn't define timeout values, retry intervals, or what constitutes a "failed" handshake. Network latency or transient failures could cause false negatives in verification output.

**Recommendations (8):**
- Add explicit test coverage section with scenarios: ?1? all phases succeed, ?2? single phase failure with recovery, ?3? concurrent bootstrap attempts, ?4? corrupted JSON transaction file recovery, ?5? client without verification command fallback
- Define rollback semantics: either implement atomic phase grouping ?phases 1-2 as atomic unit, phases 3-4 as atomic unit, etc.? or document that partial state is intentional and recoverable via retry commands
- For clients without verification commands, specify fallback to file-existence checks for config files ?e.g., check ??/.config/.../mcp.json? exists with correct content? rather than leaving this undefined
- Add file locking or transaction ID uniqueness constraints to prevent concurrent write corruption; consider ?flock?1?? or equivalent
- For migration path: maintain ?bootstrap-state.yaml? bidirectional sync until v0.5.x GA, then remove only after confirmed no downgrades occur from v0.4.x→v0.5.x users
- Specify transaction retention policy: e.g., keep last 10 transactions per agent or 30-day TTL with automatic cleanup
- Define retry command format as array of strings ??command: string???? rather than single string, and specify that values come from an allowlist of safe commands, never from phase evidence or error messages
- Add explicit timeout values ?e.g., 30s for MCP handshake? and retry count ?e.g., 3 attempts with exponential backoff? for network-dependent verifications