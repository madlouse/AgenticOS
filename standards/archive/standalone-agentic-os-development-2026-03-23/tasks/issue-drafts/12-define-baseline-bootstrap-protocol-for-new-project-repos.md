---
name: Feature Request
about: Define how new or unborn AgenticOS project repos enter the normal issue/branch/worktree workflow
title: "feat: define baseline bootstrap protocol for new AgenticOS project repositories"
labels: enhancement
---

## Problem Statement

Some AgenticOS-managed project repositories may still have no initial commit.

In that state:
- normal branch creation is not meaningful
- normal worktree flow cannot start cleanly
- issue-first branch/worktree rules become self-contradictory

This is not hypothetical.
The `agentic-os-development` standards project itself is currently such a repo, which makes this issue immediately relevant.

## Proposed Solution

Define a baseline bootstrap protocol for newborn project repos.

It should specify:
- the minimum baseline files required
- whether bootstrap work needs a special issue type
- when bootstrap is considered complete
- when the repo transitions into normal issue/branch/worktree flow
- what actions remain forbidden even during bootstrap
- how bootstrap composes with the broader task-classification protocol

Recommended direction:
- treat `bootstrap` as a narrow repository state, not a broad exemption
- allow only baseline-establishing work during bootstrap
- require the first baseline commit on `main`
- require normal issue/branch/worktree rules immediately after bootstrap exit

Potential outputs:
- bootstrap state definition
- minimum baseline file set
- bootstrap issue template guidance
- exit criteria
- guardrail pseudocode for blocking non-baseline work before bootstrap is complete

## Why This Matters

Without a bootstrap protocol, the standard cannot cleanly apply to newly initialized projects, including the standards project itself.

Without a clean bootstrap rule, downstream projects can misuse "new repo" status as a loophole around the normal workflow.

## Scope

This issue should define:
- how a repo is classified as `bootstrap`
- what exact files or conditions form the minimum baseline
- what is allowed and forbidden during bootstrap
- when bootstrap ends
- how the repo transitions into normal issue-first branch/worktree flow

## Non-Goals

- This issue should not define the entire downstream project template package
- This issue should not implement runtime guardrails by itself
- This issue should not weaken branch/worktree rules for normal repositories

## Verification Plan

- Verify the protocol against a real unborn repository state
- Verify that non-baseline work would be blocked during bootstrap
- Verify that after the first baseline commit, normal branch/worktree flow becomes applicable
- Verify that the bootstrap state cannot remain indefinitely without explicit reason

## Acceptance Criteria

- A documented bootstrap phase exists for repos with no initial commit
- Minimum baseline requirements are defined
- Exit criteria from bootstrap into normal workflow are defined
- The protocol prevents bootstrap from becoming a loophole for unrelated work
- The protocol is concrete enough to classify the current standards project correctly
