---
name: Feature Request
about: Execute the runtime-project extraction from the AgenticOS product source repository into the live workspace
title: "feat: execute runtime project extraction from the product source repository"
labels: enhancement
---

## Problem Statement

Issue `#38` completed the planning milestone for runtime-project extraction:
- runtime projects are now explicitly classified
- fixture/example content is identified
- an extraction and de-tracking sequence exists

But the real runtime projects are still physically tracked in the product source repository.

That means AgenticOS still has a gap between:
- the intended source/workspace boundary
- the actual filesystem and Git-tracking reality

## Proposed Solution

Execute the first real extraction wave for the tracked runtime projects.

Initial execution targets:
- `projects/2026okr`
- `projects/360teams`
- `projects/agentic-devops`
- `projects/ghostty-optimization`
- `projects/okr-management`
- `projects/t5t`

This issue should:
- prepare or confirm the separate live workspace root
- copy the runtime projects into that workspace
- verify that copied project state and project-local Git repositories remain intact
- de-track the runtime project directories from the product source repository only after verification
- leave `projects/agenticos` untouched as product source
- decide whether `projects/test-project` stays as fixture/example or is removed separately

## Why This Matters

Without the execution step, the source repo remains polluted by live runtime project content even though the intended architecture is now clear.

## Non-Goals

- redesigning the self-hosting model
- changing the canonical host-product path `projects/agenticos`
- moving repository-root infrastructure such as `.github/`
- silently deleting runtime project data before copied workspace verification passes

## Acceptance Criteria

- A live workspace destination for extracted runtime projects is confirmed
- The first-wave runtime projects are copied out and verified
- The product source repository de-tracks those runtime projects after verification
- Root docs reflect that the source repo no longer carries the extracted runtime projects
- `projects/agenticos` remains the only canonical product-source project under `projects/`

## Verification Plan

- verify the extracted project directories exist in the live workspace
- verify project-local `.git` directories or repositories still work where present
- verify project-local `.context/` state remains readable
- verify `git diff --stat origin/main...HEAD` in the source repo contains only the intended de-tracking and documentation changes
- verify root docs and root guidance describe the new boundary correctly
