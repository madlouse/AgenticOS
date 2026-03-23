# homebrew-agenticos

Homebrew tap for [AgenticOS](https://github.com/madlouse/AgenticOS) — AI-native project management MCP server.

## Install

```bash
brew tap madlouse/agenticos
brew install agenticos
```

## Usage

After installation, set your workspace and configure your AI tool:

```bash
# Optional: customize workspace location
export AGENTICOS_HOME="$HOME/AgenticOS"   # default

# Add to MCP config (~/.claude/settings/mcp.json)
{
  "mcpServers": {
    "agenticos": {
      "command": "agenticos-mcp",
      "args": []
    }
  }
}
```

## Upgrade

```bash
brew upgrade agenticos
```
