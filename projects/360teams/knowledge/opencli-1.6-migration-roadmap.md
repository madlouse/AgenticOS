# OpenCLI 1.6.x Migration Roadmap

## Context

`360teams` has been upgraded from local `@jackwener/opencli@1.5.6` and global `opencli@1.5.7` to `1.6.2`.

The upgrade is already validated at two levels:

- Project test suite: `211/211` passing
- Live smoke checks: `status`, `me`, `conversations`, `calendar`, `docs`, `t5t`, `todo`

The next phase is not "upgrade again", but "absorb the value of 1.6.x into the 360Teams adapter design".

## Why This Matters

OpenCLI `1.6.x` introduced changes that are directly relevant to `360teams`:

- `opencli operate` for controlled browser interaction and probing
- stronger browser action heuristics for click/type/state handling
- reduced browser round-trips and faster command hot path
- better tab drift recovery
- stronger launcher and Electron/browser failure handling

For `360teams`, this matters in three ways:

1. Dynamic miniapp flows such as `T5T`, `docs`, and `todo` can become easier to probe and debug.
2. Runtime stability can improve if we stop relying only on ad hoc command-level smoke checks.
3. We can add higher-level scenarios on top of the current primitive commands.

## Migration Principles

- Keep shared transport utilities generic; do not leak `T5T`-specific logic into shared files.
- Prefer live smoke evidence for Electron workflows, not only pure unit tests.
- Introduce new OpenCLI capabilities only where they reduce real maintenance cost.
- Keep existing commands stable before expanding scenario surface area.
- Treat "new feature adoption" and "new scenario expansion" as separate issue tracks.

## Proposed Follow-Up Issues

### Issue #10: OpenCLI 1.6.x Follow-Through

Goal:

- Audit where current `360teams` code still duplicates OpenCLI `1.6.x` capabilities.

Key targets:

- [clis/360teams/cdp.js](/Users/jeking/dev/AgenticOS/projects/360teams/clis/360teams/cdp.js)
- [clis/360teams/launcher.js](/Users/jeking/dev/AgenticOS/projects/360teams/clis/360teams/launcher.js)
- [clis/360teams/miniapp-cdp.js](/Users/jeking/dev/AgenticOS/projects/360teams/clis/360teams/miniapp-cdp.js)

Expected outcome:

- A bounded list of places where `1.6.x` can replace custom logic without increasing risk.
- Current audit artifact:
  - [opencli-1.6-followthrough-audit.md](/Users/jeking/dev/AgenticOS/projects/360teams/knowledge/opencli-1.6-followthrough-audit.md)

### Issue #11: `operate` Adoption for Dynamic UI Flows

Goal:

- Evaluate whether `opencli operate` should be introduced for dynamic miniapp probing and alert handling.

Primary candidates:

- `T5T` alert/tip/modified-flow detection
- `docs` iframe and readiness probing
- `todo` page readiness and fallback diagnostics

Expected outcome:

- A clear split between flows that should stay on direct CDP and flows that benefit from `operate`.
- Current evaluation:
  - [opencli-operate-adoption-evaluation.md](/Users/jeking/dev/AgenticOS/projects/360teams/knowledge/opencli-operate-adoption-evaluation.md)

### Issue #12: Runtime Stability Matrix

Goal:

- Build a repeatable live smoke matrix across all public `360teams` commands.

Coverage target:

- `status`
- `me`
- `contacts`
- `conversations`
- `groups`
- `read`
- `send`
- `calendar`
- `rooms`
- `docs`
- `t5t`
- `todo`

Expected outcome:

- A single verification protocol that can be run after adapter changes or OpenCLI upgrades.
- Current artifact:
  - [runtime-stability-matrix.md](/Users/jeking/dev/AgenticOS/projects/360teams/knowledge/runtime-stability-matrix.md)

### Issue #13: New Scenario Expansion

Goal:

- Add higher-level scenarios after the base command set is stabilized on `1.6.x`.

Candidate scenarios:

- T5T publish with guarded readback verification
- meeting workflow from calendar to room lookup
- doc search to document read workflow
- todo triage workflow with safe dry-run diagnostics
- conversation lookup to read/send workflow

Expected outcome:

- New user-facing scenarios built from existing commands, not random one-off commands.

## Recommended Execution Order

1. Issue `#10` first: find what should actually change.
2. Issue `#12` second: strengthen stability evidence before broader refactors.
3. Issue `#11` third: adopt `operate` only where the evidence says it helps.
4. Issue `#13` last: expand scenarios on a stable runtime base.

## Success Criteria

- `360teams` remains green on full unit test suite.
- Live smoke matrix is runnable and documented.
- `T5T`, `docs`, and `todo` have clearer runtime diagnostics.
- New scenarios are composed from stable primitives with explicit guardrails.
