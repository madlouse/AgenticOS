---
name: release
description: Prepare and execute a release: bump version, update CHANGELOG, create git tag. Usage: /release <major|minor|patch>
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
---

# /release

Prepare and execute a release following semantic versioning.

## Usage

```
/release patch  # 0.2.0 → 0.2.1 (bug fixes)
/release minor  # 0.2.0 → 0.3.0 (new features)
/release major  # 0.2.0 → 1.0.0 (breaking changes)
```

## Pre-Release Checklist

Before running `/release`, verify:
- [ ] All PRs for this release are merged to `main`
- [ ] CI passes on `main`
- [ ] No uncommitted changes on `main`
- [ ] Conventional Commits are used in the release commits

## Steps

### 1. Update Version

Update `package.json` and `mcp-server/src/index.ts`:

```bash
# Determine new version
current=$(git describe --tags --abbrev=0)
echo "Current version: $current"

# Update package.json version field
# Update mcp-server/src/index.ts version constant
```

### 2. Generate CHANGELOG Entry

Use `git log` to generate the changelog from Conventional Commits since last tag:

```bash
git log --format="%s" $(git describe --tags --abbrev=0)..HEAD --grep -E "^(feat|fix|docs|chore|refactor|test|ci):"
```

Categorize into:
- **Breaking Changes** (feat!: or fix!: or BREAKING CHANGE:)
- **New Features** (feat:)
- **Bug Fixes** (fix:)
- **Other Changes** (docs, chore, refactor, ci, test)

### 3. Update Files

Update these files with the new version:
1. `mcp-server/package.json` — `version` field
2. `mcp-server/src/index.ts` — version constant
3. `CHANGELOG.md` — prepend new version entry with today's date

### 4. Commit

```bash
git add mcp-server/package.json mcp-server/src/index.ts CHANGELOG.md
git commit -m "release: bump version to <new-version>"
```

### 5. Tag

```bash
git tag -a v<new-version> -m "Release v<new-version>"
```

### 6. Push

```bash
git push origin main --tags
```

## Current Version

Check with:
```bash
grep '"version"' mcp-server/package.json | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+'
```

## Forbidden Actions

- Never modify version field without following the full release process
- Never force-push tags
- Never release with failing CI
