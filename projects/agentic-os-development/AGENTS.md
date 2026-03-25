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

After recording, call `agenticos_save` to commit to Git.

### Session Start

On session start, read these files for context:
1. `.project.yaml` — Project metadata
2. `.context/state.yaml` — Current state and working memory
3. `.context/conversations/` — Previous session records

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
| `artifacts/` | Outputs and deliverables |
| `changelog.md` | Project changelog |
