# AgenticOS Topic To GBrain Reference Convention - 2026-05-21

## Purpose

Issue #452 defines the reference convention between AgenticOS durable topics and
GBrain semantic memory.

The convention exists to prevent a slow boundary failure: GBrain is useful
because it is shared semantic memory, but it must not become a duplicate
AgenticOS task board, project registry, or state file. AgenticOS remains the
owner of active topic state, tasks, artifacts, and execution workflow. GBrain
stores distilled summaries, entities, relations, and links that help Hermes,
Codex, Claude Code, and future agents rediscover context.

## Ownership Boundary

| Surface | Owns | Must not own |
| --- | --- | --- |
| GBrain | distilled summaries, entities, relations, stable decisions, timelines, cross-agent links | active task board, `.context/state.yaml`, raw secrets, raw captures, AgenticOS project registry |
| AgenticOS topic | current state, tasks, resume point, topic knowledge, artifacts, private captures | global semantic graph, Hermes-only preferences |
| AgenticOS project | issue workflow, worktrees, PR/CI evidence, release state, rollback evidence | GBrain entity graph |
| Hermes | routing, lightweight assistant memory, user-facing coordination | canonical task/state persistence |

Rule of thumb:

- If the question is "what should the next agent know semantically?", write a
  distilled GBrain summary or entity link.
- If the question is "what is currently open, blocked, in progress, or done?",
  write AgenticOS `tasks/<task_id>.yaml` and `.context/state.yaml`.
- If the question is "where is this project/topic registered and what path
  should tools use?", call AgenticOS MCP. Do not infer it from GBrain.

## Slug Rules

All AgenticOS and GBrain reference slugs must be safe to copy into YAML,
Markdown, logs, URLs, and shell-adjacent text:

- lowercase ASCII letters, numbers, and hyphens
- begins and ends with an alphanumeric character
- no spaces, `#`, slashes, shell metacharacters, control characters, or raw user
  text
- recommended maximum length: 80 characters

When a source title is longer or private, derive a short neutral slug and keep
the private detail in AgenticOS local topic state only.

## AgenticOS Reference URIs

Use `agenticos://` URIs when GBrain needs to point back to AgenticOS without
copying active state.

Canonical shapes:

```text
agenticos://topic/<topic_id>
agenticos://project/<project_id>
agenticos://task/<project_id>/<task_id>
agenticos://knowledge/<project_id>/<relative_path>
agenticos://artifact/<project_id>/<relative_path>
agenticos://issue/<owner>/<repo>/<number>
agenticos://pr/<owner>/<repo>/<number>
```

Contracts:

- `<topic_id>` and `<project_id>` are AgenticOS project ids, not display names.
- `<task_id>` is the task filename without `.yaml`.
- `<relative_path>` is project-relative and must not contain `..`.
- `agenticos://topic/...` may point to a topic implemented as an
  AgenticOS-managed project with `agenticos.project_kind: topic`.
- `agenticos://project/...` is for full execution projects, especially
  `github_versioned` projects.

Examples:

```text
agenticos://topic/personal-cognition-sleep
agenticos://task/personal-cognition-sleep/compare-evening-workout-effects
agenticos://knowledge/personal-cognition-sleep/sleep-and-cognition-research.md
agenticos://project/agenticos
agenticos://issue/madlouse/AgenticOS/452
```

## GBrain Reference URIs

Use `gbrain://` URIs inside AgenticOS `refs` when AgenticOS needs to point to
cross-agent semantic memory.

Recommended shapes:

```text
gbrain://topic/<slug>
gbrain://entity/<slug>
gbrain://decision/<slug>
gbrain://summary/<slug>
gbrain://relation/<source_slug>/<relation_slug>/<target_slug>
```

Contracts:

- GBrain pages hold distilled context, not task state.
- GBrain entity pages may link to AgenticOS topics/projects with
  `agenticos://...` references.
- GBrain decision pages may summarize rationale and link to the AgenticOS task
  or issue that owns execution.
- GBrain references must never be required to switch projects. Agents must use
  AgenticOS MCP for project/topic identity and workdir.

Example AgenticOS task ref:

```yaml
refs:
  - type: gbrain
    uri: gbrain://topic/sleep-evening-workout
    title: Sleep and evening workout summary
    visibility: private
  - type: knowledge
    uri: knowledge/sleep-and-cognition-research.md
    title: Local topic research notes
    visibility: private
```

## Allowed GBrain Content

GBrain may store:

- distilled summaries of a topic or project
- stable entities, names, aliases, and relationships
- decisions and rationale that are useful outside one AgenticOS topic
- source links, citations, and safe references to AgenticOS topics/tasks/issues
- credential-location references such as `op://...`, never credential values

GBrain must not store:

- raw secrets, tokens, passwords, cookies, private keys, one-time codes, or
  recovery phrases
- raw private transcripts or full sidecar captures
- complete AgenticOS task boards
- `.context/state.yaml` content as a copied state snapshot
- AgenticOS registry entries, filesystem paths as authority, or active workdir
  selection logic

## Reference Records

When GBrain stores a distilled topic summary, it should include only a compact
reference block:

```yaml
kind: agenticos_reference
agenticos:
  uri: agenticos://topic/personal-cognition-sleep
  project_id: personal-cognition-sleep
  project_kind: topic
  refs:
    - agenticos://task/personal-cognition-sleep/compare-evening-workout-effects
    - agenticos://knowledge/personal-cognition-sleep/sleep-and-cognition-research.md
summary_policy:
  stores_active_state: false
  stores_full_task_board: false
  stores_raw_private_capture: false
```

This record is a pointer and retrieval aid. It is not the authoritative
AgenticOS state.

## Update Direction

### AgenticOS To GBrain

At session end or after a meaningful synthesis:

1. Update AgenticOS topic/project state and tasks first.
2. Distill stable cross-agent learning into GBrain only when it is useful
   outside the current topic.
3. Include `agenticos://...` references back to the topic, task, knowledge file,
   issue, or PR.
4. Do not copy the full task board or state file into GBrain.

### GBrain To AgenticOS

When a GBrain page suggests active work:

1. Treat GBrain as background knowledge.
2. Call AgenticOS MCP to switch or create the topic/project.
3. Create or update `tasks/<task_id>.yaml` with a `gbrain://...` ref.
4. Update `.context/state.yaml` only through AgenticOS topic/project workflow.

## Examples

### Personal Topic

Scenario: the user wants to iteratively improve sleep, energy, and cognition.

AgenticOS owns:

```text
agenticos://topic/personal-cognition-sleep
agenticos://task/personal-cognition-sleep/compare-evening-workout-effects
agenticos://knowledge/personal-cognition-sleep/sleep-and-cognition-research.md
```

GBrain owns:

```text
gbrain://topic/sleep-evening-workout
gbrain://entity/evening-workout
gbrain://decision/test-two-week-evening-workout-window
```

GBrain summary content:

```text
The user is investigating whether evening workouts affect sleep quality.
Current AgenticOS topic: agenticos://topic/personal-cognition-sleep.
Active task reference: agenticos://task/personal-cognition-sleep/compare-evening-workout-effects.
```

GBrain does not store the full experiment checklist, private logs, or the
current resume point. Those remain in AgenticOS.

### Work Topic

Scenario: Hermes helps track a recurring lightweight workstream, such as
following up on HRMS team-member data quality.

AgenticOS owns:

```text
agenticos://topic/hrms-team-member-data-quality
agenticos://task/hrms-team-member-data-quality/reconcile-department-field-rules
agenticos://artifact/hrms-team-member-data-quality/data-quality-summary.md
```

GBrain owns:

```text
gbrain://topic/hrms-team-member-data-quality
gbrain://entity/hrms
gbrain://entity/team-member-directory
gbrain://relation/hrms/contains/team-member-directory
```

GBrain stores reusable concepts, glossary, stable system relationships, and a
link to the AgenticOS topic. It does not store private work messages, raw data
exports, or the active task board.

### Full Project Escalation

Scenario: a topic becomes a maintained tool, automation, MCP server, skill, or
release-managed product.

Before escalation:

```text
agenticos://topic/apple-health-export-analysis
gbrain://topic/apple-health-export-analysis
```

After escalation:

```text
agenticos://project/apple-health-analyzer
agenticos://issue/example/apple-health-analyzer/12
agenticos://pr/example/apple-health-analyzer/15
```

GBrain should keep a summary that the personal topic produced a maintained
project and link to the project/issue/PR. It must not become the project
registry or release tracker.

## Failure Cases

| Failure | Why it is wrong | Correct behavior |
| --- | --- | --- |
| GBrain stores raw access token found during a session | Violates secret boundary | Store no secret; at most store `op://...` or a redacted credential-location reference |
| GBrain stores every `tasks/*.yaml` record as a copied task board | Duplicates AgenticOS active state and will drift | Store a summary plus `agenticos://task/...` links |
| Hermes switches project by reading a GBrain page and running `cd` | Bypasses AgenticOS MCP and may use stale state | Call `agenticos_switch` and use the returned explicit workdir |
| GBrain becomes the list of known AgenticOS projects | Recreates the registry outside AgenticOS | Use AgenticOS registry/MCP for project identity and paths |
| AgenticOS task stores full GBrain page text in `description` | Copies semantic memory into operational state | Store a short operational description and a `gbrain://...` ref |
| GBrain stores `.context/state.yaml` as a snapshot | Creates stale resume state | Store a high-level summary and link to `agenticos://topic/...` |

## Minimum Validation Checklist

A future implementation satisfies this convention when it can prove:

- GBrain pages contain distilled summaries/entities/relations/links only.
- AgenticOS topic tasks use `refs` for `gbrain://...` links instead of copying
  GBrain pages.
- GBrain pages use `agenticos://...` links instead of copying AgenticOS task
  boards or state.
- Agents use AgenticOS MCP, not GBrain and not `cd`, for project/topic switching.
- Raw secrets and raw private captures are blocked or redacted on both sides.
- The AgenticOS registry remains the only authoritative project/path registry.

## Decision

Use `agenticos://...` for GBrain-to-AgenticOS references and `gbrain://...` for
AgenticOS-to-GBrain references.

GBrain is the cross-agent semantic layer. AgenticOS is the durable topic/project
operating layer. The two systems should link to each other deliberately without
copying each other's authoritative state.
