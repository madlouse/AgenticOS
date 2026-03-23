---
name: Feature Request
about: Evaluate moving the AgenticOS product itself under projects/ so the workspace self-hosts the main product
title: "feat: evaluate self-hosting workspace model for the AgenticOS product"
labels: enhancement
---

## Problem Statement

The current setup still leaves ambiguity between:
- the AgenticOS product source repository
- the AgenticOS runtime workspace
- the standards/meta project used to evolve the rules

One possible resolution is to make the top-level AgenticOS directory the runtime workspace, and move the AgenticOS product itself under `projects/` as a managed project.

That would make AgenticOS develop itself under its own project rules.

## Proposed Solution

Evaluate a self-hosting model where:
- the top-level AgenticOS directory becomes workspace home
- the AgenticOS product source becomes a managed project under `projects/`
- standards and implementation are unified inside that managed product project

The evaluation should define:
- target directory layout
- what happens to `agentic-os-development`
- migration impact on CI, releases, Homebrew, and docs
- whether this is better than keeping the current source-first model

## Why This Matters

This model may be the cleanest way to ensure that AgenticOS itself is developed under AgenticOS project governance.

## Acceptance Criteria

- A documented comparison exists between source-first and self-hosting models
- The target structure for a self-hosting model is defined
- The role of `agentic-os-development` is clarified under that model
- Migration cost and risk are explicitly assessed
