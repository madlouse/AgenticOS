---
issue: 215
title: patch release for canonical-main runtime write protection
status: in_progress
owners:
  - codex
created: 2026-04-07
---

## Goal

Prepare the next patch release so the standard Homebrew-installed runtime can
pick up the canonical-main write-protection changes already merged to `main`.

## Why

The recovery audit now shows that the source tree contains the protection, but
the installed `agenticos-mcp` runtime still does not. Recovery should not rely
on local source-only fixes; it needs a standard install-time binary.

## Deliverables

- bump `projects/agenticos/mcp-server/package.json` to the next patch version
- update `package-lock.json` version metadata
- add release notes to `CHANGELOG.md`
- record this release-prep work in the issue task file

## Follow-up

- merge this preparation PR
- create and push the release tag
- wait for `agenticos-mcp.tgz` to publish
- update `projects/agenticos/homebrew-tap/Formula/agenticos.rb` with the new
  version, URL, and sha256
- reinstall and verify the Homebrew runtime on this machine

## Self-check

### Rule-based

- patch bump only
- no product behavior changes in this issue
- changelog entries must describe the real runtime recovery relevance

### Executable

- `npm test` still passes after the version bump
- `agenticos-mcp --version` from the build output reports the new patch version
