---
issue: 224
title: stop tracking .agent-workspace registry at root
status: in_progress
owners:
  - codex
created: 2026-04-07
---

## Goal

Remove `.agent-workspace/registry.yaml` from the root Git index while keeping the
registry file on disk as local workspace metadata.

## Safety Contract

- add root ignore coverage before index removal
- use `git rm --cached`, not file deletion
- verify `.agent-workspace/registry.yaml` remains present after extraction
