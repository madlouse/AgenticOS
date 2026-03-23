---
name: Feature Request
about: Prepare an operator-ready checklist with exact commands for baseline isolation before self-hosting migration
title: "feat: prepare operator checklist for self-hosting migration baseline isolation"
labels: enhancement
---

## Problem Statement

The migration planning stack now includes:
- target model
- relocation checklist
- verification-first execution sequence
- baseline isolation plan

But an operator still needs one final artifact:
- the exact command checklist to establish the migration baseline safely

Without that, execution may still drift or improvise.

## Proposed Solution

Prepare an operator-ready checklist that freezes:
- exact base commit
- exact migration branch name
- exact external worktree path
- exact preservation commands for current dirty state
- exact isolation verification commands
- exact isolation rollback commands

## Why This Matters

This is the final bridge between planning and safe execution.

## Acceptance Criteria

- An execution-ready operator checklist exists
- Exact commands are listed for preservation, worktree creation, and verification
- Exact stop conditions are defined
- Exact isolation rollback commands are defined
