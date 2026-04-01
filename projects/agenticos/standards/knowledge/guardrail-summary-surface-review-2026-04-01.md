# Guardrail Summary Entry Surface Review

> Issue: #94
> Date: 2026-04-01
> Status: decision complete

---

## Scope

Review all AgenticOS MCP entry surfaces. Decide which ones (beyond `agenticos_status` and `agenticos_switch`) should expose a compact guardrail summary.

---

## Current State

Compact guardrail summary (`buildGuardrailSummaryLines`) is active in:
- `agenticos_status` ✅
- `agenticos_switch` ✅

Both cases surface the latest guardrail command + status + timestamp at the moment an agent is orienting or reorienting itself. This is the proven pattern.

---

## Entry Surface Evaluation Matrix

| Surface | Role | Add guardrail summary? | Rationale |
|---------|------|----------------------|-----------|
| `agenticos_status` | Project orientation | ✅ Already present | Agent is explicitly reading context |
| `agenticos_switch` | Project switch | ✅ Already present | Agent is reorienting — guardrail state of new project matters |
| `agenticos_record` | Record session work | ✅ **Approve** | High-value catch: recording without a prior PASS preflight is a signal the session skipped the guardrail sequence. Showing a BLOCK/NONE summary at record time gives the agent a last-chance correction signal. |
| `agenticos_init` | Create new project | ❌ No | No guardrail state exists yet for a new project. Noise. |
| `agenticos_list` | List all projects | ❌ No | Per-project guardrail state would be noisy and orthogonal to the list purpose. |
| `agenticos_save` | Commit state to git | ❌ No | Save is a persistence operation, not an orientation step. Guardrail summary here would be duplicative noise after `agenticos_record`. |
| `agenticos_preflight` | Run preflight | ❌ No | This IS the guardrail. Its output is already the authoritative guardrail signal. |
| `agenticos_branch_bootstrap` | Bootstrap worktree | ❌ No | Downstream of preflight; already surfaces its own result. |
| `agenticos_pr_scope_check` | Validate PR scope | ❌ No | Already surfaces its own result. |
| `agenticos_edit_guard` | Block or allow edits | ❌ No | Already surfaces its own result. |
| `agenticos_health` | Runtime health check | ❌ No | Diagnostic tool; guardrail state is already visible via status. Adding it here would duplicate without improving safety. |
| `agenticos_entry_surface_refresh` | Regenerate AGENTS/CLAUDE.md | ❌ No | Maintenance tool, not an execution entry point. |
| `agenticos_standard_kit_*` | Standard kit operations | ❌ No | Infrastructure tools, not execution entry points. |
| `agenticos_non_code_evaluate` | Non-code work evaluation | ❌ No | Evaluation tool for a specific work type; not an orientation surface. |

---

## Decision

**Approved for rollout: `agenticos_record` only.**

**Rationale**: Recording session work without having run a preflight is the observable symptom of a bypass incident (as identified in #112 RCA). Adding a compact guardrail summary to `agenticos_record` output gives agents a correction signal at the one moment where a missing preflight is still actionable — before the session ends and state is committed.

All other candidate surfaces either already handle their own guardrail output, are maintenance tools, or would produce noise without a corresponding safety improvement.

**Stop condition for this pass**: Do not extend beyond `agenticos_record`. If future incident analysis surfaces another surface where the summary materially improves recovery or prevents a bypass class, open a new scoped issue.

---

## Approved Rollout

| Surface | Change | Priority |
|---------|--------|----------|
| `agenticos_record` | Append compact guardrail summary to output when latest guardrail is missing or BLOCK | High |

---

## Rejected Surfaces (explicit non-goals)

- `agenticos_list`: per-project guardrail status creates noise, not safety
- `agenticos_save`: save is persistence, not orientation
- `agenticos_health`: duplicates status without recovery value
- All guardrail tools themselves: already surface their own results
