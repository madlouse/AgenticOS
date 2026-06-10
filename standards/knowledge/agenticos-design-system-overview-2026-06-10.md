# AgenticOS Design System Overview - 2026-06-10

## Purpose

AgenticOS is an operating system for AI-assisted project execution. Its design
does not start with a UI screen; it starts with durable project identity,
structured memory, explicit context switching, and guardrails that keep agent
work tied to issues, evidence, tests, review, and rollback.

## Core Design Model

AgenticOS uses three layers:

| Layer | Purpose | Primary Surfaces |
| --- | --- | --- |
| Universal project protocol | Tool-agnostic project structure that any agent can read | `.project.yaml`, `.context/`, `knowledge/`, `tasks/`, `artifacts/` |
| MCP integration layer | Canonical state and action plane | `agenticos_init`, `agenticos_switch`, `agenticos_record`, `agenticos_preflight`, task APIs |
| Agent/runtime adaptation | Routing and activation help for specific clients | activation Skills, Claude Code hook, Hermes cwd applicator, Cursor rule, bootstrap CLI |

The central invariant is that MCP is the source of truth for project identity,
state, and guardrail decisions. Skills, hooks, and docs help agents call MCP and
apply returned workdirs; they do not replace MCP state.

## Product Capabilities

AgenticOS currently groups into ten capability domains:

1. Project lifecycle and topology.
2. Context switching and workdir effects.
3. Continuity memory and knowledge evolution.
4. Durable tasks and topic management.
5. Guardrails and Git-backed workflow.
6. Bootstrap and supported-agent activation.
7. Downstream standard kit.
8. Evaluation, coverage, and review.
9. Optional channel integrations.
10. Release and Homebrew distribution.

## Cross-Cutting Invariants

- Project identity is explicit and path-bound; agents must not infer it from cwd
  or branch name alone.
- Context switching is logical first. Physical cwd/workdir application is a
  client-side responsibility proven by bootstrap verification where possible.
- Git-backed implementation work uses issue branches and isolated worktrees.
- Documentation, Skills, hooks, and Homebrew caveats are runtime integration
  surfaces, not side notes.
- Optional integrations such as Discord must degrade without weakening the core
  MCP workflow.
- Raw transcripts and secrets stay out of public tracked knowledge; distilled
  continuity is preferred.

## Current Maturity

The implementation is strong for core MCP project operations, guardrails,
bootstrap, standard kit, and tests. The largest active gaps are orchestration,
freshness, and release automation: unified checkout identity (`#514`), persisted
MCP reconnect binding (`#516`), freshness warnings (`#517`), a composed
issue-start command (`#519`), registry display names (`#521`), Homebrew tap
token early failure (`#522`), and release workflow/source formula drift after
the `v0.4.37` manual recovery (`#547`).
