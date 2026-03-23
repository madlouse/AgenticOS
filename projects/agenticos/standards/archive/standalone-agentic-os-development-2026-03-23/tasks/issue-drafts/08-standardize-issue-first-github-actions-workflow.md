---
name: Feature Request
about: Turn issue-driven evolution into a reusable AgenticOS standard
title: "feat: standardize issue-first and GitHub Actions based evolution workflow"
labels: enhancement
---

## Problem Statement

AgenticOS already points toward an open-source workflow:
Issue -> branch/worktree -> PR -> review -> merge -> automation

But this workflow is not yet fully productized as a reusable standard for downstream projects.

This issue is about the reusable workflow model itself:
- what branch lifecycle AgenticOS projects should use
- how issues, PRs, and GitHub Actions fit together
- what downstream projects should inherit by default

It should be explicit that `git worktree` is a workspace-isolation mechanism, not by itself the branching model.

## Proposed Solution

Define a reusable evolution workflow standard for AgenticOS-managed projects.

Recommended direction:
- adopt **GitHub Flow** as the canonical branch lifecycle
- require short-lived issue-linked branches
- require PR-based merge back to `main`
- define how GitHub Actions participates in validation, release, and automation
- define how this model is inherited by downstream AgenticOS projects

The standard should cover:
- when to create an issue
- how to link tasks and issue drafts
- how to create branches/worktrees safely
- how to structure PRs
- how GitHub Actions should participate
- what verification is required before merge
- what release/tagging path is expected after merge

Potential outputs:
- workflow spec
- downstream checklist
- issue/PR template guidance
- automation hooks or bootstrap helpers

## Alternatives Considered

- Keep workflow guidance only in repository docs
- Let each downstream project invent its own process

## Additional Context

This issue matters because sustainable evolution is one of the main product goals.

It is intentionally separate from the agent-enforcement layer:
- issue 08 defines the reusable workflow standard
- issue 09 defines how agents are forced to comply with it before editing

This issue should also clarify why AgenticOS uses GitHub Flow rather than full GitFlow:
- lower operational overhead
- better fit for continuous, agent-assisted iteration
- simpler downstream inheritance and automation

## Acceptance Criteria

- A documented workflow standard exists
- The standard explicitly names the canonical branch model used by AgenticOS
- The workflow references issue-first behavior explicitly
- GitHub Actions responsibilities are defined
- The standard is reusable by downstream AgenticOS projects
- The boundary between workflow model and agent-enforcement layer is clear
