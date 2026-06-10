# Continuity Memory

## 1. Overview

Continuity memory is the reason AgenticOS exists: agents should not require the
user to re-explain project state every session. AgenticOS records operational
state, decisions, outcomes, pending work, cases, knowledge, and distilled
continuity.

Public surfaces:

- `agenticos_record`
- `agenticos_save`
- `agenticos_record_case`
- `agenticos_list_cases`
- `agenticos_status`
- `agenticos_health`
- distillation ledger and sidecar captures

User value: a future session can resume with project context, current task,
decisions, and relevant knowledge without raw transcript dumping.

## 2. Detailed Design

Continuity is intentionally layered:

- `.context/state.yaml` stores mutable operational state.
- `.context/quick-start.md` provides fast entry orientation.
- `knowledge/` stores durable distilled insights.
- `tasks/` stores actionable work.
- private sidecars store raw captures when publication policy requires privacy.
- distillation ledger tracks capture promotion lifecycle.

Invariants:

- Raw transcript material should not be published into public project knowledge.
- State refresh should reflect important task/session transitions.
- Recording from isolated worktrees must write tracked continuity into the
  correct checkout and private captures into the runtime sidecar.
- Health/status should warn when state, knowledge, tasks, or adapters are stale.

Failure modes:

- Captures accumulate without promotion or explicit ignore reason.
- Agent records to canonical main when it should record to an issue worktree.
- Registry/session binding is lost across MCP reconnect.
- Freshness warnings are too quiet to affect agent behavior.

## 3. Implementation Mapping

| Surface | Files/Tests | Notes |
| --- | --- | --- |
| Recording | `mcp-server/src/tools/record.ts`, `record.test.ts`, `record-capture.test.ts` | Captures session summaries and continuity. |
| Saving | `mcp-server/src/tools/save.ts`, `save.test.ts` | Commits/pushes tracked continuity. |
| Cases | `mcp-server/src/tools/case.ts`, `case.test.ts`, `case-knowledge.test.ts` | Structured bad/corner case knowledge. |
| Ledger | `mcp-server/src/utils/distillation-ledger.ts`, `distillation-ledger.test.ts` | Capture promotion lifecycle. |
| Health | `mcp-server/src/utils/knowledge-evolution-health.ts`, `health.ts`, tests | Freshness and drift warnings. |
| Entry refresh | `mcp-server/src/tools/entry-surface-refresh.ts`, `entry-surface-refresh.test.ts` | Deterministic quick-start/state refresh. |

Issue cluster: 32 continuity issues. Open gaps are `#517`, `#516`, and `#514`.

Status: implemented with active health warnings; needs stronger reconnect and
freshness behavior.

## Gaps

- `#516`: persist active session project binding across MCP reconnect.
- `#517`: make freshness/drift warnings more visible in status and switch.
- `#514`: unify checkout identity resolution across record/save/guardrails.
