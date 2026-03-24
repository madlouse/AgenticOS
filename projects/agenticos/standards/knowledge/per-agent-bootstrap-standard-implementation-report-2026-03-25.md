# Per-Agent Bootstrap Standard Implementation Report - 2026-03-25

## Scope

Issue `#29` lands the per-agent bootstrap standard in three places:

1. a machine-readable bootstrap matrix
2. canonical human-facing bootstrap docs
3. a small parser test to keep the matrix loadable and queryable

## Landed Changes

### Canonical Matrix

- added `.meta/bootstrap/agent-bootstrap-matrix.yaml`

### Parser and Verification Harness

- added `mcp-server/src/utils/bootstrap-matrix.ts`
- added `mcp-server/src/utils/__tests__/bootstrap-matrix.test.ts`

### Canonical Docs

- updated root `README.md`
- updated `projects/agenticos/mcp-server/README.md`
- added `knowledge/per-agent-bootstrap-standard-2026-03-25.md`

## Why This Design

The issue could have been solved with prose only.

That was rejected because the support matrix would drift again.

Using one machine-readable matrix gives later issues a stable base:

- `#30` can map Homebrew caveats to the same supported agents
- `#31` can compare MCP-native versus fallback modes against the same support surface

## Verification

- `npm install`
- `npm run build`
- `npm test -- --run src/utils/__tests__/bootstrap-matrix.test.ts`
- targeted coverage for `src/utils/bootstrap-matrix.ts`
- `npm test`
- YAML parsing for `.meta/bootstrap/agent-bootstrap-matrix.yaml`

## Outcome

Agent bootstrap is now described as a canonical support contract instead of a scattered set of installation hints.
