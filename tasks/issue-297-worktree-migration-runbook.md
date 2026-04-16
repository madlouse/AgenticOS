# Issue #297 Worktree Migration Runbook

## Scope

This runbook applies to existing `github_versioned` managed-project issue
worktrees that are physically located outside the derived project-scoped helper
root:

```text
$AGENTICOS_HOME/worktrees/<project-id>/
```

## Rule

Do not move a Git worktree directory with bare `mv`.

Relocate by recreating the worktree from the canonical repo under the derived
root, then remove the old misplaced worktree.

## Classification

Classify each misplaced worktree before touching it:

1. `clean needed`
2. `dirty needed`
3. `obsolete or duplicate`

For every class, also verify:

- branch name
- HEAD commit
- whether unique commits exist
- whether an upstream branch exists
- whether a PR already exists

## Clean Needed

1. Record branch name and HEAD.
2. Recreate the worktree from the canonical repo under the derived root.
3. Verify the new worktree resolves to the same branch and HEAD.
4. Remove the old misplaced worktree.

## Dirty Needed

1. Record branch name and HEAD.
2. Protect the changes with `git stash -u` or a temporary safety commit.
3. Recreate the worktree under the derived root.
4. Restore the protected changes.
5. Verify the restored diff.
6. Remove the old misplaced worktree.

## Obsolete Or Duplicate

Only delete after verifying all of the following:

- no unique commits still matter
- no upstream branch still needs to be preserved
- no PR still depends on the worktree branch
- no local uncommitted recovery state needs to be kept

## Suggested Operator Outputs

Status and audit surfaces should help operators classify each misplaced
worktree with at least:

- path
- branch
- dirty
- upstream
- suggested_action
