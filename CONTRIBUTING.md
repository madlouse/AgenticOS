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
cd AgenticOS/projects/agenticos/mcp-server
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

### Canonical Local Sync

Before you treat `/Users/jeking/dev/AgenticOS` as a trusted local starting point, resync it:

```bash
git -C /Users/jeking/dev/AgenticOS fetch origin --prune
git -C /Users/jeking/dev/AgenticOS checkout main
git -C /Users/jeking/dev/AgenticOS pull --ff-only origin main
git -C /Users/jeking/dev/AgenticOS status --short --branch
```

Trusted output is a clean:

```text
## main...origin/main
```

If the checkout is dirty, ahead, or behind, do not use it as your trusted local reasoning base. Resync first, then open or use an isolated worktree for real implementation work.

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
git add projects/agenticos/mcp-server/package.json CHANGELOG.md
git commit -m "chore(release): bump version to v0.2.1"

# 4. Push to main
git push

# 5. Tag — this triggers the Release workflow automatically
git tag v0.2.1
git push origin v0.2.1

# 6. Update Homebrew formula sha256 (after release artifact is published)
curl -sL https://github.com/madlouse/AgenticOS/releases/download/vX.Y.Z/agenticos-mcp.tgz | shasum -a 256
# Update projects/agenticos/homebrew-tap/Formula/agenticos.rb with new url, sha256, and version
```

> **Important**: Update the Homebrew formula immediately after every release. Never leave `sha256` as a placeholder — it will break `brew install`.

## Code Style

- TypeScript with strict mode enabled
- Follow existing patterns in `projects/agenticos/mcp-server/src/`
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

### GitHub transport fallback

If `git push` fails even though GitHub itself is reachable, diagnose before changing any global config.

Start with these checks:

```bash
gh auth status
git config --global --get-regexp '^(http|https)\\.proxy$' || true
git ls-remote https://github.com/madlouse/AgenticOS.git HEAD
```

Common failure pattern on this machine:

- `curl https://github.com` works
- `gh auth status` is healthy
- `git push` over HTTPS fails because global `http.proxy` / `https.proxy` points to a broken local proxy

If direct Git works but proxied Git does not, use a command-scoped fallback instead of editing the remote URL or mutating global proxy settings.

Create a temporary askpass helper:

```bash
cat >/tmp/agenticos-gh-askpass.sh <<'EOF'
#!/bin/sh
case "$1" in
  *Username*) echo "madlouse" ;;
  *Password*) gh auth token ;;
  *) echo "" ;;
esac
EOF
chmod 700 /tmp/agenticos-gh-askpass.sh
```

Then push with direct Git transport and explicit non-interactive credentials:

```bash
GIT_TERMINAL_PROMPT=0 \
GIT_ASKPASS=/tmp/agenticos-gh-askpass.sh \
GIT_ASKPASS_REQUIRE=force \
git -c credential.helper= -c http.proxy= -c https.proxy= push -u origin <branch>
```

If that still fails with `LibreSSL SSL_connect: SSL_ERROR_SYSCALL`, retry with a command-scoped HTTP transport compatibility override:

```bash
GIT_TERMINAL_PROMPT=0 \
GIT_ASKPASS=/tmp/agenticos-gh-askpass.sh \
GIT_ASKPASS_REQUIRE=force \
git -c credential.helper= -c http.proxy= -c https.proxy= -c http.version=HTTP/1.1 push -u origin <branch>
```

Interpretation:

- no-proxy failure usually means GitHub itself or the network path is unavailable
- no-proxy success plus push failure usually means the remaining problem is credentials or Git HTTPS transport compatibility
- `-c http.version=HTTP/1.1` is a command-scoped compatibility step, not a recommendation to rewrite global Git config

Rules:

- Prefer command-scoped `-c http.proxy=` / `-c https.proxy=` over changing global proxy config
- Prefer a temporary `GIT_ASKPASS` helper over embedding tokens in the remote URL
- Prefer command-scoped `-c http.version=HTTP/1.1` over changing global transport defaults
- Remove the temporary helper after use if you no longer need it: `rm -f /tmp/agenticos-gh-askpass.sh`

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
- If HTTPS push fails, use the documented command-scoped no-proxy + `GIT_ASKPASS` fallback, and add `-c http.version=HTTP/1.1` if the first retry still fails with `SSL_ERROR_SYSCALL`

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
