# Issue #187: Ignore Excluded Local Helper Roots

## Summary

After normalizing local project roots, the canonical `AgenticOS` worktree still remained dirty because two excluded local helper roots were not ignored:

- `.private/`
- `worktrees/`

These paths are local helper state, not canonical product source.

## Scope

- add explicit ignore rules for `.private/` and `worktrees/`
- keep the canonical checkout focused on tracked source only

## Non-Goals

- do not delete existing helper state
- do not change the semantics of managed projects
