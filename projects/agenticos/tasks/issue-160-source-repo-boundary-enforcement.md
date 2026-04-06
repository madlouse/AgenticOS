# Issue #160: Source Repo Boundary Enforcement

## Summary

AgenticOS guardrails currently allow implementation work to proceed when the active managed project is correct but the actual Git repository is wrong.

This was first reproduced during `360teams` work on 2026-04-05, before the canonical source was migrated into the managed `projects/360teams` location.

The failure mode was:

- the active managed project looked correct
- the execution path still accepted the wrong Git repository root
- branch/PR flow could start before the repo boundary was proven

GitHub issue:

- https://github.com/madlouse/AgenticOS/issues/160

## Why This Matters

- Project-path resolution is not enough when a managed project lives inside a larger container repository.
- A larger checkout can still look valid if tooling only proves project-path containment.
- The safer contract is: implementation-affecting work must prove both the managed project identity and the allowed source repo root before edits, branching, or PR validation continue.

## Required Changes

1. Add explicit source-repo binding to managed project metadata.
2. Make preflight/edit/branch/PR guardrails fail closed when the resolved Git root is not declared for the target project.
3. Apply the same boundary enforcement to `bugfix` work, not only `implementation`.
4. Return a redirect action pointing to the expected repo root/worktree.
5. Persist both project identity and resolved repo identity evidence for downstream guardrails.

## Acceptance Criteria

- The wrong-repo case returns `BLOCK` before any edit or PR step.
- Bugfix tasks no longer bypass repo-boundary enforcement.
- Guardrail output tells the operator which repo should be used instead.
