---
name: review
description: Review the current branch's diff against main for convention compliance. Run without arguments to check the current branch.
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
---

# /review

Review the current branch for compliance with project conventions.

## Usage

```
/review
/review feat/12-export-tool
```

## Checks

### 1. Branch Naming
Verify branch name follows `<type>/<issue-number>-<slug>`:
```bash
git branch --show-current
```

### 2. Commit Convention
Check commits follow Conventional Commits:
```bash
git log main..HEAD --oneline
```

Expected format: `<type>(scope): <description>`

### 3. PR Reference
Verify the branch has an associated PR:
```bash
gh pr list --head $(git branch --show-current) --state open
```

### 4. Build Pass
Verify the code compiles:
```bash
cd mcp-server && npm run build
```

### 5. No Forbidden Changes
Check no files under `projects/` were modified:
```bash
git diff main --stat | grep "projects/"
```

### 6. No Sensitive Files
Check for accidental commits:
```bash
git diff main --name-only | grep -E "node_modules|build/|\.env|package-lock"
```

## Output Format

Provide a checklist with ✅/❌ for each check, and list any issues found.
If all checks pass, output: "All checks passed. Ready to merge."

## When to Run

- Before opening a PR
- After making significant changes
- Before requesting review
- Before merging
