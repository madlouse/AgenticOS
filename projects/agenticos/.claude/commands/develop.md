---
name: develop
description: Given a GitHub issue number, run guardrail preflight, create a compliant worktree branch if needed, implement the change, and open a PR. Usage: /develop <issue-number> or /develop <issue-url>
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
- Load root `AGENTS.md` and `CLAUDE.md`
- Read standards context from `projects/agenticos/standards/knowledge/` when the issue changes workflow, templates, standards, or repository structure
- Ask clarifying questions if the requirements are unclear

### 2. Run Guardrail Preflight
- Classify the task
- Draft the intended file scope
- Call `agenticos_preflight` before editing anything
- If preflight returns:
  - `PASS`: continue
  - `REDIRECT`: call `agenticos_branch_bootstrap` and move to the returned worktree
  - `BLOCK`: stop and resolve the blocking reasons first

### 3. Create Or Confirm Branch
- Branch name must follow `<type>/<issue-number>-<slug>`
- The branch must be derived from `origin/main`, not the local current branch
- Use an **isolated worktree directory** outside the source checkout
- Prefer `agenticos_branch_bootstrap` over raw `git worktree add`

### 4. Implement
- Read CLAUDE.md and AGENTS.md at the repo root for development rules
- Implement the change following the conventions:
  - TypeScript strict mode
  - Conventional Commits format
  - No direct commits to main
- For non-trivial work, complete the design/critique loop before editing
- Build and verify from the self-hosted product path: `cd projects/agenticos/mcp-server && npm install && npm run build && npm test`

### 5. Record & Commit
- Call `agenticos_record()` with session summary
- Commit using Conventional Commits: `<type>(scope): <description>`
- Keep the issue number in the commit subject so `agenticos_pr_scope_check` can validate branch intent

### 6. Validate Scope And Open PR
- Call `agenticos_pr_scope_check`
- If scope check returns `BLOCK`, stop and fix the scope problem before PR creation
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
- Never skip guardrail preflight for implementation work
- Never open a PR without running `agenticos_pr_scope_check`
- Never modify runtime workspace projects under `projects/` unless the issue explicitly targets them
- Never skip the PR — even for small changes
