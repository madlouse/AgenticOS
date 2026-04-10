# Issue #262: Concurrent Runtime Project Resolution Redesign

## Summary

`#262` redesigns AgenticOS project-resolution semantics for the intended runtime model:

- `AGENTICOS_HOME` is a long-term runtime workspace
- `projects/` contains many managed projects
- multiple projects may be active in parallel
- a single project may have multiple agents working different issues and worktrees in parallel

The current implementation does not satisfy that model because it still treats
`registry.active_project` as a home-global enforcement primitive.

## Landed Progress

The following tranches are now implemented in the `#262` worktree:

- session-local project binding for `switch`, `status`, `list`, and context reads
- project-tool precedence updates for `record`, `save`, and `standard-kit`
- `init` no longer repopulates a home-global authoritative current project
- guardrail precedence updates for `preflight`, `edit-guard`, `issue-bootstrap`,
  `branch-bootstrap`, and `pr-scope-check`
- registry patch APIs with lock + reload + field patch + temp-file atomic rename
- patch-based registry writes for `switch`, `record`, and `init`

Still pending inside `#262`:

- review whether any remaining runtime write paths should migrate to patch APIs
- refresh broader generated/docs/status surfaces so all user-facing wording reflects the new model
- decide whether schema cleanup such as `last_selected_project` belongs in `#262` or should wait for `#263`

GitHub issue:

- https://github.com/madlouse/AgenticOS/issues/262

Live RCA confirmation:

- `tasks/issue-262-active-project-drift-live-rca-2026-04-10.md`

## Problem Statement

Current behavior is centered around a single mutable `active_project` stored in
`AGENTICOS_HOME/.agent-workspace/registry.yaml`.

This creates four structural failures:

1. `agenticos_switch` and `agenticos_init` mutate a home-global current-project value.
2. explicit `project` or `project_path` can still be rejected if they disagree with that unrelated global value.
3. registry persistence is a full-object rewrite, so stale snapshots can overwrite newer metadata.
4. tools that should only update lightweight metadata can accidentally replay or revert unrelated registry state.

This is not only a guardrail bug. It is a state-model bug.

## Non-Goals

- Do not directly implement `#245` public raw conversation isolation in this issue.
- Do not directly implement `#244` private full continuity persistence in this issue.
- Do not reopen `#260` scope.
- Do not perform the larger root Git detachment / product repo extraction here.

## State Model Contract

`#262` should formalize four distinct state layers.

### 1. Home-Global Registry

Purpose:

- project index
- project metadata
- lightweight workspace-level metadata

Allowed examples:

- project id, name, path, status, created
- last accessed
- last recorded
- optional compatibility metadata such as `last_selected_project`

Forbidden examples:

- global authoritative current project
- issue-local execution context
- worktree-local execution identity
- session-local project selection

### 2. Project-Global State

Purpose:

- project-shared durable operational memory

Allowed examples:

- quick-start
- current state
- knowledge
- tasks
- latest guardrail evidence
- latest issue bootstrap evidence

This layer already mostly exists inside each project's configured context paths.

### 3. Session-Local Context

Purpose:

- the current project bound to one MCP server session / agent process

Allowed examples:

- current project id
- current project path
- bound timestamp
- optional session-local notes for diagnostics

Design choice for `#262`:

- implement session-local context as in-memory state within the MCP server process
- do not persist it into the shared home-global registry

Rationale:

- current server model is stdio MCP, effectively one server process per agent session
- in-memory storage matches the meaning of session-local
- it avoids creating a second shared mutable file with the same class of race condition

### 4. Issue/Worktree-Local Identity

Purpose:

- execution identity for implementation-affecting work

Allowed examples:

- `project_path`
- `repo_path`
- `issue_id`
- branch
- worktree type
- git common root
- latest preflight / bootstrap / edit-guard evidence

This layer should become the primary trust chain for guardrail tools.

## Core Contract Changes

## A. `active_project` Semantics

Current problem:

- `resolveManagedProjectTarget()` rejects explicit `project` when it differs from `registry.active_project`

Required change:

- `active_project` must stop acting as a blocking enforcement source
- explicit `project`, explicit `project_path`, and provable `repo_path` must not be vetoed by a global registry value

Compatibility plan:

- keep loading legacy `active_project` during migration
- stop using it for fail-closed validation
- optionally rename the write-side concept to `last_selected_project` in a later schema cleanup

## B. Session-Local `switch`

Current problem:

- `agenticos_switch` mutates the home-global registry current project

Required change:

- `agenticos_switch` binds the current session to a target project
- it may patch lightweight registry metadata such as `last_accessed`
- it must not change a home-global current-project enforcement field

`agenticos_status`, `agenticos_list`, and `agenticos://context/current` must all
be updated to read session-local current project semantics.

## C. Registry Persistence

Current problem:

- `saveRegistry(registry)` rewrites the entire registry object

Required change:

- add registry patch APIs
- use file locking
- reload fresh inside the critical section
- apply only field-level mutations
- write through a temporary file and atomic rename

Recommended write API shape:

- `withRegistryLock()`
- `loadRegistryFresh()`
- `patchRegistry(mutationFn)`
- `patchProjectMetadata(projectId, patch)`
- `registerProject(...)`

`saveRegistry(registry)` should stop being the default business-path API.

Current landed state:

- `patchRegistry()` and `patchProjectMetadata()` now exist
- business-path writes for `switch`, `record`, and `init` already use patch-based writes
- `saveRegistry()` remains as a lower-level compatibility write path, not the preferred business API

## D. Unified Resolution Order

The system should stop using different and conflicting target-resolution rules.

Recommended unified precedence:

### Project Tools

Applies to:

- `record`
- `save`
- `status`
- `context/current`
- standard-kit helpers

Resolution order:

1. explicit `project_path` if supported
2. explicit `project`
3. session-local current project
4. otherwise fail closed; do not resolve through legacy registry current-project state

### Guardrail and Execution Tools

Applies to:

- `preflight`
- `branch-bootstrap`
- `pr-scope-check`
- `issue-bootstrap`
- `edit-guard`

Resolution order:

1. explicit `project_path`
2. provable `repo_path`
3. session-local project only as advisory fallback
4. otherwise fail closed; never let unrelated legacy global state substitute for explicit or provable identity

## Command-by-Command Design

### `resolveManagedProjectTarget()`

Refactor into two concepts:

- explicit/provable target resolution
- session-default target resolution

It should no longer combine explicit target proof with a legacy active-project consistency check.

### `agenticos_switch`

Should:

- validate target project
- bind session-local current project
- patch project `last_accessed`
- return the same rich context summary as today

Should not:

- mutate global current-project enforcement state

### `agenticos_status`

Should:

- accept optional `project`
- use session-local current project when no explicit project is passed
- fail clearly if there is no explicit target and no session binding

### `agenticos_list`

Should:

- list registry projects
- optionally highlight the session-local current project
- stop presenting a home-global active project as the single current truth

### `agenticos://context/current`

Should:

- mean current session project context
- fail clearly when the session is unbound
- optionally gain a separate explicit-project variant in a later iteration if useful

### `agenticos_record`

Should:

- resolve project explicitly or from session-local binding
- update only the target project's `last_recorded`
- stop writing stale registry snapshots back

### `agenticos_save`

Should:

- resolve project explicitly or from session-local binding
- remain project-scoped
- stop depending on legacy global current-project state

### `standard-kit`

Should:

- prefer explicit `project_path`
- otherwise use session-local current project
- stop consulting registry `active_project` as a hidden fallback

### Guardrail Tools

Should:

- trust explicit `project_path`
- trust provable `repo_path`
- use issue/worktree evidence as the main execution identity chain
- treat session-local current project only as supportive context

### `edit-guard`

Should:

- block on mismatched resolved target identity versus latest issue/bootstrap/preflight evidence
- stop centering its logic on `active_project mismatch`

## Concurrency Design

Recommended solution:

- session-local current project: in-memory only
- home-global registry: lock + reload + field patch + temp file + atomic rename

Why this combination:

- lock prevents cross-process concurrent writes from interleaving
- reload prevents stale in-memory objects from overwriting newer state
- field patch avoids replaying unrelated fields
- atomic rename avoids partial-file corruption

Rejected alternatives for `#262`:

- CAS only: still leaves high retry/merge complexity
- append log / event sourcing: too heavy for this scope
- unprotected patch writes: still unsafe across processes

## Migration and Compatibility

Migration goals:

- old registries with `active_project` still load
- old docs and tests do not remain semantically wrong
- commands fail with clear messages when session binding is missing

Compatibility policy:

- read legacy `active_project`
- stop using it as a hard gate
- update tool descriptions and generated docs to stop telling operators that a single global active project is authoritative

## Required Documentation Updates

At minimum update:

- `CLAUDE.md`
- `AGENTS.md`
- `mcp-server/README.md`
- tool descriptions in `mcp-server/src/index.ts`
- generated distill / entry-surface wording
- any audit scripts or knowledge docs that still prescribe “switch the global active project” as the truth model

## Required Test Matrix

### Session-Local Behavior

- two parallel sessions bind different projects and do not interfere
- status and context/current reflect the current session binding
- unbound session returns the correct error

### Explicit Precedence

- explicit `project_path` beats any legacy registry state
- explicit `project` beats session fallback
- provable `repo_path` beats legacy registry state

### Registry Concurrency

- concurrent `last_accessed` and `last_recorded` updates are both preserved
- stale snapshot cannot overwrite newer fields
- atomic write path never leaves malformed YAML on disk
- lock release and retry behavior is covered

### Command Regression Coverage

- `record` works without legacy active-project checks
- `save` works without legacy active-project checks
- `standard-kit` no longer depends on registry active project
- guardrail tools keep explicit/provable target precedence
- edit-guard blocks on evidence mismatch rather than legacy active-project mismatch

### Migration Coverage

- legacy registry containing `active_project` loads correctly
- new schema writes remain readable
- no runtime command resolves its target through legacy `active_project`
- no command still emits “must match active project” semantics

## Execution Order

1. Introduce session-context abstraction.
2. Introduce registry lock and patch APIs.
3. Migrate `switch/status/list/context/current`.
4. Migrate `record/save`.
5. Migrate `standard-kit`.
6. Migrate guardrail and edit-guard resolution semantics.
7. Update docs, templates, tool descriptions, and tests.

Current state:

- 1 through 6 are implemented in the worktree
- 7 is partially implemented and remains open for broader wording/template cleanup

## Acceptance Checks

- no explicit or provable project identity is blocked by unrelated registry global state
- `switch` no longer mutates a home-global authoritative current project
- registry writes are concurrency-safe
- stale registry snapshots cannot revert newer state
- session-local project binding is observable and reliable
- docs and tool descriptions reflect the new runtime model
