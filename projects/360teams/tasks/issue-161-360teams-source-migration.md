# Issue #161: Migrate 360teams-opencli Source Into Managed Project

## Goal

Use `projects/360teams` as the canonical 360Teams source location and absorb the externally parked `360teams-opencli` content into the managed project.

## Scope

- migrate repo-level assets that still only exist in `/Users/jeking/dev/360teams-opencli`
- land the `docs.read` / `miniapp-cdp` stabilization patch in `projects/360teams`
- keep implementation under AgenticOS issue/worktree/PR flow

## Required Code Delta

- `projects/360teams/clis/360teams/docs.js`
- `projects/360teams/clis/360teams/helpers.js`
- `projects/360teams/clis/360teams/miniapp-cdp.js`
- `projects/360teams/clis/360teams/tests/docs-parser.test.js`
- `projects/360teams/clis/360teams/tests/helpers.test.js`
- `projects/360teams/clis/360teams/tests/miniapp-cdp.test.js`

## Migration Rules

- do not copy derived artifacts like `node_modules/` or coverage output
- prefer committed content from the external repo, not its uncommitted working tree
- keep project-specific AgenticOS files in place: `.project.yaml`, `.context/`, `tasks/`, `knowledge/`

## Acceptance Criteria

- `projects/360teams` contains the authoritative docs stabilization patch
- managed-project tests pass from `projects/360teams`
- live runtime smoke remains green
- the migration is pushed and bound to Issue `#161`
