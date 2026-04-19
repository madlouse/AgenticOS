---
issue: 302
title: ship release so installed runtime includes post-0.4.3 continuity and transcript fixes
status: in_progress
owners:
  - codex
created: 2026-04-19
---

## Goal

Ship the next AgenticOS release so the installed/runtime distribution catches up
with the continuity and transcript behavior already merged to `main` after
`v0.4.3`.

## Why

As of 2026-04-19:

- `mcp-server/package.json` is still `0.4.3`
- GitHub Releases stop at `v0.4.3` from 2026-04-10
- `homebrew-tap/Formula/agenticos.rb` still points to `v0.4.2`
- source `main` already contains merged PR `#270` and PR `#278`
- live runtime use on 2026-04-18 and 2026-04-19 still required a manual
  follow-up commit to carry refreshed `standards/.context/quick-start.md`,
  even though source `main` already stages quick-start in `save.ts` and the
  save tests assert that behavior

This is a release/install parity gap, not an unimplemented source-tree design.

## Deliverables

- choose the next release version after `0.4.3`
- bump `mcp-server/package.json`
- bump `mcp-server/package-lock.json`
- add the new release entry to `CHANGELOG.md`
- publish the GitHub release artifact
- update `homebrew-tap/Formula/agenticos.rb` version/url/sha256
- reinstall or upgrade the installed runtime and verify parity

## Verification

- `cd mcp-server && npm run lint`
- `cd mcp-server && npm test -- src/tools/__tests__/save.test.ts src/tools/__tests__/record.test.ts src/utils/__tests__/context-policy-plan.test.ts src/utils/__tests__/continuity-surface.test.ts`
- verify built/runtime version reports the new release
- verify live runtime no longer drops refreshed quick-start state after entry-surface refresh

## Notes

- release `v0.4.3` only shipped the `#260` / `#262` runtime-resolution tranche
- this issue exists because continuity/transcript work merged later and is not
  yet reflected in the installed runtime path
- do not redesign continuity policy or transcript routing in this issue; ship
  the already-merged behavior
