---
name: review
description: Review the current branch's diff against origin/main for convention compliance and guardrail scope compliance. Run without arguments to check the current branch.
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
Check commits follow Conventional Commits and remain linked to the intended issue:
```bash
git log origin/main..HEAD --oneline
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
cd projects/agenticos/mcp-server && npm install && npm run build && npm test
```

### 5. Guardrail Scope Check
Run the MCP guardrail scope validator before merge:
- call `agenticos_pr_scope_check`
- verify it returns `PASS`

### 6. No Sensitive Files
Check for accidental commits:
```bash
git diff origin/main --name-only | grep -E "node_modules|build/|\.env"
```

## Output Format

Provide a checklist with ✅/❌ for each check, and list any issues found.
If all checks pass, output: "All checks passed. Ready to merge."

## When to Run

- Before opening a PR
- After making significant changes
- Before requesting review
- Before merging
