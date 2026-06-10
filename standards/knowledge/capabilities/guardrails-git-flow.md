# Guardrails And Git Flow

## 1. Overview

Guardrails and Git flow make AgenticOS work reviewable and rollback-friendly.
The standard is Git-backed, not GitHub-only: GitHub, GitLab, Gitee, and generic
Git remotes share the same local issue/worktree/preflight/edit/scope/review
discipline.

Public surfaces:

- `agenticos_branch_bootstrap`
- `agenticos_issue_bootstrap`
- `agenticos_preflight`
- `agenticos_edit_guard`
- `agenticos_pr_scope_check`
- `agenticos_enforce_git_policy`
- `agenticos_worktree_cleanup`

User value: agents should not casually mutate a dirty checkout or unrelated
branch; each change should map to an issue, isolated worktree, verification
evidence, PR/MR, CI, merge, and cleanup.

## 2. Detailed Design

Normal implementation flow:

1. Create/identify issue.
2. Bootstrap isolated branch/worktree from intended remote base.
3. Record issue bootstrap after context reset and project startup context.
4. Run preflight with target files and reproducibility gates.
5. Pass edit guard before implementation-affecting edits.
6. Run tests and scope check.
7. Open PR/MR, wait for policy/CI, merge.
8. Cleanup worktree and stale branch.

Invariants:

- Worktree execution is required for implementation work.
- Branch ancestry must match intended remote base.
- Declared target files define scope.
- Guardrails fail closed when identity, bootstrap, or preflight evidence is
  missing.
- Merge commits preserve rollback.

Failure modes:

- Work occurs on canonical main.
- Issue id leaks unsafe characters into branch/worktree names.
- Guardrail tools resolve different checkouts.
- Shell-based git calls create command-injection risk.

## 3. Implementation Mapping

| Surface | Files/Tests | Notes |
| --- | --- | --- |
| Branch bootstrap | `mcp-server/src/tools/branch-bootstrap.ts`, tests | Creates sanitized worktree/branch. |
| Issue bootstrap | `mcp-server/src/tools/issue-bootstrap.ts`, tests | Records startup evidence. |
| Preflight/edit guard | `preflight.ts`, `edit-guard.ts`, tests | Scope and evidence gates. |
| PR scope | `pr-scope-check.ts`, tests | Confirms branch diff belongs to issue. |
| Git policy | `git-policy-enforce.ts` | Host policy enforcement. |
| Cleanup | `worktree-cleanup.ts`, tests | Removes merged/stale worktrees. |
| Standards | `git-backed-development-workflow-standard-2026-05-28.md` | Host-neutral Git flow. |

Issue cluster: 74 guardrail/Git issues. Open gaps are `#547`, `#522`, `#519`,
and `#514`.

Status: implemented and heavily tested. The next maturity step is orchestration
and shared identity resolution.

## Gaps

- `#514`: one checkout identity resolver shared across guardrail tools.
- `#519`: single `agenticos_issue_start` orchestration entrypoint.
- `#522`: release workflow should fail early when Homebrew tap token is absent.
- `#547`: release workflow should validate GitHub Release permissions and keep
  source formula sync from drifting after manual recovery.
