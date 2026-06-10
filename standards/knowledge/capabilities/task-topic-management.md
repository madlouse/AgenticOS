# Task And Topic Management

## 1. Overview

Task/topic management lets AgenticOS represent durable personal, work, and
project follow-up as structured YAML tasks rather than ephemeral chat intent.
Topics and projects are both user-facing "projects" when that language is more
natural, but AgenticOS can still route internally with `project_kind`.

Public surfaces:

- `agenticos_task_create`
- `agenticos_task_update`
- `agenticos_task_list`
- `agenticos_task_close`
- `project_kind: topic|project`
- `tasks/<task_id>.yaml`

User value: Hermes-style personal/life/work topics can evolve over time without
forcing every topic into a code repository, while implementation projects can
still use strict Git flow.

## 2. Detailed Design

The task contract stores:

- `id`
- `title`
- `status`
- `priority`
- `source`
- `acceptance_criteria`
- `refs`
- `created_at`
- `updated_at`

Task create deduplicates by explicit id or source dedupe key. Creating or
updating a task synchronizes `.context/state.yaml` so `current_task` and resume
signals remain aligned. Closing a task clears matching current/resume state.

Invariants:

- A task must attach to a known project/topic.
- Secret-looking raw input must be rejected rather than persisted.
- Duplicate task creation returns existing state instead of producing a second
  task.
- Topic tasks and repo implementation tasks share the same MCP API but do not
  imply the same Git workflow.

Failure modes:

- Creating tasks without project context.
- Persisting secrets in task title/criteria.
- GBrain or Hermes duplicating AgenticOS active task boards.

## 3. Implementation Mapping

| Surface | Files/Tests | Notes |
| --- | --- | --- |
| Task API | `mcp-server/src/tools/task.ts`, `task.test.ts` | CRUD and state synchronization. |
| Smoke flow | `mcp-server/src/__tests__/durable-topic-task-smoke.test.ts` | End-to-end topic/project task behavior. |
| Project kind | `mcp-server/src/tools/init.ts`, project contract tests | Topic/project routing metadata. |
| Design docs | `agenticos-topic-task-contract-2026-05-21.md`, `hermes-side-durable-topic-integration-model-2026-05-21.md` | Defines topic/task usage. |
| GBrain convention | `agenticos-topic-gbrain-reference-convention-2026-05-21.md` | Keeps GBrain as summary/reference layer. |

Issue cluster: 8 topic/task issues. No open issue in this cluster at refresh
time.

Status: implemented and covered by unit and smoke tests.

## Gaps

No active implementation gap was found in the issue cluster. The main design
risk is future product drift: Hermes/GBrain/channel integrations must not copy
AgenticOS active task state into separate task boards.
