# AIOS Collaboration Rules

## Core Principles

1. **Agent Autonomy** - AI Agents manage project structure and content
2. **State Persistence** - All work states are automatically saved
3. **Context Efficiency** - Load only what's needed, when needed
4. **Self-Evolution** - Structure adapts based on actual usage

## Agent Responsibilities

When working in AIOS projects, AI Agents should:

- **On Project Start**: Read `.project.yaml` → `quick-start.md` → `state.yaml`
- **During Work**: Update `state.yaml` and append to `memory.jsonl`
- **On Completion**: Update task status and save session summary
- **On Context Switch**: Save current state before switching

## File Conventions

- `.project.yaml` - Project metadata (AI reads first)
- `.context/quick-start.md` - 30-second context summary
- `.context/state.yaml` - Current working state
- `.context/memory.jsonl` - Event stream (append-only)
- `tasks/*.yaml` - Structured task management

## Evolution Guidelines

- Create new files/folders as needed
- Update structures based on actual usage patterns
- Keep quick-start.md under 200 lines
- Archive completed projects to reduce noise
