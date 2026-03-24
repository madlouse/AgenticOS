# Status Guardrail Evidence Implementation Report - 2026-03-24

## Summary

Issue `#74` upgrades the normal project status surface so the latest persisted guardrail evidence is visible without opening raw YAML state.

The first slice lands in:

- `agenticos_status`
- `getStatus()`

## What Changed

When a project has `guardrail_evidence` in `.context/state.yaml`, status output now shows:

- the latest guardrail command
- the latest result status
- the recorded timestamp
- the related issue number when present
- the most relevant detail for blocking or redirect states

Examples of surfaced states:

- `PASS`
- `BLOCK`
- `REDIRECT`

When no guardrail evidence exists, status now explicitly says:

- `Latest guardrail: None recorded`

## Formatting Rule

The v1 status surface keeps the summary intentionally compact.

It does not dump full JSON payloads.
Instead it extracts the most useful top-level signal:

- `block_reasons[0]` for `BLOCK`
- `redirect_actions[0]` for `REDIRECT`
- `summary` for ordinary pass-style results
- branch creation note for `CREATED` style bootstrap results

## Verification

Verification completed in the isolated `#74` worktree:

- `npm install`
- `npm test -- --run src/tools/__tests__/project.test.ts`
- `npm test`

Result:

- `65 passed | 3 skipped`

## Follow-Up

The next refinement, if needed, is not more raw detail.

The next likely improvement is:

- decide whether `agenticos_switch` or other entry surfaces should also summarize the latest guardrail evidence in the same compact style
