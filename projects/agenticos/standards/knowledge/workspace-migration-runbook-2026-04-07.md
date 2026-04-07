# AgenticOS Workspace Migration Runbook

> Date: 2026-04-07
> Issue: #195
> Purpose: move the live AgenticOS workspace off the current source checkout and verify that workspace operations no longer pollute product source

## 1. Rules

- the live `AGENTICOS_HOME` must not point inside the AgenticOS product source checkout
- the live workspace must contain portable workspace data:
  - `.agent-workspace/`
  - `projects/`
- supported local agent configs must point to the dedicated workspace root
- verification must include one real MCP workspace flow:
  - `list`
  - `switch`
  - `status`
- the product source checkout must remain unchanged before and after that flow

## 2. Execution Outline

1. back up the current agent config files and workspace registry
2. copy the portable workspace data into the new workspace root
   - preserve nested child `.git/` directories for standalone child repos
3. update agent configs with `agenticos-bootstrap`
4. apply manual fallback edits if a supported agent cannot be auto-updated
5. run the verification script
6. run a topology audit over `projects/*` in the new workspace
7. clean stale workspace-generated dirtiness from the source checkout only after the new workspace passes verification

## 3. Recorded Migration Outcome

- workspace root: `AGENTICOS_WORKSPACE_HOME`
- source checkout: `AGENTICOS_SOURCE_ROOT`
- Codex config migrated
- Cursor config migrated
- Claude settings required a manual env-path fallback because `claude` CLI was not present on PATH
- nested child repo metadata had to be restored for `projects/agent-cli-api/.git`
- the installed local `agenticos_init` path did not fully backfill `source_control.topology` during one normalization step, so topology audit remained necessary after migration
- shell profile updated
- `launchctl` session env updated
- product source checkout was cleaned after the new workspace verification passed

## 4. Repeatable Verification

Use:

```bash
export AGENTICOS_SOURCE_ROOT="/absolute/path/to/current-agenticos-source-root"
export AGENTICOS_WORKSPACE_HOME="/absolute/path/to/current-workspace-home"
"$AGENTICOS_SOURCE_ROOT/projects/agenticos/tools/verify-workspace-separation.sh" \
  "$AGENTICOS_SOURCE_ROOT" \
  "$AGENTICOS_WORKSPACE_HOME" \
  agent-cli-api
```

Expected result:

- the script exits `0`
- the script proves config separation
- the script proves workspace MCP flow succeeds
- the script proves the product source checkout does not gain new dirtiness

## 5. Manual Fallback Rule

If `agenticos-bootstrap` cannot update a supported local agent automatically:

- keep the bootstrap output as the primary source of truth
- manually update only the missing config entry
- re-run the verification script

Do not treat the migration as complete until the verification script passes.

This runbook documents a transitional separation step. The final target model is still `workspace home` plus `project source`, not a permanent requirement that users keep an external workspace path.
