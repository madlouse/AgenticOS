# AIOS - Agentic Operating System

An AI-native workspace for collaborative projects with AI Agents.

## What is AIOS?

AIOS is a framework for managing AI-collaborative projects where:
- **AI Agents** create and maintain project structures
- **Context** persists across sessions
- **State** is automatically tracked and restored
- **Projects** can be switched seamlessly

## Quick Start

### For AI Agents

1. Check active project: Read `.agent-workspace/registry.yaml`
2. Switch project: Update `active_project` in registry
3. Load context: Read project's `.project.yaml` → `.context/quick-start.md`
4. Work and save: Update `.context/state.yaml` after each session

### For Humans

- **View all projects**: Check `.agent-workspace/registry.yaml`
- **Check project status**: Read `projects/[name]/.context/quick-start.md`
- **Review progress**: Check `projects/[name]/.context/state.yaml`

## Directory Structure

```
AIOS/
├── .agent-workspace/     # AI workspace
│   └── registry.yaml     # Project registry (AI-maintained)
├── .meta/                # Global config
│   ├── rules.md          # Collaboration rules
│   └── templates/        # Project templates
├── projects/             # All projects (AI-created)
└── tools/                # Utility scripts
```

## Philosophy

AIOS follows these principles:
- **Agent First** - Designed for AI to manage, not just use
- **Self-Organizing** - Structure evolves based on usage
- **Context Aware** - Efficient context loading and switching
- **Human Readable** - Transparent to humans when needed

---

*This is a living system. Structure and conventions will evolve through AI-human collaboration.*
