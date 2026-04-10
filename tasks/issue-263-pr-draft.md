# PR Draft for #263

Closes #263.

## Title

`design: add report-only legacy managed-project migration audit surfaces`

## Summary

This PR lands the first safe slice of `#263`.

It adds report-only migration inventory commands after `#262` so operators can
audit legacy managed-project state without mutating projects or the home
registry.

The new surface is intentionally audit-first:

1. per-project audit via `agenticos_migration_audit`
2. registry-backed home inventory via `agenticos_migrate_home`
3. explicit `BLOCK` output for ambiguous or structurally unsafe states
4. no apply-mode mutation yet

## What Changed

- added `agenticos_migration_audit` for per-project report-only migration checks
- added `agenticos_migrate_home` for registry-backed home-wide inventory
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
- documented the report-only first-slice boundary and clarified that
  `agenticos_migrate_home` currently inventories registry-backed projects rather
  than scanning arbitrary on-disk directories

## Verification

- `npm test`
- `npm run lint`

Result:

- `33` test files passed
- `266` tests passed
- lint passed

## Key Files

- `mcp-server/src/utils/migration-audit.ts`
- `mcp-server/src/tools/migration-audit.ts`
- `mcp-server/src/tools/__tests__/migration-audit.test.ts`
- `mcp-server/src/index.ts`
- `mcp-server/README.md`
- `tasks/issue-263-legacy-project-migration-plan.md`

## Follow-Ups

- per-project explicit migration (`agenticos_migrate_project`) remains future
  work in `#263`
- home-wide apply-safe-repair mode is still intentionally deferred until
  single-project migration is proven
- filesystem-wide orphan discovery under `AGENTICOS_HOME/projects` is not part
  of this first report-only slice

## Risks / Notes

- `agenticos_migrate_home` is registry-backed by design in this slice, so
  unregistered directories are not yet inventoried
- report-only audit can prove that migration is needed, but it does not perform
  any mutation or write migration evidence yet
