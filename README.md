# AgenticOS

AI-native project management system for Claude Code, Cursor, Codex, and any MCP-compatible AI tool. Persists context and state across sessions so your AI agent always knows where it left off.

## Install

### Option A — Homebrew (recommended for macOS)

```bash
brew tap madlouse/agenticos
brew install agenticos
```

### Option B — Manual install (from GitHub Releases)

```bash
# Download latest release
curl -LO https://github.com/madlouse/AgenticOS/releases/latest/download/agenticos-mcp.tgz
# Install globally
npm install -g ./agenticos-mcp.tgz
```

---

## MCP Configuration

Add to your AI tool's MCP config file:

**Claude Code** — `~/.claude/settings/mcp.json`
**Cursor** — `~/.cursor/mcp.json`
**Windsurf** — `~/.codeium/windsurf/mcp_config.json`

If installed via Homebrew, use the binary directly (faster, no npx overhead):

```json
{
  "mcpServers": {
    "agenticos": {
      "command": "agenticos-mcp",
      "args": []
    }
  }
}
```

If installed via npm/manual download:

```json
{
  "mcpServers": {
    "agenticos": {
      "command": "npx",
      "args": ["-y", "agenticos-mcp"]
    }
  }
}
```

Restart your AI tool after saving the config.

---

## Quick Start

Once configured, tell your AI agent:

```
创建一个新项目，名字叫 my-feature
```

or in English:

```
Create a new AgenticOS project called my-feature
```

The agent will call `agenticos_init` and set up the project structure automatically.

---

## MCP Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `agenticos_init` | Create a new project | `name` (required), `description`, `path` |
| `agenticos_switch` | Switch active project | `project` (ID or name) |
| `agenticos_list` | List all projects | — |
| `agenticos_status` | Show active project status | — |
| `agenticos_preflight` | Evaluate implementation/PR guardrails | `task_type`, `repo_path`, `issue_id`, `declared_target_files` |
| `agenticos_branch_bootstrap` | Create issue branch + isolated worktree from `origin/main` | `issue_id`, `slug`, `repo_path`, `worktree_root` |
| `agenticos_pr_scope_check` | Validate commit/file scope before PR | `issue_id`, `repo_path`, `declared_target_files` |
| `agenticos_record` | Record session progress | `summary`, `decisions`, `outcomes`, `pending`, `current_task` |
| `agenticos_save` | Save state + git backup | `message` (commit message) |

### Implementation Guardrail Flow

For implementation work in AgenticOS-managed repositories:

1. call `agenticos_preflight`
2. if the result is `REDIRECT`, call `agenticos_branch_bootstrap`
3. implement in the returned isolated worktree
4. call `agenticos_pr_scope_check` before opening or merging a PR

### MCP Resource

`agenticos://context/current` — Returns the full context of the active project (config + quick-start + current state) as Markdown. AI tools load this automatically on each session.

---

## Project Structure

Each project is a self-contained directory:

```
~/AgenticOS/projects/my-feature/
├── .project.yaml          # Project metadata
├── .context/
│   ├── quick-start.md     # 30-second context summary (AI reads this first)
│   ├── state.yaml         # Current session state
│   └── conversations/     # Session logs
├── knowledge/             # Decisions, insights, research
├── tasks/                 # Task definitions
└── artifacts/             # Code, configs, outputs
```

The global registry lives at `~/AgenticOS/.agent-workspace/registry.yaml` and tracks all projects with relative paths — making the whole workspace portable.

Runtime-only byproducts should not be treated as canonical source:

- `.runtime/` is reserved for local runtime state
- `.claude/worktrees/` is an agent worktree area, not product source

If you are developing AgenticOS itself from a Git checkout, keep that source checkout separate from your live `AGENTICOS_HOME` workspace.

For downstream project inheritance, the executable workflow standard kit lives in:

- `projects/agenticos/.meta/standard-kit/`

Within this repository, only `projects/agenticos/` should be treated as canonical product source.
The runtime extraction program has already moved `2026okr`, `360teams`, `agentic-devops`, and `ghostty-optimization` into the live workspace.
The orphaned gitlink residues `okr-management` and `t5t` have been removed from the source repo rather than treated as real runtime projects.
Any remaining non-`agenticos` tracked entry under `projects/` should now be treated as explicit fixture content, not product source.

---

## Environment Variable

By default, AgenticOS stores everything in `~/AgenticOS`. Override with:

```bash
# Add to ~/.zshrc or ~/.bashrc
export AGENTICOS_HOME="$HOME/my-custom-path"
```

Recommended layout:

- product source checkout: any normal development path such as `~/src/AgenticOS`
- live workspace: `AGENTICOS_HOME`, such as `~/AgenticOS`

---

## Cross-Machine Migration

### New machine, fresh start

```bash
# 1. Install
brew tap madlouse/agenticos && brew install agenticos

# 2. Set workspace (optional, ~/AgenticOS is the default)
echo 'export AGENTICOS_HOME="$HOME/AgenticOS"' >> ~/.zshrc
source ~/.zshrc

# 3. Configure mcp.json and restart your AI tool
```

### Migrate existing projects from another machine

```bash
# On old machine — push your workspace to Git
cd ~/AgenticOS
git remote add origin https://github.com/yourname/your-agenticos-workspace.git
git push -u origin main

# On new machine
brew tap madlouse/agenticos && brew install agenticos
git clone https://github.com/yourname/your-agenticos-workspace.git ~/AgenticOS
echo 'export AGENTICOS_HOME="$HOME/AgenticOS"' >> ~/.zshrc
source ~/.zshrc
```

All projects restore automatically. The registry stores relative paths (`projects/my-feature`), so they resolve correctly regardless of the machine or username.

---

## How It Works

```
AI Tool (Claude / Cursor / Codex)
        ↓  MCP protocol (stdio)
  agenticos-mcp server
        ↓  reads/writes
  ~/AgenticOS/
    .agent-workspace/registry.yaml   ← active project + project list
    projects/
      my-feature/
        .project.yaml                ← metadata
        .context/quick-start.md      ← loaded on every session
        .context/state.yaml          ← persisted working memory
```

On each session start, the AI reads `agenticos://context/current` to restore full context — no need to re-explain the project.

---

## Privacy

- All data is stored locally on your machine
- No external servers, no telemetry, no accounts
- Git backup is optional and fully under your control

---

## License

MIT — [github.com/madlouse/AgenticOS](https://github.com/madlouse/AgenticOS)
