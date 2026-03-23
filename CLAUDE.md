# CLAUDE.md — AgenticOS

> Read [AGENTS.md](AGENTS.md) first — it is the canonical development guide for this repository.
> This file adds Claude Code-specific capabilities on top of it.

## Claude Code Workflow

### Worktree Isolation

All development MUST use isolated worktrees:

```
# When spawning agents for development tasks:
Agent(isolation: "worktree", subagent_type: "...")
```

This creates a separate git worktree so changes never touch `main` directly.

Treat `.claude/worktrees/` and `.runtime/` as runtime-only areas.
They are not canonical product source and should stay outside structural product-source moves.

### Before Spawning Sub-Agents

Sub-agents start with no project context. Before spawning, read and inject:
1. This file (`CLAUDE.md`) and `AGENTS.md`
2. Key knowledge files from `projects/agenticos/standards/knowledge/` relevant to the task
3. Current project state from the active AgenticOS project

### MCP Tools Available

This project is managed by AgenticOS. Use these MCP tools:

| Tool | When |
|------|------|
| `agenticos_record` | After meaningful work (feature, fix, decision, analysis) |
| `agenticos_save` | Before session ends — commits state to Git |
| `agenticos_status` | Check current project state |

### Design Artifacts

Persist research, design, and analysis outputs to files immediately:
- Research reports → `projects/agenticos/standards/knowledge/`
- Implementation artifacts → `projects/agenticos/standards/artifacts/`
- Reference file paths in conversation, not inline content

This prevents context loss from conversation compression and enables cross-session access.

### Build & Verify

```bash
cd projects/agenticos/mcp-server && npm install && npm run build
```
