# Health Command Design — 2026-03-25

## Problem

AgenticOS now has several important pre-work signals:

- whether the canonical checkout is current and clean
- whether the live entry surfaces have explicit refresh metadata
- whether persisted guardrail evidence exists
- whether standard-kit drift is already visible

Today these checks exist, but they are scattered across:

- `git status`
- `state.yaml`
- guardrail evidence inspection
- standard-kit upgrade checks

That means an agent can still start work from a degraded environment unless it remembers to run several separate checks.

## Design Reflection

This should not become a generic dashboard.

The right product shape is one bounded health surface that answers one practical question:

> Can this environment be trusted as a starting point before work begins?

That means the health command should aggregate only a small number of high-signal gates and report them with the same clear semantics already used elsewhere:

- `PASS`
- `WARN`
- `BLOCK`

## Chosen Scope

Add one command:

- `agenticos_health`

It evaluates:

1. `repo_sync`
2. `entry_surface_refresh`
3. `guardrail_evidence`
4. `standard_kit` (optional)

### Repo Sync

For this issue, checkout role is intentionally limited to:

- `canonical`

Meaning the command is explicitly for trusted local base checkouts, not issue worktrees.

Canonical checkout is `PASS` only when:

- branch status is exactly `main...origin/main`
- working tree is clean

Anything else is a `BLOCK`.

### Entry-Surface Refresh

This gate checks whether project state contains explicit refresh metadata:

- `entry_surface_refresh.refreshed_at`
or
- `session.last_entry_surface_refresh`

Missing metadata is a `WARN`, not a `BLOCK`, because the environment may still be usable but is not fully proven fresh.

### Guardrail Evidence

This gate checks whether `guardrail_evidence.last_command` exists.

Missing evidence is a `WARN`.

### Standard-Kit Drift

This gate is optional and reuses the existing standard-kit upgrade-check logic.

Detected drift is a `WARN`, not a `BLOCK`, because drift should usually be reviewed before work but does not always invalidate the environment.

## Non-Goals

This issue does not:

- replace `agenticos_preflight`
- judge issue scope or branch ancestry for implementation work
- act as a release-readiness dashboard
- infer project health from arbitrary heuristics outside these explicit gates

## Acceptance Shape

The issue is complete when:

- there is one executable `agenticos_health` surface
- the output is deterministic and compact
- it uses `PASS / WARN / BLOCK`
- it proves the canonical checkout and project freshness signals without becoming a noisy dashboard
