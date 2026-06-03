# User-Derived Agent Execution Standards

---
status: live
date: 2026-05-30
issue: "#495"
scope: Codex, Claude Code, Hermes, and AgenticOS managed-project execution behavior
privacy: distilled_only
---

## Purpose

This document distills repeated operator requirements from local Codex, Claude
Code, Hermes, and AgenticOS session records into reusable AgenticOS execution
standards. It exists so future agents can inherit the operator's durable
preferences without requiring the same instructions to be repeated in every
session.

The source material was user-authored input only. Assistant output, tool
results, injected system prompts, sub-agent boilerplate, and raw transcript
payloads are excluded from the standard.

## Source Coverage

The extraction pass scanned the local session surfaces available on
2026-05-30:

| Surface | Source pattern | Notes |
| --- | --- | --- |
| Codex | `~/.codex/sessions/2026/05/**/*.jsonl`, `~/.codex/archived_sessions/*.jsonl` | User messages from Codex desktop/CLI sessions |
| Claude Code | `~/.claude/projects/**/*.jsonl` | User messages from Claude Code project sessions |
| Hermes | `~/.hermes/sessions/*.jsonl`, `~/.hermes/sessions/*.json` | User messages from Hermes assistant sessions |
| AgenticOS captures | `.agent-workspace/projects/*/captures/conversations/*.md` and project `.context/conversations/*.md` | Used only as supporting continuity evidence; raw transcript publication remains out of scope |

The parser found 1,774 parseable files, 17,572 user messages, and 11,730
categorized standards-relevant hits. The largest recurring categories were
issue flow guardrails, Homebrew release completion, MCP project switching,
security/admin guardrails, Hermes routing, browser/OpenCLI usage, planning
review, knowledge distillation, and install/upgrade compatibility.

These numbers are audit evidence, not a requirement to preserve the original
messages. Raw transcripts must stay private unless a project's explicit context
publication policy allows otherwise.

## Extraction Method

The extraction used a conservative rule:

1. Read only records that could be attributed to the user/operator.
2. Remove tool output, assistant output, command dumps, injected policy blocks,
   sub-agent notifications, aborted turns, and very large payload artifacts.
3. Classify candidate messages by repeated intent categories.
4. Collapse duplicates into durable rules.
5. Match each rule against current AgenticOS standards before proposing new
   work.

The result is not a transcript summary. It is a standards delta extracted from
operator intent.

## Distilled Standards

### Project Routing

- AgenticOS MCP is the authority for project identity, project path, session
  binding, and workdir guidance.
- When the operator asks to switch, enter, continue, inspect, or create an
  AgenticOS project/topic, the first observable action should be AgenticOS MCP
  tool discovery or a direct AgenticOS MCP call.
- `cd`, shell directory search, Git branch inspection, or `pwd` alone must not
  be treated as project switching.
- After `agenticos_switch` or equivalent project resolution succeeds, all
  shell/tool operations should use the returned explicit workdir.
- If MCP is unavailable, the agent must say that AgenticOS switching did not
  complete and provide bootstrap/repair guidance instead of pretending success.

### Issue-First Development

- Implementation and bugfix work must be issue-first.
- The normal implementation path is:
  `status/switch -> preflight -> branch_bootstrap -> issue_bootstrap -> preflight -> edit_guard -> scoped edits -> tests -> pr_scope_check -> PR/MR -> CI -> merge -> cleanup`.
- Work must run in an isolated issue branch/worktree when guardrails redirect
  there.
- Dirty exploratory commits, stale worktrees, branches already merged upstream,
  and abandoned local work should be cleaned once verified as disposable.
- PRs/MRs should use merge commits when reversibility and auditability matter.
- Agents must not bypass the flow just because a task looks small.

### Git Host Neutrality

- Git-backed development policy is host-neutral. GitHub, GitLab, Gitee, and
  generic Git remotes should share the same local AgenticOS standard.
- Provider differences belong in adapter/evidence layers, not in a separate
  development policy.
- If a provider cannot prove PR/MR approvals or CI status through a bundled
  adapter, the agent must record manual or host-side evidence rather than
  weakening the workflow.

### Planning And Review

- Design, architecture, routing, lifecycle, release, and integration questions
  should enter analysis/Plan Mode before implementation.
- Non-trivial plans and risky fixes should receive sub-agent review using an
  explicit inheritance packet and verification expectation.
- Agents should synthesize the operator's fragmented intent into a clean plan,
  but should stop and ask when intent, trusted data source, or scope cannot be
  resolved.
- Analysis must be evidence-first: collect repository state, open issues,
  current standards, and relevant runtime behavior before drawing conclusions.

### Release And Homebrew Completion

- A release is not complete merely because code is merged.
- For Homebrew-distributed projects, release completion means:
  remote code is pushed, the version tag/release exists, the Homebrew tap or
  formula path is updated, and local Homebrew install/upgrade verification has
  been run or explicitly blocked with evidence.
- PATs and secrets must never be requested in chat or written to the repo.
  Secret setup should be represented as a checklist, required permission scope,
  and verification command.
- If automation cannot bump Homebrew because a secret is absent or invalid, the
  release record must say so and either use a manual tap update or leave an
  explicit pre-release blocker.

### Lifecycle Compatibility

- Changes that touch install, upgrade, bootstrap, generated templates, runtime
  config, external integrations, local services, persisted state, or operator
  workflows require lifecycle impact analysis before implementation.
- Existing AgenticOS installations must remain compatible by default.
- Normal upgrades must not silently mutate operator runtime config or persisted
  state.
- Required migrations or repairs must be previewable where practical,
  auditable, and documented with rollback or recovery guidance.
- If an agent/runtime restart is required after upgrade, the release or rollout
  instructions must state that requirement explicitly.

### Hermes Routing And Worker Delegation

- Hermes is primarily a lightweight personal/work assistant and router. Heavy
  project work should be delegated to Codex or Claude Code workers under
  AgenticOS guardrails.
- Hermes Agent support is peer-agent support: MCP availability plus an
  AgenticOS activation Skill. It does not imply Discord, a gateway, or thread
  routing.
- In external assistant/channel language, topics and projects may both be
  called projects. Internally, AgenticOS may still distinguish kind or routing
  metadata.
- Discord is the current optional threaded channel surface for
  project-oriented routing. Feishu thread routing is out of scope unless
  reopened as a separate integration.
- A project command in a Discord job channel should create or reuse a project
  cockpit thread and route subsequent messages in that thread to the same
  project context.
- Worker startup defaults to Codex unless the user explicitly asks for Claude
  Code or another backend.
- Worker progress should be observable inside the project/job thread. The
  origin channel should receive a thread link or clear routing status.
- Hermes Agent activation and Discord channel routing are independently
  optional. Machines without Hermes or Discord must keep the normal AgenticOS
  MCP workflow.

### Durable Topics, Knowledge, And State

- Personal/work assistant topics that require continuity should become durable
  AgenticOS projects/topics with tasks, state, and distilled knowledge.
- Chat-only exchanges should remain lightweight and should not force project
  creation.
- AgenticOS owns active task/state continuity. GBrain-style knowledge layers
  should store distilled summaries, entities, references, and searchable links,
  not duplicate the active AgenticOS task board.
- Runtime captures should be promoted through a traceable distillation lifecycle
  into knowledge, task, or state updates. Unprocessed captures should be visible
  as freshness warnings rather than silently accumulating.
- Raw transcripts are private by default for public/shared repos; tracked
  knowledge must be distilled.

### Browser, Chrome, And OpenCLI Operations

- Browser/CDP/OpenCLI tasks that depend on the operator's logged-in state should
  use the active/default Chrome profile or the project's approved OpenCLI
  wrapper surface, not an arbitrary fresh browser profile.
- When a project ships a command wrapper for browser automation, agents should
  use that wrapper so credentials, profile selection, redaction, and audit
  behavior stay centralized.
- If browser automation cannot access the required authenticated state, the
  agent must report that limitation and request the intended setup path instead
  of attempting a fragile workaround.

### Security, Admin, And Dangerous Actions

- Destructive, externally visible, or admin-sensitive actions need explicit
  confirmation and code-level guardrails.
- Examples include deleting channels, mutating remote services, changing
  credentials, force-pushing, dropping data, and overwriting user-customized
  local files.
- Secrets, PATs, tokens, and private credentials must be configured through
  platform secret stores or local environment setup, never through committed
  files or chat logs.
- Guardrails should fail closed when project identity, issue scope, edit
  boundary, or operator authorization cannot be proven.

## Coverage Match Against Current Standards

| Extracted rule area | Existing coverage | Status | Action |
| --- | --- | --- | --- |
| MCP-first project switching | `AGENTS.md`, `CLAUDE.md`, AgenticOS skill, switch guardrail reports | Covered | Keep generated adapter surfaces aligned and verify after bootstrap upgrades |
| Issue-first worktree flow | `AGENTS.md`, guardrail protocol, `git-backed-development-workflow-standard-2026-05-28.md` | Covered | Continue using guardrail MCP tools as the enforcement layer |
| GitHub/GitLab/Gitee/generic Git neutrality | `git-backed-development-workflow-standard-2026-05-28.md` | Covered | Provider adapters may add evidence, but policy stays host-neutral |
| Sub-agent review protocol | `sub-agent-inheritance-protocol-2026-03-25.md` | Covered | Use for substantive reviews; parent remains responsible for persistence |
| Plan-before-implementation for ambiguous design | `AGENTS.md` task intake, lifecycle impact standard, agent execution loop | Partially covered | Consider adding a machine-checkable design/preflight checklist for architecture-heavy issues |
| Release includes Homebrew and local verification | `homebrew-distribution-standard.md`, Homebrew post-install docs | Partially covered | Add release checklist enforcement that distinguishes merge, tag, tap bump, and local install verification |
| Secret/PAT handling | Homebrew distribution standard, lifecycle impact standard | Covered | Keep secrets out of chat/repo; represent setup as checklist and verification |
| Installed-machine compatibility | `lifecycle-impact-analysis-standard-2026-05-28.md` | Covered | Treat missing lifecycle section as a review finding for affected changes |
| Discord channel project-thread routing | `hermes-discord-project-thread-rollout-2026-05-22.md`, Hermes routing scenario coverage | Covered for MVP | Keep Feishu thread routing explicitly out of MVP unless reopened |
| Topic/project unification in user-facing language | topic task contract, Hermes durable topic integration model | Partially covered | Update user-facing adapter wording when future project-kind metadata changes |
| Durable topic task/state/knowledge continuity | topic task contract, knowledge evolution audit, GBrain reference convention | Covered conceptually | Continue implementing health/ledger/task APIs and freshness warnings |
| Browser/OpenCLI active-profile rule | Project-specific OpenCLI skills and wrappers | Partial/missing at AgenticOS standard layer | Add a host-neutral browser automation credential/profile standard if this recurs across projects |
| Admin/dangerous external actions | General guardrails and careful operator practice | Partial/missing at AgenticOS standard layer | Add an external-admin-action guardrail standard for Hermes/channel/service mutations |

## Follow-Up Candidates

These are not required to close this issue, but they are the standards gaps most
worth tracking:

1. Release checklist enforcement for Homebrew-backed projects: distinguish
   merge, tag/release, tap/formula update, and local install verification.
2. Cross-project browser automation standard: active/default Chrome profile,
   OpenCLI wrapper preference, credential redaction, and failure reporting.
3. External admin action standard: explicit confirmation, authorization proof,
   dry-run where practical, and rollback guidance for Hermes/channel/service
   mutations.
4. Architecture/design preflight checklist: a lightweight machine-checkable
   gate for non-trivial design work before implementation begins.

## Operating Rule

Future agents should treat this document as distilled operator policy. If a
new request conflicts with it, the newer explicit user instruction wins for
that session, but durable deviations should be captured as a standards update
rather than becoming hidden prompt drift.
