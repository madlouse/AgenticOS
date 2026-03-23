---
name: Feature Request
about: Ensure spawned agents inherit and verify project context
title: "feat: define sub-agent context inheritance and verification rules"
labels: enhancement
---

## Problem Statement

`agenticos_switch` can restore context for the main session, but spawned/sub agents may still start effectively context-blind.

This creates waste, inconsistency, and design drift.

## Proposed Solution

Define a standard for sub-agent startup:
- what files the main agent must read before spawning
- what minimum context must be injected into the sub-agent prompt
- how the sub-agent should verify it understands the project before working
- how the sub-agent should persist important outputs back into project files

Potential required context:
- project identity
- current task
- key constraints
- relevant knowledge files
- relevant task or issue draft

## Alternatives Considered

- Let every agent infer context independently
- Depend on the parent agent to free-form summarize context ad hoc

## Additional Context

This was already identified internally as a major product gap.

## Acceptance Criteria

- A standard sub-agent inheritance protocol is documented
- The protocol specifies required inputs and required verification behavior
- The protocol is reflected in agent-facing docs
- A downstream test scenario or simulation is defined
