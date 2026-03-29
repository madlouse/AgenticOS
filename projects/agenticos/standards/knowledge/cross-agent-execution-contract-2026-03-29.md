# Cross-Agent Execution Contract - 2026-03-29

## Design Reflection

AgenticOS should not maintain one workflow for Claude Code and a different workflow for Codex.

That would turn runtime integration details into policy drift.

The correct split is:

1. one canonical execution policy
2. multiple runtime-specific adapter surfaces
3. optional runtime-specific enhancements

## Canonical Rule

The following concerns are policy invariants and must stay identical across all supported agents:

- active-project alignment before implementation edits
- issue-first execution
- executable preflight before implementation edits
- isolated issue branch and worktree execution when guardrails require it
- edit-boundary fail-closed behavior
- PR scope validation before PR creation or merge
- canonical recording and save flow

## Adapter Rule

Generated agent-facing files are adapters over the same policy, not separate policy definitions.

Current canonical adapter surfaces:

- `AGENTS.md` for Codex and generic MCP-capable agents
- `CLAUDE.md` for Claude Code

These files may differ in:

- bootstrap wording
- routing hints
- runtime-specific operator guidance

They must not differ in:

- workflow semantics
- guardrail meaning
- recording requirements
- what counts as compliant implementation flow

## Hook Rule

Runtime-specific hooks remain optional local enhancements.

They may:

- remind
- surface local state
- improve operator ergonomics

They must not:

- replace canonical guardrails
- replace canonical persistence
- become the only place where a required rule is enforced

## Canonical Source Of Truth

The machine-readable source of truth is:

- `projects/agenticos/.meta/bootstrap/cross-agent-execution-contract.yaml`

Generated instruction surfaces and downstream conformance checks should align to that contract rather than inventing agent-local rule variants.
