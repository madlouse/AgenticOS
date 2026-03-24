# Switch Guardrail Evidence Implementation Report - 2026-03-24

## Summary

Issue `#76` extends the compact persisted guardrail summary from `agenticos_status` into `agenticos_switch`.

The goal is to make the default entry surfaces consistent, so switching into a project immediately shows the latest guardrail state without opening raw YAML.

## What Changed

The implementation lands in:

- `agenticos_switch`
- `switchProject()`

The switch response now shows:

- the latest guardrail command
- the latest result status
- the recorded timestamp
- the related issue number when present
- the most relevant detail for blocking, redirect, or branch-bootstrap states

When no guardrail evidence exists, switch output now explicitly says:

- `Latest guardrail: None recorded`

## Design Rule

This slice does not introduce a second formatter.

Instead, `switchProject()` now reuses the same compact guardrail-summary builder already used by `getStatus()`.

That keeps:

- formatting logic in one place
- detail-priority rules consistent across entry surfaces
- future guardrail summary changes from drifting between status and switch

## Verification

Verification completed in the isolated `#76` worktree:

- `npm install`
- `npm test -- --run src/tools/__tests__/project.test.ts`
- `npm test`

Result:

- `67 passed | 3 skipped`

## Follow-Up

The next refinement, if needed, is not a third formatter.

The next likely improvement is:

- decide whether any additional entry surfaces beyond `agenticos_status` and `agenticos_switch` need the same compact guardrail summary
