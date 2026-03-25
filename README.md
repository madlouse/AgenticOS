# AgenticOS

AI-native project management system for Claude Code, Codex, Cursor, Gemini CLI, and other MCP-capable tools. Persists context and state across sessions so your AI agent always knows where it left off.

## Install

### Option A — Homebrew (recommended for macOS)

```bash
brew tap madlouse/agenticos
brew install agenticos
```

Homebrew installs:

- the `agenticos-mcp` binary
- a seed workspace directory under Homebrew `var`

Homebrew does **not**:

- edit Claude Code, Codex, Cursor, or Gemini CLI configuration for you
- restart your AI tool
- prove activation by itself

After `brew install`, bootstrap one supported agent below, restart it, and verify `agenticos_list` explicitly.

### Option B — Manual install (from GitHub Releases)

```bash
# Download latest release
curl -LO https://github.com/madlouse/AgenticOS/releases/latest/download/agenticos-mcp.tgz
# Install globally
npm install -g ./agenticos-mcp.tgz
```

---

## Supported Agent Bootstrap

AgenticOS is `MCP-native`.

Bootstrap has two separate layers:

1. **Transport bootstrap**: register the `agenticos` MCP server successfully.
2. **Project-intent routing**: make sure the agent is actually reading project instructions and using the tools when the task calls for it.

If transport works but project-create/switch behavior is weak, that is a routing problem, not an MCP registration problem.

### Officially Supported Agent Paths

| Agent | Canonical bootstrap | Canonical config location | Verify |
|------|---------------------|---------------------------|--------|
| Claude Code | `claude mcp add --transport stdio --scope user agenticos -- agenticos-mcp` | Claude-managed user MCP config | `claude mcp list`, `/mcp`, then call `agenticos_list` |
| Codex | `codex mcp add agenticos -- agenticos-mcp` | `~/.codex/config.toml` | `codex mcp list`, then call `agenticos_list` |
| Cursor | Add `agenticos` to `~/.cursor/mcp.json` | `~/.cursor/mcp.json` | Restart Cursor, then open MCP settings or run `cursor-agent mcp list` |
| Gemini CLI | `gemini mcp add -s user agenticos agenticos-mcp` | `~/.gemini/settings.json` | `gemini mcp list`, restart Gemini CLI, then call `agenticos_list` |

### Cursor Global `mcp.json`

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

### Experimental / Manual

Other MCP-capable tools are currently **experimental**. They are only considered bootstrapped if:

- they can register a local stdio MCP server
- `agenticos` appears in that tool's MCP diagnostics
- `agenticos_list` can be called successfully

Restart the AI tool after registration or config changes.

The machine-readable source of truth for this support matrix lives in:

- `projects/agenticos/.meta/bootstrap/agent-bootstrap-matrix.yaml`

## Integration Modes

AgenticOS supports multiple integration modes, but they are not equal:

| Mode | Status | Purpose |
|------|--------|---------|
| `MCP-native` | primary | Canonical AgenticOS execution path |
| `MCP + Skills Assist` | supported fallback | Keep MCP as the execution path but use skills/prompt overlays to improve routing and bootstrap ergonomics |
| `CLI Wrapper` | limited fallback | Operator diagnostics and temporary bootstrap recovery only |
| `Skills-only Guidance` | experimental | Research or tool-specific guidance without the canonical MCP surface |

The machine-readable source of truth for this mode decision lives in:

- `projects/agenticos/.meta/bootstrap/integration-mode-matrix.yaml`

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
| `agenticos_health` | Check canonical checkout, entry-surface, and guardrail freshness | `repo_path`, `project_path`, `check_standard_kit` |
| `agenticos_refresh_entry_surfaces` | Refresh quick-start and state from structured merged-work inputs | `project_path`, `summary`, `status`, `current_focus` |
| `agenticos_non_code_evaluate` | Validate a completed non-code rubric and persist latest structured evidence into project state | `project_path`, `rubric_path` |
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

## GitHub Publish Troubleshooting

If branch pushes fail but GitHub itself is reachable, check for broken Git proxy configuration before changing credentials:

```bash
gh auth status
git config --global --get-regexp '^(http|https)\\.proxy$' || true
git ls-remote https://github.com/madlouse/AgenticOS.git HEAD
```

If the failure is specific to proxied Git HTTPS transport, use a command-scoped direct push with a temporary `GIT_ASKPASS` helper instead of embedding tokens in the remote URL. The canonical operator procedure lives in [CONTRIBUTING.md](CONTRIBUTING.md).

If the no-proxy retry still fails with `LibreSSL SSL_connect: SSL_ERROR_SYSCALL`, retry once more with command-scoped `-c http.version=HTTP/1.1` rather than changing global Git transport defaults.

---

## Cross-Machine Migration

### New machine, fresh start

```bash
# 1. Install
brew tap madlouse/agenticos && brew install agenticos

# 2. Set workspace (optional, ~/AgenticOS is the default)
echo 'export AGENTICOS_HOME="$HOME/AgenticOS"' >> ~/.zshrc
source ~/.zshrc

# 3. Bootstrap one of the supported agents above and restart it
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
