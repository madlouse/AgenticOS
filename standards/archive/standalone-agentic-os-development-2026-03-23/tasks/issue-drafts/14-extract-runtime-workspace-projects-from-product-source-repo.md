---
name: Feature Request
about: Extract tracked runtime workspace projects out of the AgenticOS product source repository
title: "feat: extract runtime workspace projects from the product source repository"
labels: enhancement
---

## Problem Statement

The current AgenticOS product source repository still tracks multiple real runtime projects under `projects/`.

This creates coupling between:
- AgenticOS standards and implementation development
- real user project workspace data

As long as runtime projects remain tracked in the product source repository:
- repository boundaries remain unclear
- migration stays messy
- standards work can be polluted by runtime history
- AgenticOS source development can interfere with the live workspace model

## Proposed Solution

Extract runtime workspace projects from the product source repository into a separate live workspace rooted at `AGENTICOS_HOME`.

This issue should define:
- which current `projects/*` entries are runtime projects
- which entries are standards/meta content
- which entries are fixtures/examples
- the extraction sequence
- the de-tracking strategy in the source repo
- the documentation and bootstrap updates required afterward

Initial recommended extraction targets:
- `projects/2026okr`
- `projects/360teams`
- `projects/agentic-devops`
- `projects/ghostty-optimization`
- `projects/okr-management`
- `projects/t5t`

## Why This Matters

Without extraction, AgenticOS remains both a product source repo and a live workspace at the same time.

That weakens portability and makes Agent behavior less predictable.

Self-hosting migration has now fixed the host-product positioning, so this issue has become more concrete:

- `projects/agenticos/` is now the host product project
- the remaining non-`agenticos` entries under `projects/` are much easier to classify as runtime, standards, or fixture content

## Acceptance Criteria

- Runtime workspace projects are classified explicitly
- A migration sequence exists for moving them into a separate workspace
- A de-tracking strategy exists for the product source repository
- `agentic-os-development` is kept distinct from ordinary runtime projects
- The resulting source repo no longer needs to act as the live default workspace
- The extraction plan is consistent with `projects/agenticos/` already being the landed host-product project
