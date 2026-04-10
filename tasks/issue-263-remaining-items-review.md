# #263 Remaining Items Review

## Purpose

This document re-evaluates the remaining tail items after the current `#263`
delivery state:

- report-only audit is implemented
- per-project deterministic planning is implemented
- guarded deterministic per-project apply is implemented
- operator migration guide and checklist are published

The question is no longer “what else could be built”.

The question is:

- what is still necessary to satisfy the actual target model
- what can be explicitly deferred
- what should be closed instead of expanded

## Decision Standard

An item should remain in active scope only if it materially improves one of
these goals:

1. preserve the runtime-home model
2. preserve safe multi-project parallel work
3. make existing installations operable without forcing global mutation
4. improve operator correctness in realistic migration workflows

If an item mainly expands surface area without materially improving those
outcomes, it should be deferred or closed.

## Current Delivery Baseline

Already delivered inside `#263`:

- `agenticos_migration_audit`
- `agenticos_migrate_home --report-only`
- `agenticos_migrate_project mode=plan`
- `agenticos_migrate_project mode=apply` for the currently supported
  deterministic actions
- phase-2 technical review
- operator migration guide

That means the core migration contract is now present:

- audit
- plan
- guarded apply
- evidence
- operator documentation

## Remaining Items

### A. Home-Wide `apply-safe-repairs`

#### Assessment

Not necessary for the core target model.

Reason:

- the runtime-home model does not require estate-wide mutation
- per-project migration already satisfies the active-project workflow
- home-wide apply increases blast radius immediately
- the operator guide already gives a safe incremental path

#### Decision

Defer.

#### Reopen Only If

- repeated real-world use shows that per-project apply creates unacceptable
  operational overhead
- a large estate has many low-risk registry-only repairs where bulk apply would
  materially reduce toil

#### Current Status

- not required to close `#263`
- should not be implemented now

### B. Filesystem Orphan Discovery Under `AGENTICOS_HOME/projects`

#### Assessment

Useful, but not necessary for the current migration contract.

Reason:

- current inventory is registry-backed by design
- the runtime model already works when project targeting is explicit
- orphan discovery is an estate hygiene capability, not a prerequisite for safe
  per-project migration
- adding it now would broaden `#263` from migration correctness into discovery
  policy

#### Decision

Defer, likely as a follow-up issue rather than extending `#263`.

#### Reopen Only If

- operators repeatedly encounter materially important unregistered project
  directories
- a future home-integrity or estate-audit feature needs filesystem discovery as
  a first-class capability

### C. Broader Structural Apply Beyond The Current Deterministic Actions

#### Assessment

Partially necessary, but not all at once.

Reason:

- current apply only covers the deterministic safe subset
- some blocked findings may remain too manual for comfortable operator use
- however, broadening structural apply too fast risks reintroducing guessing and
  silent scope creep

#### Decision

Keep open, but narrow the remaining active scope.

#### What Stays In Scope

- only additional deterministic, provable, per-project structural repairs
- only when the planner can describe them precisely and fail closed on
  ambiguity

#### What Leaves Scope

- topology guessing
- identity conflict auto-repair
- damage recovery for unreadable YAML without trustworthy source inputs

#### Working Rule

Every new apply action must pass this test:

- can the tool prove the intended target meaning without inference?

If not, it should remain `manual_block`.

### D. Historical Evidence Rewrite

#### Assessment

Not necessary, and harmful as a default.

Reason:

- historical evidence should remain historical evidence
- additive migration reports already solve the operator/auditability need
- rewriting history would blur provenance and expand risk without improving the
  runtime model

#### Decision

Close for `#263`.

Do not continue this direction in the current issue.

### E. Schema Rename `active_project -> last_selected_project`

#### Assessment

Not necessary.

Reason:

- `#262` already removed runtime dependence on `active_project`
- the remaining field is compatibility-only schema baggage, not runtime truth
- renaming it now adds migration surface but does not materially improve
  operator outcomes

#### Decision

Close for `#263`.

If ever revisited, it should be justified as a separate schema cleanup issue,
not bundled into migration correctness work.

### F. General Rollback Subsystem

#### Assessment

Not necessary right now.

Reason:

- the current apply path is already constrained to deterministic actions
- writes are patch-based or atomic
- rerun + post-audit is the current recovery model
- a general rollback framework would add much more machinery than the current
  scope justifies

#### Decision

Defer.

Only reopen if actual field usage shows repeated partial-apply recovery pain.

## Recommended Closure State For #263

### Keep Active

- narrowly expand deterministic per-project structural apply only if real
  operator cases justify it

### Defer

- home-wide `apply-safe-repairs`
- filesystem orphan discovery
- general rollback subsystem

### Close

- historical evidence rewrite as a default migration behavior
- schema rename of `active_project`

## Final Judgment

`#263` has already reached the core target.

It now provides:

- audit
- deterministic plan
- guarded per-project apply
- additive evidence
- operator migration guidance

That is sufficient to support the long-term runtime-home / multi-project model
without reintroducing global current-project semantics.

So the correct posture from here is:

- stop expanding by default
- only reopen narrowly justified deterministic apply actions
- move estate-hygiene extras into follow-up issues if they become necessary
