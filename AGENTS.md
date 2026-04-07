# AGENTS.md — AgenticOS Product Source

This file is the canonical operator and implementation guide for AgenticOS product work.

If you are editing AgenticOS itself, use this file instead of relying on the workspace-root compatibility copy.

## Quick Start

```bash
cd projects/agenticos/mcp-server
npm install
npm run build
npm test
```

## Product-Source Map

| Path | Purpose |
|------|---------|
| `projects/agenticos/mcp-server/src/` | MCP server source |
| `projects/agenticos/mcp-server/src/tools/` | Tool implementations |
| `projects/agenticos/mcp-server/src/utils/` | Shared utilities |
| `projects/agenticos/standards/` | Standards and product-definition area |
| `projects/agenticos/.meta/` | Templates and agent protocol guides |
| `projects/agenticos/.meta/standard-kit/` | Downstream reusable workflow kit |
| `projects/agenticos/homebrew-tap/` | Homebrew distribution formula |

## Working Rules

1. Every change starts from a GitHub issue.
2. Use an isolated issue branch/worktree from `origin/main`.
3. Run `agenticos_preflight` before implementation-affecting work.
4. Run `agenticos_pr_scope_check` before opening or merging a PR.
5. Treat `projects/agenticos/` as the canonical product-source boundary.

## Canonical References

- contribution flow: [CONTRIBUTING.md](CONTRIBUTING.md)
- MCP package and install surface: [mcp-server/README.md](mcp-server/README.md)
- standards knowledge: [standards/knowledge/](standards/knowledge/)
