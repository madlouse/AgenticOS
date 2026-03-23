---
name: Bug Report
about: Restore a reproducible clean-install baseline for mcp-server before self-hosting migration continues
title: "fix: restore reproducible mcp-server clean install baseline before self-hosting migration"
labels: bug
---

## Problem Statement

The first real baseline-isolation execution for self-hosting migration succeeded in creating a clean external worktree, but failed at the reproducibility gate:

```bash
cd /Users/jeking/worktrees/agenticos-self-hosting/mcp-server
npm ci
```

`npm ci` failed because `package.json` and `package-lock.json` are out of sync. The missing lock entries include `vitest` and related packages.

That means the current migration baseline commit cannot be reproduced from a clean checkout.

## Proposed Solution

Restore a reproducible baseline for `mcp-server` by:
- bringing `package-lock.json` back into sync with `package.json`
- verifying `npm ci` succeeds in a fresh clean worktree
- verifying `npm run build` succeeds after the clean install
- documenting the clean-baseline verification step as a hard migration gate

## Why This Matters

Self-hosting migration cannot safely continue from a baseline that is not reproducible from a clean checkout.

If this is left unresolved:
- migration verification becomes unreliable
- future agents may continue from a false green baseline
- rollback and reproducibility claims become weak

## Non-Goals

- This issue does not execute the structural self-hosting migration itself
- This issue does not redesign the broader migration plan

## Acceptance Criteria

- `mcp-server/package.json` and `mcp-server/package-lock.json` are in sync
- `npm ci` succeeds in a fresh clean isolated worktree
- `npm run build` succeeds immediately after that clean install
- the baseline isolation and operator-checklist docs reflect `npm ci` as the canonical clean-baseline install gate
