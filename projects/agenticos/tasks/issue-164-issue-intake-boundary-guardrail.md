# Issue #164: Issue-Intake Boundary Guardrail

## Summary

AgenticOS now has fail-closed project and source-repo checks before implementation-affecting edits, branch bootstrap, and PR scope validation.

The remaining gap is the issue-intake stage itself.

There is no canonical AgenticOS guardrail that proves:

- the active project is correct
- the intended managed project is correct
- the current source repo binding is correct

before a new GitHub issue is created or linked.

GitHub issue:

- https://github.com/madlouse/AgenticOS/issues/164

## Why This Matters

- Operators can still start from the wrong project context before the current guardrails begin.
- The execution path is now protected, but the task-intake path is not.
- A dedicated issue-intake guardrail would make project intent explicit earlier and reduce cross-project drift.

## Requested Changes

1. Add an issue-intake helper or guardrail that proves active project identity before creating or binding a GitHub issue.
2. Validate the intended managed project and declared source repo roots at issue-intake time.
3. Return a fail-closed redirect when the operator is in the wrong project context or wrong source repo.
4. Persist issue-intake evidence into project state so downstream preflight/edit/PR tools can reuse it.

## Acceptance Criteria

- Creating or binding an issue from the wrong active project fails closed.
- The guardrail reports the expected managed project and canonical repo root/worktree.
- Downstream tools can see the latest issue-intake evidence in project state.
