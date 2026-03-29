# Claude / Codex Adapter Parity - 2026-03-29

## Design Reflection

Claude Code and Codex do not need identical bootstrap or hook surfaces.

They do need identical policy semantics.

So parity does not mean "make the docs look the same."

Parity means:

- the same canonical policy block
- different runtime-specific guidance blocks
- one executable conformance path that knows the difference

## Canonical Adapter Rule

The canonical adapter surfaces are:

- `CLAUDE.md` for Claude Code
- `AGENTS.md` for Codex and the generic MCP-capable family

`CLAUDE.md` must carry Claude-specific guidance such as:

- Claude CLI-managed MCP config expectations
- restart expectations
- optional stop-hook boundary

`AGENTS.md` must carry Codex/generic guidance such as:

- explicit `agenticos_*` tool-call fallback when routing is weak
- bootstrap differences remain runtime concerns rather than policy concerns

## Conformance Rule

Adapter parity should be enforced by:

1. machine-readable adapter metadata
2. generated adapter docs
3. executable conformance checks over a downstream adopted project

If the runtime-specific guidance block is removed from one adapter, conformance should fail for that adapter without redefining the shared policy.

## Canonical Source Of Truth

The machine-readable source of truth is:

- `projects/agenticos/.meta/bootstrap/agent-adapter-matrix.yaml`
