---
name: Feature Request
about: Define how to isolate a clean migration baseline before any self-hosting execution begins
title: "feat: define baseline isolation procedure before self-hosting migration"
labels: enhancement
---

## Problem Statement

The current AgenticOS root worktree is not clean enough to serve as a trustworthy migration starting point.

It currently mixes:
- unstaged root product-source changes
- staged deletions related to the standards subproject split
- unrelated runtime project changes

If self-hosting migration starts from this state, verification and rollback become ambiguous.

## Proposed Solution

Define a baseline isolation procedure that:
- preserves the current dirty state safely
- creates a dedicated migration branch
- creates a fresh isolated worktree
- verifies the clean baseline before any structural move begins

The procedure should define:
- branch naming
- worktree location rules
- preservation commands for current dirty state
- clean-worktree verification gates
- stop conditions if isolation fails

## Why This Matters

Migration quality depends on starting from a clean and reviewable baseline.

Without isolation, even a good migration plan can fail operationally.

## Acceptance Criteria

- A documented baseline isolation procedure exists
- Dirty-state preservation requirements are explicit
- A clean migration branch/worktree strategy is defined
- Verification gates exist before the first structural move
