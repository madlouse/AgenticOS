# Issue #167: Self-Hosting Root Project Identity Resolution

## Summary

The root managed AgenticOS project at `projects/agenticos` cannot currently be resolved as a normal active project for `agenticos_record` / `agenticos_save`.

The immediate causes are:

- `projects/agenticos/.project.yaml` is missing
- `resolveManagedProjectTarget()` assumes root `.context/*` instead of honoring configured `agent_context` paths
- self-hosting compatibility shims redirect root `.context/*` to canonical `standards/.context/*`, but resolver and status paths do not treat that explicitly

GitHub issue:

- https://github.com/madlouse/AgenticOS/issues/167

## Why This Matters

- root `AgenticOS` project identity is not currently provable for write commands
- `record/save/context/status` can resolve to redirect-only compatibility files instead of canonical state
- this contradicts the self-hosting topology already documented in issue `#158`

## Required Changes

1. Add root `projects/agenticos/.project.yaml` metadata for the self-hosting product project.
2. Make managed-project resolution honor configured `agent_context` paths instead of assuming root `.context/*`.
3. Update switch/status and any relevant helpers to use canonical context paths from project metadata.
4. Add regression tests covering self-hosting root project resolution and canonical context redirects.

## Acceptance Criteria

- `agenticos_record` and `agenticos_save` can prove root `AgenticOS` project identity.
- canonical context paths resolve to `standards/.context/*` for the self-hosting root project.
- status/switch/context flows no longer depend on redirect-only root `.context/*` for live operational state.
