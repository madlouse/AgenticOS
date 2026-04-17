# Issue #300 Design Review: Stale Issue-Bootstrap Paths After Worktree Relocation

## Summary

`#297` fixed where issue worktrees are allowed to live.

`#300` is about what happens **after** a worktree is manually relocated or
normalized.

Today, `issue_bootstrap.latest.repo_path` is still treated in two incompatible
ways:

1. as a historical record of the checkout where bootstrap was recorded
2. as if it were still current-path proof for every later status/freshness read

That is the core design error.

The correct V1 model is:

- persisted bootstrap paths stay immutable as historical evidence
- status/health must explicitly evaluate whether that evidence is still valid
  for the **current checkout**
- live guardrail commands must still require an explicit rerun of
  `agenticos_issue_bootstrap` in the new checkout instead of silently
  reconciling history

## Current Evidence

The current gap was reproduced after normalizing `360teams` worktrees under the
project-scoped root:

- worktree topology now reports `PASS`
- expected root is `/Users/jeking/dev/AgenticOS/worktrees/360teams`
- the old misplaced worktree paths were removed or moved
- but the latest bootstrap record still points at the old checkout path

So the system ends up saying two different things at once:

- topology is correct
- latest bootstrap path still looks stale or mismatched

That is confusing because the first problem has been fixed while the second is
just a historical-evidence continuity problem.

## Current Semantics In Code

### `versioned-entry-surface-state.ts`

`assessVersionedEntrySurfaceState(...)` currently hard-codes this stale reason:

- `issue bootstrap repo_path still points at "<path>" instead of the canonical project root`

That means a historical worktree path is incorrectly treated as a canonical
freshness invariant.

### `project.ts`

`status` / `switch` currently render the latest bootstrap record directly and do
not distinguish:

- latest recorded bootstrap evidence
- bootstrap evidence that is still valid for the current checkout

The label logic is also tied to committed-snapshot freshness, so a runtime
bootstrap record can be shown under a “committed snapshot” label.

### `health.ts`

`health` has a `guardrail_evidence` presence gate and a committed entry-surface
freshness gate, but no dedicated bootstrap-continuity signal for the current
checkout.

### `preflight.ts` and `edit-guard.ts`

These tools currently do the right thing from a safety perspective:

- they fail closed when `latestBootstrap.repo_path !== current repo_path`

But their messaging is too generic. They do not distinguish:

- historical bootstrap recorded in an older checkout
- operator has relocated the worktree and simply needs to rerun bootstrap
- truly wrong checkout / wrong branch / wrong issue context

## Design Goal

Keep historical bootstrap evidence immutable, but stop treating historical paths
as if they were still current live proof for any later checkout.

The system should:

1. preserve `issue_bootstrap.latest.repo_path` as the original recorded path
2. explicitly evaluate whether that record is still valid for the current
   checkout
3. surface that evaluation in `status` and `health`
4. keep live guardrail enforcement fail-closed and require rerunning
   `agenticos_issue_bootstrap` in the current checkout

## Non-Goals

This issue should not:

- reopen `#297` worktree-root placement enforcement
- automatically move worktrees
- silently rewrite persisted historical bootstrap paths
- auto-reconcile old and new checkouts based only on branch name or HEAD
- expand into append-only bootstrap history
- change the guardrail trust model so that relocated worktrees become trusted
  without rerunning `agenticos_issue_bootstrap`

## Design Options

### Option A: Narrow Freshness Fix Only

Remove the canonical-root `repo_path` stale reason from
`versioned-entry-surface-state.ts`, and keep all other behavior unchanged.

Pros:

- smallest implementation
- fixes the most obviously wrong stale reason

Cons:

- `status` still does not explain whether the latest bootstrap is current or
  only historical
- `health` still has no machine-checkable bootstrap continuity signal
- relocation still looks like a generic mismatch in live guardrail commands

### Option B: Add Bootstrap Continuity As A First-Class Evaluation Layer

Introduce an explicit current-checkout evaluation for the latest bootstrap
record, and use it in `status`, `health`, and live guardrail recovery
messaging.

Pros:

- separates historical evidence from current-checkout validity
- keeps immutable history and fail-closed rerun semantics
- resolves the status/health ambiguity directly

Cons:

- slightly larger implementation slice
- requires new tests across multiple surfaces

## Recommendation

Recommend **Option B**.

Option A is too narrow for the issue statement and acceptance criteria.

`#300` is not just “remove one stale reason.” It is about defining the semantic
boundary between:

- the latest recorded bootstrap
- bootstrap evidence that is still valid for the current checkout

## Proposed V1 Contract

### 1. Historical bootstrap evidence stays immutable

`issue_bootstrap.latest` remains a point-in-time record.

In particular:

- `repo_path` remains the checkout path where bootstrap was recorded
- `startup_context_paths` remain the paths recorded at bootstrap time
- no status/health read is allowed to rewrite those paths

### 2. Add explicit bootstrap continuity evaluation

Add a shared helper, preferably in a new utility such as:

- `mcp-server/src/utils/issue-bootstrap-continuity.ts`

Suggested output shape:

```ts
type IssueBootstrapContinuityStatus =
  | 'current'
  | 'historical_for_current_checkout'
  | 'missing_or_invalid';

interface IssueBootstrapContinuityAssessment {
  status: IssueBootstrapContinuityStatus;
  summary: string;
  reasons: string[];
  recovery_actions: string[];
  details: {
    recorded_repo_path: string | null;
    current_repo_path: string | null;
    repo_path_exists: boolean | null;
    startup_context_paths_checked: number;
    missing_startup_context_paths: string[];
  };
}
```

### 3. Continuity rules

For V1, continuity is only about whether the latest bootstrap record still
counts as proof for the **current checkout path**.

Suggested rules:

- `current`
  - latest bootstrap exists
  - `repo_path` matches the current checkout path
  - any absolute `startup_context_paths` that are expected to exist still exist

- `historical_for_current_checkout`
  - latest bootstrap exists
  - but `repo_path` differs from the current checkout path, or
  - recorded startup context paths are missing / historical

- `missing_or_invalid`
  - no bootstrap exists, or
  - required bootstrap fields are missing / malformed

Important:

- this helper should **not** auto-upgrade `historical_for_current_checkout` to
  `current` by inspecting same-branch or same-HEAD heuristics
- explicit rerun remains required

### 4. Committed freshness semantics

`versioned-entry-surface-state.ts` should stop treating
`issue_bootstrap.latest.repo_path` as a canonical-root invariant.

Keep stale committed-snapshot signals that are genuinely about stale issue
context:

- `current_task.status === in_progress`
- `entry_surface_refresh.status === in_progress`
- `issue_bootstrap.current_branch !== main`
- `issue_bootstrap.workspace_type === isolated_worktree`

Remove the direct canonical-root mismatch reason:

- `issue bootstrap repo_path still points at "<path>" instead of the canonical project root`

Then, if needed, append a **path-aware** stale reason only through the new
continuity helper, not through a raw canonical-root string comparison.

### 5. `status` / `switch` rendering

`project.ts` should render bootstrap continuity explicitly.

Suggested output pattern:

- `🧭 Latest issue bootstrap record: #300 on fix/...`
- `   Status: current for this checkout`

or

- `🧭 Latest issue bootstrap record: #18 on feat/...`
- `   Status: historical for current checkout`
- `   Reason: recorded repo_path points at an older checkout path`
- `   Recovery: rerun agenticos_issue_bootstrap in the current checkout`

Two important rendering rules:

1. stop using committed-snapshot freshness to rename the bootstrap label as if
   the bootstrap line itself were a committed snapshot
2. keep “committed snapshot freshness” and “bootstrap continuity” as separate
   lines so users can see when both are true at once

### 6. `health` semantics

Add a dedicated gate:

- `issue_bootstrap_continuity`

Recommended statuses:

- `PASS` when bootstrap continuity is `current`
- `WARN` when it is `historical_for_current_checkout`
- `BLOCK` when it is `missing_or_invalid`

This keeps the issue separate from:

- `worktree_topology`
- `repo_sync`
- committed `versioned_entry_surface_state`

Suggested recovery actions:

- historical:
  - `rerun agenticos_issue_bootstrap in the current checkout before trusting current-checkout bootstrap evidence`
- missing/invalid:
  - `record agenticos_issue_bootstrap in the current verified checkout before continuing`

### 7. Live guardrail enforcement

Do **not** weaken `preflight` / `edit_guard`.

Instead:

- keep exact current-checkout mismatch as a fail-closed condition
- replace generic mismatch wording with relocation-aware recovery wording

Example:

- current: `latest issue bootstrap was recorded for a different repo_path`
- proposed V1: `latest issue bootstrap is historical for this checkout; rerun agenticos_issue_bootstrap in the current checkout before continuing`

This preserves safety while making the operator action obvious.

### 8. `startup_context_paths`

For V1:

- inspect only paths that can be evaluated deterministically
- absolute paths are checked directly
- relative paths may be resolved against `project_path` when available
- missing historical startup paths should contribute to
  `historical_for_current_checkout`, not trigger silent rewriting

This matters mainly for older records and compatibility cases.

## Affected Files

Primary implementation slice:

- `mcp-server/src/utils/versioned-entry-surface-state.ts`
- `mcp-server/src/tools/project.ts`
- `mcp-server/src/utils/health.ts`
- `mcp-server/src/tools/preflight.ts`
- `mcp-server/src/tools/edit-guard.ts`

New shared helper:

- `mcp-server/src/utils/issue-bootstrap-continuity.ts`

Likely unchanged persistence/write behavior:

- `mcp-server/src/utils/guardrail-evidence.ts`
- `mcp-server/src/tools/issue-bootstrap.ts`

V1 out of scope unless review finds a hard requirement:

- `mcp-server/src/resources/context.ts`

Reason:

- it is a raw context surface, not the main operator-facing health/status flow
- including it now would widen the issue without changing the core contract

## Test Plan

### `versioned-entry-surface-state.test.ts`

Add / update cases for:

- historical relocated `repo_path` alone no longer causes the canonical-root
  stale reason
- non-main branch still causes stale
- isolated worktree still causes stale
- fresh canonical-main snapshot remains PASS

### `health.test.ts`

Add cases for:

- `issue_bootstrap_continuity = PASS` when repo_path matches current checkout
- `issue_bootstrap_continuity = WARN` when repo_path points at an older moved
  checkout path
- `issue_bootstrap_continuity = BLOCK` when bootstrap is missing or invalid
- recovery action tells the operator to rerun `agenticos_issue_bootstrap`

### `project.test.ts`

Add cases for:

- status renders `Latest issue bootstrap record`
- status distinguishes current vs historical bootstrap continuity
- historical bootstrap continuity shows recovery guidance
- committed snapshot stale lines remain separate from bootstrap continuity lines

### `preflight.test.ts` and `edit-guard.test.ts`

Add cases for:

- relocated old bootstrap path still blocks
- block reason says bootstrap is historical for the current checkout
- recovery action says rerun bootstrap in the current checkout
- truly missing bootstrap still blocks as missing, not historical

## Acceptance Criteria

`#300` is complete when:

1. historical `issue_bootstrap.repo_path` is no longer treated as a canonical
   freshness invariant by itself
2. `status` distinguishes latest recorded bootstrap evidence from bootstrap
   evidence that is valid for the current checkout
3. `health` exposes bootstrap continuity as its own machine-checkable signal
4. relocated historical bootstrap evidence yields rerun guidance instead of a
   generic mismatch message
5. `preflight` and `edit_guard` still fail closed until bootstrap is rerun in
   the current checkout
6. no status/health evaluation silently rewrites historical bootstrap paths

## Implementation Notes

The most important scope control for V1 is:

- do not try to infer continuity from same branch or same HEAD alone
- do not implement automatic path reconciliation
- do not widen into generic historical-path rewriting

The safe contract is:

- immutable record
- explicit continuity assessment
- explicit rerun to restore current-checkout proof
