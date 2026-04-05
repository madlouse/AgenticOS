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

After installation, set `AGENTICOS_HOME` explicitly, bootstrap one officially supported agent, restart it, and verify `agenticos_list`:

```bash
# Example workspace path
mkdir -p "$(brew --prefix)/var/agenticos"
export AGENTICOS_HOME="$(brew --prefix)/var/agenticos"

# Recommended: detect supported agents and register them automatically
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --first-run

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

Then restart the AI tool and confirm `agenticos_list` works.
If you prefer not to edit your shell profile, omit `--first-run` and use the explicit MCP commands below instead.
On macOS, `--first-run` also enables `launchctl` persistence so GUI/session processes inherit `AGENTICOS_HOME`.
Use `agenticos-bootstrap --verify` with the same flags to audit the current machine state without mutating it.

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
brew upgrade agenticos
```

After upgrade, restart the AI tool so it launches the new `agenticos-mcp` process instead of any older long-lived session copy.
