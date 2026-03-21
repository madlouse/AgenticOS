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
| `agenticos_save` | Save state + git backup | `message` (commit message) |

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

---

## Environment Variable

By default, AgenticOS stores everything in `~/AgenticOS`. Override with:

```bash
# Add to ~/.zshrc or ~/.bashrc
export AGENTICOS_HOME="$HOME/my-custom-path"
```

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
