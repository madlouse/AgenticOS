# Ghostty Optimization - Claude Code Configuration

## AIOS Integration

This project is part of AIOS (Agentic OS). Core context is in:
- `.project.yaml` - Project metadata
- `.context/quick-start.md` - 30-second context
- `.context/state.yaml` - Current state

## Project Context

**Goal**: Optimize Ghostty terminal performance and configuration
**Current Phase**: Performance benchmarking
**Next Action**: Install hyperfine and run benchmarks

## Collaboration Rules

### State Management
- **On session start**: Read `.context/state.yaml` to restore context
- **During work**: Update `state.yaml` with progress
- **On session end**: Append key events to `.context/memory.jsonl`

### Task Workflow
- Tasks are in `tasks/in-progress.yaml` (structured YAML)
- Update task status as you progress
- Create new tasks as needed

### File Organization
- Code artifacts: `artifacts/code/`
- Test results: `artifacts/benchmarks/`
- Knowledge: `knowledge/`

## Current Status

Ghostty version: 1.3.1
Next step: Performance benchmarking against iTerm2 and Alacritty

## Agent Behavior

### Automatic Recording (CRITICAL)
- **Record all conversations**: Append to `.context/conversations/YYYY-MM-DD.md`
- **Record user insights**: Update `knowledge/user-insights.md` with user preferences, ideas, constraints
- **Record learnings**: Update `knowledge/learnings.md` with technical discoveries
- **Record events**: Append to `.context/memory.jsonl` (structured event stream)
- **Update changelog**: Append to `.context/changelog.md` (timeline view)

### State Management
- Automatically maintain `.context/state.yaml`
- Update task status in `tasks/`
- Keep `quick-start.md` current (under 200 lines)

### Recording Format

**Conversations**: Natural dialogue format with timestamps
**Memory Stream**: `{"timestamp": "ISO8601", "type": "action|decision|insight", "agent": "name", "content": "...", "result": "..."}`
**Changelog**: Timeline format with date headers
