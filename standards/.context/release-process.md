# Release Process

> Every merged PR group should produce a tagged release. No exception.

## Version Number

Semantic versioning: `MAJOR.MINOR.PATCH`
- **PATCH**: bug fixes, test additions, minor improvements
- **MINOR**: new features, new tools, new MCP capabilities
- **MAJOR**: breaking API changes

## Release Automation

Releases are automated via `.github/workflows/release.yml`:
- Triggered by pushing a tag matching `v*` (e.g., `git tag v0.4.19 && git push origin v0.4.19`)
- Runs: build → npm pack → create GitHub Release → update Homebrew formula

## Pre-release Checklist

Before creating a GitHub release:

- [ ] All PRs in the release group are merged to `main`
- [ ] `main` passes CI (build + all tests)
- [ ] Version bumped in `mcp-server/package.json`
- [ ] Tests pass: `AGENTICOS_HOME=<path> npx vitest run` — all green
- [ ] Commit version bump: `git add mcp-server/package.json && git commit -m "chore: release v<VERSION>"`
- [ ] Push and tag: `git tag v<VERSION> && git push origin v<VERSION>`

## CI/CD Release Flow (Automated)

```
git tag v<VERSION> && git push origin v<VERSION>
    ↓
.github/workflows/release.yml triggers
    ↓
1. Build (npm install + npm run build)
2. Create tarball (npm pack)
3. Create GitHub Release (softprops/action-gh-release)
4. Update Homebrew formula (mislav/bump-homebrew-formula-action)
    ↓
GitHub Release created + Homebrew PR auto-opened
```

## Manual Release Commands (Fallback)

If CI is unavailable, run manually:

```bash
# 1. Bump version in mcp-server/package.json
# 2. Build + package
cd mcp-server
npm install --ignore-scripts
./node_modules/.bin/tsc
npm pack

# 3. SHA256
shasum -a 256 agenticos-mcp-*.tgz

# 4. Create GitHub Release
gh release create v<VERSION> \
  --title "v<VERSION> — <summary>" \
  --notes "## Summary\n- ..."

# 5. Upload tgz
gh release upload v<VERSION> agenticos-mcp-*.tgz

# 6. Update homebrew-tap/Formula/agenticos.rb (both repos)
# URL: https://github.com/madlouse/AgenticOS/releases/download/v<VERSION>/agenticos-mcp-<VERSION>.tgz
# Version + SHA256 updated

# 7. Commit and push formula to both:
#   - projects/agenticos/homebrew-tap/Formula/agenticos.rb  (AgenticOS main)
#   - /opt/homebrew/Library/Taps/madlouse/homebrew-agenticos/Formula/agenticos.rb  (local tap)

# 8. Install and link
brew reinstall madlouse/agenticos/agenticos
brew link --overwrite madlouse/agenticos/agenticos

# 9. Verify
agenticos-mcp --version
claude mcp list
```

## Homebrew Tap Locations

| Repo | Path |
|------|------|
| Canonical source | `projects/agenticos/homebrew-tap/Formula/agenticos.rb` |
| Local tap (for `brew install`) | `/opt/homebrew/Library/Taps/madlouse/homebrew-agenticos/Formula/agenticos.rb` |

Both must be updated on every release. The local tap is what `brew install` reads.

## Required Secrets

For automated Homebrew bumps, the repository needs:

| Secret | Purpose |
|--------|---------|
| `HOMEBREW_TAP_PAT` | PAT with `repo` scope for `mislav/bump-homebrew-formula-action` to create PRs |

If `HOMEBREW_TAP_PAT` is absent or empty, the release can still create the
GitHub Release artifact, but the Homebrew tap update will fail and the source
formula sync step will be skipped. In that case, manually update both formula
locations to the release artifact URL and SHA256 before considering the release
complete.

## Post-release

- [ ] MCP registration verified in Claude Code and other agents
- [ ] Release notes posted to relevant channels if needed

## Workflow Template for Other Projects

The `.github/workflows/release.yml` in AgenticOS is designed as a template for other projects.
To reuse in other projects:

```yaml
on:
  push:
    tags:
      - "v*"

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install and build
        run: npm install && npm run build
      - name: Create npm tarball
        run: npm pack
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: "*.tgz"
      - name: Update Homebrew formula
        uses: mislav/bump-homebrew-formula-action@v4
        with:
          formula-name: YOUR_FORMULA
          formula-path: Formula/yourformula.rb
          homebrew-tap: user/homebrew-yourtap
          tag-name: ${{ github.ref_name }}
        env:
          COMMITTER_TOKEN: ${{ secrets.YOUR_PAT_SECRET }}
```

For reusable workflow_call version, see `homebrew-bump.yml`.
