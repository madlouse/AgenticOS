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
- a seed workspace at Homebrew `var`

Homebrew does **not**:

- edit Claude Code, Codex, Cursor, or Gemini CLI configuration automatically
- restart your AI tool
- verify activation for you

After installation, set your workspace if needed, bootstrap one officially supported agent, restart it, and verify `agenticos_list`:

```bash
# Optional: customize workspace location
export AGENTICOS_HOME="$(brew --prefix)/var/agenticos"

# Claude Code
claude mcp add --transport stdio --scope user agenticos -- agenticos-mcp

# Codex
codex mcp add agenticos -- agenticos-mcp

# Gemini CLI
gemini mcp add -s user agenticos agenticos-mcp
```

For Cursor, add this to `~/.cursor/mcp.json`:

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

Then restart the AI tool and confirm `agenticos_list` works.

Homebrew policy is reminder-only today. It does not silently mutate user agent configs.

## Upgrade

```bash
brew upgrade agenticos
```
