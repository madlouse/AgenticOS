---
name: Feature Request
about: Enforce issue-first branch/worktree workflow for code agents
title: "feat: enforce agent compliance with issue-first branch and worktree workflow"
labels: enhancement
---

## Problem Statement

AgenticOS already documents an issue-first, branch-based workflow and, in the main repository, explicit worktree isolation for development.

However, this session showed that the protocol is still not reliably enforced in agent behavior:
- changes were made directly in the active workspace
- work did not begin from a dedicated branch/worktree
- the workflow was not treated as a hard gate before editing

This means the current standard is still descriptive, not operationally enforceable.

## Why This Matters

If a code agent can read the rules and still edit directly on `main` or on the active workspace, then:
- the standard is not strong enough
- cross-session trust decreases
- running systems are exposed to accidental mutation
- issue-first collaboration cannot scale reliably

This is not only a workflow issue. It is an agent-control issue.

## Current State

Today the documented guidance is split:
- repository-level `AGENTS.md` defines Issue-First, feature branches, and no direct work on `main`
- repository-level `CLAUDE.md` adds worktree isolation for Claude Code
- project-level documents do not always restate or enforce these rules
- there is no hard preflight check that blocks edits when the workflow contract is not satisfied
- some independent project repos may still be on an unborn `main` branch with no initial commit, which means normal branch/worktree flow cannot even start cleanly yet

## Proposed Solution

Turn workflow compliance into an explicit agent preflight protocol.

The intended workflow model should be:

- **GitHub Flow** for branch lifecycle
- **mandatory isolated worktrees** for implementation work
- **issue-first preflight** before implementation begins

This issue should build on the executable agent protocol from issue 03 rather than invent a separate workflow logic.
In particular, worktree enforcement should be attached to task classification:
- `discussion_only` does not require a worktree
- `analysis_or_doc` may remain in the main workspace only when implementation-affecting files are untouched
- `implementation` requires branch + isolated worktree
- `bootstrap` allows a narrow baseline exception until the repo can support normal flow

This issue is not about choosing release branches. It is about making the chosen workflow executable by agents.

Before any code-editing task begins, the agent should verify:
- an issue exists or an issue draft has been accepted
- the current repo is not the protected `main` working tree for active development
- a dedicated branch or isolated worktree exists for the task
- the write target is appropriate for the current repo and task

Potential enforcement directions:
- add an agent preflight checklist to canonical agent docs
- add a helper command or bootstrap script that creates the issue branch/worktree correctly
- add guardrails that refuse code edits when running on `main`
- add repository checks that surface a warning or hard failure when editing on the wrong branch/worktree
- distinguish clearly between "discussion/doc drafting allowed on main" and "implementation changes require branch/worktree"
- define how the protocol behaves when the repo has no initial baseline commit yet
- provide reusable preflight and submission templates so worktree compliance is not purely conversational

## Scope

This issue should define:
- when a branch/worktree is mandatory
- whether docs-only work is exempt or not
- how independent subproject repos should inherit the same rule
- what minimum baseline state is required before branch/worktree workflow becomes mandatory
- how agents should behave if the correct branch/worktree does not exist yet
- how this protocol differs between Claude Code, Codex, and other supported agents
- what counts as an "implementation-affecting" change versus a "discussion-only" change
- how worktree enforcement composes with the broader agent execution protocol

## Non-Goals

- This issue should not redesign the whole Git workflow model
- This issue should not decide release branching strategy
- This issue should not replace issue 08; it should provide the agent-execution enforcement layer that issue 08 depends on

## Alternatives Considered

- Rely on written guidance only
- Let users manually catch workflow violations
- Enforce workflow only socially through code review

## Verification Plan

- Define a preflight checklist and test it against real agent tasks
- Simulate a code-edit task on `main` and confirm the agent is redirected to create/use a branch or worktree
- Verify that documentation-only tasks and implementation tasks are treated according to the new rules
- Verify that the standard is visible to downstream projects and not only the root repository
- Verify behavior for repos with no initial commit yet
- Verify that task classification cannot silently downgrade implementation work into a docs-only exception

## Acceptance Criteria

- A documented agent preflight workflow exists for issue-first and branch/worktree compliance
- The standard explicitly treats worktree as mandatory isolation for implementation work under GitHub Flow
- The standard defines whether docs-only and implementation tasks are treated differently
- The standard defines how task classification drives branch/worktree requirements
- The standard covers both the root repository and independent AgenticOS-managed project repos
- The standard is concrete enough to support future guardrails or automation
- Later agent sessions should not modify active `main` workspaces for implementation tasks by default
