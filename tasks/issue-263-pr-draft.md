# PR Draft for #263

Closes #263.

## Title

`design: add report-only legacy managed-project migration audit surfaces`

## Summary

This PR now covers the first complete operator-safe tranche of `#263`.

It adds:

1. report-only migration audit and registry-backed home inventory
2. reviewed phase-2 design documentation
3. deterministic per-project migration planning
4. guarded per-project apply for the currently supported deterministic actions
5. operator migration guide and per-project checklist

## What Changed

- added `agenticos_migration_audit` for per-project report-only migration checks
- added `agenticos_migrate_home` for registry-backed home-wide inventory
- added `agenticos_migrate_project` for deterministic per-project migration
  planning and guarded apply
- implemented a structured finding model:
  - `compatible_only`
  - `safe_lazy_repair`
  - `explicit_migration_required`
- added detection for:
  - populated legacy `registry.active_project`
  - registry path normalization drift
  - missing lightweight metadata such as `last_accessed`
  - missing/unreadable `.project.yaml`
  - missing `meta.id`
  - registry / `.project.yaml` identity mismatches
  - duplicate registry identity fields (`id` / `path` / `name`)
  - invalid topology / publication-policy normalization
  - compatibility-only legacy `active_project` evidence in state artifacts
- treated archived/reference projects as inventory-only during audit instead of
  forcing active managed-project topology/state checks
- added a reviewed phase-2 migration design with explicit invariants for:
  - explicit-target apply
  - plan hash verification
  - project-local migration lock
  - additive migration evidence
- implemented guarded apply for the currently supported deterministic actions:
  - patch-based registry cleanup
  - state surface rebuild when already provable
  - additive migration report + state summary pointer
- documented the current migration boundary and clarified that
  `agenticos_migrate_home` currently inventories registry-backed projects rather
  than scanning arbitrary on-disk directories
- published an operator migration guide with:
  - upgrade guidance
  - per-project checklist
  - mixed-state rollout advice
  - FAQ

## Verification

- `npm test`
- `npm run lint`

Result:

- `33` test files passed
- `274` tests passed
- lint passed

## Key Files

- `mcp-server/src/utils/migration-audit.ts`
- `mcp-server/src/utils/migration-project.ts`
- `mcp-server/src/tools/migration-audit.ts`
- `mcp-server/src/tools/migration-project.ts`
- `mcp-server/src/tools/__tests__/migration-audit.test.ts`
- `mcp-server/src/tools/__tests__/migration-project.test.ts`
- `mcp-server/src/index.ts`
- `mcp-server/README.md`
- `tasks/issue-263-legacy-project-migration-plan.md`
- `tasks/issue-263-phase2-technical-design-review.md`
- `tasks/issue-263-operator-migration-guide.md`

## Follow-Ups

- home-wide apply-safe-repair mode is still intentionally deferred until
  single-project migration is proven across more real projects
- filesystem-wide orphan discovery under `AGENTICOS_HOME/projects` is still not
  part of this tranche
- ambiguous identity / topology remediation remains explicit operator work, not
  automatic migration

## Risks / Notes

- `agenticos_migrate_home` is registry-backed by design in this tranche, so
  unregistered directories are not yet inventoried
- `agenticos_migrate_project` apply remains intentionally narrow and will still
  block on ambiguous/manual states
- historical evidence is preserved additively rather than rewritten
