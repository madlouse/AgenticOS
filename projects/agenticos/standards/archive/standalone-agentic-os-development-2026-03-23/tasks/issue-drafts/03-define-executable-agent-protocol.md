---
name: Feature Request
about: Turn Agent First and Agent Friendly into executable rules
title: "feat: define executable agent protocol for Agent First and Agent Friendly"
labels: enhancement
---

## Problem Statement

`Agent First` and `Agent Friendly` are meaningful product principles, but they are still too abstract to guarantee predictable behavior across different models and tools.

Without executable rules, different agents will interpret the same principle differently.

## Proposed Solution

Create an explicit agent protocol that defines:
- how the agent synthesizes fragmented user input into a coherent objective
- how the agent classifies the task before acting
- what an agent must read first
- what counts as enough context to begin acting
- how an issue should be framed against project-level goals and existing design
- how many design/critique iterations are required before implementation
- when the agent must ask for confirmation
- how executable acceptance criteria are defined before implementation
- what must be recorded after meaningful work
- what verification is required before claiming completion
- how project boundaries must be preserved
- how to handle uncertainty, ambiguity, and missing state

The protocol should be expressed in a form agents can follow consistently:
- rules
- decision trees
- pseudocode
- schemas
- validation checkpoints
- reusable templates for preflight, design briefs, evaluation rubrics, and submission evidence

The protocol should explicitly define an execution loop such as:
- intent synthesis
- task classification
- context loading
- preflight
- task framing
- design
- critique
- redesign
- acceptance definition
- implementation
- verification
- submission

## Alternatives Considered

- Keep principles as narrative guidance only
- Add more prose to `AGENTS.md` without formalizing execution logic

## Additional Context

This is the key issue for turning AgenticOS from a philosophy into an operating standard.

It should also clarify that issue execution is not a one-shot generation act.
Agents should normally go through two to three design/critique passes before implementation for non-trivial work.

The protocol should include concrete pass/fail gates for:
- `discussion_only`
- `analysis_or_doc`
- `implementation`
- `bootstrap`

Verification should distinguish between:
- **code deliverables**: automated tests plus coverage expectations for the changed scope
- **non-code deliverables**: rubric-based LLM evaluation or equivalent goal-oriented assessment

The intent is to make completion claims auditable rather than purely conversational.

Potential outputs should include:
- a canonical preflight checklist schema
- an issue design brief template
- a non-code evaluation rubric template
- a submission evidence template

## Acceptance Criteria

- A written protocol exists with concrete execution rules
- The protocol distinguishes mandatory steps from optional heuristics
- The protocol defines how fragmented user intent is synthesized into a task objective
- The protocol defines task classification and preflight gates before editing
- The protocol defines a multi-pass design/critique loop before implementation
- The protocol requires executable acceptance criteria before implementation
- The protocol distinguishes code verification from non-code verification
- The protocol has reusable template artifacts that downstream projects can adopt
- The protocol can be referenced by Claude, Codex, and other agent-specific guides
- The protocol is specific enough that future linting or auto-checks are plausible
