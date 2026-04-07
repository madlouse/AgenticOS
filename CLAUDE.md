# CLAUDE.md — AgenticOS Product Source

> Read [AGENTS.md](AGENTS.md) first. It is the canonical development guide for
> the AgenticOS product source. This file adds Claude Code-specific guidance on
> top of it.

## Claude Code Workflow

### Worktree Isolation

All implementation work must run in isolated worktrees:

```text
Agent(isolation: "worktree", subagent_type: "...")
```

Treat `.claude/worktrees/` and `.runtime/` as runtime-only areas. They are not
canonical product source.

### Before Spawning Sub-Agents

Sub-agents start without local context. Before spawning, inject:

1. this file and [AGENTS.md](AGENTS.md)
2. the relevant files under `standards/knowledge/`
3. the current project state from the active AgenticOS project

### MCP Tools Available

This project is managed by AgenticOS. Use these MCP tools:

| Tool | When |
|------|------|
| `agenticos_preflight` | Before implementation or PR work to evaluate guardrail status |
| `agenticos_branch_bootstrap` | When preflight returns `REDIRECT` and a correct issue branch/worktree must be created |
| `agenticos_pr_scope_check` | Before opening or merging a PR to verify diff scope |
| `agenticos_record` | After meaningful work |
| `agenticos_save` | Before session ends |
| `agenticos_status` | Check current project state |

### Mandatory Guardrail Sequence

Before implementation-affecting edits:

1. call `agenticos_preflight`
2. if the result is `REDIRECT`, call `agenticos_branch_bootstrap` and continue
   in the returned worktree
3. if the result is `BLOCK`, stop and resolve the block reason first

Before PR submission or merge:

1. call `agenticos_pr_scope_check`
2. do not proceed if it returns `BLOCK`

### Design Artifacts

Persist research, design, and analysis outputs to files immediately:

- research reports -> `standards/knowledge/`
- implementation artifacts -> `standards/artifacts/`
- reference file paths in conversation instead of pasting long inline content

### Build And Verify

```bash
cd mcp-server
npm install
npm run build
npm test
```
