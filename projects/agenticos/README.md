# AgenticOS Product Source

This directory is the canonical product-source project for AgenticOS.

If you are changing AgenticOS itself, start here instead of treating the workspace root as the authoritative product repository.

## Scope

`projects/agenticos/` owns:

- product documentation and operator contracts
- MCP server source under `mcp-server/`
- standards, templates, and downstream workflow kit
- Homebrew distribution assets under `homebrew-tap/`

The enclosing workspace root may still expose compatibility entrypoints while the root-Git split is in progress, but those root files are not the long-term authority path.

## Quick Start

```bash
cd projects/agenticos/mcp-server
npm install
npm run build
npm test
```

## Canonical Documents

- product overview and install surface:
  [mcp-server/README.md](mcp-server/README.md)
- implementation and operator instructions:
  [AGENTS.md](AGENTS.md)
- contribution and release flow:
  [CONTRIBUTING.md](CONTRIBUTING.md)
- standards and design knowledge:
  [standards/knowledge/](standards/knowledge/)

## Current Boundary Rule

- `projects/agenticos/` is the only canonical AgenticOS product-source project under `projects/`
- the workspace root is evolving toward `workspace home`, not permanent product-source Git root
- root-level `README.md`, `AGENTS.md`, and `CONTRIBUTING.md` currently remain as compatibility entrypoints during that migration
