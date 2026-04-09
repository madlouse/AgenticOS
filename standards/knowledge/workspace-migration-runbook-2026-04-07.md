# AgenticOS Workspace Migration Runbook

> Date: 2026-04-07
> Issue: #195
> Purpose: document the temporary external-workspace mitigation that moved live
> workspace activity off the product-source repo root before the final
> workspace-home model was fully restored

> Historical note: this runbook records a transitional mitigation, not the final
> steady-state storage model. The final terminology is frozen in
> `workspace-home-vs-project-source-model-2026-04-07.md`.

## 1. Transitional Rules

- the live `AGENTICOS_HOME` must not point at the AgenticOS product-source repo root
- during this mitigation phase, the live workspace was moved to a temporary external workspace home
- the live workspace must contain portable workspace data:
  - `.agent-workspace/`
  - `projects/`
- supported local agent configs must point to the chosen workspace home for the mitigation
- verification must include one real MCP workspace flow:
  - `list`
  - `switch`
  - `status`
- the product source repo root must remain unchanged before and after that flow

## 2. Execution Outline

1. back up the current agent config files and workspace registry
2. copy the portable workspace data into the temporary workspace home
   - preserve nested child `.git/` directories for standalone child repos
3. update agent configs with `agenticos-bootstrap`
4. apply manual fallback edits if a supported agent cannot be auto-updated
5. run the verification script
6. run a topology audit over `projects/*` in the new workspace
7. clean stale workspace-generated dirtiness from the product source root only after the new workspace passes verification

## 3. Recorded Migration Outcome

- mitigation workspace home: `AGENTICOS_WORKSPACE_HOME`
- product source root: `AGENTICOS_SOURCE_ROOT`
- Codex config migrated
- Cursor config migrated
- Claude settings required a manual env-path fallback because `claude` CLI was not present on PATH
- nested child repo metadata had to be restored for `projects/agent-cli-api/.git`
- the installed local `agenticos_init` path did not fully backfill `source_control.topology` during one normalization step, so topology audit remained necessary after migration
- shell profile updated
- `launchctl` session env updated
- product source root was cleaned after the new workspace verification passed

## 4. Repeatable Verification

Use:

```bash
export AGENTICOS_SOURCE_ROOT="/absolute/path/to/current-agenticos-product-source-root"
export AGENTICOS_WORKSPACE_HOME="/absolute/path/to/current-workspace-home"
"$AGENTICOS_SOURCE_ROOT/projects/agenticos/tools/verify-workspace-separation.sh" \
  "$AGENTICOS_SOURCE_ROOT" \
  "$AGENTICOS_WORKSPACE_HOME" \
  agent-cli-api
```

Expected result:

- the script exits `0`
- the script proves config separation for the chosen workspace home
- the script proves workspace MCP flow succeeds
- the script proves the product source root does not gain new dirtiness

## 5. Manual Fallback Rule

If `agenticos-bootstrap` cannot update a supported local agent automatically:

- keep the bootstrap output as the primary source of truth
- manually update only the missing config entry
- re-run the verification script

Do not treat the migration as complete until the verification script passes.

This runbook documents a transitional separation step. The final target model is
still `workspace home` plus `project source`, not a permanent requirement that
users keep an external workspace path. In the steady state, the enclosing
`AgenticOS/` path may itself be the valid `AGENTICOS_HOME` as long as the
product source remains the child project at `projects/agenticos`.
