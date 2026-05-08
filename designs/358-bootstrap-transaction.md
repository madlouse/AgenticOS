# Design: Bootstrap Transaction Model

**Issue**: #358
**Author**: Jeking.Hwang
**Status**: Draft

## Context

AgenticOS upgrade/bootstrap currently operates as a best-effort sequence across:
- package install / Homebrew upgrade
- `AGENTICOS_HOME` selection
- per-client MCP registration (Claude Code, Codex, Cursor, Gemini)
- client restart / MCP transport reload
- entry surface refresh
- runtime persistence via `agenticos_record` / `agenticos_save`

Partial failures leave users believing the system is fully upgraded when it is not. The worst case: silent partial activation where one client works but others don't.

## Design Goals

1. **Explicit state** — bootstrap progress is modeled as a transaction with phases
2. **Verifiable** — `agenticos-bootstrap --verify` returns actionable status per client
3. **Actionable recovery** — each failure includes retry command
4. **Single answer** — users can run one command to check "is runtime fully active?"

## Transaction Phases

```
┌─────────────────────────────────────────────────────────────┐
│  BootstrapTransaction Phases                                │
├─────────────────────────────────────────────────────────────┤
│  1. package_installed     ✓ package binary present         │
│  2. workspace_selected     ✓ AGENTICOS_HOME valid           │
│  3. client_config_written  ✓ MCP config file updated        │
│  4. client_config_verified ✓ `mcp get` confirms reg        │
│  5. client_restart_required ✓ client needs restart signal   │
│  6. mcp_transport_verified ✓ MCP handshake succeeds        │
│  7. entry_surfaces_checked ✓ CLAUDE.md/AGENTS.md present   │
│  8. runtime_persistence_ok ✓ record/save accessible        │
│  9. complete              ✓ fully operational              │
└─────────────────────────────────────────────────────────────┘
```

## Data Model

```typescript
interface BootstrapTransaction {
  id: string;                    // UUID
  started_at: string;            // ISO timestamp
  updated_at: string;
  status: 'in_progress' | 'complete' | 'partial_failure' | 'failed';
  agent_id: SupportedAgentId;
  phases: PhaseResult[];
  workspace: string;
  runtime_version: string;
}

interface PhaseResult {
  phase: PhaseId;
  status: 'pending' | 'in_progress' | 'success' | 'failed' | 'skipped';
  evidence?: string;              // command output or file content
  error?: string;                 // error message if failed
  retry_command?: string;         // actionable recovery
  requires_user_action?: boolean;
  safe_to_continue?: boolean;
}

type PhaseId =
  | 'package_installed'
  | 'workspace_selected'
  | 'client_config_written'
  | 'client_config_verified'
  | 'client_restart_required'
  | 'mcp_transport_verified'
  | 'entry_surfaces_checked'
  | 'runtime_persistence_ok'
  | 'complete';
```

## Storage Location

Transactions stored in:
```
${AGENTICOS_HOME}/.agent-workspace/bootstrap-transactions/
  {agent_id}/
    latest.json           # most recent transaction
    {transaction_id}.json # full history
```

## CLI Interface

### `agenticos-bootstrap --verify`
Validates all registered clients, outputs actionable status:

```bash
$ agenticos-bootstrap --verify

AgenticOS Bootstrap Verification
================================

✅ Claude Code:
   - package:     0.4.14 ✓
   - workspace:   /Users/jeking/dev/AgenticOS ✓
   - config:      registered ✓
   - transport:   MCP handshake OK ✓

⚠️ Codex:
   - package:     0.4.14 ✓
   - workspace:   /Users/jeking/dev/AgenticOS ✓
   - config:      registered ✓
   - transport:   NOT VERIFIED (requires restart)

   Recovery:  Run `codex restart` then re-run verification

❌ Gemini CLI:
   - package:     0.4.14 ✓
   - workspace:   /Users/jeking/dev/AgenticOS ✓
   - config:      NOT FOUND
   - transport:   N/A

   Recovery:  Run `agenticos-bootstrap --agents gemini-cli`

================================
Summary: 1/3 clients fully operational
Run with --detail for full evidence
```

### `agenticos-bootstrap --agents {agent} --first-run`
Runs full bootstrap for specified agent with transaction tracking.

### `agenticos-status` Integration
When switching projects or running status, surface unresolved bootstrap failures prominently:

```
⚠️ Bootstrap Incomplete
   Codex: client restart required
   Run: agenticos-bootstrap --verify
```

## Implementation Phases

### Phase 1: Core Infrastructure
1. Create `bootstrap-transaction.ts` with types and state machine
2. Add `BootstrapTransactionManager` class
3. Add CLI `--verify` flag to `bootstrap.ts`
4. Add transaction storage to `.agent-workspace/`

### Phase 2: Per-Agent Verification
1. Implement `verifyAgentRegistration(agentId)` for each supported agent
2. Implement `verifyMcpTransport(agentId)` - attempt MCP handshake
3. Add evidence collection per phase

### Phase 3: Status Integration
1. Update `agenticos_status` to surface bootstrap failures
2. Update `agenticos_switch` to warn about incomplete bootstrap
3. Update `agenticos_preflight` to check bootstrap health

### Phase 4: Documentation
1. Update caveats in Homebrew formula
2. Add `agenticos-bootstrap --verify` to post-install checklist
3. Document partial failure recovery path

## Migration Path

Existing `.agent-workspace/bootstrap-state.yaml` can be deprecated:
1. New transactions supersede bootstrap-state
2. Read bootstrap-state for backwards compatibility during transition
3. Write new transaction format going forward
4. Remove bootstrap-state in v0.5.x

## Acceptance Criteria

- [ ] `agenticos-bootstrap --verify` validates all registered clients
- [ ] `agenticos_status` surfaces bootstrap partial failures prominently
- [ ] Each failed phase includes actionable retry command
- [ ] Transaction history preserved for debugging
- [ ] Single command answers: "Is AgenticOS fully active for client X?"

## Open Questions

1. Should transaction failures block `agenticos_switch`?
2. How to handle clients that don't expose verification commands?
3. Should we auto-retry failed phases or require manual intervention?
4. How to handle partial upgrades (package upgraded but client not restarted)?

## Related Files

- `mcp-server/src/utils/bootstrap-cli.ts` — existing bootstrap logic
- `mcp-server/src/bootstrap.ts` — CLI entry point
- `mcp-server/src/tools/status.ts` — status tool
