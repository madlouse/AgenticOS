# Standard-Kit Command Design v1 - 2026-03-23

## Summary

Issue `#72` adds first-class command entry points for the downstream standard kit.

The smallest safe first slice is:

1. `agenticos_standard_kit_adopt`
2. `agenticos_standard_kit_upgrade_check`

This slice intentionally does **not** implement destructive in-place copied-template upgrades.

## Why This Slice

The current product already has:

- canonical kit metadata in `projects/agenticos/.meta/standard-kit/manifest.yaml`
- canonical copied templates in `projects/agenticos/.meta/templates/`
- canonical generated guidance in `distill.ts`

What is still missing is an operational surface that lets another project:

- adopt the standard kit
- inspect its upgrade posture later

## Command Roles

### `agenticos_standard_kit_adopt`

Purpose:

- materialize the canonical standard kit into a downstream project root

Behavior in v1:

- load the standard-kit manifest
- resolve the target project root
- create missing parent directories
- copy missing copied-template files from canonical sources
- create generated files (`AGENTS.md`, `CLAUDE.md`) if missing
- upgrade generated files if their template marker version is stale
- do **not** overwrite existing copied-template files

Return shape should report:

- target path
- kit version
- files created
- generated files upgraded
- copied-template files skipped because they already exist

### `agenticos_standard_kit_upgrade_check`

Purpose:

- compare an existing downstream project against the canonical kit surface without mutating it

Behavior in v1:

- load the standard-kit manifest
- resolve the target project root
- report missing required files
- report generated-file template version status
- report copied-template status:
  - `missing`
  - `matches_canonical`
  - `diverged_from_canonical`

Return shape should report:

- target path
- kit version
- missing files
- generated file statuses
- copied-template statuses

## Deliberate Non-Goals

v1 should not:

- overwrite project-owned copied templates in place
- auto-merge local changes with canonical template updates
- mutate repository-root infrastructure such as `.github/`
- require a project to already be registered if an explicit path is given

## Resolution Rules

Target resolution should support:

1. explicit `project_path`
2. fallback to the active project in the registry

This keeps the command usable both for registered AgenticOS projects and for directed adoption flows.

## Verification

The first bounded implementation should be considered sufficient if:

1. tests prove adopt creates missing kit files without overwriting project-owned templates
2. tests prove upgrade-check correctly classifies missing, matching, diverged, and stale generated files
3. MCP tool registration exposes both commands with explicit descriptions and schemas
