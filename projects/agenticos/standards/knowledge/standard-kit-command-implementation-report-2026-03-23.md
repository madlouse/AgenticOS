# Standard-Kit Command Implementation Report - 2026-03-23

## Summary

Issue `#72` adds the first operational command surface for the downstream standard kit.

New MCP tools:

- `agenticos_standard_kit_adopt`
- `agenticos_standard_kit_upgrade_check`

## What Landed

### `agenticos_standard_kit_adopt`

The adopt command now:

- resolves a target project through explicit `project_path` or the active registry project
- loads the canonical standard-kit manifest
- creates missing directories needed by the kit surface
- copies missing copied-template files from canonical sources
- creates generated `AGENTS.md` and `CLAUDE.md` files when missing
- upgrades stale generated files when the template marker version is older than the current distill version
- avoids overwriting existing copied-template files

### `agenticos_standard_kit_upgrade_check`

The upgrade-check command now:

- resolves a target project through explicit `project_path` or the active registry project
- loads the canonical standard-kit manifest
- reports missing required files
- reports generated-file template version status
- reports copied-template status as:
  - `missing`
  - `matches_canonical`
  - `diverged_from_canonical`

## Supporting Changes

- added reusable standard-kit helpers under `projects/agenticos/mcp-server/src/utils/standard-kit.ts`
- registered both commands in the MCP server entry surface
- fixed `upgradeClaudeMd` so stale generated `CLAUDE.md` files can be upgraded correctly
- aligned generated navigation text so it includes:
  - `tasks/templates/non-code-evaluation-rubric.yaml`

## Verification

Verification completed in the isolated `#72` worktree:

- `npm install`
- `npm test -- --run src/tools/__tests__/standard-kit.test.ts`
- `npm test`

Result:

- `62 passed | 3 skipped`

## Limits of v1

This slice intentionally does not:

- overwrite project-owned copied templates in place
- auto-merge local copied-template customizations with canonical template changes
- mutate repository-root infrastructure such as `.github/`

## Follow-Up

The natural next step after v1 is:

- add a guided upgrade command or upgrade plan that can stage selective copied-template refreshes without silently overwriting project-owned files
