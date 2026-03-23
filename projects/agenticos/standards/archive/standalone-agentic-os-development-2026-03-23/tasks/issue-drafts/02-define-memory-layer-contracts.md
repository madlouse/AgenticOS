---
name: Feature Request
about: Define strict contracts for AgenticOS memory layers
title: "feat: define canonical contracts for quick-start, state, conversations, and knowledge"
labels: enhancement
---

## Problem Statement

AgenticOS already has multiple memory layers, but their roles are not strict enough.
That creates overlap, noise, and unreliable recovery.

The unclear boundaries are especially visible between:
- `.context/quick-start.md`
- `.context/state.yaml`
- `.context/conversations/`
- `knowledge/`
- `tasks/`

Current implementation already writes across several layers:
- `recordSession` appends to `conversations/`
- `recordSession` mutates `state.yaml`
- `recordSession` may enrich `quick-start.md` when it detects boilerplate
- `updateClaudeMdState` mirrors part of state into `CLAUDE.md`

This means the memory model is already operational, but still underspecified.
Without a strict contract, agents can write the wrong kind of information to the wrong layer and later sessions will recover low-signal or misleading context.

## Proposed Solution

Define a canonical contract for each layer:

- `quick-start.md`
  A short, project-level orientation summary for fast session entry

- `state.yaml`
  Structured working memory, current task, decisions, pending items, and loaded context

- `conversations/`
  Session-level historical record, append-only

- `knowledge/`
  Durable synthesized insights, architecture, decisions, and research

- `tasks/`
  Explicit work items, issue drafts, execution plans, and task decomposition

The contract should specify:
- canonical vs derived content
- append-only vs mutable content
- project-level vs session-level content
- human-readable vs machine-oriented content
- what should never be written into each file type

The contract should also answer:
- which layer is read first on session start
- which layer is safe to rewrite automatically
- which layer must remain append-only
- which layer should hold raw history vs synthesized knowledge
- which layer is the source of truth when two layers overlap

Suggested output format for this issue:
- a memory-layer specification document
- a file-by-file contract matrix
- example entries for each layer
- write rules for agents and MCP tools

Suggested first-pass contract direction:

- `.project.yaml`
  Stable project identity and metadata. Canonical. Rarely changed.

- `.context/quick-start.md`
  Short orientation summary for fast session entry. Human-readable. Mutable, but should remain concise and project-level.

- `.context/state.yaml`
  Structured current working state: current task, pending items, working memory, loaded context pointers. Mutable. Operational source for current state, not full history.

- `.context/conversations/`
  Session-by-session append-only history. Raw record, not the place for synthesis.

- `knowledge/`
  Durable synthesis: architecture, decisions, research, product judgments. Canonical for learned understanding, not raw conversation logs.

- `tasks/`
  Actionable work artifacts: issue drafts, plans, decompositions, checklists. Future-facing execution layer, not historical narrative.

- `artifacts/`
  Concrete outputs and deliverables, not memory or planning by default.

Suggested implementation scope:
- `mcp-server/src/tools/record.ts`
  Constrain what gets written automatically into each memory layer
- `mcp-server/src/utils/distill.ts`
  Clarify which parts of `CLAUDE.md` are derived views of state vs user-authored content
- project templates and generated docs
  Align initial files with the new contracts
- documentation
  Reflect the layer model consistently in README, AGENTS, and project templates

## Non-Goals

- This issue should not fully solve project-boundary enforcement by itself
- This issue should not redesign the MCP transport layer
- This issue should not decide all cross-agent bootstrap behavior
- This issue should not require immediate automation for every rule on day one

## Alternatives Considered

- Keep the current loose conventions and rely on agent judgment
- Collapse several layers into fewer files
- Make everything append-only and rely on later summarization
- Make `state.yaml` the single source for everything, including long-term knowledge

## Additional Context

This issue is foundational because multiple later problems are downstream of weak memory contracts.

It is also the bridge between issue 01 and later protocol issues:
- issue 01 defines where writes are allowed
- this issue defines what each location is allowed to contain

## Verification Plan

- Create a contract table for all memory-related paths
- Test current examples against the contract and identify mismatches
- Verify that the standards project files can be classified cleanly under the new model
- Define at least one invalid example per layer to make the boundaries explicit
- Confirm that future issues can reference this contract without redefining the same concepts

## Acceptance Criteria

- A written spec exists for each memory layer
- The spec identifies source-of-truth vs derived layers
- The spec defines append-only vs mutable behavior per layer
- The spec defines what must never be written into each layer
- Templates and docs reflect the new contracts
- Example content is provided for each file type
- The spec is strong enough to drive future validation or linting
- The spec is usable as an input to later agent-protocol and boundary-enforcement work
