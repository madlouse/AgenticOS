# Issue #262 Live RCA Confirmation — 2026-04-10

## Purpose

This note captures a concrete live reproduction of the remaining
`active_project` drift behavior on the machine runtime after `#260`, and
explains why `#262` is still necessary.

The important conclusion is:

- the drift is not random
- the drift is not caused by the Agentic Home directory layout itself
- the drift is the expected outcome of the old home-global
  `registry.active_project` runtime model still being live

## Observed Symptom

During concurrent project work on 2026-04-10:

1. the session explicitly switched to `AgenticOS`
2. a subsequent `agenticos_record(project="AgenticOS")` failed because the
   runtime believed the active project was `agent-cli-api`
3. the shared home registry confirmed that `active_project` had already drifted
   back to `agent-cli-api`

Relevant registry evidence:

- `AGENTICOS_HOME/.agent-workspace/registry.yaml`
- at observation time:
  - `active_project: agent-cli-api`
  - `agenticos.last_accessed: 2026-04-10T14:26:25.659Z`
  - `agenticos.last_recorded: 2026-04-10T14:26:37.346Z`
  - `agent-cli-api.last_accessed: 2026-04-10T14:26:54.276Z`
  - `agent-cli-api.last_recorded: 2026-04-10T14:27:10.425Z`

This proves a different project session updated the global current-project field
immediately after the `AgenticOS` session had been working correctly.

## Root Cause

### 1. The live runtime still treats `registry.active_project` as authoritative

On the current `main` checkout, `resolveManagedProjectTarget()` still:

- fails when no `registry.active_project` exists
- rejects an explicit `project` if it does not match `registry.active_project`
- falls back to `registry.active_project` as the default target

Evidence:

- `mcp-server/src/utils/project-target.ts`
  - lines 65-66: no active project -> hard failure
  - lines 82-85: explicit project mismatch -> hard failure
  - lines 87-92: default target comes from `registry.active_project`

This is exactly the error string observed in the live failed `agenticos_record`
attempt, which confirms the runtime was still executing the pre-`#262`
semantics.

### 2. `agenticos_switch` still writes a home-global current project on `main`

On `main`, `agenticos_switch` does:

- `registry.active_project = found.id`
- then persists the entire registry

Evidence:

- `mcp-server/src/tools/project.ts`
  - lines 243-245

That means any session switching to any project overwrites the shared
home-global current project for all other sessions.

### 3. `status` and `list` still read the same home-global field on `main`

On `main`:

- `agenticos_list` highlights the project whose id equals
  `registry.active_project`
- `agenticos_status` loads whatever project is stored in
  `registry.active_project`

Evidence:

- `mcp-server/src/tools/project.ts`
  - lines 315-317
  - lines 332-340

So even if one session is logically working in project A, a different session's
later switch to project B will redirect status/list output back to B.

### 4. Guardrail resolution still prefers the global field on `main`

On `main`, `resolveGuardrailProjectTarget()` does this order:

1. explicit `project_path`
2. `active_project`
3. `repo_path` match

Evidence:

- `mcp-server/src/utils/repo-boundary.ts`
  - lines 116-169

This is the wrong precedence for the target runtime model because a stale or
unrelated global field can outrank a provable repository location.

### 5. `init` also repopulates the home-global field on `main`

On `main`, `agenticos_init` writes `registry.active_project = id` in both the
"already exists" normalization path and the final project registration path.

Evidence:

- `mcp-server/src/tools/init.ts`
  - lines 160-161
  - lines 250-251

So the drift is not only caused by explicit switching. Project creation or
normalization can also silently move the global current-project pointer.

### 6. Registry persistence on `main` still uses full-object rewrite

On `main`, `saveRegistry(registry)` writes the full registry snapshot without
lock + reload + field patch semantics.

Evidence:

- `mcp-server/src/utils/registry.ts`
  - lines 76-92

This creates a second class of problem:

- even lightweight metadata updates can replay stale in-memory registry state
- concurrent sessions can overwrite unrelated registry changes

That amplifies the impact of the global `active_project` design.

## Why Multiple Projects All See The Same Problem

The bug is structural, not project-specific.

As long as the runtime model is:

- one shared `AGENTICOS_HOME`
- one shared `registry.yaml`
- one authoritative `active_project` field inside that shared file

then any concurrent project session can overwrite the selection observed by any
other project session.

That is why the symptom appears across unrelated projects.

## Why `#262` Fixes The Actual Root Cause

The `#262` branch changes the model instead of only patching the symptom.

Key differences already implemented there:

1. `resolveManagedProjectTarget()` uses:
   - explicit `project`
   - otherwise session-local project binding
   - otherwise fail closed
   - no runtime veto from `registry.active_project`
2. `agenticos_switch` binds session-local context and only patches
   lightweight metadata such as `last_accessed`
3. `agenticos_status` and `agenticos_list` read the session-local binding
4. guardrail resolution prefers:
   - explicit `project_path`
   - provable `repo_path`
   - session-local binding
   - otherwise fail closed
5. registry business-path writes now use lock + reload + patch + atomic rename

Relevant `#262` evidence:

- `mcp-server/src/utils/project-target.ts`
  - lines 65-95 in the `#262` worktree
- `mcp-server/src/tools/project.ts`
  - lines 244-257
  - lines 317-350
- `mcp-server/src/utils/repo-boundary.ts`
  - lines 133-240
- `mcp-server/src/utils/registry.ts`
  - lines 112-190

## Final Judgment

The live drift observed on 2026-04-10 is explained by one fact:

- the installed/runtime MCP behavior on the machine is still effectively
  pre-`#262`

So the required corrective action is not another local workaround around
`active_project`.

The required corrective action is:

1. merge `#262` / PR `#264`
2. ship the updated runtime so the installed MCP stops using the old semantics
3. continue `#263` only for compatibility-state migration and operator guidance,
   not as a substitute for the `#262` runtime redesign
