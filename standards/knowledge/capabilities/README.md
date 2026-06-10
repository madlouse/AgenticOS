# AgenticOS Capability Design Index

This index is the agent-facing entry point for AgenticOS capability design. It
starts from the public README promises, maps them to design sources, MCP/code
surfaces, tests, and issue clusters, then records the remaining gaps.

Each module uses the same three-layer shape:

1. Overview: purpose, user value, and public surface.
2. Detailed design: data model, flow, invariants, and failure modes.
3. Implementation mapping: tools, files, tests, issues, current status, and gaps.

## Capability Modules

| Capability | Design Doc | Primary User Outcome |
| --- | --- | --- |
| Project lifecycle | [project-lifecycle.md](project-lifecycle.md) | Create, resolve, normalize, and manage projects/topics with stable identity. |
| Context switching | [context-switching.md](context-switching.md) | Enter and leave project context without confusing logical binding with cwd mutation. |
| Continuity memory | [continuity-memory.md](continuity-memory.md) | Preserve conversations, decisions, state, knowledge, and cross-session resume signals. |
| Task and topic management | [task-topic-management.md](task-topic-management.md) | Convert durable topic/project work into structured task files and state updates. |
| Guardrails and Git flow | [guardrails-git-flow.md](guardrails-git-flow.md) | Keep implementation work issue-scoped, reviewable, testable, and rollback-friendly. |
| Bootstrap and agent support | [bootstrap-agent-support.md](bootstrap-agent-support.md) | Install, verify, and repair AgenticOS MCP/Skill support across supported agents. |
| Standard kit | [standard-kit.md](standard-kit.md) | Apply consistent downstream adapter, context, and guardrail surfaces to projects. |
| Evaluation and review | [evaluation-review.md](evaluation-review.md) | Run structured non-code evaluation, delegation validation, coverage, and multi-agent review. |
| Channel integrations | [channel-integrations.md](channel-integrations.md) | Keep optional Discord/thread routing separate from core MCP/Hermes activation. |
| Release and Homebrew | [release-homebrew.md](release-homebrew.md) | Ship reproducible releases and make local install/upgrade activation verifiable. |

## Companion Documents

- Human landing page: [docs/agenticos-capability-hub.html](../../../docs/agenticos-capability-hub.html)
- Capability matrix and traceability map: [../agenticos-capability-matrix-and-design-map-2026-06-10.md](../agenticos-capability-matrix-and-design-map-2026-06-10.md)
- Design system overview: [../agenticos-design-system-overview-2026-06-10.md](../agenticos-design-system-overview-2026-06-10.md)

## Issue Coverage Snapshot

The 2026-06-11 refresh reviewed 280 GitHub issues: 272 closed and 8 open. The
open issues at refresh time were `#547`, `#533`, `#522`, `#521`, `#519`,
`#517`, `#516`, and `#514`. The issue clusters in each module are keyword-based
starting points, then checked against design docs and code surfaces; they are not
treated as proof without implementation mapping.
