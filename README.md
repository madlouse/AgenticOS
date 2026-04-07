# AgenticOS

AI-native project management system for Claude Code, Codex, Cursor, Gemini CLI, and other MCP-capable tools. Persists context and state across sessions so your AI agent always knows where it left off.

> Compatibility entrypoint: the canonical AgenticOS product-source docs now live in [projects/agenticos/README.md](projects/agenticos/README.md). Treat the workspace root as a transitional entry surface while root Git responsibilities are being removed.

## Install

### Option A — Homebrew (recommended for macOS)

```bash
brew tap madlouse/agenticos
brew install agenticos
```

Homebrew installs:

- the `agenticos-mcp` binary

Homebrew does **not**:

- create or select a workspace for you
- edit Claude Code, Codex, Cursor, or Gemini CLI configuration for you
- restart your AI tool
- prove activation by itself

After `brew install`, either run:

```bash
agenticos-bootstrap --workspace "$(brew --prefix)/var/agenticos" --first-run
```

or bootstrap one supported agent below manually, restart it, and verify `agenticos_list` explicitly.
On macOS, `--first-run` also enables `launchctl` persistence so GUI-launched tools can inherit `AGENTICOS_HOME`.
Use `agenticos-bootstrap --verify` to audit the current bootstrap state without mutating configs.
Successful apply/first-run runs also record bootstrap metadata under `$AGENTICOS_HOME/.agent-workspace/bootstrap-state.yaml`.

For implementation-affecting work, AgenticOS now ships an installed-runtime hook command: `agenticos-edit-guard`.
Use it from local automation or any client-side pre-edit hook layer to fail closed unless:

- the active project matches the intended managed project
- the intended issue is explicit
- the latest persisted `agenticos_preflight` for that issue and repo is `PASS`

The root-level `tools/check-edit-boundary.sh` path is now legacy compatibility only.

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
| Claude Code | `claude mcp add --transport stdio --scope user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp` | Claude-managed user MCP config | `claude mcp list`, `/mcp`, then call `agenticos_list` |
| Codex | `codex mcp add --env AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp` | `~/.codex/config.toml` | `codex mcp list`, then call `agenticos_list` |
| Cursor | Add `agenticos` with explicit `env.AGENTICOS_HOME` to `~/.cursor/mcp.json` | `~/.cursor/mcp.json` | Restart Cursor, then open MCP settings or run `cursor-agent mcp list` |
| Gemini CLI | `gemini mcp add -s user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos agenticos-mcp` | `~/.gemini/settings.json` | `gemini mcp list`, restart Gemini CLI, then call `agenticos_list` |

### Cursor Global `mcp.json`

```json
{
  "mcpServers": {
    "agenticos": {
      "command": "agenticos-mcp",
      "args": [],
      "env": {
        "AGENTICOS_HOME": "/absolute/path/to/your/AgenticOS-workspace"
      }
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

### Repair Stale MCP Registrations

The only supported runtime entrypoint is `agenticos-mcp`.
Legacy source-checkout registrations such as `node /Users/jeking/dev/AgenticOS/mcp-server/build/index.js` are unsupported and should be replaced.

Claude Code repair:

```bash
claude mcp get agenticos
claude mcp remove agenticos -s user
claude mcp add --transport stdio --scope user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp
```

Then restart Claude Code, confirm `agenticos` appears in `claude mcp list` and `/mcp`, and call `agenticos_list`.

Codex repair:

```bash
codex mcp list
codex mcp get agenticos
codex mcp remove agenticos
codex mcp add --env AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp
```

If `codex mcp get agenticos` reports that no server exists, skip the remove step and add it directly.
Then restart Codex, confirm `agenticos` appears in `codex mcp list`, and call `agenticos_list`.
If `codex mcp get agenticos` shows `env: -`, treat that registration as incomplete and re-add it with explicit `AGENTICOS_HOME`.

Bootstrap verification is intentionally manual and agent-local.
`agenticos_health` stays repo/project scoped and does not inspect or mutate user MCP settings owned by Claude Code, Codex, Cursor, or Gemini CLI.

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

The agent will call `agenticos_init` and set up the project structure automatically, but new projects now require an explicit topology choice: `local_directory_only` or `github_versioned`.

### Topology Choice

- Use `local_directory_only` for private/local work such as ongoing writing, weekly planning, research notes, and project-specific knowledge evolution.
- Use `github_versioned` for reusable capabilities such as tools, automation, standards, plugins, libraries, and other assets that should evolve through issue/PR/release flow.
- If the boundary is ambiguous, stop and confirm instead of guessing.

Projects may later upgrade from `local_directory_only` to `github_versioned`, but that upgrade must be explicit.
Do not silently move a local project into GitHub Flow just because it starts containing code.

---

## MCP Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `agenticos_init` | Create or normalize a project | `name` (required), `topology` (required), `description`, `path`, `github_repo`, `normalize_existing` |
| `agenticos_switch` | Switch active project | `project` (ID or name) |
| `agenticos_list` | List all projects | — |
| `agenticos_status` | Show active project status | — |
| `agenticos_preflight` | Evaluate implementation/PR guardrails | `task_type`, `repo_path`, `project_path`, `issue_id`, `declared_target_files` |
| `agenticos_edit_guard` | Fail closed before implementation edits unless project alignment and matching PASS preflight evidence exist | `issue_id`, `repo_path`, `project_path`, `declared_target_files` |
| `agenticos_branch_bootstrap` | Create issue branch + isolated worktree from `origin/main` | `issue_id`, `slug`, `repo_path`, `worktree_root` |
| `agenticos_pr_scope_check` | Validate commit/file scope before PR | `issue_id`, `repo_path`, `declared_target_files` |
| `agenticos_health` | Check canonical checkout, entry-surface, and guardrail freshness | `repo_path`, `project_path`, `check_standard_kit` |
| `agenticos_refresh_entry_surfaces` | Refresh quick-start and state from structured merged-work inputs | `project_path`, `summary`, `status`, `current_focus` |
| `agenticos_non_code_evaluate` | Validate a completed non-code rubric and persist latest structured evidence into project state | `project_path`, `rubric_path` |
| `agenticos_record` | Record session progress | `summary`, `decisions`, `outcomes`, `pending`, `current_task` |
| `agenticos_save` | Save state + git backup | `message` (commit message) |

For the formal decision rubric, see:

- `projects/agenticos/standards/knowledge/project-topology-decision-rubric-2026-04-07.md`

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
$AGENTICOS_HOME/projects/my-feature/
├── .project.yaml          # Project metadata
├── .context/
│   ├── quick-start.md     # 30-second context summary (AI reads this first)
│   ├── state.yaml         # Current session state
│   └── conversations/     # Session logs
├── knowledge/             # Decisions, insights, research
├── tasks/                 # Task definitions
└── artifacts/             # Code, configs, outputs
```

The global registry lives at `$AGENTICOS_HOME/.agent-workspace/registry.yaml` and tracks all projects with relative paths — making the whole workspace portable.

Runtime-only byproducts should not be treated as canonical source:

- `.runtime/` is reserved for local runtime state
- `.claude/worktrees/` is an agent worktree area, not product source

If you are developing AgenticOS itself from a Git checkout, keep that source checkout separate from your live `AGENTICOS_HOME` workspace.

For downstream project inheritance, the executable workflow standard kit lives in:

- `projects/agenticos/.meta/standard-kit/`

Within this repository, only `projects/agenticos/` should be treated as the canonical **AgenticOS product-source** project.
Sibling entries under `projects/` may still exist as preserved managed-project content and should not be rewritten or removed just because AgenticOS itself adopted a self-hosting layout.
The installed-runtime command `agenticos-record-reminder` is now the preferred reminder hook entrypoint.
The source checkout keeps a legacy-compatible top-level `tools/record-reminder.sh` path only for older hook callers that have not been migrated yet.
The orphaned gitlink residues `okr-management` and `t5t` were not recoverable as full tracked projects and therefore should not be treated as canonical managed-project content without a separate verified source.

---

## Environment Variable

AgenticOS requires `AGENTICOS_HOME` to be set explicitly before you start `agenticos-mcp` or call workspace-backed tools:

```bash
# Add to ~/.zshrc or ~/.bashrc
export AGENTICOS_HOME="$HOME/my-custom-path"
```

Recommended layout:

- product source checkout: any normal development path such as `~/src/AgenticOS`
- live workspace: `AGENTICOS_HOME`, such as `~/AgenticOS-workspace`

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

# 2. Set workspace
echo 'export AGENTICOS_HOME="$HOME/AgenticOS-workspace"' >> ~/.zshrc
source ~/.zshrc

# 3. Bootstrap one of the supported agents above and restart it
```

### Migrate existing projects from another machine

```bash
# On old machine — push your workspace to Git
cd "$AGENTICOS_HOME"
git remote add origin https://github.com/yourname/your-agenticos-workspace.git
git push -u origin main

# On new machine
brew tap madlouse/agenticos && brew install agenticos
git clone https://github.com/yourname/your-agenticos-workspace.git "$HOME/AgenticOS-workspace"
echo 'export AGENTICOS_HOME="$HOME/AgenticOS-workspace"' >> ~/.zshrc
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
  $AGENTICOS_HOME/
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
