---
issue: 220
title: executable root-git exit audit for workspace-home cutover
status: in_progress
owners:
  - codex
created: 2026-04-07
---

## Goal

Add one read-only audit surface that reports whether the current AgenticOS root
is ready to stop acting as the Git repository root and become a normal
workspace-home directory.

## Why

The user-confirmed target workspace-home path is `/Users/jeking/dev/AgenticOS`,
but that path still mixes:

- root Git ownership
- product-source compatibility files
- tracked child projects
- runtime state dirtiness

The blocker set must be executable before any relocation or history surgery.

## Self-check

### Rule-based

- audit must be read-only
- audit must emit structured PASS/WARN/BLOCK output
- blocker categories must align with the existing root topology analysis

### Executable

- run the audit against `/Users/jeking/dev/AgenticOS`
- confirm it detects root Git, root-owned product files, tracked sibling
  projects, and runtime dirtiness
