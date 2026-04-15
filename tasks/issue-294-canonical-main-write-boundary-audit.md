# Issue #294: Canonical Main Runtime Write Boundary Audit

## Summary

`#294` closes the remaining write-boundary gap left after `#262`, `#286`, and
`#288`.

The current system no longer relies on a home-global `active_project` for
resolution, and canonical checkout cleanup exists, but normal guardrail commands
still persist execution-time evidence into each project's configured
`current_state` file.

For `github_versioned` projects such as AgenticOS itself, that file is a
versioned source path:

- `standards/.context/state.yaml`

So normal runtime commands like `agenticos_issue_bootstrap` and
`agenticos_preflight` can still dirty committed project state and, on canonical
`main`, reintroduce exactly the runtime-write pollution that prior issues were
trying to eliminate.

## Problem Statement

The intended model is now clear:

- `AGENTICOS_HOME` is a long-term runtime workspace
- `projects/` contains managed projects
- source-controlled projects may live under `projects/<id>/`
- runtime-only evidence must not silently rewrite committed canonical state

The remaining gap is that guardrail persistence still treats project
`current_state` as the sink for live execution evidence.

That violates the runtime model in two ways:

1. it can dirty canonical `main`
2. it mixes execution-time trust-chain evidence with committed status-summary
   surfaces

## Current Write Paths

The concrete remaining write entrypoint is:

- `mcp-server/src/utils/guardrail-evidence.ts`

### `persistGuardrailEvidence(...)`

Current behavior:

- resolves the target managed project
- resolves that project's configured `current_state`
- reads the existing state YAML
- updates `state.guardrail_evidence`
- writes the full YAML back to `state.yaml`

Current writers:

- `agenticos_preflight`
- `agenticos_branch_bootstrap`
- `agenticos_pr_scope_check`

### `persistIssueBootstrapEvidence(...)`

Current behavior:

- resolves the target managed project
- resolves that project's configured `current_state`
- reads the existing state YAML
- updates `state.issue_bootstrap`
- writes the full YAML back to `state.yaml`

Current writer:

- `agenticos_issue_bootstrap`

## Current Read Dependencies

The current read side is split into two semantics that should no longer share
the same file.

### Execution / Guardrail Trust Chain

These commands depend on the latest issue/bootstrap evidence for live execution:

- `agenticos_preflight`
  - reads `issue_bootstrap.latest` to verify the current issue/worktree
- `agenticos_edit_guard`
  - reads `issue_bootstrap.latest`
  - reads `guardrail_evidence.preflight`

These are runtime execution checks, not committed project-summary reads.

### Status / Historical Snapshot Reads

These reads are committed-snapshot oriented:

- `agenticos_status` via `mcp-server/src/tools/project.ts`
- `agenticos_health` via `mcp-server/src/utils/health.ts`
- `versioned-entry-surface-state`

These are supposed to reason about the tracked project snapshot and stale/fresh
semantics introduced by `#288`.

That means the same `state.yaml` file is currently being used for two different
things:

1. live execution evidence
2. committed summary snapshot

That coupling is the root design error.

## Why The Existing Canonical-Main Guard Is Not Enough

`mcp-server/src/utils/canonical-main-guard.ts` blocks runtime persistence when
the target repo is the canonical `main` checkout.

That protection is necessary, but not sufficient.

It still leaves three failures:

1. isolated issue worktrees still write execution evidence into versioned
   project state
2. canonical status surfaces still depend on fields that were populated by
   runtime commands rather than explicit committed refresh
3. the design still says “latest execution evidence belongs in committed
   project state unless we happened to be on canonical `main`”

That is opposite of the intended runtime/home model.

## Design Goal For `#294`

Normal runtime guardrail commands must no longer write to committed project
entry surfaces.

The system should distinguish:

- runtime guardrail evidence
- committed project snapshot evidence

Runtime guardrail evidence should live in a runtime-managed surface under
`AGENTICOS_HOME`, not under tracked project context paths.

## Recommended Runtime Surface

Recommended V1 storage target:

- `AGENTICOS_HOME/.agent-workspace/projects/<project-id>/guardrail-state.yaml`

Why this location:

- it is home-runtime scoped, not repo scoped
- it remains project-specific
- it does not depend on whether the project is source-controlled
- it fits the established `.agent-workspace` runtime namespace
- it keeps guardrail evidence outside tracked project files

Recommended V1 shape:

```yaml
version: 1.0.0
updated_at: <iso>
guardrail_evidence:
  updated_at: <iso>
  last_command: agenticos_preflight
  preflight: ...
  branch_bootstrap: ...
  pr_scope_check: ...
issue_bootstrap:
  updated_at: <iso>
  latest: ...
```

This intentionally preserves the existing data model so the write-boundary
change stays narrow.

## Resolution And Read Contract

### Runtime Authoritative Reads

For execution-time trust chain:

- `agenticos_issue_bootstrap` writes runtime guardrail state
- `agenticos_preflight` reads runtime `issue_bootstrap.latest`
- `agenticos_edit_guard` reads runtime `issue_bootstrap.latest` and runtime
  `guardrail_evidence.preflight`

### Compatibility Fallback

During rollout, reads may fall back to project `state.yaml` only when runtime
guardrail state is absent.

This gives safe migration without requiring an immediate one-shot rewrite of all
existing project state files.

### Committed Snapshot Reads

`agenticos_status`, `agenticos_health`, and stale committed-snapshot assessment
should continue to treat project `state.yaml` as a committed snapshot surface,
not as the live execution ledger.

This means `#294` does **not** need to make status pages display live runtime
guardrail evidence as if it were committed truth.

That separation is the point.

## Concurrency Notes

The current latest-only model is still not ideal for many parallel issue
worktrees within one project.

However, that is a separate semantic expansion.

For `#294`, the bounded goal should be:

- move latest runtime evidence out of committed state
- make runtime writes concurrency-safe
- keep the existing latest-only semantics for now

Recommended minimum write-safety for the runtime file:

- per-project lock under `.agent-workspace/projects/<project-id>/`
- reload inside the lock
- field-level patch
- temp file + atomic rename

That matches the `#262` registry-write contract.

## Options Considered

### Option A: Keep Writing `state.yaml`, Just Strengthen Canonical Main Blocking

Reject.

This only reduces one symptom. It still treats committed state as the normal
live execution sink.

### Option B: Move Only `guardrail_evidence`, Keep `issue_bootstrap` In `state.yaml`

Reject.

`issue_bootstrap.latest` is part of the execution trust chain used by
`preflight` and `edit-guard`. Leaving it in committed state preserves the same
boundary error.

### Option C: Move Both Latest Guardrail Evidence And Latest Issue Bootstrap To
Runtime State

Recommend.

This is the smallest change that actually matches the runtime/home model.

## Recommended V1 Implementation Slice

`#294` V1 should land the following bounded changes:

1. Add a runtime guardrail state resolver under `.agent-workspace/projects`.
2. Add concurrency-safe runtime read/write helpers for:
   - `guardrail_evidence`
   - `issue_bootstrap`
3. Change `persistGuardrailEvidence(...)` to write runtime state instead of
   project `state.yaml`.
4. Change `persistIssueBootstrapEvidence(...)` to write runtime state instead of
   project `state.yaml`.
5. Update `preflight` and `edit-guard` to read latest bootstrap / preflight
   evidence from runtime state first, then fall back to committed state for
   compatibility.
6. Preserve project `state.yaml` reads for status/history surfaces.

## Explicit Non-Goals For `#294`

- do not redesign guardrail evidence into a multi-issue append-only journal
- do not automatically refresh committed entry surfaces from runtime state
- do not widen `#294` into `#292` or `#293`
- do not change the committed-snapshot stale/fresh semantics from `#288`

## Validation Expectations

At minimum, `#294` should prove:

1. `agenticos_issue_bootstrap` no longer dirties project `state.yaml`
2. `agenticos_preflight` no longer dirties project `state.yaml`
3. canonical `main` remains clean after normal guardrail commands
4. `preflight` and `edit-guard` still work from runtime guardrail evidence
5. legacy committed `state.yaml` evidence remains readable as compatibility
   fallback

## Conclusion

The remaining write-boundary bug is not “a missing extra guard.”

It is that the system still stores live guardrail execution evidence in the same
versioned file that now has explicit committed-snapshot semantics.

`#294` should fix that by moving latest guardrail / bootstrap persistence to a
runtime-managed project surface under `AGENTICOS_HOME/.agent-workspace/`, while
keeping committed `state.yaml` reserved for explicit project snapshot semantics.
