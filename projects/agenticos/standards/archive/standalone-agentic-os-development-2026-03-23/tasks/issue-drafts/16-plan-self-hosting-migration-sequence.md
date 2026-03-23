---
name: Feature Request
about: Plan the migration sequence if AgenticOS adopts the self-hosting workspace model
title: "feat: plan the self-hosting migration sequence for AgenticOS"
labels: enhancement
---

## Problem Statement

The self-hosting model is conceptually coherent, but adoption requires a structural migration.

Without a staged migration plan, AgenticOS risks:
- path breakage
- CI and release breakage
- confusion about where standards live
- accidental mixing of old and new models

## Proposed Solution

Define a phased migration sequence for adopting the self-hosting workspace model.

Assume the frozen target model for planning is:
- top-level `AgenticOS` directory becomes workspace home
- canonical managed product project path becomes `projects/agenticos`
- current standards content moves under `projects/agenticos/standards/`
- runtime-only artifacts move under `.runtime/`

The plan should specify:
- target directory layout
- where the AgenticOS product project will live
- where standards will live
- how runtime artifacts will move
- which current root paths move into `projects/agenticos`
- which current standards paths move into `projects/agenticos/standards`
- what paths need rewriting
- how to preserve or manage Git history
- what verification must pass after each phase

Execution planning should be verification-first:
- each step defines preconditions
- each step has immediate post-change verification
- each step has a local rollback boundary
- later steps do not begin until earlier verification passes
- the plan should be precise enough to become a command-level playbook

## Why This Matters

A self-hosting model only helps if the transition to it is controlled and reversible.

## Acceptance Criteria

- A phased migration plan exists
- The target model is explicit enough to plan against without re-opening the naming decision each time
- A concrete path relocation checklist exists for both product-source paths and standards paths
- Path rewrite scope is identified
- Verification gates are defined
- A verification-first execution order exists
- A command-level playbook exists or is directly derivable from the plan
- Rollback boundaries are defined
