# Agent Guide for AIOS

> Legacy note: this file predates the self-hosting and guardrail standard-kit model.
> Canonical downstream packaging rules now live in `.meta/standard-kit/README.md`.
> If guidance here conflicts with the standard kit, the standard kit wins.

## For All AI Agents

This guide helps any AI Agent (Claude, Gemini, Cursor, etc.) work with AIOS projects.

## Quick Start Protocol

When entering an AIOS project, follow this sequence:

1. **Read** `.project.yaml` - Get project metadata
2. **Read** `.context/quick-start.md` - Get 30-second context
3. **Read** `.context/state.yaml` - Restore working state
4. **Check** your agent-specific file if exists (CLAUDE.md, GEMINI.md, etc.)

## State Management Protocol

### On Session Start
```yaml
# Read state.yaml to restore:
- current_task
- working_memory
- next_step
```

### During Work
```yaml
# Update state.yaml with:
- Progress on current task
- New facts learned
- Decisions made
```

### On Session End
```yaml
# Append to memory.jsonl:
{"timestamp": "ISO8601", "type": "action|decision|insight", "content": "..."}
```

## File Conventions

- `.project.yaml` - Project metadata (YAML)
- `.context/quick-start.md` - Quick context (Markdown)
- `.context/state.yaml` - Current state (YAML)
- `.context/memory.jsonl` - Event log (JSONL)
- `tasks/*.yaml` - Task management (YAML)

## Agent-Specific Files

- `CLAUDE.md` - Claude Code specific rules
- `GEMINI.md` - Gemini specific rules
- `.cursorrules` - Cursor specific rules

Read your specific file for enhanced capabilities.

## Cross-Agent Compatibility

All agents share:
- Project metadata (.project.yaml)
- Working state (state.yaml)
- Memory stream (memory.jsonl)
- Task definitions (tasks/*.yaml)

Agent-specific states stored in `.context/agents/[agent-name].yaml`
