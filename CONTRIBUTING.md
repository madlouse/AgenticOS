# Contributing to AgenticOS Product Source

This file is the canonical contribution guide for AgenticOS product work.

The workspace-root `CONTRIBUTING.md` remains a compatibility entrypoint while the root-Git split is in progress, but contribution flow should be anchored here.

## Development Setup

```bash
git clone https://github.com/madlouse/AgenticOS.git
cd AgenticOS/projects/agenticos/mcp-server
npm install
npm run build
npm test
```

## Expected Flow

1. Create a GitHub issue.
2. Bootstrap an isolated issue branch/worktree from `origin/main`.
3. Run `agenticos_preflight`.
4. Implement only inside declared scope.
5. Run `agenticos_pr_scope_check`.
6. Open a PR that closes the issue.

## Release Surface

- MCP package source: `projects/agenticos/mcp-server/`
- Homebrew formula: `projects/agenticos/homebrew-tap/Formula/agenticos.rb`
- canonical standards and contracts: `projects/agenticos/standards/knowledge/`

## Notes

- `npm install` is the supported install path for local development and CI.
- Treat root-level `tools/` as compatibility shims unless a contract explicitly requires them.
- Do not treat workspace-runtime files as product source.
