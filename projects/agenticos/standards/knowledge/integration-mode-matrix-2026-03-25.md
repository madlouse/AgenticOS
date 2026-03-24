# Integration Mode Matrix - 2026-03-25

## Design Reflection

Issue `#31` is not asking whether MCP is useful.

That decision is already settled.

The real design problem is how AgenticOS should talk about fallback without accidentally creating multiple canonical product modes.

If the product says "MCP is primary" but also treats CLI wrappers or skills-only flows as equal runtime paths, the operating model becomes self-contradictory.

The adopted decision is:

- **MCP-native** is the only canonical primary mode
- **MCP + Skills Assist** is a supported fallback for routing and operator ergonomics, not a second data plane
- **CLI Wrapper** is a limited operator fallback for diagnostics and temporary bootstrap gaps
- **Skills-only Guidance** remains experimental and is not an officially supported runtime mode

## Canonical Source of Truth

The machine-readable source of truth is:

- `projects/agenticos/.meta/bootstrap/integration-mode-matrix.yaml`

## Product Rule

Fallback exists to reduce operational fragility.

Fallback does not redefine the canonical execution model.

That means:

- durable project state still assumes the MCP-native contract
- fallback modes must declare narrower scope and explicit non-goals
- docs and roadmap should describe fallback as limited rather than symmetrical
