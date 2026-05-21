# AgenticOS Topic Task Contract - 2026-05-21

## Purpose

Issue #446 defines the durable task contract for AgenticOS topics before MCP
task APIs are implemented.

This contract exists because Hermes-side durable topics need real operational
state without pretending every long-running topic is a GitHub-backed engineering
project. AgenticOS owns topic state, tasks, artifacts, and durable topic
knowledge. Hermes may classify the request and call AgenticOS MCP. GBrain may
store distilled semantic summaries and references. Neither Hermes nor GBrain is
the canonical active task board for AgenticOS topics.

## Scope

This contract applies to AgenticOS-managed topics and may also be used inside
full projects for local planning. It defines the canonical file shape for
AgenticOS topic tasks:

```text
tasks/<task_id>.yaml
```

The task file is the source of truth for a topic task. `.context/state.yaml`
may point to a task as the current or resume target, but it must not duplicate
the full task board.

## File Layout

Every durable topic task is stored as one YAML document:

```text
tasks/
  improve-sleep-routine.yaml
  compare-gbrain-routing-options.yaml
  20260521-research-local-llm-choice.yaml
```

`<task_id>` must be filesystem-safe and branch-safe:

- lowercase ASCII letters, numbers, and hyphens only
- begins and ends with an alphanumeric character
- no `#`, spaces, slashes, shell metacharacters, or control characters
- recommended maximum length: 80 characters

MCP tools must derive the path only after validating and normalizing the
`task_id`. User-provided titles, URLs, chat text, or GitHub issue names must
never be concatenated directly into a file path.

## Required YAML Fields

Required fields:

```yaml
id: improve-sleep-routine
title: Improve sleep routine after evening workouts
status: open
priority: medium
source:
  kind: hermes
  origin: chat
  dedupe_key: hermes:topic:sleep:evening-workout
acceptance_criteria:
  - Track current hypothesis and next two experiments.
  - Preserve decisions and evidence without storing private raw logs.
refs:
  - type: gbrain
    uri: gbrain://topic/sleep-evening-workout
    title: Sleep and evening workout summary
    visibility: private
created_at: "2026-05-21T10:00:00Z"
updated_at: "2026-05-21T10:00:00Z"
```

Field contract:

| Field | Type | Contract |
| --- | --- | --- |
| `id` | string | Must exactly match `<task_id>` without `.yaml` |
| `title` | string | Human-readable task title, not used as the path authority |
| `status` | enum | One of `open`, `in_progress`, `blocked`, `done`, `canceled` |
| `priority` | enum | One of `low`, `medium`, `high`, `urgent`; default is `medium` |
| `source` | object | Where the task came from and how dedupe should work |
| `acceptance_criteria` | string array | Observable completion checks |
| `refs` | object array | Links to related knowledge, artifacts, issues, chats, or GBrain entries |
| `created_at` | ISO-8601 string | Creation timestamp in UTC |
| `updated_at` | ISO-8601 string | Last material update timestamp in UTC |

Recommended optional fields:

| Field | Type | Contract |
| --- | --- | --- |
| `description` | string | Short operational context, not a transcript |
| `owner` | string | Human, agent, or team responsible for progress |
| `labels` | string array | Lightweight routing tags |
| `blocked_reason` | string | Required when `status` is `blocked` |
| `closed_at` | ISO-8601 string | Required when `status` is `done` or `canceled` |
| `related_tasks` | string array | Other AgenticOS task ids |
| `privacy` | object | Task-specific handling when stricter than project policy |

## Source Object

The `source` object identifies how the task was created.

```yaml
source:
  kind: hermes
  origin: chat
  source_id: "chatcmpl-or-session-id-if-safe"
  dedupe_key: hermes:topic:sleep:evening-workout
```

Allowed `kind` values:

- `user`
- `hermes`
- `codex`
- `claude_code`
- `agenticos_mcp`
- `github`
- `manual`

Allowed `origin` values:

- `chat`
- `mcp`
- `github_issue`
- `gbrain`
- `capture`
- `manual`
- `import`

`source_id` is optional. It must not contain raw private conversation text,
tokens, secret values, or external identifiers that should not be published.

`dedupe_key` is optional but recommended. When omitted, MCP tools should derive
a stable dedupe key from normalized `title`, `source.kind`, `source.origin`,
and canonical `refs`.

## Refs Object

`refs` connects the task to evidence without copying that evidence into the
task file.

```yaml
refs:
  - type: knowledge
    uri: knowledge/hermes-side-durable-topic-integration-model-2026-05-21.md
    title: Hermes-side durable topic integration model
    visibility: public
  - type: private_capture
    uri: agenticos-private://projects/hermes-agent/captures/2026-05-21
    title: Private session capture
    visibility: private
```

Allowed `type` values:

- `knowledge`
- `artifact`
- `task`
- `github_issue`
- `github_pr`
- `gbrain`
- `private_capture`
- `external_url`
- `note`

Allowed `visibility` values:

- `public`
- `private`
- `restricted`

Private refs may point to local sidecar evidence or GBrain entries, but the task
file must store only a safe reference and short title.

## Status Lifecycle

Canonical statuses:

| Status | Meaning | Allowed next statuses |
| --- | --- | --- |
| `open` | Accepted durable task, not actively worked | `in_progress`, `blocked`, `done`, `canceled` |
| `in_progress` | Current active work | `blocked`, `done`, `canceled`, `open` |
| `blocked` | Cannot progress without a dependency or decision | `in_progress`, `canceled`, `open` |
| `done` | Acceptance criteria satisfied | none by default |
| `canceled` | Deliberately abandoned or superseded | none by default |

Closed statuses are `done` and `canceled`. Reopening a closed task requires an
explicit update action and must preserve `closed_at` history through a future
audit or ledger surface.

`blocked_reason` is required for `blocked`. `closed_at` is required for `done`
and `canceled`.

## Idempotency And Dedupe

Task creation must be idempotent.

`agenticos_task_create` should return an existing non-closed task instead of
creating a duplicate when any of these match:

- exact `id`
- exact `source.dedupe_key`
- derived dedupe key from normalized `title`, `source.kind`, `source.origin`,
  and canonical `refs`

Normalization rules:

- lowercase
- collapse whitespace to one space
- trim leading and trailing whitespace
- ignore punctuation-only differences for title matching
- sort refs by `type` and `uri` before deriving a key

If a matching task is `done` or `canceled`, creation should not silently reopen
it. The default behavior is to create a new task with a new id and a
`related_tasks` reference to the closed task. Reopen must be explicit.

## Relationship To `.context/state.yaml`

`.context/state.yaml` is the mutable entry state. It may mirror a small pointer
to the active task:

```yaml
current_task:
  id: improve-sleep-routine
  title: Improve sleep routine after evening workouts
  status: in_progress
  updated: "2026-05-21T10:30:00Z"
  next_step: Run the next sleep experiment and record the result.
resume:
  task_id: improve-sleep-routine
  reason: Continue the current durable topic task.
```

Rules:

- The task file remains canonical for task fields and acceptance criteria.
- State may contain only entry-friendly task summary and resume hints.
- When a task becomes `in_progress`, MCP should update `current_task`.
- When the current task is closed, MCP should clear or advance `current_task`.
- State freshness warnings should compare `current_task.id` against
  `tasks/<task_id>.yaml`.

This prevents stale state from pretending to be a complete task board while
still giving agents a fast resume path.

## Privacy Rules

Task files inherit the project or topic context publication policy. For many
Hermes-side personal topics, that will be `private_continuity` or local-only.

Always apply these rules:

- Do not store raw secrets, tokens, cookies, passwords, private keys, or one-time
  codes in task files.
- Do not paste raw chat transcripts into `description` or `acceptance_criteria`.
- Store references to secret locations, such as `op://...`, not secret values.
- Use `refs` for private captures instead of copying sensitive evidence.
- Redact personal data unless the topic requires it and the project policy
  allows local private storage.
- If a task is generated from a private chat, `source.source_id` and `refs`
  must be safe to persist under the topic policy.

MCP APIs must fail closed or redact when inputs include obvious secret material
or control characters.

## Topic Tasks Versus GitHub Issues

AgenticOS topic tasks are not a replacement for GitHub issues in full
engineering projects.

| Surface | Use for | Owner | Rollback model |
| --- | --- | --- | --- |
| `tasks/<task_id>.yaml` | Durable topic work, personal/work assistant tasks, research follow-ups, local planning | AgenticOS topic/project | Local state and later ledger/audit |
| GitHub issue | Engineering work that changes code, config, CI, releases, or public docs | GitHub-backed AgenticOS project | PR merge commit and revert |
| GitHub PR | Reviewed implementation, validation, and merge evidence | GitHub-backed AgenticOS project | Merge commit and revert |

For a `github_versioned` project, code/config/release work must still follow
the issue-first workflow: issue bootstrap, isolated worktree, preflight, edit
guard, scope check, PR, CI, merge, and cleanup.

Topic tasks are appropriate when the work is durable but not yet a software
change:

- recurring personal planning
- cognitive-growth research
- assistant-mediated life/work topics
- multi-session investigations
- artifacts that do not need a code review path

If a topic task begins to require code, config, release, or rollback-managed
changes, it should escalate into a GitHub issue or a full AgenticOS project
workflow.

## MCP API Implications

Future MCP APIs should implement this contract as the data plane:

- `agenticos_task_create` validates input, normalizes the id, dedupes, writes
  `tasks/<task_id>.yaml`, and updates state when requested.
- `agenticos_task_update` updates allowed fields, preserves timestamps, and
  validates lifecycle transitions.
- `agenticos_task_list` reads task YAML files and may filter by status,
  priority, source, or label.
- `agenticos_task_close` transitions to `done` or `canceled`, writes
  `closed_at`, and reconciles `.context/state.yaml`.

The APIs must never claim success when MCP is unavailable or when filesystem
writes fail. A chat-side assistant may propose a task, but AgenticOS MCP must
persist it for the task to exist.

## Minimum Validation Checklist

An implementation satisfies this contract when it can prove:

- `tasks/<task_id>.yaml` is the canonical task path.
- Required fields are present and schema-valid.
- `id` matches the filename.
- Status transitions follow the lifecycle.
- Creation is idempotent for matching ids and dedupe keys.
- Privacy rules prevent raw secret and raw transcript persistence.
- `.context/state.yaml` points to tasks instead of duplicating the board.
- Full engineering work still escalates to GitHub issues and PR workflow.

## Decision

Adopt `tasks/<task_id>.yaml` as the AgenticOS durable topic task contract.

This keeps Hermes lightweight, keeps GBrain semantic, and gives AgenticOS the
operational task/state layer needed for durable topics.
