---
issue: 218
title: require explicit user-confirmed workspace for bootstrap flows
status: completed
owners:
  - codex
created: 2026-04-07
---

## Goal

Remove silent workspace auto-selection from bootstrap so the runtime workspace
path is always explicitly confirmed by the user.

## Decision

- bootstrap now accepts workspace from exactly two places:
  - `--workspace <path>`
  - preconfirmed `AGENTICOS_HOME`
- when no confirmed workspace exists, bootstrap prints machine-local suggested
  candidates and an explicit confirmation command, but does not auto-select
- Homebrew and home-directory paths are now suggestions only, not implicit
  selections

## Verification

- `npx vitest run src/utils/__tests__/bootstrap-helper.test.ts src/utils/__tests__/bootstrap-cli.test.ts`
- `npm test`
