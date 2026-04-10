# Legacy Managed-Project Migration Plan After #262

## Summary

After `#262` lands, existing managed projects may still contain legacy state and
registry assumptions that were valid under the old `active_project` model but are
unsafe or misleading under the new concurrent runtime model.

This migration problem should be tracked as a separate issue from `#262`.

Detailed phase-2 technical review for the next implementation tranche:

- `tasks/issue-263-phase2-technical-design-review.md`

The migration contract should answer three questions:

1. Which existing projects actually require migration?
2. Which changes can be repaired lazily and safely during normal commands?
3. Which changes require an explicit migration flow with audit visibility?

## Recommendation

Do **not** require a one-shot global migration before the system can be used.

Do **not** rely only on silent switch-time mutation either.

Use a **hybrid migration model**:

1. Backward-compatible reads from old registry/project data remain supported.
2. Safe metadata-only normalization may happen lazily when a project is
   explicitly targeted or switched into.
3. Structural changes that affect execution identity, persistence layout,
   registry semantics, or auditability must use an explicit migration command or
   guided workflow with dry-run output.

This gives three benefits:

- existing installations continue working immediately after `#262`
- operators are not forced to migrate every project up front
- high-risk changes remain explicit, reviewable, and auditable

## Why A Full One-Time Migration Is The Wrong Default

`AGENTICOS_HOME` can contain many projects, and not all of them will be active.

A mandatory one-shot migration is a poor default because:

- it touches dormant projects that may not need immediate modification
- it increases blast radius if migration logic is wrong
- it couples rollout of `#262` to the correctness of every project repair path
- it creates avoidable friction on machines where only one or two projects are
  currently active

## Why Pure Switch-Time Migration Is Also Insufficient

Pure switch-time migration is also incomplete because:

- some changes should not happen silently inside a routine context-load command
- migration may need dry-run reporting, operator review, and evidence logging
- some projects may need bulk audit/remediation before teams rely on them again
- schema repair and registry rewrite changes have concurrency implications

## Migration Classes

### Class A: Read-Compatible Legacy Data

Examples:

- registry still contains `active_project`
- registry project entries still use legacy path shapes that are still resolvable
- project data still assumes legacy fallback behavior, but explicit identity is
  provable

Handling:

- continue reading without blocking
- do not require immediate mutation
- treat as compatibility input only

### Class B: Safe Metadata Repair

Examples:

- `registry.active_project` still populated with a stale project id
- project `last_accessed` or other lightweight metadata is missing
- registry stores absolute or relative paths that can be normalized without
  changing project meaning

Handling:

- allow repair during explicit `switch` or explicit project-target resolution
- only mutate fields that are local, low-risk, and reversible
- log what changed
- never silently rewrite unrelated registry state

Candidate lazy repairs:

- clear or downgrade legacy `active_project`
- fill missing non-authoritative metadata
- normalize path formatting

### Class C: Explicit Structural Migration

Examples:

- changing registry write semantics to patch-based / lock-based mutation
- renaming `active_project` to `last_selected_project`
- moving or normalizing project context paths
- repairing project files whose identity cannot be proven cleanly
- rewriting guardrail evidence/state shapes

Handling:

- require explicit migrate command or guided workflow
- support `dry_run`
- produce a report of planned changes
- write audit evidence to project state or migration report artifacts
- fail closed when project identity is ambiguous

## Proposed UX Contract

### 1. `#262` Runtime Behavior

Immediately after `#262`:

- old registries still load
- old projects still resolve if identity is provable
- legacy `active_project` is compatibility-only, not authoritative

### 2. Lazy Repair On Explicit Project Entry

When the operator calls `agenticos_switch` or another explicit project-targeted
command:

- inspect whether the project/registry is in a safe Class B legacy state
- if yes, optionally apply a minimal repair patch
- surface a short note such as:
  - `Applied safe legacy metadata normalization`
  - `Legacy registry current-project field was cleared`

This should be:

- deterministic
- narrow in scope
- field-patch based
- concurrency-safe

### 3. Explicit Migration Workflow

Add a dedicated migration issue and later implementation surface for commands
such as:

- `agenticos_migrate_project`
- `agenticos_migrate_home --report-only`
- `agenticos_migration_audit`

Minimum behavior:

- detect legacy projects
- classify findings by risk
- support dry-run
- support per-project execution
- support home-wide audit reporting without forced mutation

## Scope For The Follow-Up Migration Issue

The follow-up issue should include:

1. Legacy-state inventory
   - registry fields
   - project file/state fields
   - guardrail evidence/state records

2. Migration classifier
   - read-compatible only
   - safe lazy repair
   - explicit migration required

3. Operator workflow
   - audit first
   - migrate selected project
   - optional home-wide migration report

4. Concurrency and safety rules
   - no blind full-object registry rewrites
   - lock + reload + field patch + atomic rename
   - explicit identity proof before mutation

5. Documentation
   - upgrade guide for existing Agentic Home installations
   - per-project migration checklist
   - notes for mixed old/new runtime states during rollout

## Implementation Breakdown

The migration issue should be executed as four concrete workstreams.

### Workstream 1: Audit / Report-Only Surface

Goal:

- detect legacy state without mutating anything
- let operators understand whether migration is needed and how risky it is

Suggested command shape:

- `agenticos_migration_audit`
- `agenticos_migrate_home --report-only`

Minimum inputs:

- optional `project_path`
- optional `project`
- optional `home_scope=true`

Minimum outputs:

- detected project identity
- finding list with severity
- finding classification: `compatible_only`, `safe_lazy_repair`, `explicit_migration_required`
- recommended next action per finding
- whether the project is safe to continue operating without migration

Findings to detect:

- legacy `active_project` still populated
- registry/project path normalization drift
- missing or stale non-authoritative metadata
- project identity ambiguity
- context path divergence from current contract
- guardrail evidence/state using old shapes

Acceptance criteria:

- no writes occur in report-only mode
- output is deterministic and machine-readable
- ambiguous identity fails closed
- the same project can be audited repeatedly without side effects

Initial finding schema for the first implementation slice:

- `code`
  - stable machine-readable finding identifier
- `migration_class`
  - `compatible_only`
  - `safe_lazy_repair`
  - `explicit_migration_required`
- `severity`
  - `info`
  - `warning`
  - `error`
- `summary`
  - concise human-readable explanation
- `evidence`
  - concrete file paths, field names, or mismatch values
- `recommended_action`
  - bounded next step
- `safe_to_defer`
  - whether operators can keep using the project under compatibility-on-read without immediate migration

Initial audit coverage should detect at least:

- populated legacy `registry.active_project`
- registry path normalization drift
- missing lightweight registry metadata such as `last_accessed`
- missing or unreadable `.project.yaml`
- missing `meta.id`
- registry / `.project.yaml` identity mismatches
- missing or invalid topology/publication-policy normalization
- compatibility-only legacy `active_project` evidence still present in state artifacts

Explicit first-slice boundary:

- `agenticos_migrate_home --report-only` inventories registry-backed managed
  projects only; it does not yet scan arbitrary on-disk directories under
  `AGENTICOS_HOME/projects`
- guardrail/state archaeology is intentionally narrow in the first slice; the
  initial implementation only detects compatibility-era `active_project`
  evidence, not every historical guardrail record shape

### Workstream 2: Per-Project Explicit Migration

Goal:

- migrate one target project deliberately and safely

Canonical reviewed phase-2 design:

- `tasks/issue-263-phase2-technical-design-review.md`

Suggested command shape:

- `agenticos_migrate_project`

Minimum inputs:

- `project_path` or `project`
- optional `dry_run=true`
- optional `apply_safe_repairs_only=true`

Minimum behaviors:

- prove project identity before mutation
- show planned actions in dry-run mode
- apply only the selected migration classes
- emit a structured migration report
- persist migration evidence into project state or artifacts

Mutation classes:

- safe metadata repair
- explicit structural migration

Must not do:

- mutate unrelated projects
- rewrite the whole registry from a stale snapshot
- silently downgrade ambiguous findings into automatic mutation

Acceptance criteria:

- dry-run and apply modes produce matching action plans
- rerunning after success is idempotent or no-op where appropriate
- project-local artifacts clearly show what changed
- concurrency-safe registry writes are used

### Workstream 3: Home-Wide Migration Report

Goal:

- give operators a complete estate-level view of legacy state across one
  `AGENTICOS_HOME`

Suggested command shape:

- `agenticos_migrate_home --report-only`
- optional later `agenticos_migrate_home --apply-safe-repairs`

Why report-first:

- a long-lived home may contain many dormant projects
- estate-wide mutation should not be the default first step

Minimum outputs:

- list of managed projects discovered from registry
- per-project migration class summary
- blocked/ambiguous projects
- which projects are safe to defer
- which projects need explicit operator review

Optional later capability:

- apply only Class B safe repairs home-wide

Non-goal for first iteration:

- bulk automatic Class C structural migration across the entire home

Acceptance criteria:

- estate-level report can be generated without mutating any project
- per-project findings match single-project audit results
- blocked projects are called out explicitly instead of being skipped silently

### Workstream 4: Upgrade Guide And Operator Docs

Goal:

- make migration and mixed-state rollout understandable without reading code or
  issue archaeology

Required documentation outputs:

- upgrade guide for existing Agentic Home installations
- migration FAQ
- per-project migration checklist
- explanation of what is repaired lazily vs explicitly
- rollback/recovery guidance for migration failures

Required topics:

- what changed after `#262`
- why `active_project` is no longer authoritative
- when operators should run audit only
- when operators should run explicit migration
- what commands are safe during mixed old/new state

Acceptance criteria:

- an operator can decide whether to migrate now, later, or only audit
- docs distinguish runtime compatibility from full normalization
- docs include examples for both runtime-only homes and source-managed projects

## Recommended Sequencing

Recommended order:

1. Workstream 1: audit / report-only
2. Workstream 4: docs drafted in parallel with audit output schema
3. Workstream 2: per-project explicit migration
4. Workstream 3: home-wide report and optional safe-repair expansion

Detailed follow-up design review for Workstream 2:

- see [tasks/issue-263-phase2-design-review.md](/Users/jeking/dev/AgenticOS/worktrees/agenticos-263-legacy-project-migration-audit/tasks/issue-263-phase2-design-review.md)
- canonical technical detail lives in [tasks/issue-263-phase2-technical-design-review.md](/Users/jeking/dev/AgenticOS/worktrees/agenticos-263-legacy-project-migration-audit/tasks/issue-263-phase2-technical-design-review.md)
- the next safe milestone is `agenticos_migrate_project` with explicit
  `plan/apply` semantics, not home-wide apply mode

Reasoning:

- audit must exist before operators can trust migration decisions
- docs should be written against a real audit/migration contract, not guesses
- per-project explicit migration is safer than starting with home-wide mutation
- estate-level apply behavior should only come after single-project migration is
  proven

Canonical reviewed follow-up design for Workstream 2 is persisted in:

- [issue-263-phase2-technical-design-review.md](/Users/jeking/dev/AgenticOS/worktrees/agenticos-263-legacy-project-migration-audit/tasks/issue-263-phase2-technical-design-review.md)

## Suggested Issue Checklist

- [ ] Define the migration finding schema and severity model.
- [ ] Implement report-only audit for a single project.
- [ ] Implement home-wide report-only migration inventory.
- [ ] Define the per-project migration action plan and dry-run output.
- [ ] Implement per-project explicit migration with evidence logging.
- [ ] Document safe lazy repair cases allowed during explicit project entry.
- [ ] Publish the upgrade guide and migration checklist.
- [ ] Decide whether home-wide apply-safe-repairs is warranted after single-project migration is proven.

## Decision

The recommended strategy is:

- **not** a mandatory one-shot migration gate
- **not** silent migration of all legacy state during `switch`
- **yes** to compatibility-on-read
- **yes** to narrow safe lazy repair for metadata-only fixes
- **yes** to explicit migration tooling/workflow for structural changes

That is the safest design for a long-lived `AGENTICOS_HOME` that manages many
projects concurrently.
