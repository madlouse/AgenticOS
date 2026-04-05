# OpenCLI `operate` Adoption Evaluation for 360Teams

## Scope

This note closes Issue `#11` at the design level: where `opencli operate` should be used, where it should not, and why.

Sources used:

- [issue-011-opencli-1.6-followthrough.md](/Users/jeking/dev/AgenticOS/projects/360teams/tasks/issue-011-operate-adoption.md)
- [runtime-stability-matrix.md](/Users/jeking/dev/AgenticOS/projects/360teams/knowledge/runtime-stability-matrix.md)
- [t5t.js](/Users/jeking/dev/AgenticOS/projects/360teams/clis/360teams/t5t.js)
- [docs.js](/Users/jeking/dev/AgenticOS/projects/360teams/clis/360teams/docs.js)
- installed [todo.js](/Users/jeking/.opencli/clis/360teams/todo.js)
- installed OpenCLI `1.6.2` `operate` docs and source

## Baseline Facts

- `opencli operate` uses Browser Bridge and a dedicated automation workspace:
  - `bridge.connect({ timeout: 30, workspace: 'operate:default' })`
- Normal `360teams` commands do not use that path. They run against Electron app state and CDP targets.
- `360teams` miniapps are not ordinary browser pages:
  - `T5T` and `docs` rely on Electron miniapp target discovery
  - `docs` additionally relies on cross-origin iframe isolated-world access
  - `todo` relies on Vue instance data and iframe/detail-state probing
- On this machine, `operate` is currently not available as a routine dependency:
  - `opencli doctor` reports daemon running but Browser Bridge extension not connected
  - `opencli operate open https://example.com` fails with `Browser not connected`

## Primary Decision

`operate` should be adopted as a **diagnostic and exploratory sidecar**, not as the primary execution path for current `360teams` commands.

Reason:

1. It depends on Browser Bridge, which is currently absent on this machine.
2. It operates in a separate browser automation window, not the live 360Teams Electron renderer/runtime.
3. The hardest `360teams` workflows depend on low-level capabilities that `operate` does not directly replace.

## Decision Table

| Area | Current implementation need | `operate` fit | Decision |
|---|---|---|---|
| Electron command baseline | direct access to 360Teams runtime and CDP targets | poor | `AVOID` |
| T5T status/history | miniapp open/connect, page-specific parsing | limited | `KEEP direct CDP` |
| T5T publish/write | controlled textarea updates, write/modify split, readback verification, MD5 guard | poor | `AVOID` |
| T5T alert/tip exploration | visual/interactive diagnosis of changed UI | moderate | `ADOPT for diagnostics only` |
| Docs status/list/search | miniapp + cross-origin iframe + view switching | weak for replacement | `KEEP direct CDP` |
| Docs read | iframe isolated world + authenticated fetch | poor for replacement, useful for investigation | `ADOPT for diagnostics only` |
| Todo list | Vue data extraction, hub-wrap state introspection | poor for replacement | `KEEP direct CDP` |
| Todo mutation flows | iframe/detail dialogs + approval semantics | poor | `AVOID` |
| New web-only scenarios outside Electron | interactive exploration, API discovery, quick prototype generation | strong | `ADOPT` |

## Detailed Decisions

### 1. Core Electron path

Decision:

- `AVOID`

Why:

- `operate` is not wired into the `site:360teams` execution path.
- `360teams` commands already use Electron-specific CDP targeting.
- Replacing that with Browser Bridge would add a new dependency while reducing direct runtime control.

Implication:

- `operate` should not become a required prerequisite for `status`, `me`, `contacts`, `conversations`, `read`, or other baseline commands.

### 2. T5T

Decision:

- `KEEP direct CDP` for `status`, `history`, and all publish/write paths
- `ADOPT for diagnostics only` for alert/tip exploration

Why:

- T5T write uses controlled textarea updates and explicit submit semantics in [t5t.js](/Users/jeking/dev/AgenticOS/projects/360teams/clis/360teams/t5t.js).
- The publish flow also has non-UI requirements:
  - write vs modify decision
  - post-submit readback
  - MD5 verification
- `operate` can help inspect a changed tip, modal, or button surface if that surface is reachable in a browser session, but it should not own the canonical publish flow.

Adoption boundary:

- good:
  - explore changed alert copy
  - inspect candidate selectors
  - capture network/API behavior for research
- not acceptable:
  - direct T5T publish
  - replacing MD5-verified readback logic

### 3. Docs

Decision:

- `KEEP direct CDP` for command implementation
- `ADOPT for diagnostics only` around `docs.read`

Why:

- `docs` depends on cross-origin iframe handling in [miniapp-cdp.js](/Users/jeking/dev/AgenticOS/projects/360teams/clis/360teams/miniapp-cdp.js).
- `docs.read` already surfaced a concrete runtime failure in the matrix:
  - `Cannot find context with specified id`
- That failure points to frame/context invalidation, which is exactly the kind of problem where `operate` may help with exploratory diagnosis, but not with final implementation.

Adoption boundary:

- good:
  - inspect page state before/after docs navigation in a normal browser session
  - inspect captured network requests
  - reproduce navigation drift at a higher level
- not acceptable:
  - replacing isolated-world iframe access with `operate` commands
  - making docs read success depend on Browser Bridge availability

### 4. Todo

Decision:

- `KEEP direct CDP`

Why:

- Installed [todo.js](/Users/jeking/.opencli/clis/360teams/todo.js) is heavily tied to:
  - Vue instance data
  - iframe URL inspection
  - dialog/button semantics after item click
- `operate` is comparatively good at click/type/state loops, but weak as a replacement for this kind of app-internal state extraction.
- Approval, reject, forward, and assign are high-risk mutation flows and should not be migrated to a higher-level control path without a much stronger safety model.

Adoption boundary:

- possible later:
  - read-only visual diagnostics for button-label drift
- not recommended:
  - list logic replacement
  - approval path migration

### 5. New scenarios

Decision:

- `ADOPT`

Why:

- The strongest fit for `operate` is not replacing the existing Electron adapter.
- The strongest fit is:
  - prototyping new browser-only workflows
  - capturing APIs quickly
  - generating scaffolds with `operate init`
  - debugging page-level interaction drift before deciding whether the logic belongs in the main adapter

This means `operate` is valuable for scenario exploration around Issue `#13`, but not as a blanket refactor target.

## Rollout Recommendation

Phase 1:

- Keep the current Electron adapter as the production path.
- Use `operate` only as an optional diagnostic tool.

Phase 2:

- Apply it to one bounded read-only investigation flow:
  - preferred candidate: `docs.read` failure analysis

Phase 3:

- If Browser Bridge becomes reliably available and the diagnostic value is proven, document a small set of `operate` playbooks for:
  - T5T alert inspection
  - docs page/network inspection
  - browser-only scenario prototyping

## Explicit Non-Goals

- No migration of T5T publish to `operate`
- No migration of todo mutations to `operate`
- No introduction of Browser Bridge as a hard dependency for the base `360teams` command set

## Final Recommendation

For `360teams`, `operate` is a **useful adjunct**, not a replacement layer.

The project should:

- adopt it for targeted diagnostics and scenario exploration
- keep direct CDP for Electron-native command execution
- revisit broader adoption only after Browser Bridge is consistently available and after a concrete diagnostic win is demonstrated
