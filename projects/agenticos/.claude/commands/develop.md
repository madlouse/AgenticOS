---
name: develop
description: Given a GitHub issue number, create a worktree branch, implement the change, and open a PR. Usage: /develop <issue-number> or /develop <issue-url>
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
---

# /develop

Given a GitHub issue, implement it following the Issue-First workflow.

## Usage

```
/develop 12
/develop https://github.com/madlouse/AgenticOS/issues/12
```

## Steps

### 1. Understand the Issue
- Fetch the issue details with `gh issue view <number> --json title,body,labels`
- Read the acceptance criteria carefully
- Ask clarifying questions if the requirements are unclear

### 2. Create Branch
- Create a branch following the naming convention: `<type>/<issue-number>-<slug>`
  where type is derived from labels (feat/fix/docs/chore/ci/refactor/test)
  and slug is a short lowercase description of the issue
- Use a **separate worktree directory** (not inside the repo):
  ```bash
  git worktree add /path/to/worktree -b branch-name
  ```

### 3. Implement
- Read CLAUDE.md and AGENTS.md at the repo root for development rules
- Implement the change following the conventions:
  - TypeScript strict mode
  - Conventional Commits format
  - No direct commits to main
- Build and verify: `cd mcp-server && npm run build`

### 4. Record & Commit
- Call `agenticos_record()` with session summary
- Commit using Conventional Commits: `<type>(scope): <description>`
- Always include `Closes #<issue-number>` in the commit message

### 5. Open PR
- Push branch to origin
- Create PR with `gh pr create`
- Reference the issue: `Closes #<issue-number>`

## Branch Naming Examples

| Issue | Label | Branch |
|-------|-------|--------|
| #12 "Add export tool" | enhancement | `feat/12-export-tool` |
| #3 "Fix save error" | bug | `fix/3-save-error` |
| #8 "Add CI pipeline" | enhancement | `feat/8-ci-pipeline` |
| #5 "Update docs" | documentation | `docs/5-update-readme` |

## Forbidden Actions

- Never push directly to `main`
- Never commit `node_modules/`, `build/`, `.env`
- Never modify files under `projects/` (user data)
- Never skip the PR — even for small changes
