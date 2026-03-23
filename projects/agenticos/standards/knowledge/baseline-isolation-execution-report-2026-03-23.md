# AgenticOS Baseline Isolation Execution Report

> Date: 2026-03-23
> Purpose: record the first real execution of baseline isolation before self-hosting migration

## 1. Operator Inputs Used

- source repo path: `/Users/jeking/dev/AgenticOS`
- base commit: `fc401332bea49fdecdc2f4e489e30545d5061043`
- migration branch: `feat/self-hosting-migration`
- migration worktree path: `/Users/jeking/worktrees/agenticos-self-hosting`

## 2. Baseline Preservation Result

The current dirty root state was preserved outside the repository at:

```text
/Users/jeking/worktrees/agenticos-self-hosting-baseline/2026-03-23
```

Artifacts captured:
- `status.txt`
- `worktrees.txt`
- `unstaged.patch`
- `staged.patch`
- `untracked.txt`
- `base-commit.txt`

## 3. Isolation Result

Isolation itself succeeded.

Executed outcome:
- created branch `feat/self-hosting-migration`
- created external worktree `/Users/jeking/worktrees/agenticos-self-hosting`
- verified the fresh worktree was clean
- verified the fresh worktree HEAD was `fc401332bea49fdecdc2f4e489e30545d5061043`

## 4. Clean Baseline Validation Result

The clean reproducibility gate failed.

Command used:

```bash
cd /Users/jeking/worktrees/agenticos-self-hosting/mcp-server
npm ci
```

Observed result:
- `npm ci` failed immediately with `EUSAGE`
- npm reported that `package.json` and `package-lock.json` were not in sync
- the missing lock entries included `vitest` and related packages

This means the selected baseline commit is **not reproducible from a clean checkout** for `mcp-server`.

## 5. Operational Conclusion

The baseline isolation procedure is only partially complete:

- preservation: passed
- external worktree creation: passed
- clean worktree verification: passed
- clean install reproducibility: failed

Structural self-hosting migration must **not** continue from this baseline until the clean-install drift is resolved.

## 6. What This Changes

This execution introduces a new hard rule:

- migration execution is blocked not only by dirty source state
- it is also blocked by any clean-checkout reproducibility failure in the isolated worktree

For `mcp-server`, the reproducibility gate should use:

```bash
npm ci
npm run build
```

not a weaker install path that could hide lock drift.

## 7. Immediate Next Action

Create and track a dedicated issue to restore a reproducible clean `mcp-server` baseline before self-hosting migration resumes.

## 8. Follow-Up Resolution in Isolated Worktree

The clean-install blocker was then fixed in the isolated worktree without resuming structural migration.

Fix scope:
- updated `mcp-server/package-lock.json` only
- switched the external worktree onto a dedicated issue branch:
  - `fix/43-mcp-server-clean-install-baseline`
- committed the fix as:
  - `4aada96 fix(mcp-server): restore clean install lockfile baseline (#43)`

Validation after the lockfile sync:

```bash
cd /Users/jeking/worktrees/agenticos-self-hosting/mcp-server
npm ci
npm run build
npm test
```

Observed result:
- `npm ci` passed
- `npm run build` passed
- `npm test` passed with 43 tests passing and 3 skipped

## 9. Updated Operational Conclusion

The original reproducibility blocker is now resolved locally on the dedicated `#43` fix branch.

However, self-hosting migration should still remain paused until:
- the `#43` fix is reviewed and landed
- the migration baseline is re-established from the corrected source state

The fix has now been pushed and opened as:

- PR #44 `fix(mcp-server): restore clean install lockfile baseline (#43)`
