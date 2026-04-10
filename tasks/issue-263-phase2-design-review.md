# #263 Phase 2 Design Review

This file is the lightweight index for the phase-2 review.

The consolidated technical proposal now lives in:

- `tasks/issue-263-phase2-technical-design-review.md`

Reviewed by three parallel Sub-agents plus local synthesis:

- runtime semantics / command contract
- migration action model / evidence strategy
- concurrency safety / failure recovery

## Scope

The reviewed tranche is the next implementation step after the report-only audit
slice:

- explicit per-project migration
- narrow safe lazy repair boundary
- concurrency-safe apply semantics
- failure recovery and migration evidence

## Status

Review synthesis completed.

Current decision:

- proceed with a per-project `dry_run` / explicit `apply` design
- require explicit target selection for apply
- keep registry writes patch-based
- add a per-project migration lock and plan fingerprint precondition
- keep historical evidence additive by default rather than rewriting it
- defer home-wide apply, schema rename, and orphan discovery

Current implementation status:

- deterministic `plan` is implemented
- guarded per-project `apply` is implemented for the current deterministic
  actions
- broader structural apply and home-wide mutation are still deferred

For the full rationale, command contract, concurrency model, and rollout
recommendation, use the technical review document above as the canonical source.
