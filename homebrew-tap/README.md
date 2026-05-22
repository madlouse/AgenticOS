# homebrew-agenticos

Homebrew tap for [AgenticOS](https://github.com/madlouse/AgenticOS) — AI-native project management MCP server.

## Install

```bash
brew tap madlouse/agenticos
brew install agenticos
```

## Usage

Homebrew installs:

- the `agenticos-mcp` binary

Homebrew does **not**:

- edit Claude Code, Codex, Cursor, or Gemini CLI configuration automatically
- create or select a workspace for you
- restart your AI tool
- verify activation for you

After installation, set `AGENTICOS_HOME` explicitly, bootstrap one officially supported agent, restart it, and verify the Homebrew/runtime bootstrap state before relying on `agenticos_list`.
The recommended bootstrap also installs the AgenticOS activation Skill for Codex and Claude Code when selected, which helps route "switch project", `pwd`, and "切换到 ... 项目" prompts through AgenticOS MCP:

```bash
# Example default workspace path for a Homebrew-only install
mkdir -p "$(brew --prefix)/var/agenticos"
export AGENTICOS_HOME="$(brew --prefix)/var/agenticos"

# Recommended: detect supported agents, register MCP, and install activation Skills
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --first-run --auto-configure-hooks

# Claude Code
claude mcp add --transport stdio --scope user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp

# Codex
codex mcp add --env AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp

# Gemini CLI
gemini mcp add -s user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos agenticos-mcp
```

For Cursor, add this to `~/.cursor/mcp.json`:

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

Then restart the AI tool and verify the Homebrew/runtime bootstrap state:

```bash
agenticos-config --validate
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --all --install-skills --verify
```

Then confirm the server appears in the tool's MCP diagnostics and verify `agenticos_list` works.
If you prefer not to edit your shell profile, omit `--first-run` and use the explicit MCP commands above instead.
On macOS, `--first-run` also enables `launchctl` persistence so GUI/session processes inherit `AGENTICOS_HOME`.
For Codex and Claude Code, `--first-run` implies `--install-skills`; bootstrap updates AgenticOS-managed Skill files by content hash and refuses to overwrite user-modified files unless you pass `--force-skills`.
For Claude Code PWD guidance after `agenticos_switch`, run `agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent claude-code --auto-configure-hooks --apply` or include `--auto-configure-hooks` with `--first-run`. The hook reads Claude's PostToolUse stdin payload and feeds the switched project path back into Claude; it does not mutate a parent shell process.
Use `agenticos-bootstrap --workspace "$AGENTICOS_HOME" --all --install-skills --verify` with the same flags to audit the current machine state without mutating it.

Hermes + Discord project threads are optional. Homebrew does not install
Hermes, create a Discord application, store bot credentials, or enable a
gateway. If those pieces are absent, AgenticOS still supports normal MCP
project resolution and switching.

For the Discord MVP, configure Hermes and Discord separately, then verify:

```bash
agenticos-config --validate
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --all --install-skills --verify --verify-hermes-discord
```

In Discord, Hermes should call `agenticos_project_ensure`, create or reuse a
project thread, bind it with `agenticos_external_thread_bind`, and dispatch
Codex unless the user explicitly requests Claude Code. Feishu thread routing is
not part of the MVP. If verification reports missing AgenticOS MCP tools,
upgrade with `brew update && brew upgrade agenticos`, restart Hermes and the
execution agent, then retry.

`AGENTICOS_HOME` may also be a long-term self-hosting workspace home. The
Homebrew example path above is a default example, not the only valid workspace
layout.

If you are developing AgenticOS from a source checkout, remember that `npm run build` in the repo does **not** replace the Homebrew-installed `agenticos-mcp` binary on your PATH.
If your MCP client is registered to `agenticos-mcp`, it will keep launching the installed binary until you explicitly reinstall or upgrade that binary and restart the AI tool.

Homebrew policy is reminder-only today. It does not silently mutate user agent configs.

If a previous registration still points at a source checkout instead of `agenticos-mcp`, repair it manually:

```bash
# Claude Code
claude mcp get agenticos
claude mcp remove agenticos -s user
claude mcp add --transport stdio --scope user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp

# Codex
codex mcp list
codex mcp get agenticos
codex mcp remove agenticos
codex mcp add --env AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp
```

## Upgrade

```bash
brew update && brew upgrade agenticos
```

`brew update` must run first so Homebrew refreshes tap metadata; `brew upgrade` only installs a version the local Homebrew cache already knows about.
After upgrade, restart the AI tool so it launches the new `agenticos-mcp` process instead of any older long-lived session copy.
