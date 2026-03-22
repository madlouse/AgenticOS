# Contributing to AgenticOS

Thank you for your interest in contributing to AgenticOS!

## Prerequisites

- Node.js 20+
- npm 9+
- Git
- GitHub CLI (`gh`) — recommended for PR and release operations

## Development Setup

```bash
git clone https://github.com/madlouse/AgenticOS.git
cd AgenticOS/mcp-server
npm install     # use npm install, NOT npm ci (see Pitfalls section)
npm run build
npm test
```

## Git Flow

AgenticOS uses **GitHub Flow** — simple and well-suited for a small team with continuous delivery.

### Branch Structure

```
main  (protected: CI required, no review required)
  ↑
feat/<issue>-<slug>     # new features
fix/<issue>-<slug>      # bug fixes
test/<issue>-<slug>     # test additions
docs/<issue>-<slug>     # documentation
chore/<issue>-<slug>    # maintenance, releases
```

- **`main` is the only long-lived branch** — no `develop`, no `release/*`
- Every change goes through a PR, never pushed directly to `main`
- Short-lived feature branches are deleted after merge

### Why Not Git Flow?

Full Git Flow (with `develop` + `release/*`) is designed for large teams with infrequent releases. For AgenticOS:
- Releases are continuous and small (patch/minor)
- AI Agents use worktrees as natural isolation — no need for a `develop` buffer
- A `develop` branch adds merge overhead with no benefit at this scale

### Branch Protection Rules (main)

| Rule | Setting | Reason |
|------|---------|--------|
| Required reviews | **0** | Solo/small team — GitHub blocks self-review |
| Required CI | ✅ build (Node 20 + 22) | Catch regressions automatically |
| Allow admin bypass | ✅ | Unblock when needed |
| Allow force push | ❌ | Protect history |

> **Note**: GitHub does not allow PR authors to approve their own PRs. If your project requires reviews, you need at least one other contributor. For solo projects, set required reviews to 0.

## Workflow

1. **Create an Issue** — document the problem or feature first
2. **Branch** — `git checkout -b fix/42-save-error-handling`
3. **Develop** — make changes, run `npm run build && npm test`
4. **Commit** — use [Conventional Commits](https://www.conventionalcommits.org/): `fix(save): report failure when git push fails`
5. **Open PR** — reference issue with `Closes #42`
6. **Merge** — once CI passes, merge with merge commit (not squash)

## Commit Types

| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `chore` | Maintenance tasks (releases, deps) |
| `refactor` | Code restructuring (no behavior change) |
| `test` | Adding or updating tests |
| `ci` | CI/CD changes |

## Versioning

AgenticOS follows [Semantic Versioning](https://semver.org/):

| Change | Version bump | Example |
|--------|-------------|---------|
| Bug fix, CI, docs | Patch | `0.2.0` → `0.2.1` |
| New tool/feature, non-breaking | Minor | `0.2.1` → `0.3.0` |
| Breaking API change | Major | `0.3.0` → `1.0.0` |

### Release Process

```bash
# 1. Update version in package.json
# 2. Update CHANGELOG.md (add new version section, clear [Unreleased])
# 3. Commit
git add mcp-server/package.json CHANGELOG.md
git commit -m "chore(release): bump version to v0.2.1"

# 4. Push to main
git push

# 5. Tag — this triggers the Release workflow automatically
git tag v0.2.1
git push origin v0.2.1

# 6. Update Homebrew formula sha256 (after release artifact is published)
curl -sL https://github.com/madlouse/AgenticOS/releases/download/vX.Y.Z/agenticos-mcp.tgz | shasum -a 256
# Update homebrew-tap/Formula/agenticos.rb with new url, sha256, and version
```

> **Important**: Update the Homebrew formula immediately after every release. Never leave `sha256` as a placeholder — it will break `brew install`.

## Code Style

- TypeScript with strict mode enabled
- Follow existing patterns in `mcp-server/src/`
- Avoid `any` types in new code where possible

## Common Pitfalls

### `npm ci` vs `npm install`

Always use `npm install` in CI and local dev — **not `npm ci`**.

`npm ci` requires the `package-lock.json` to be perfectly in sync with `package.json`. When new devDependencies (e.g., `vitest`) are added without regenerating the full lock file, `npm ci` fails with `Missing: X from lock file`. `npm install` is tolerant and self-healing.

This applies to **both** `.github/workflows/ci.yml` and `.github/workflows/release.yml`.

### Triggering CI after force push

`gh run rerun <run-id>` re-runs the **same SHA** — it does not pick up new commits from a force push. To trigger a new CI run:
- Push a new commit (even an empty one), or
- Wait for GitHub to auto-trigger the `pull_request` event (usually within a few seconds of a push)

### HTTPS push authentication

If `git push` fails with "could not read Username", inject the token directly:

```bash
GH_TOKEN=$(gh auth token)
git push https://madlouse:${GH_TOKEN}@github.com/madlouse/AgenticOS.git main
```

### Homebrew formula sha256

Never commit a formula with `sha256 "PLACEHOLDER_..."`. Always compute the real value:

```bash
curl -sL <release-url>/agenticos-mcp.tgz | shasum -a 256
```

## AI Contributors

If you are an AI agent, read `CLAUDE.md` or `AGENTS.md` at the repository root before starting work.

Key rules for AI agents:
- All work in isolated worktrees (`Agent(isolation: "worktree", ...)`)
- Record every session with `agenticos_record` before ending
- Push changes via `https://user:$TOKEN@github.com/...` if SSH is unavailable

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
