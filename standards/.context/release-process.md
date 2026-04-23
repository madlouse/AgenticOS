# Release Process

> Every merged PR group should produce a tagged release. No exception.

## Version Number

Semantic versioning: `MAJOR.MINOR.PATCH`
- **PATCH**: bug fixes, test additions, minor improvements
- **MINOR**: new features, new tools, new MCP capabilities
- **MAJOR**: breaking API changes

## Pre-release Checklist

Before creating a GitHub release:

- [ ] All PRs in the release group are merged to `main`
- [ ] `main` passes CI (build + all tests)
- [ ] Version bumped in `mcp-server/package.json`
- [ ] Build clean: `npm run build` passes
- [ ] Tests pass: `AGENTICOS_HOME=<path> npx vitest run` — all green
- [ ] Package tgz built: `npm pack`
- [ ] SHA256 computed: `shasum -a 256 *.tgz`
- [ ] Homebrew formula updated with new URL + version + SHA
- [ ] GitHub Release created with descriptive release notes
- [ ] tgz uploaded to GitHub Release assets
- [ ] Homebrew formula committed and pushed to `homebrew-tap` repo
- [ ] Local Homebrew upgraded: `brew reinstall madlouse/agenticos/agenticos && brew link --overwrite madlouse/agenticos/agenticos`
- [ ] Version verified: `agenticos-mcp --version` matches new version
- [ ] MCP health checked: `claude mcp list` shows agenticos ✓

## Release Commands

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
# URL: https://github.com/madlouse/AgenticOS/releases/download/v<VERSION>/agenticos-mcp-<VERSION>.tggz
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

## Post-release

- [ ] MCP registration verified in Claude Code and other agents
- [ ] Release notes posted to relevant channels if needed
