# PR Draft for #266

Closes #266.

## Title

`release: prepare v0.4.3 for session-local runtime resolution`

## Summary

This PR prepares the next AgenticOS patch release so the standard
Homebrew-installed runtime can pick up the merged `#262` session-local project
resolution redesign.

This tranche is release-prep only:

1. patch version bump to `0.4.3`
2. changelog entry for the runtime-model fix set
3. issue task record for the release-parity work

Release artifact publication, tag push, Homebrew formula sha update, and local
reinstall/verification remain the follow-up execution steps after merge.

## What Changed

- bumped `mcp-server/package.json` to `0.4.3`
- updated `mcp-server/package-lock.json` version metadata
- added the `0.4.3` changelog entry describing the installed-runtime impact of
  `#260` and `#262`
- added the issue task file for runtime release parity execution

## Verification

- `npm test`
- `npm run lint`
- `node build/index.js --version`

Result:

- `32` test files passed
- `255` tests passed
- lint passed
- build output reports `0.4.3`

## Key Files

- `mcp-server/package.json`
- `mcp-server/package-lock.json`
- `CHANGELOG.md`
- `tasks/issue-266-homebrew-runtime-session-local-release.md`

## Follow-Ups

- merge this PR
- create and push tag `v0.4.3`
- wait for the GitHub release asset `agenticos-mcp.tgz`
- update `madlouse/homebrew-agenticos` formula version/url/sha256
- `brew upgrade agenticos`
- restart MCP clients and verify the installed runtime no longer reproduces the
  old `active_project` mismatch semantics
