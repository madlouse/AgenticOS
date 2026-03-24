# Project Boundary Isolation Implementation Report - 2026-03-25

## Design Reflection

Issue `#25` is not primarily a routing problem.

It is a boundary-proof problem.

The product goal is not to guess user intent better at write time.
The safer goal is to make every project mutation prove the target project identity before mutating any files.

Three design options were considered:

1. keep trusting `registry.active_project`
2. require every write call to pass an explicit project argument
3. introduce one shared fail-closed project resolver and let write/read paths reuse it

The adopted design is option 3.

Why:

- option 1 preserves the original bug
- option 2 is safer, but would make normal workflows noisy and still duplicate validation logic
- option 3 gives one canonical identity-proof path, supports optional explicit project proof, and keeps current MCP ergonomics intact

The resulting contract is:

- registry alone is not enough
- `.project.yaml` alone is not enough
- project identity is only accepted when registry entry, registry uniqueness, project path, and `.project.yaml` metadata agree
- ambiguous identity fails closed
- explicit project selection that disagrees with the active project also fails closed

## What Changed

The implementation now adds a shared project-boundary resolver:

- `projects/agenticos/mcp-server/src/utils/project-target.ts`

It is now used by:

- `agenticos_record`
- `agenticos_save`
- `agenticos://context/current`

The resolver now proves project identity by validating:

- registry lookup
- active project or explicit project selection
- uniqueness of registry id/path/name
- `.project.yaml` readability
- `.project.yaml.meta.id`
- `.project.yaml.meta.name` when present

The tool surface also now exposes optional explicit project proof for:

- `agenticos_record`
- `agenticos_save`

Both tools now reject writes when:

- there is no active project and no explicit project
- the explicit project disagrees with the active project
- the registry has duplicate project identity fields
- `.project.yaml` is missing or unreadable
- `.project.yaml` metadata mismatches the registry entry

The context resource now also identifies the loaded project explicitly before returning project content:

- project id
- project path

## Verification

Verification completed in the isolated `#25` worktree:

- `npm install`
- `npm run build`
- `npm test`

Targeted coverage verification also ran against the changed files:

- `src/utils/project-target.ts`
- `src/resources/context.ts`
- `src/tools/record.ts`
- `src/tools/save.ts`

Coverage result for the changed files:

- `100%` statements
- `100%` lines
- `100%` functions

The targeted tests explicitly cover:

- ambiguous registry identity
- missing `.project.yaml`
- mismatched `.project.yaml` identity
- explicit-project / active-project disagreement
- context read fail-closed behavior
- record fail-closed behavior
- save fail-closed behavior
- degraded save states such as no git root, nothing-to-commit, commit failure, and push failure

## Outcome

AgenticOS now has a reusable project-boundary proof layer instead of ad hoc active-project trust.

This makes later work easier:

- `#26` can define what each memory layer may contain
- later validation can build on one canonical target resolver
- later bootstrap and sub-agent rules can assume project identity is already proven before writes occur
