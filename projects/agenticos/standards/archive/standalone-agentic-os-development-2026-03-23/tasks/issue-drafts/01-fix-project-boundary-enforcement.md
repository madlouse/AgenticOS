---
name: Bug Report
about: Fix cross-project context pollution in AgenticOS
title: "fix: enforce project boundary isolation in recorded context"
labels: bug
---

## Description

AgenticOS projects are supposed to maintain durable, project-specific context.
In practice, the standards project `agentic-os-development` accumulated unrelated execution details from downstream projects such as `360teams`.

This breaks one of the core product promises: a project should recover its own context, not a contaminated mixture of nearby work.

## Steps to Reproduce

1. Work in project A.
2. Later switch to project B.
3. Record progress, update quick-start, or update state.
4. Observe that project B may now contain facts, pending items, or summaries that belong to project A.

## Expected Behavior

Each project should only contain:
- its own quick-start summary
- its own state and working memory
- its own conversations and knowledge

## Actual Behavior

Project-level context can be polluted by unrelated project execution history.

## Problem Statement

Without strong boundary enforcement, AgenticOS cannot serve as a reliable project operating system.
If context pollution is possible, downstream recovery and cross-agent collaboration become unsafe.

At the moment, the core write path trusts `registry.active_project` too much:
- `agenticos_switch` sets the active project in the registry
- `recordSession` resolves the target path from that single active-project pointer
- the tool then writes to `.context/conversations/`, `.context/state.yaml`, `.context/.last_record`, and `CLAUDE.md` without an additional identity check

This means that if project selection, agent context, or user intent drift even slightly, the wrong project can be mutated.

## Proposed Solution

Define and enforce project-boundary rules for:
- `.context/quick-start.md`
- `.context/state.yaml`
- `.context/conversations/`
- `knowledge/`

Potential implementation directions:
- always resolve and validate the active project before `record` and `save`
- reject writes when project identity is ambiguous
- introduce project-id checks in state updates
- add automated tests for cross-project isolation

Suggested implementation scope:
- `mcp-server/src/tools/project.ts`
  Harden project switching and make active-project transitions easier to inspect
- `mcp-server/src/tools/record.ts`
  Add project-identity validation before all writes
- `mcp-server/src/resources/context.ts`
  Ensure context reads clearly identify the active project being loaded
- registry helpers
  Make active-project provenance and transitions more explicit

Possible product/technical safeguards:
- include canonical project identity in `state.yaml`
- include a write-time validation step that compares registry project id, project path, and local `.project.yaml`
- fail closed if project identity cannot be proven
- optionally support an explicit `project` parameter for record/save in future, rather than relying only on global active state

## Non-Goals

- This issue should not redesign the entire memory model
- This issue should not solve sub-agent inheritance by itself
- This issue should not change Git workflow or bootstrap strategy unless required for boundary validation

## Alternatives Considered

- Rely on agent discipline only
- Detect contamination after the fact using lint-like checks
- Keep `active_project` as the only trust anchor and accept occasional manual cleanup

## Verification Plan

- Create a test fixture with at least two projects
- Switch from project A to project B
- Record a session in project B
- Verify that only project B files changed
- Repeat with stale context and ambiguous situations to confirm the tool fails safely instead of writing to the wrong project
- Manually validate that `agentic-os-development` no longer picks up downstream-project state during normal use

## Acceptance Criteria

- Recording to one project never mutates another project's quick-start, state, or conversations
- Write paths validate project identity before mutating files
- Ambiguous or invalid project identity produces an explicit error instead of best-effort writes
- Automated tests cover project switching and recording across multiple projects
- The standards project no longer contains unrelated downstream project state after validation
- The issue leaves behind a clear project-boundary contract that later issues can build on
