# Record Array Parsing Fix Report - 2026-03-24

## Summary

Issue `#24` fixes a bug in `agenticos_record` where array-style arguments passed as JSON strings were treated like plain strings and then spread character-by-character into persisted state.

The fix lands in:

- `projects/agenticos/mcp-server/src/tools/record.ts`
- `projects/agenticos/mcp-server/src/tools/__tests__/record.test.ts`

## Problem

Some MCP clients submit array arguments as JSON-encoded strings instead of native arrays.

Before this fix, `recordSession()` only trusted already-parsed arrays and defaulted to `[]` for everything else.

That broke an important real-world path:

- `decisions: "[\"a\",\"b\"]"`
- `outcomes: "[\"x\",\"y\"]"`
- `pending: "[\"p\"]"`

The downstream state update path then received malformed values and could persist unusable character-level noise instead of real list items.

## What Changed

`recordSession()` now normalizes `decisions`, `outcomes`, and `pending` through a shared helper:

- accept native arrays as-is
- accept JSON-stringified arrays by parsing them
- fall back to `[]` only when the value is neither an array nor a valid JSON array

This keeps the tool tolerant of MCP argument-shape differences without widening the accepted contract beyond list-like input.

## Verification

Verification completed in the isolated `#24` worktree:

- `npm install`
- `npm test -- --run src/tools/__tests__/record.test.ts`
- `npm test`

Result:

- `68 passed | 3 skipped`

The regression test now specifically verifies that JSON-stringified array arguments are persisted as real list items rather than one-character fragments.

## Outcome

`agenticos_record` now behaves correctly for both:

- native array arguments
- JSON-stringified array arguments from less strict MCP client paths

This closes the gap that was previously preserved only as a local unpublished commit during canonical working-copy cleanup.
