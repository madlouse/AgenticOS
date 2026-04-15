# Issue #288 Design Review: Versioned Entry Surface Refresh After Merged Mainline Work

## Summary

After `#286` cleaned canonical checkout runtime drift and restored canonical
`main` to a trusted baseline, the remaining stale status-page behavior is no
longer caused by Git drift.

The problem is that the versioned entry surfaces under
`standards/.context/{quick-start.md,state.yaml}` still reflect an older project
snapshot around `#260` / `#262`, while the canonical checkout itself is already
up to date with `origin/main`.

So `#288` is a semantics and workflow issue:

1. What do versioned entry surfaces mean for a `github_versioned` project?
2. When should those surfaces be refreshed after merged mainline work?
3. How should `status` and related summary commands represent stale versioned
   state without confusing it with runtime drift?

## Current Evidence

As of `2026-04-14`, canonical project status still reports old work even though
the canonical checkout is clean and aligned:

- `agenticos_status` still shows:
  - `Latest guardrail: None recorded`
  - `Latest issue bootstrap: #260`
  - `Current task: Implement #262 concurrent runtime project resolution`
- `standards/.context/state.yaml` still includes:
  - `issue_bootstrap.latest.issue_id: "260"`
  - `current_task.title: "Implement #262 concurrent runtime project resolution"`
- `standards/.context/quick-start.md` still says the current focus is to finish
  `#262`

Meanwhile:

- canonical checkout is now `main...origin/main`
- runtime-managed drift has been snapshot and cleaned
- no source-tree drift remains in the canonical checkout
- during this review round, `issue_bootstrap` / `preflight` persistence also
  demonstrated that some execution-time evidence still targets the committed
  project state surface and can re-dirty canonical `main` if not handled
  carefully

## Current Semantics In Code

### `agenticos_status`

`agenticos_status` currently builds its summary directly from the project's
versioned quick-start and state surfaces. It treats:

- `current_task`
- `working_memory.pending`
- `issue_bootstrap.latest`
- `guardrail_evidence.last_command`

as the primary visible truth for the status page.

This means stale versioned state is rendered as if it were current truth.

### `agenticos_health`

`agenticos_health` currently checks:

- repo sync / runtime drift
- whether entry-surface refresh metadata exists
- whether guardrail evidence exists

But it does **not** check whether the versioned entry surfaces are stale relative
to merged mainline work. So a project can pass repo sync while still presenting
historically stale task/guardrail summaries.

### `agenticos_refresh_entry_surfaces`

`agenticos_refresh_entry_surfaces` already exists as a deterministic writer for
versioned entry surfaces, but the system does not yet define a complete
post-merge contract for when this must happen for `github_versioned` projects.

## Problem Breakdown

There are actually two different state classes here:

### 1. Runtime Drift

This is when the canonical checkout gets dirtied by local runtime-managed files.

Examples:

- `CLAUDE.md`
- `standards/.context/state.yaml`
- `standards/.context/.last_record`
- conversation files

This class is now handled by `#286` / `agenticos_canonical_sync`.

### 2. Stale Versioned Entry Surfaces

This is when the committed source of truth under `standards/.context/*` is
internally consistent but no longer represents the intended current project
snapshot after later merged work.

This class is **not** handled by canonical sync and should not be treated as
runtime drift.

## Non-Goals

- Reintroduce runtime writes into canonical `main`
- Make status pages depend on legacy global `active_project`
- Mix per-session runtime memory back into committed project state without an
  explicit contract
- Hide stale versioned state by silently switching to unrelated runtime state

## Candidate Design Directions

## Option A: Manual Refresh Only, Better Warnings

Keep `agenticos_refresh_entry_surfaces` as the only refresh path.

Add stale-state diagnostics to `status` / `health`, but require operators to
refresh versioned entry surfaces manually when needed.

Pros:

- smallest implementation
- keeps writes explicit
- no new automation complexity

Cons:

- stale status pages remain common if humans forget
- still weak as an operational default
- does not define when refresh becomes required

## Option B: Explicit Post-Merge Refresh Contract

Keep refresh explicit, but define a required workflow:

1. merged mainline work that changes project-facing status must also refresh
   versioned entry surfaces in the issue branch before merge, or in a dedicated
   follow-up refresh issue
2. `status` and `health` must detect and surface stale versioned entry surfaces
   as a distinct condition
3. operators must not confuse stale versioned state with runtime drift

Pros:

- preserves explicit source control semantics
- keeps canonical main read-only outside normal Git flow
- gives one normative workflow instead of tribal knowledge

Cons:

- requires stronger stale-state detection heuristics / contracts
- still depends on workflow discipline

## Option C: Automatic Refresh Derived From Merge History

Introduce a helper that tries to infer the latest merged issue and rewrite
versioned entry surfaces automatically after merge.

Pros:

- reduces manual maintenance

Cons:

- highest hallucination / mis-summary risk
- unclear source of truth across multiple merged issues
- easy to produce wrong “current task” narratives
- conflicts with the existing deterministic refresh philosophy

## Initial Recommendation

Recommend **Option B**.

The intended model should be:

1. For `github_versioned` projects, versioned entry surfaces are a committed
   project-level summary surface, not a live per-session runtime ledger.
2. They must be refreshed explicitly through deterministic inputs.
3. `status` and `health` must distinguish:
   - repo clean vs dirty
   - runtime drift vs versioned-state staleness
   - missing guardrail evidence vs stale versioned guardrail summary
4. The system should fail clearer when the visible status page is stale, instead
   of confidently rendering old task/guardrail data as if it were current.

This keeps source control semantics clean and avoids heuristic auto-rewriters.

## Refined Review Conclusions

After local review of the current implementation and historical `#99` refresh
design, the following refinements look necessary:

1. The stale-state problem is not only “missing refresh.”
   It is specifically that `status` currently renders the last committed
   `current_task`, `issue_bootstrap`, and guardrail summary as if freshness were
   already proven.

2. `entry_surface_refresh.refreshed_at` by itself is not enough.
   It proves that a refresh happened at some time, but not that the committed
   snapshot still matches the intended current mainline narrative.

3. `#288` should not introduce automatic merge-history summarization.
   That would directly conflict with the original deterministic refresh contract
   from `#99`.

4. The first implementation should separate:
   - detection of stale versioned entry surfaces
   - presentation of stale status
   - operator workflow for explicit refresh

5. The first implementation does **not** need a heavy auto-refresh mechanism.
   It needs one explicit contract and one machine-checkable stale-state model.

6. There is an adjacent write-boundary risk:
   if review/bootstrap/guardrail persistence still writes execution-time evidence
   into committed project state during worktree execution, canonical `main` can
   become dirty again even when runtime drift handling is otherwise correct.
   `#288` should at minimum account for this boundary explicitly, even if some
   write-target refactoring lands in a follow-up issue.

## Proposed Semantic Contract

### Versioned Entry Surfaces

For `github_versioned` projects:

- `standards/.context/quick-start.md`
- `standards/.context/state.yaml`

are **committed summary surfaces** for project resume and orientation.

They are not guaranteed to represent the latest local session.
They are only authoritative to the extent that they were explicitly refreshed
for the intended current project snapshot.

### Runtime State

Per-session runtime evidence belongs in runtime-managed or append-only surfaces,
not in ad hoc canonical-main writes.

### Status Semantics

`agenticos_status` should not present stale versioned state as if it were known
fresh truth.

Possible status behavior:

- if versioned entry surfaces are stale, show the stale marker first
- keep showing the last committed summary, but clearly mark it as historical
- avoid “Latest guardrail: None recorded” when the deeper reality is “current
  committed snapshot freshness is not proven”
- distinguish:
  - `Latest committed snapshot`
  - `Latest committed issue bootstrap snapshot`
  - `Latest committed guardrail snapshot`
  from fresh live/runtime truth

### Health Semantics

`agenticos_health` should gain an explicit gate for versioned entry-surface
freshness relative to the intended committed project snapshot, distinct from repo
sync/runtime drift.

Recommended initial behavior:

- `repo_sync`: checkout cleanliness and canonical branch alignment
- `entry_surface_refresh`: refresh metadata exists
- `entry_surface_staleness`: whether the committed snapshot is still fresh enough
  to trust
- `guardrail_evidence`: committed guardrail snapshot visibility is present and
  not misleadingly absent

The stale-state gate should be independent from runtime drift.

## Implementation Shape To Evaluate

This review round should specifically decide whether the likely implementation
should include:

1. a new stale-state classifier for versioned entry surfaces
2. `status` wording changes to avoid false freshness
3. `health` gate changes so stale versioned state is machine-checkable
4. an explicit documented/operator workflow for post-merge entry-surface refresh
5. optionally, a report-only helper to explain why the current versioned state is
   considered stale

## Recommended V1 Scope

The first landing should likely be limited to four bounded changes:

1. Add a machine-checkable stale committed-snapshot classifier.
2. Update `agenticos_status` and switch/status summaries to mark stale committed
   state explicitly instead of rendering it as current truth.
3. Extend `agenticos_health` with a distinct stale-versioned-state gate.
4. Document the one supported post-merge refresh workflow for
   `github_versioned` projects.

This is enough to fix the misleading status semantics without jumping straight
to auto-refresh automation.

## Recommended Workflow Contract

For `github_versioned` projects, the supported workflow should be:

1. If an issue intentionally changes the project-facing current narrative, the
   issue branch should refresh committed entry surfaces before merge.
2. If multiple issues merge without a clean single-issue narrative, a dedicated
   follow-up refresh issue is allowed and should be explicit.
3. Until refresh is completed, canonical status surfaces must say the committed
   snapshot is stale rather than pretending the old snapshot is current.
4. No runtime-only command may silently rewrite canonical `main` to “fix” this.

## Hard Questions For Review

1. What is the minimum machine-checkable signal that versioned entry surfaces are
   stale without inventing heuristics from arbitrary commit history?
2. Should stale detection be based on:
   - explicit refresh metadata only
   - explicit issue linkage
   - mismatch against newer merged task/report artifacts
   - some bounded combination of the above
3. What should `Latest guardrail` mean on a canonical status page:
   - latest committed guardrail snapshot in versioned state
   - latest persisted runtime guardrail evidence
   - or “unknown / stale” when freshness is not proven
4. Should the refresh workflow be:
   - mandatory inside issue branches before merge
   - allowed as a follow-up issue
   - or both, with clear rules

## Review Goal

Before implementation, review should converge on:

- one clear semantic model
- one supported refresh workflow
- one status/health representation for stale versioned state
- one bounded implementation slice for the first landing

## Missing Acceptance Criteria To Add

- [ ] `agenticos_status` marks stale committed snapshots explicitly instead of
      presenting their `current_task` / bootstrap / guardrail summary as fresh
      truth
- [ ] `agenticos_health` distinguishes runtime drift from stale committed entry
      surfaces
- [ ] the supported post-merge refresh workflow for `github_versioned` projects
      is explicit about “refresh in branch” vs “refresh in follow-up issue”
- [ ] the first implementation does not depend on heuristic merge-history
      summarization
- [ ] review/bootstrap/guardrail persistence semantics are at least explicitly
      bounded so #288 does not accidentally reintroduce canonical-main write
      pollution while addressing stale committed snapshots
