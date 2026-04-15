# #263 Operator Migration Guide

## Purpose

This guide explains how to migrate existing managed projects after `#262` and
the `#263` audit / per-project migration work.

It is written for the normalized runtime model:

- `AGENTICOS_HOME` is a long-lived runtime workspace
- managed projects live under `projects/`
- a project may be source-managed inside its own project directory, but the
  home itself is not the authoritative runtime current-project switch

## What Changed After #262

After `#262`:

- runtime target resolution no longer depends on global `registry.active_project`
- runtime resolution now prefers:
  1. explicit target
  2. provable `repo_path`
  3. session-local binding
  4. otherwise fail closed
- `registry.active_project` remains compatibility-only schema state

That means old homes and old projects may still work, but they can contain
legacy state that is no longer the desired normalized contract.

## Current Tooling Status

Available now:

- `agenticos_migration_audit`
  - report-only, per-project
- `agenticos_migrate_home --report-only`
  - report-only, registry-backed home inventory
- `agenticos_migrate_project mode=plan`
  - deterministic per-project migration plan
- `agenticos_migrate_project mode=apply`
  - guarded apply for the currently supported deterministic actions

Still intentionally out of scope:

- home-wide apply
- orphan discovery under `AGENTICOS_HOME/projects`
- topology / identity guessing for ambiguous projects
- rewriting historical guardrail / bootstrap / RCA evidence

## Migration Strategy

Use the hybrid strategy below.

Do:

1. audit first
2. migrate only the projects you actually need
3. apply per-project with reviewed `plan_hash`
4. leave dormant or ambiguous projects alone until they need explicit handling

Do not:

- run a one-shot global mutation across the entire home
- treat `registry.active_project` as current truth
- rely on `switch` to silently perform structural migration

## Which Projects Need Immediate Attention

Prioritize these first:

- active projects you are about to work on
- projects with `explicit_migration_required` findings that block intended work
- projects whose registry identity/path metadata is obviously stale

Defer these when safe:

- archived/reference projects
- dormant projects not currently being used
- projects with compatibility-only historical evidence but no execution impact

## Standard Workflow

### 1. Inventory The Home

Run:

- `agenticos_migrate_home --report-only`

Use this to answer:

- which registered projects are `PASS`
- which are `WARN`
- which are `BLOCK`
- which projects are safe to defer

### 2. Audit One Target Project

Run:

- `agenticos_migration_audit`
  - with explicit `project` or `project_path`

Use this when:

- a specific project is about to be worked on
- the home inventory showed a `WARN` or `BLOCK`
- you want the exact finding-level detail before planning migration

### 3. Build A Deterministic Plan

Run:

- `agenticos_migrate_project mode=plan`

Required operator checks:

- target identity is the intended project
- `manual_blocks` is empty
- planned actions are narrow and expected
- `plan_hash` is present

If `manual_blocks` is non-empty:

- stop
- do not try to force apply
- fix the ambiguous or damaged state explicitly first

### 4. Apply The Reviewed Plan

Run:

- `agenticos_migrate_project mode=apply expected_plan_hash=...`

Apply is allowed only when:

- the target is explicit
- the reviewed `plan_hash` still matches
- the project is not in a manual-blocked state

Apply currently performs only deterministic per-project actions such as:

- clearing compatibility-only `registry.active_project`
- normalizing registry path storage
- backfilling lightweight metadata such as `last_accessed`
- rebuilding a missing state surface when the target contract is already proven
- writing additive migration evidence

### 5. Review Post-Apply Evidence

After apply, inspect:

- post-apply audit status
- migration report under `artifacts/migrations/`
- latest migration summary in state

The migration should leave:

- a narrower or empty set of actionable findings
- no hidden mutation outside the selected project and supported registry fields

## Per-Project Checklist

Before apply:

- [ ] I selected the project explicitly with `project` or `project_path`
- [ ] I ran `agenticos_migration_audit`
- [ ] I ran `agenticos_migrate_project mode=plan`
- [ ] I reviewed the `plan_hash`
- [ ] `manual_blocks` is empty
- [ ] The planned actions are only the deterministic actions I intend to run

After apply:

- [ ] `mode=apply` succeeded without a hash mismatch
- [ ] post-apply audit no longer shows the repaired findings
- [ ] a migration report was written under `artifacts/migrations/`
- [ ] state contains the latest migration summary pointer
- [ ] no unrelated project was mutated

## Mixed-State Rollout Guidance

During rollout, it is normal for one home to contain a mix of:

- fully normalized projects
- compatible-but-not-yet-normalized projects
- blocked projects requiring explicit operator repair

That mixed state is acceptable.

The important rule is:

- compatibility-on-read is allowed
- mutation is per-project and explicit

This is why the recommended migration order is:

1. projects you are actively using now
2. projects you will use soon
3. everything else later, only if needed

## FAQ

### Should I migrate every project immediately?

No.

Only migrate projects that need near-term work or have blocking findings you
must clear.

### Should migration happen automatically during `agenticos_switch`?

Only in the narrow metadata-repair sense, and only for registry-local cleanup.

Structural migration must remain explicit.

### Does `agenticos_migrate_home --report-only` find every directory under `projects/`?

No.

Current home inventory is registry-backed. Unregistered directories are not yet
discovered automatically.

### Can `mode=apply` fix ambiguous identity or missing topology automatically?

No.

If the tool cannot prove the intended meaning safely, it must keep blocking.

### Should historical evidence be rewritten to remove old `active_project` traces?

Not by default.

Historical evidence stays historical. New migration evidence is written
additively instead.

## Recommended Order For Existing Installations

For an existing machine with historical drift:

1. run `agenticos_migrate_home --report-only`
2. choose one active project
3. run `agenticos_migration_audit`
4. run `agenticos_migrate_project mode=plan`
5. run `agenticos_migrate_project mode=apply`
6. repeat only for the next project that actually matters

This gives the intended effect:

- once-only coherent correction where needed
- no unnecessary mutation of dormant projects
- no regression to a global runtime current-project model
