# AGENTS.md — AgenticOS Development

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

After recording, call `agenticos_save` to commit to this project's Git repo.

## Git Boundary

This directory is a standalone Git repository.
Do not use the parent `AgenticOS` repository as the Git root for work in `agentic-os-development`.

## Agent Execution Protocol (MANDATORY)

Before acting on any non-trivial task, load and follow:
1. `knowledge/agent-preflight-and-execution-protocol-2026-03-23.md`
2. `knowledge/workflow-model-review-2026-03-23.md`

Execution rules:
- Do not react only to the user's literal last sentence; synthesize fragmented intent into a coherent objective.
- Do not jump from issue reading straight to implementation.
- Classify the task as `discussion_only`, `analysis_or_doc`, `implementation`, or `bootstrap`.
- For `implementation`, branch + isolated worktree are mandatory.
- For non-trivial work, complete a design -> critique -> redesign loop before implementation.
- Define executable acceptance criteria before editing files.
- Verify before claiming completion.

Reusable templates:
- `tasks/templates/agent-preflight-checklist.yaml`
- `tasks/templates/issue-design-brief.md`
- `tasks/templates/non-code-evaluation-rubric.yaml`
- `tasks/templates/submission-evidence.md`

### Session Start

On session start, read these files for context:
1. `.project.yaml` — Project metadata
2. `.context/state.yaml` — Current state and working memory
3. `.context/quick-start.md` — Project overview
4. `.context/conversations/` — Previous session records
5. `knowledge/product-positioning-and-design-review-2026-03-22.md` — Current product framing

Then greet the user with: project name, last progress, current pending items, suggested next step.

## Project

**Name**: AgenticOS Development
**Description**: Agent-first project management OS — AI Agent autonomously manages project state, cross-session context recovery, and cross-tool collaboration.

## Directory Structure

| Path | Purpose |
|------|---------|
| `.project.yaml` | Project metadata |
| `.context/state.yaml` | Session state and working memory |
| `.context/conversations/` | Session records (auto-generated) |
| `knowledge/` | Persistent knowledge: architecture, decisions, trade-offs |
| `knowledge/architecture.md` | Three-layer architecture design |
| `knowledge/design-decisions.md` | 5 key design decisions with rationale |
| `knowledge/complete-design.md` | Complete system design document |
| `tasks/` | Task tracking |
| `tasks/templates/` | Reusable execution and evaluation templates |
| `artifacts/` | Outputs and deliverables |
| `changelog.md` | Project changelog |
