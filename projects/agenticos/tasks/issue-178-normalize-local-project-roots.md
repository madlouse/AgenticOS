# Issue #178: Normalize Local Project Roots Under `projects/`

## Summary

`projects/agent-cli-api` and `projects/agenticresearch` are real managed projects in live local state, but they do not exist in clean `origin/main`.

They therefore need two separate kinds of normalization:

1. parent repo normalization
   - `AgenticOS` canonical must stop treating them as stray untracked paths
2. project-local normalization
   - each project must declare a valid `source_control.topology`

## Decisions

- `agent-cli-api`
  - classify as `github_versioned`
  - keep it as a standalone downstream repo with its own Git history and remote
  - canonical `AgenticOS` should ignore its project root instead of pretending it belongs to the main repo tree

- `agenticresearch`
  - classify as `local_directory_only`
  - keep it as a local-only managed project without any GitHub binding
  - canonical `AgenticOS` should ignore its project root so local iteration does not pollute the main repo worktree

## Scope

- add explicit ignore rules for these two local roots in `AgenticOS`
- record the normalization decision in project memory
- separately normalize each project's `.project.yaml` to the new topology contract

## Non-Goals

- do not import either whole project tree into `AgenticOS` main
- do not weaken repo-boundary guardrails
- do not force a GitHub repo onto `agenticresearch`
