# #263 Phase 2 Technical Design Review

## Purpose

This document reviews the next implementation tranche for `#263` after the
report-only audit slice landed.

The goal is to define a migration design that remains consistent with `#262`
while making legacy managed projects repairable without reintroducing
home-global runtime coupling.

## Review Basis

Current contract already established by `#262` and the first `#263` slice:

- `AGENTICOS_HOME` is a long-term runtime workspace, not an authoritative
  single-project source checkout
- `projects/` contains many managed projects that may be active in parallel
- runtime target resolution must remain:
  - explicit target
  - then provable `repo_path` where applicable
  - then session-local binding
  - otherwise fail closed
- `registry.active_project` is compatibility-only schema state, not runtime
  truth
- `#263` slice 1 already provides report-only detection through
  `agenticos_migration_audit` and `agenticos_migrate_home`

Review lenses used for this design:

1. runtime semantics and command contract
2. migration action model and idempotency
3. concurrency safety and failure recovery
4. operator rollout and upgrade path

## Current Gap

The current implementation can detect legacy state, but it cannot yet:

- execute a reviewed per-project migration plan
- apply safe metadata repair deterministically
- persist migration evidence for later audit
- recover cleanly from an interrupted apply
- define a trustworthy switch-time lazy-repair boundary

That means `#263` currently proves where migration is needed, but not how to
repair a project safely.

## Critical Findings

### 1. Apply mode must be explicit-target only

`report-only` audit can safely fall back to the session-bound project.

`apply` must not do that.

Reason:

- session-local selection is runtime convenience, not a strong enough mutation
  intent boundary
- migration changes durable project or registry state
- the operator must prove which project is being mutated

Design consequence:

- `agenticos_migrate_project --apply` must require explicit `project` or
  explicit `project_path`
- session fallback may remain allowed for dry-run only, but should be avoided if
  we want one mutation contract instead of two

Recommended choice:

- require explicit `project` or `project_path` for both `dry_run=false` and
  `dry_run=true`
- keep session fallback only on `agenticos_migration_audit`

### 2. Dry-run and apply must share one planner

If dry-run builds one result and apply reinterprets findings ad hoc, the design
will drift and operators will stop trusting the tool.

Design consequence:

- introduce one internal planner that converts current project state into a
  deterministic migration plan
- `agenticos_migration_audit` remains a pure classifier
- `agenticos_migrate_project --dry_run` returns the planned action list
- `agenticos_migrate_project --apply` recomputes that same plan and refuses to
  continue if it no longer matches the reviewed dry-run

### 3. Registry writes must stay patch-based

`#262` already established that business-path registry writes must use lock +
reload + field patch + atomic rename.

That rule must remain non-negotiable for migration apply.

Must use patch-based registry APIs for:

- clearing or downgrading legacy `active_project`
- normalizing a project's stored path
- backfilling `last_accessed`
- updating any future migration metadata recorded in the registry

Must not do:

- load registry once, mutate in memory, and later write a full stale snapshot
- combine unrelated project updates into one broad rewrite

### 4. Project-file mutation needs its own lock boundary

`registry.lock` protects only the home registry.

It does not protect `.project.yaml`, `state.yaml`, or any migration report file
inside a project.

Design consequence:

- add a per-project migration lock, e.g. under the resolved project context root
- allow only one `agenticos_migrate_project --apply` per project at a time
- keep registry mutation inside existing patch-based APIs when registry changes
  are required during that same apply

### 5. Structural migration must not guess topology when identity is ambiguous

Some legacy projects can be normalized deterministically.

Some cannot.

Examples that should still block:

- missing `.project.yaml` and registry identity cannot be proven
- missing topology where runtime evidence cannot distinguish
  `local_directory_only` from `github_versioned`
- conflicting registry / `.project.yaml` identity
- public/private continuity policy cannot be derived safely

Design consequence:

- `agenticos_migrate_project` should repair only deterministic cases
- ambiguous cases must remain `BLOCK` with an explicit operator action
- this issue should not smuggle in an unsafe topology inference engine

### 6. Migration evidence should be additive, not historical rewrite by default

Legacy compatibility evidence such as old `active_project` fields inside
historical guardrail records is not current truth, but it is still historical
evidence.

Design consequence:

- default migration should add a new migration report and state summary
- it should not rewrite old guardrail evidence blobs by default
- any compatibility-evidence rewrite should be an opt-in later capability, not
  part of the minimal sufficient tranche

## Recommended Command Contract

### `agenticos_migrate_project`

Recommended inputs:

- `project_path` or `project`
- `dry_run` default `true`
- `apply_safe_repairs_only` default `false`
- `expected_plan_fingerprint` required when `dry_run=false`

Recommended outputs:

- resolved project identity
- current migration status
- deterministic `plan_fingerprint`
- planned actions in stable order
- touched files / surfaces
- which actions are:
  - `safe_lazy_repair`
  - `explicit_structural_migration`
- whether apply is blocked
- block reasons
- migration report path when apply succeeds

Recommended rules:

- if `dry_run=true`, no writes occur
- if `dry_run=false`, explicit `project` or `project_path` is required
- if `dry_run=false`, `expected_plan_fingerprint` is required
- apply recomputes the plan and fails closed if the fingerprint changed

## Recommended Action Model

The planner should emit bounded actions, not free-form repair logic.

Recommended action families:

1. `registry_patch`
   - clear compatibility-only `active_project`
   - normalize stored project path
   - backfill lightweight registry metadata

2. `project_yaml_patch`
   - repair deterministic identity fields
   - normalize deterministic topology fields only when provable
   - normalize deterministic publication-policy fields only when provable

3. `state_surface_repair`
   - create missing state surface from the current contract
   - backfill deterministic migration summary nodes

4. `evidence_write`
   - write a machine-readable migration report
   - write a concise latest-migration summary into state

Recommended non-goal for this tranche:

- rewriting arbitrary historical guardrail/state evidence blobs

## Safe Lazy Repair Boundary

Safe lazy repair should remain narrow.

Allowed lazy repairs during explicit project entry:

- clear compatibility-only `registry.active_project`
- backfill missing `last_accessed`
- normalize a stored path from absolute-under-home to relative form

Not allowed as lazy repair during `switch`:

- rewriting `.project.yaml`
- generating or rewriting project state structures with structural meaning
- changing topology or publication policy
- repairing identity mismatches

Reason:

- `switch` is still a routine context-load command
- silent structural mutation during `switch` would violate the design intent of
  `#263`

## Concurrency And Failure Recovery

## Required Write Order

Minimal sufficient apply sequence:

1. resolve explicit project target and prove identity
2. acquire a project-local migration lock
3. build migration plan
4. compare plan fingerprint with `expected_plan_fingerprint`
5. write project-local files using temp file + atomic rename
6. apply registry patches through `patchRegistry()` or
   `patchProjectMetadata()`
7. write additive migration evidence
8. release lock

## Recovery Contract

If apply is interrupted:

- rerunning dry-run must rebuild the current plan from disk
- already-completed atomic file writes remain valid
- partially completed steps are re-evaluated rather than assumed
- registry writes remain safe because they are patch-based under lock

This means recovery is based on idempotent recomputation, not a separate
rollback engine.

Recommended minimum safeguards:

- per-project migration lock
- temp-file atomic rename for project-local file writes
- patch-based registry mutation
- deterministic planner
- plan fingerprint check before apply

## Fingerprint / Preconditions

The minimal sufficient design should include a plan fingerprint.

Recommended contents of the fingerprint:

- project id
- project path
- relevant audit findings
- current raw registry entry subset affecting the target
- current `.project.yaml` content digest
- current `state.yaml` content digest or missing marker
- selected apply mode

Recommended semantics:

- dry-run returns `plan_fingerprint`
- apply requires `expected_plan_fingerprint`
- if any relevant input changed, apply returns `BLOCK` and tells the operator to
  rerun dry-run

This is enough optimistic concurrency for the current scope.

A heavier transactional system is not necessary yet.

## Evidence Persistence

Recommended outputs after successful apply:

1. a machine-readable migration report under the resolved runtime context tree
2. a concise latest-migration summary in `state.yaml`

Recommended report content:

- migrated project identity
- executed plan fingerprint
- executed actions
- skipped actions
- blocked findings that remained unresolved
- timestamps

Reason for runtime-context storage instead of repo-root historical docs:

- it keeps operator evidence near current runtime surfaces
- it avoids forcing publishability assumptions for every source-managed project
- it keeps historical issue/RCA documents intact

## Rollout Strategy

Recommended rollout remains hybrid:

1. operator runs `agenticos_migrate_home --report-only`
2. operator picks one active project
3. operator runs `agenticos_migrate_project --dry_run`
4. operator reviews the plan
5. operator runs `agenticos_migrate_project --apply`
6. only after repeated success do we consider optional home-wide safe-repair

This still satisfies the long-term home model because:

- dormant projects are not mutated unnecessarily
- active projects can be normalized deliberately
- multiple projects remain independently migratable
- concurrent project work is preserved

## What Is Not Necessary Right Now

These items are explicitly deferrable:

- renaming `active_project` to `last_selected_project`
- home-wide `--apply-safe-repairs` mutation
- filesystem-wide orphan discovery under `AGENTICOS_HOME/projects`
- compatibility-evidence rewrite of historical guardrail blobs
- a general rollback subsystem

Deferring them does not block the core goal if per-project dry-run/apply is
implemented correctly.

## Can This Reach The Goal?

Yes, if implemented with these constraints:

- explicit-target apply only
- one deterministic planner for dry-run and apply
- patch-based registry writes only
- per-project migration lock
- plan fingerprint precondition
- additive evidence writes
- narrow lazy-repair boundary
- fail closed on ambiguous topology or identity

No, if implementation drifts into any of these patterns:

- silent structural migration during `switch`
- home-wide mutate-first rollout
- reintroducing runtime dependence on `registry.active_project`
- full-object registry rewrites from stale snapshots
- rewriting historical evidence as a default side effect

## Recommended Next Implementation Tranche

The next tranche should be limited to:

1. planner + `agenticos_migrate_project --dry_run`
2. plan fingerprint + explicit apply
3. per-project migration lock
4. patch-based registry actions
5. project-local state / evidence writes
6. operator docs for the dry-run/apply workflow

That is the minimal sufficient path that advances `#263` without reopening the
state-model mistakes that `#262` just removed.
