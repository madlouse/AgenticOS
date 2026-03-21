# Contributing to AgenticOS

Thank you for your interest in contributing to AgenticOS!

## Prerequisites

- Node.js 20+
- npm 9+
- Git

## Development Setup

```bash
git clone https://github.com/madlouse/AgenticOS.git
cd AgenticOS/mcp-server
npm install
npm run build
```

## Workflow

1. **Find or create an Issue** — check [existing issues](https://github.com/madlouse/AgenticOS/issues) first
2. **Fork and branch** — create a branch from `main` using the naming convention: `<type>/<issue-number>-<slug>`
3. **Develop** — make your changes, ensuring `npm run build` passes
4. **Commit** — use [Conventional Commits](https://www.conventionalcommits.org/) format: `<type>(scope): <description>`
5. **Open a Pull Request** — reference the issue with `Closes #N`

## Commit Types

| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `chore` | Maintenance tasks |
| `refactor` | Code restructuring (no behavior change) |
| `test` | Adding or updating tests |
| `ci` | CI/CD changes |

## Code Style

- TypeScript with strict mode enabled
- Follow existing patterns in `mcp-server/src/`
- Avoid `any` types in new code where possible

## AI Contributors

If you are an AI agent, please also read `CLAUDE.md` or `AGENTS.md` at the repository root for additional guidance.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
