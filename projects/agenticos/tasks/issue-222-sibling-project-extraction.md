---
issue: 222
title: stop tracking sibling projects in the root git repository
status: in_progress
owners:
  - codex
created: 2026-04-07
---

## Goal

Remove root-repository tracking for sibling projects outside
`projects/agenticos` so the enclosing `AgenticOS` root can continue moving
toward a normal workspace-home directory.

## Scope

This extraction wave covers:

- `projects/2026okr`
- `projects/360teams`
- `projects/agentic-devops`
- `projects/agentic-os-development`
- `projects/ghostty-optimization`
- `projects/okr-management`
- `projects/t5t`
- `projects/test-project`

## Safety Contract

- use `git rm --cached -r`, not file deletion
- keep all project files on disk
- add explicit root `.gitignore` coverage before index removal
- verify the root-git audit no longer reports `tracked-sibling-projects`

## Self-check

### Rule-based

- `projects/agenticos` remains tracked
- the eight sibling projects become root-ignored, not deleted
- no runtime config changes are mixed into this issue

### Executable

- `test -d` passes for all eight project directories after index removal
- `git ls-files` returns no entries under the eight project roots
- `projects/agenticos/tools/audit-root-git-exit.sh --workspace-root /Users/jeking/dev/AgenticOS/worktrees/agenticos-222-sibling-project-extraction`
  reports `tracked-sibling-projects: PASS`
