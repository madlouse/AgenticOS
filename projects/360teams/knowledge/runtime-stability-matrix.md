# 360Teams Runtime Stability Matrix

## Purpose

This matrix defines the live smoke protocol for `360teams` after adapter edits, OpenCLI upgrades, or Electron/runtime drift investigation.

It is intentionally split into three tiers:

- `required-safe`: must pass on every routine verification run
- `optional-read`: read-only probes that are useful but depend more on live data, miniapp state, or UI timing
- `guarded-write`: mutating or high-risk flows that must not run in routine smoke

## Scope Source

The command surface in this matrix is based on the actual installed public CLI surface, not only the project README:

- `opencli list`
- `opencli 360teams --help`

That matters because the installed adapter currently exposes `todo`, while the project checkout does not yet contain [todo.js](/Users/jeking/dev/AgenticOS/projects/360teams/clis/360teams/todo.js).

## Execution Rules

1. Run `required-safe` after every dependency upgrade or adapter edit.
2. Run `optional-read` when validating runtime-heavy changes, miniapp behavior, or OpenCLI launcher changes.
3. Never run `guarded-write` in unattended smoke.
4. If a required-safe command fails, stop and investigate before expanding to optional checks.

## Command Matrix

| Family | Action | Tier | Command | Preconditions | Expected success | Failure meaning |
|---|---|---|---|---|---|---|
| core | status | required-safe | `opencli 360teams status -f json` | 360Teams running with reachable CDP | one row with `Connected` | CDP/launcher/session broken |
| core | me | required-safe | `opencli 360teams me -f json` | authenticated session | one user row | renderer store unreadable or auth/session broken |
| core | contacts | required-safe | `opencli 360teams contacts --limit 3 -f json` | contact store loaded | 1+ contact rows | store access or parser regression |
| core | conversations | required-safe | `opencli 360teams conversations --limit 3 -f json` | conversation list loaded | 1+ conversation rows | store access or parser regression |
| core | groups | required-safe | `opencli 360teams groups -f json` | group store loaded | 0+ group rows, command completes | store access or parser regression |
| search | search | optional-read | `opencli 360teams search --name <kw> --limit 3 -f json` | derive `<kw>` from a known contact name | 1+ matching rows | search/store mismatch or no matching seed data |
| messaging | read | optional-read | `opencli 360teams read --target <id> --type <PRIVATE|GROUP> --limit 3 -f json` | derive target from `conversations` | 1+ message rows | message fetch regression or seed conversation empty |
| messaging | send | guarded-write | `opencli 360teams send --to <id> --msg <text> --type <PRIVATE|GROUP>` | explicit target and approval | sent row or expected send error | real outbound mutation path changed |
| calendar | today | optional-read | `opencli 360teams calendar --action today --limit 3 -f json` | calendar app reachable | 0+ event rows, command completes | calendar navigation or parser regression |
| calendar | list | optional-read | `opencli 360teams calendar --action list --limit 3 -f json` | same as `today` | 0+ event rows, command completes | same failure class as `today` |
| calendar | rooms | optional-read | `opencli 360teams rooms -f json` | calendar rooms view reachable | 0+ room rows, command completes | room panel navigation or parser regression |
| calendar | create | guarded-write | `opencli 360teams calendar --action create ...` | explicit ticket, target date/time, and operator intent | draft form opens or submit succeeds when approved | mutating calendar workflow changed |
| docs | status | required-safe | `opencli 360teams docs --action status -f json` | docs miniapp reachable | one health row | docs miniapp/webview failed to open |
| docs | shared | optional-read | `opencli 360teams docs --action shared --limit 3 -f json` | docs iframe reachable | 0+ document rows | docs iframe navigation/parser regression |
| docs | recent | optional-read | `opencli 360teams docs --action recent --limit 3 -f json` | same as `shared` | 0+ document rows | same failure class as `shared` |
| docs | favorites | optional-read | `opencli 360teams docs --action favorites --limit 3 -f json` | same as `shared` | 0+ document rows | same failure class as `shared` |
| docs | search | optional-read | `opencli 360teams docs --action search --query <kw> --limit 3 -f json` | derive `<kw>` from a known doc title | 0+ document rows | search input/iframe context drift |
| docs | read | optional-read | `opencli 360teams docs --action read --name <doc> --limit 3 -f json` | derive `<doc>` from `shared` or `recent` | document content rows | iframe/context invalidation or Shimo API/read-path regression |
| t5t | status | required-safe | `opencli 360teams t5t --action status -f json` | T5T miniapp reachable | one status row | T5T miniapp entry or parser regression |
| t5t | history | optional-read | `opencli 360teams t5t --action history --limit 3 -f json` | T5T history tab reachable | 0+ record rows | T5T view switch/parser regression |
| t5t | write | guarded-write | `opencli 360teams t5t --action write --content ...` | explicit publish intent, MD5 guard, write/modify decision | editor opens or approved submit completes | real T5T publish path changed |
| todo | list | optional-read | `opencli 360teams todo --action list --limit 3 -f json` | todo miniapp reachable | 0+ todo rows, command completes | todo miniapp/Vue introspection drift |
| todo | approve | guarded-write | `opencli 360teams todo --action approve --id <n> ...` | explicit item selection and approval | action completes on chosen item | real approval mutation path changed |
| todo | reject | guarded-write | `opencli 360teams todo --action reject --id <n> ...` | same as approve | action completes on chosen item | reject mutation path changed |
| todo | forward | guarded-write | `opencli 360teams todo --action forward --id <n> --to <user> ...` | explicit item and recipient | action completes on chosen item | forward mutation path changed |
| todo | assign | guarded-write | `opencli 360teams todo --action assign --id <n> --to <user> ...` | explicit item and assignee | action completes on chosen item | assign mutation path changed |

## Reference Runner

Use [runtime-smoke.mjs](/Users/jeking/dev/AgenticOS/projects/360teams/scripts/runtime-smoke.mjs).

Examples:

```bash
node scripts/runtime-smoke.mjs
node scripts/runtime-smoke.mjs --mode full
```

Behavior:

- default mode runs only `required-safe`
- `--mode full` runs `required-safe` plus `optional-read`
- `guarded-write` is documented only; the runner never executes it
- default exit code only fails on `required-safe` failures
- add `--fail-on-optional` when optional-read failures should break the run

## Latest Evidence

Last full read-safe probe: `2026-04-04`

Commanded via:

```bash
node scripts/runtime-smoke.mjs --mode full
```

Observed summary:

- `required-safe`: `7/7` passed
- `optional-read`: `10/11` passed
- known failing probe: `docs.read`

Known issue from latest evidence:

- `docs.read` failed with `Cannot find context with specified id`
- This points to iframe/context invalidation in the docs read path, not to a generic adapter outage
- It should be tracked as a concrete runtime bug before `operate` adoption is considered for docs flows

## Current Gaps

- The project README still describes older Playwright-based transport and does not reflect this matrix.
- The project checkout and installed adapter have drift on `todo` command ownership.
- `docs.read` is not stable enough yet to be promoted beyond `optional-read`.
