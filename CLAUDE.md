# AgenticOS Development Guide

## Repository Map

| Directory | Purpose |
|-----------|---------|
| `mcp-server/` | MCP server source (TypeScript) — the core product |
| `projects/` | User project data — **never modify in feature branches** |
| `.meta/` | Templates and agent guides |
| `homebrew-tap/` | Homebrew distribution formula |
| `tools/` | Utility scripts |

## Development Protocol

### Issue-First Rule
Every code change requires a linked GitHub Issue. No exceptions.

### Branch Naming
`<type>/<issue-number>-<slug>`

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`

Examples:
- `feat/12-export-tool`
- `fix/3-save-error-handling`

### Workflow
1. Create or claim a GitHub Issue
2. Create branch from `main` following naming convention
3. Develop in isolated worktree (`isolation: "worktree"`)
4. Build and verify: `cd mcp-server && npm install && npm run build`
5. Commit using Conventional Commits format
6. Open PR referencing the issue (`Closes #N`)

## Commit Convention

Format: `<type>(scope): <description>`

Scopes: `mcp-server`, `ci`, `docs`, `meta`

```
feat(mcp-server): add export tool for project artifacts
fix(mcp-server): resolve race condition in state sync
docs: update CONTRIBUTING guide
chore(ci): add Node 22 to test matrix
```

Footer: Always include `Closes #<issue-number>` when the PR resolves an issue.

## Build & Test

```bash
cd mcp-server
npm install
npm run build    # TypeScript compilation (strict mode)
```

## Forbidden Operations

- Never commit directly to `main` — always use feature branches + PRs
- Never force-push to `main`
- Never modify files under `projects/` in feature branches (user data)
- Never commit `node_modules/`, `build/`, `.env`, or credentials
- Never modify `package.json` version field directly (use release process)

## Code Style

- TypeScript strict mode (`strict: true` in tsconfig.json)
- ES2022 target, Node16 module resolution
- Avoid `any` in new code where possible
- Follow existing patterns in `mcp-server/src/`
