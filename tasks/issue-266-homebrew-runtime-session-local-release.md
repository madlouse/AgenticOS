---
issue: 266
title: ship patch release so Homebrew runtime includes #262 session-local project resolution
status: in_progress
owners:
  - codex
created: 2026-04-10
---

## Goal

Ship the next AgenticOS patch release so the standard Homebrew-installed
runtime includes the merged `#262` session-local project resolution redesign.

## Why

Live validation on 2026-04-10 confirmed:

- `#262` / `PR #264` is merged to source `main`
- the machine runtime is still Homebrew `agenticos-mcp 0.4.2`
- running MCP processes still come from `/opt/homebrew/bin/agenticos-mcp`
- the installed runtime therefore still reproduces cross-project
  `active_project` drift and mismatch semantics

So release parity, not source correctness, is now the blocker.

## Deliverables

- bump `mcp-server/package.json` to the next patch version
- update `mcp-server/package-lock.json` version metadata
- add release notes to `CHANGELOG.md`
- tag and publish the new GitHub release artifact
- update the Homebrew tap formula version/url/sha256
- upgrade and verify the Homebrew-installed runtime on this machine

## Notes

- this issue exists because closed `#215` only covered the earlier
  canonical-main write-protection release parity tranche
- this tranche is specifically about shipping the merged `#262` runtime-model
  redesign into the installed Homebrew runtime
- do not expand `#263` migration-policy scope in this issue

## Self-check

### Rule-based

- patch bump only
- no new runtime-model design changes here; ship the merged fix set
- changelog must describe the real install-time runtime impact

### Executable

- `npm test`
- `npm run lint`
- `agenticos-mcp --version` from the built output reports `0.4.3`
