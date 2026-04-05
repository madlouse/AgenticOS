# Development Guide

This document covers architecture, local development, and the release process.
It is written to be followed by an AI agent without additional context.

---

## Repository layout

```
360teams-opencli/
├── README.md                  # installation and usage (agent-friendly)
├── DEVELOPMENT.md             # this file
├── install.sh                 # manual install (non-Homebrew)
├── package.json               # root: dev/test config only (vitest)
├── vitest.config.js           # test config; coverage requires 100% on helpers.js
├── Formula/
│   └── teams-opencli.rb       # Homebrew formula (copy to tap repo on release)
├── skills/
│   └── SKILL.md               # Claude Code skill (source of truth)
└── clis/360teams/             # the adapter — this is what gets installed
    ├── package.json           # runtime deps only (chrome-remote-interface)
    ├── launcher.js            # auto-launch 360Teams in CDP debug mode
    ├── cdp.js                 # CDP connection; calls launcher then connects
    ├── cache.js               # file-based cache at ~/.opencli/cache/360teams/
    ├── helpers.js             # pure data-transform functions (fully tested)
    ├── helpers.test.js        # unit tests — must stay at 100% coverage
    ├── me.js                  # current user (24 h cache)
    ├── contacts.js            # contact list (1 h cache)
    ├── groups.js              # group list (1 h cache)
    ├── search.js              # name search (uses contacts cache)
    ├── conversations.js       # recent conversations (no cache)
    ├── read.js                # message history (no cache)
    ├── send.js                # send message
    └── status.js              # CDP health check
```

**Installed locations (after `brew install` or `install.sh`):**
- Adapter: `~/.opencli/clis/360teams` → symlink into Homebrew Cellar
- Skill: `~/.claude/skills/360teams/SKILL.md`
- Cache: `~/.opencli/cache/360teams/*.json` (auto-created at runtime)

---

## Architecture decisions

### Why chrome-remote-interface, not Playwright?
360Teams is an Electron app. Playwright's `connectOverCDP` unconditionally calls `Browser.setDownloadBehavior` during init, which Electron does not implement, causing an immediate crash. `chrome-remote-interface` sends only what we explicitly request.

### Why func: mode, not pipeline:?
opencli's `pipeline.evaluate` requires a Playwright `page` object. Incompatible with our custom CDP connection. All commands use `func:` and call `withElectronPage()` directly.

### Cache design
Cache files are at `~/.opencli/cache/360teams/<key>.json` — an absolute path independent of the working directory. Each file stores `{ value, expiresAt }`. `getCache` returns `null` on missing file or past expiry. `setCache` creates the directory if needed.

Contacts and groups are cached because they rarely change and fetching them requires a CDP round-trip + store traversal. Conversations and messages are never cached because they are the primary real-time data.

### Auto-launch flow
```
withElectronPage(fn)
  └─ ensureDebugMode()          [launcher.js]
      ├─ fetch http://localhost:9234/json
      │   └─ 200 OK → return (fast path, ~2ms)
      └─ not reachable
          ├─ findAppPath()      checks CANDIDATE_PATHS, then mdfind
          ├─ killExisting()     pkill + poll until pgrep returns nothing
          ├─ open -a <app> --args --remote-debugging-port=9234
          └─ waitForPort(30s)   polls every 500ms
              └─ timeout → throw with manual fallback command
  └─ CDP.List() → find renderer target → CDP connect → fn(page) → close
```

---

## Local development setup

```bash
git clone https://github.com/madlouse/360teams-opencli
cd 360teams-opencli

# Install test dependencies (vitest, coverage)
npm install

# Run tests
npm test
```

Expected test output:
```
Test Files  1 passed (1)
Tests  46 passed (46)
```

The test suite covers `helpers.js` at 100% line/branch/function/statement coverage.
Any PR that drops coverage below 100% will fail CI.

To run with coverage report:
```bash
npm run test:coverage
# Report written to ./coverage/index.html
```

---

## Adding a new command

1. Create `clis/360teams/<name>.js` following the pattern of an existing command (e.g. `contacts.js`).
2. If the command reads static data (contacts, groups), integrate `getCache`/`setCache` from `cache.js`.
3. If the command transforms data, add the transform function to `helpers.js` and write unit tests in `helpers.test.js`.
4. Verify tests still pass: `npm test`.
5. Update the command reference table in `README.md` and `skills/SKILL.md`.

---

## Release process

Follow these steps exactly. Each step includes a verification command.

### Step 1 — make changes on main branch

```bash
cd /path/to/360teams-opencli    # local clone
git status
# Expected: clean working tree, on branch main
```

### Step 2 — run tests

```bash
npm test
# Expected: all tests pass, no failures
```

### Step 3 — bump version

Edit `package.json` and `clis/360teams/package.json`: change `"version"` to the new version (e.g. `"1.1.0"`).

```bash
# Verify both files updated
grep '"version"' package.json clis/360teams/package.json
# Expected: both show the new version
```

### Step 4 — commit and push

```bash
git add package.json clis/360teams/package.json
git commit -m "chore: bump version to v1.1.0"
git push origin main
```

### Step 5 — tag and create release

```bash
VERSION=v1.1.0

git tag $VERSION
git push origin $VERSION

gh release create $VERSION \
  --title "$VERSION" \
  --notes "Describe changes here" \
  --repo madlouse/360teams-opencli
```

Verify:
```bash
gh release view $VERSION --repo madlouse/360teams-opencli
# Expected: shows release with Assets including Source code (tar.gz)
```

### Step 6 — compute sha256 of release tarball

```bash
VERSION=v1.1.0
SHA=$(curl -sL https://github.com/madlouse/360teams-opencli/archive/refs/tags/${VERSION}.tar.gz | shasum -a 256 | awk '{print $1}')
echo $SHA
# Expected: 64-character hex string
```

### Step 7 — update Homebrew formula

Edit `Formula/teams-opencli.rb`. Update these two lines:

```ruby
url "https://github.com/madlouse/360teams-opencli/archive/refs/tags/v1.1.0.tar.gz"
sha256 "<value from step 6>"
```

Also update `version "1.1.0"`.

Commit and push to source repo:
```bash
git add Formula/teams-opencli.rb
git commit -m "chore: update formula for v1.1.0"
git push origin main
```

### Step 8 — push formula to tap repo

```bash
# Clone tap repo (or use existing local clone)
git clone https://github.com/madlouse/homebrew-360teams /tmp/homebrew-360teams-release
cd /tmp/homebrew-360teams-release

cp /path/to/360teams-opencli/Formula/teams-opencli.rb ./teams-opencli.rb

git add teams-opencli.rb
git commit -m "teams-opencli v1.1.0"
git push origin main
```

### Step 9 — verify

On a machine with the tap already added:
```bash
brew reinstall teams-opencli
opencli 360teams status
# Expected: successful connection output
```

On a fresh machine:
```bash
brew tap madlouse/360teams https://github.com/madlouse/homebrew-360teams
brew install teams-opencli
opencli 360teams status
```

---

## Skill file maintenance

`skills/SKILL.md` is the **source of truth** for the Claude Code skill.

It is copied to `~/.claude/skills/360teams/SKILL.md` during `brew install` / `brew reinstall` / `./install.sh`.

When commands or behavior change:
1. Update `skills/SKILL.md` in this repo.
2. Commit and push.
3. The updated skill reaches users on their next `brew reinstall teams-opencli`.

Local developers can also manually sync:
```bash
cp skills/SKILL.md ~/.claude/skills/360teams/SKILL.md
```
