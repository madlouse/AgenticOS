# PR Draft for #262

Closes #262.

## Title

`redesign: make project resolution session-local and remove runtime fallback to global active_project`

## Summary

This PR completes the main runtime-model redesign from `#262`.

It removes hidden runtime dependence on home-global `registry.active_project` and makes
project resolution rely on:

1. explicit target selection
2. provable `repo_path` identity where guardrails can prove it
3. session-local project binding
4. otherwise fail closed

The change also hardens registry persistence, refreshes generated adapter templates,
and updates normative design/spec docs to the runtime-home / multi-project model.

## What Changed

- added session-local project binding support and switched `agenticos_switch` semantics to bind the current MCP session
- removed runtime target resolution fallback through legacy `registry.active_project` for:
  - `record`
  - `save`
  - `status`
  - `agenticos://context/current`
  - standard-kit helpers
- updated guardrail resolution to prefer explicit `project_path`, then provable `repo_path`, then session-local binding, otherwise fail closed
- added registry patch/lock/reload/atomic-write semantics on the main write paths
- updated generated `AGENTS.md` / `CLAUDE.md` template wording and bumped template version to `v11`
- tightened standard-kit conformance/tests so session-start guidance must match the new semantics
- refreshed operator-facing/normative docs to reflect:
  - runtime home vs project workspaces
  - session-local project context
  - compatibility-only status of legacy `active_project`

## Verification

- `npm test`
- `npm run lint`

Result:

- `32` test files passed
- `255` tests passed
- lint passed

## Key Files

- `mcp-server/src/utils/project-target.ts`
- `mcp-server/src/utils/repo-boundary.ts`
- `mcp-server/src/utils/registry.ts`
- `mcp-server/src/utils/standard-kit.ts`
- `mcp-server/src/utils/distill.ts`
- `mcp-server/src/index.ts`
- `standards/knowledge/agent-friendly-readme-spec-v1.md`
- `standards/knowledge/standard-kit-command-design-v1-2026-03-23.md`
- `standards/knowledge/complete-design.md`

## Follow-Ups

- `#263` remains the migration-policy / operator-guidance follow-up for legacy managed projects
- historical RCA / implementation-report artifacts were intentionally preserved as historical evidence instead of being rewritten as current truth

## Risks / Notes

- the local installed/runtime MCP on the machine will still reflect old behavior until this branch is merged and shipped
- legacy `registry.active_project` still exists in schema/compatibility surfaces, but runtime command resolution no longer depends on it
