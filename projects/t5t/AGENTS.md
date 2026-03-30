<!-- agenticos-template: v4 -->
# AGENTS.md — T5T

## Adapter Role

`AGENTS.md` is the Codex/generic adapter surface for this project.
It must expose the same canonical policy as other agent adapters rather than defining a different workflow.

## Canonical Policy (Shared Across Agents)

- This project has one canonical AgenticOS execution policy across Claude Code, Codex, and other supported agents.
- Implementation work must stay issue-first, preflighted, and inside the guardrail-controlled branch/worktree flow.
- PR creation or merge must not happen before executable scope validation passes.
- Recording and save flow remain canonical project requirements rather than runtime-specific preferences.
## Codex / Generic Runtime Notes

- If natural-language routing is weak, use explicit `agenticos_*` tool calls before treating the issue as transport failure.
- Bootstrap differences are runtime concerns rather than policy changes.
## Guardrail Protocol (MANDATORY)

Implementation work must use the executable guardrail flow:

1. call `agenticos_preflight` before editing
2. if preflight returns `REDIRECT`, call `agenticos_branch_bootstrap`
3. do not submit a PR before running `agenticos_pr_scope_check`

If any guardrail returns `BLOCK`, stop and resolve the blocking reason first.

## Recording Protocol (MANDATORY)

This project uses AgenticOS for persistent context management.
All session activity MUST be recorded via MCP tools.

### How to Record

Call the MCP tool `agenticos_record` with:
- `summary` (required): What happened in this session
- `decisions`: Key decisions made
- `outcomes`: What was accomplished
- `pending`: What remains to be done
- `current_task`: { title, status } to update current task

### When to Record

1. After completing any meaningful unit of work
2. Before ending the session (MANDATORY — context is lost otherwise)

After recording, call `agenticos_save` to commit to Git.

### Session Start

On session start, read these files for context:
1. `.project.yaml` — Project metadata
2. `.context/quick-start.md` — human-readable project summary
3. `.context/state.yaml` — Current state and working memory
4. `.context/conversations/` — Previous session records

Then greet the user with: project name, last progress, current pending items, suggested next step.

## Project

**Name**: T5T
**Description**: Recovered snapshot of the T5T weekly progress tracking project, reconstructed from verified local sources on 2026-03-25.

## Directory Structure

| Path | Purpose |
|------|---------|
| `.project.yaml` | Project metadata |
| `.context/quick-start.md` | Quick project summary |
| `.context/state.yaml` | Session state and working memory |
| `.context/conversations/` | Session records (auto-generated) |
| `knowledge/` | Persistent knowledge documents |
| `tasks/` | Task tracking |
| `tasks/templates/agent-preflight-checklist.yaml` | Preflight checklist template |
| `tasks/templates/issue-design-brief.md` | Design-loop template |
| `tasks/templates/non-code-evaluation-rubric.yaml` | Non-code evaluation rubric |
| `tasks/templates/submission-evidence.md` | Submission evidence template |
| `artifacts/` | Outputs and deliverables |
