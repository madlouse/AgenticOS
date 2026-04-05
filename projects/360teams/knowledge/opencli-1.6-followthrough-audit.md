# OpenCLI 1.6.x Follow-Through Audit

## Scope

This audit covers the upgrade-relevant infrastructure layers called out in Issue `#10`:

- [cdp.js](/Users/jeking/dev/AgenticOS/projects/360teams/clis/360teams/cdp.js)
- [launcher.js](/Users/jeking/dev/AgenticOS/projects/360teams/clis/360teams/launcher.js)
- [miniapp-cdp.js](/Users/jeking/dev/AgenticOS/projects/360teams/clis/360teams/miniapp-cdp.js)

It compares the current `360teams` implementation with OpenCLI `1.6.2` capabilities and classifies each area as:

- `ADOPT`
- `KEEP`
- `DEFER`

## Baseline Facts

- Project-local `@jackwener/opencli` is now `1.6.2`.
- Global `opencli` is now `1.6.2`.
- `360teams` full project test suite passed after the upgrade.
- Live smoke checks passed for `status`, `me`, `conversations`, `calendar`, `docs`, `t5t`, and `todo`.
- `360teams` is currently **not** registered in OpenCLI's Electron app registry.
- No `~/.opencli/apps.yaml` exists on this machine.

That last point matters because some OpenCLI `1.6.x` Electron improvements cannot benefit `360teams` yet.

## Audit Summary

| Area | Current state | OpenCLI 1.6.x overlap | Decision |
|---|---|---|---|
| Electron app registration | `360teams` not in OpenCLI Electron registry | core launcher, endpoint resolution, manual override support | `ADOPT` |
| App launch/reconnect flow | custom [launcher.js](/Users/jeking/dev/AgenticOS/projects/360teams/clis/360teams/launcher.js) | core `resolveElectronEndpoint()` / `probeCDP()` / process detection | `ADOPT` |
| Raw renderer transport | custom [cdp.js](/Users/jeking/dev/AgenticOS/projects/360teams/clis/360teams/cdp.js) using `chrome-remote-interface` | core browser session stack is broader but not a drop-in for this constraint | `KEEP` |
| Miniapp multi-target selection | custom [miniapp-cdp.js](/Users/jeking/dev/AgenticOS/projects/360teams/clis/360teams/miniapp-cdp.js) | core Electron launcher does not solve multi-webview selection | `KEEP` |
| Dynamic probing / alert handling | currently command-specific | `opencli operate` in `1.6.x` | `DEFER` |
| Runtime verification | manual smoke checks only | stronger `1.6.x` stability is useful only if we measure it | `ADOPT` |
| Project docs | quick-start and README still reflect older assumptions | OpenCLI Electron guidance and actual adapter behavior have moved | `ADOPT` |

## Detailed Decisions

### 1. Electron app registration

Status:

- `360teams` is not recognized by OpenCLI as an Electron app.
- Evidence:
  - `isElectronApp('360teams') === false`
  - no `~/.opencli/apps.yaml`

Why this matters:

- OpenCLI `1.6.x` added stronger Electron launch and endpoint resolution behavior.
- But `360teams` cannot benefit from it until the app is registered.

Decision:

- `ADOPT`

What to adopt:

- Register `360teams` as an Electron app, either:
  - as a user app in `~/.opencli/apps.yaml`, or
  - eventually upstream/in core if appropriate

Why:

- This is the highest-leverage migration point.
- It unlocks:
  - `resolveElectronEndpoint(site)`
  - built-in `OPENCLI_CDP_ENDPOINT` manual override path
  - consistent Electron launch semantics with the rest of OpenCLI

Follow-up issue:

- Primary target for Issue `#10`

### 2. Custom launcher flow

Status:

- [launcher.js](/Users/jeking/dev/AgenticOS/projects/360teams/clis/360teams/launcher.js) already does:
  - port probe
  - app path discovery
  - process detection
  - kill/relaunch with `--remote-debugging-port`
  - wait for readiness

OpenCLI overlap:

- `src/launcher.ts` in OpenCLI `1.6.2` now provides the same lifecycle in a more general form.

Decision:

- `ADOPT`

Why:

- Current `360teams` launcher is a local copy of a now-core concern.
- Keeping both will create drift.
- OpenCLI core also centralizes:
  - platform-aware fallback behavior
  - manual endpoint override contract
  - standardized launch errors

Migration boundary:

- Replace the custom "locate/kill/relaunch/probe" responsibility first.
- Do not mix this with miniapp logic in the same change.

Follow-up issue:

- Issue `#10`

### 3. Raw CDP renderer transport

Status:

- [cdp.js](/Users/jeking/dev/AgenticOS/projects/360teams/clis/360teams/cdp.js) intentionally uses `chrome-remote-interface`.
- The file documents why Playwright `connectOverCDP` is not acceptable here:
  - Electron does not support `Browser.setDownloadBehavior`
  - Playwright calls it unconditionally during initialization

Decision:

- `KEEP`

Why:

- This is not generic duplication.
- It is a project-specific workaround for a real compatibility constraint.
- Nothing in OpenCLI `1.6.x` release notes or core docs changes that constraint.

Implication:

- `360teams` should adopt launcher/endpoints from core where possible, but keep the raw transport layer until the underlying Electron constraint changes.

### 4. Miniapp multi-target and iframe access

Status:

- [miniapp-cdp.js](/Users/jeking/dev/AgenticOS/projects/360teams/clis/360teams/miniapp-cdp.js) solves problems specific to `360teams`:
  - webview target discovery
  - miniapp open/connect flow
  - iframe isolated-world access
  - post-navigation iframe context refresh

Decision:

- `KEEP`

Why:

- OpenCLI `1.6.x` gives stronger browser/Electron plumbing, but it does not provide a ready-made abstraction for:
  - 360Teams miniapp webview target arbitration
  - 360Teams-specific sidenav opening
  - cross-origin iframe read access inside those miniapps

Constraint:

- Shared `miniapp-cdp.js` must stay generic inside the `360teams` adapter itself.
- T5T-specific behavior must remain outside it.

### 5. Dynamic probing and alert handling with `operate`

Status:

- `1.6.x` introduced `opencli operate`, which is useful for direct browser interaction and probing.
- This is relevant to:
  - `T5T` tip/alert exploration
  - `todo` readiness diagnostics
  - `docs` state probing

Decision:

- `DEFER`

Why:

- `operate` is promising, but the correct boundary is not obvious yet.
- Some `360teams` flows need low-level CDP control:
  - controlled textarea updates
  - multi-webview target choice
  - iframe isolated world handling

Use rule:

- Evaluate `operate` first for read-only or diagnostic subflows.
- Do not migrate write paths such as T5T publish before a stability matrix exists.

Follow-up issue:

- Issue `#11`

### 6. Runtime stability verification

Status:

- Current confidence model is still mostly:
  - unit tests
  - manual live smoke checks

Decision:

- `ADOPT`

Why:

- `1.6.x` stability improvements only matter if the project has a repeatable way to observe them.
- `360teams` is runtime-heavy enough that unit tests alone are insufficient.

What to adopt:

- A live runtime stability matrix across all public commands.

Follow-up issue:

- Issue `#12`

### 7. Project docs alignment

Status:

- [quick-start.md](/Users/jeking/dev/AgenticOS/projects/360teams/.context/quick-start.md) still says:
  - commands use Playwright `connectOverCDP`
  - no extension or daemon needed
- [README.md](/Users/jeking/dev/AgenticOS/projects/360teams/README.md) still centers the same older explanation

But current adapter reality is:

- raw `chrome-remote-interface` transport is used for `360teams`
- OpenCLI itself has matured around Electron launcher and `operate`

Decision:

- `ADOPT`

Why:

- Documentation drift is now material.
- It will make later migration work harder if left uncorrected.

Recommended scope:

- Update project docs after the launcher/registry decision is settled, not before.

## Recommended Next Actions

### Immediate

1. Add `360teams` to OpenCLI Electron app registration flow.
2. Decide whether `launcher.js` should become a thin compatibility wrapper or be removed entirely.

### After that

1. Build the runtime stability matrix.
2. Revisit `operate` only for diagnostic/read-only flows.

### Not now

1. Replacing raw CDP transport
2. Replacing miniapp target and iframe logic with generic browser helpers
3. Expanding new scenarios before stability evidence exists

## Final Classification

### `ADOPT`

- Electron app registration
- Core Electron launcher / endpoint resolution model
- Runtime stability matrix
- Project docs alignment

### `KEEP`

- Raw `chrome-remote-interface` renderer transport in `cdp.js`
- Custom multi-webview and iframe utilities in `miniapp-cdp.js`

### `DEFER`

- `opencli operate` adoption for dynamic miniapp diagnostics and alert handling

## Why This Ordering Is Correct

If `360teams` adopts `operate` before it adopts the Electron registry and runtime stability work, the project will increase abstraction without first improving its control plane.

The correct order is:

1. connect `360teams` to the OpenCLI Electron control plane
2. formalize runtime evidence
3. only then evaluate higher-level interaction abstractions

That sequence maximizes stability and keeps migration risk bounded.
