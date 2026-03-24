# AgenticOS MCP Server

AI-native project management for complex, persistent tasks.

---

## 📖 For Humans

### What is AgenticOS?

A project management system designed for AI collaboration. When you work on complex tasks with AI assistants, AgenticOS:

- **Records everything** - Conversations, decisions, code changes
- **Resumes seamlessly** - Pick up where you left off, even weeks later
- **Works everywhere** - Claude Code, Cursor, Codex, any MCP-compatible tool
- **Backs up automatically** - Git integration keeps your work safe
- **Stays organized** - AI manages the structure, you focus on building

### Quick Start

Install AgenticOS, bootstrap one supported agent, restart that agent, then explicitly verify `agenticos_list` works before relying on project-intent routing.

### When to Use

AgenticOS is ideal for:
- Multi-step implementations
- Cross-session work (resume later)
- Complex refactoring
- Feature development with many decisions
- Any task where you want complete history

### Project Structure

Each project contains:
```
my-project/
├── .project.yaml          # Stable project identity, metadata, and layer map
├── .context/
│   ├── quick-start.md     # Concise orientation for fast resume
│   ├── state.yaml         # Mutable operational working state
│   └── conversations/     # Append-only raw session history
├── knowledge/             # Durable synthesized insights, architecture, research
├── tasks/                 # Execution plans, briefs, and task decomposition
└── artifacts/             # Deliverables and concrete outputs
```

---

## 🤖 Supported Agent Bootstrap Standard

Bootstrap is complete only when:

1. the MCP server is registered for the target agent
2. the agent has been restarted if required
3. `agenticos_list` succeeds

Transport bootstrap and project-intent routing are different concerns.

- **transport bootstrap** proves the tool is registered and callable
- **routing** proves the agent is reading project instructions and choosing the tool when appropriate

### Claude Code

- canonical bootstrap: `claude mcp add --transport stdio --scope user agenticos -- agenticos-mcp`
- verify:
  - `claude mcp list`
  - `/mcp`
  - explicit `agenticos_list`
- debug split:
  - if `agenticos` is missing from `claude mcp list`, fix MCP registration first
  - if `agenticos` exists but intent routing is weak, load `CLAUDE.md` / `AGENTS.md` and call the tool explicitly

### Codex

- canonical bootstrap: `codex mcp add agenticos -- agenticos-mcp`
- canonical config location: `~/.codex/config.toml`
- verify:
  - `codex mcp list`
  - explicit `agenticos_list`
- debug split:
  - if `agenticos` is missing from `codex mcp list`, registration did not land in the active config
  - if it is present but prompts still do not route correctly, treat that as routing behavior rather than transport failure

### Cursor

- canonical bootstrap: add `agenticos` to `~/.cursor/mcp.json`
- verify:
  - restart Cursor
  - check Cursor MCP settings or `cursor-agent mcp list` if the Cursor CLI is installed
  - explicit `agenticos_list`
- debug split:
  - if `agenticos` never appears after restart, validate the JSON and executable path
  - if tools appear but project-intent routing is weak, use explicit tools and project instructions

### Gemini CLI

- canonical bootstrap: `gemini mcp add -s user agenticos agenticos-mcp`
- canonical config location: `~/.gemini/settings.json`
- verify:
  - `gemini mcp list`
  - restart Gemini CLI
  - explicit `agenticos_list`
- debug split:
  - if `agenticos` is missing from `gemini mcp list`, bootstrap did not land
  - if it is present but behavior is weak, treat that as routing/instruction quality rather than MCP transport failure

### Other MCP-Compatible Tools

These are currently experimental. Do not describe them as first-class supported agents unless they have a documented bootstrap, verification, and debugging contract.

---

## 🛠️ Tools Reference

### agenticos_init
Create new project with standard structure.

**Parameters**:
- `name` (required) - Project name
- `description` (optional) - What this project is about
- `path` (optional) - Custom location (default: ~/AgenticOS/projects/{id})

**Returns**: Project created confirmation with path and ID

### agenticos_switch
Switch to existing project and load context.

**Parameters**:
- `project` (required) - Project ID or name

**Returns**: Loaded context (project config, quick-start, state)

The quick-start/state split is intentional:
- `quick-start.md` is a concise entry surface
- `state.yaml` is mutable operational state
- `conversations/` is append-only history, not the default inline resume surface

### agenticos_list
List all projects with status.

**Returns**: Formatted list with active project highlighted

### agenticos_save
Save state and backup to Git.

**Parameters**:
- `message` (optional) - Commit message

**Returns**: Backup confirmation with timestamp

### agenticos_status
Show the status of the active project.

**Returns**: Current task, pending items, and recent decisions

### agenticos_preflight
Run machine-checkable guardrail preflight before implementation or PR creation.

**Parameters**:
- `task_type` (required)
- `repo_path` (required)
- `issue_id` (required for implementation work)
- `declared_target_files` (required for implementation work)

**Returns**: JSON with `PASS`, `BLOCK`, or `REDIRECT`

### agenticos_branch_bootstrap
Create an issue branch and isolated worktree from the intended remote base.

**Parameters**:
- `issue_id` (required)
- `slug` (required)
- `repo_path` (required)
- `worktree_root` (required)
- `remote_base_branch` (optional, default `origin/main`)

**Returns**: JSON with `CREATED` or `BLOCK`

### agenticos_pr_scope_check
Validate that the current branch diff stays within the intended issue scope.

**Parameters**:
- `issue_id` (required)
- `repo_path` (required)
- `declared_target_files` (required)
- `remote_base_branch` (optional, default `origin/main`)

**Returns**: JSON with `PASS` or `BLOCK`

---

## 📦 Resources Reference

### agenticos://context/current
Get complete context for active project.

**Returns**:
- Project configuration (.project.yaml)
- Quick start guide
- Current session state

---

## 🔒 Privacy & Security

- All data stored locally in `~/AgenticOS/`
- No external servers or telemetry
- Git backup is optional and user-controlled
- Safe for public npm distribution

## 📄 License

MIT
