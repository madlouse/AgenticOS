---
name: Feature Request
about: Separate AgenticOS product source, user workspace, and runtime layers for portability and clarity
title: "feat: separate product source, workspace, and runtime layers"
labels: enhancement
---

## Problem Statement

The current top-level AgenticOS repository mixes:
- standards/specification assets
- product implementation
- user workspace projects
- runtime byproducts such as agent worktrees

This makes it unclear:
- what Homebrew should install
- what should live in the product source repository
- what should be portable across machines
- what should be treated as runtime-only and excluded from canonical source

## Proposed Solution

Define and adopt a layered model:

- **product source**: standards, implementation, packaging, release assets
- **workspace**: managed projects and portable workspace metadata
- **runtime**: temporary worktrees, caches, ephemeral execution state

The issue should define:
- which current paths belong to which layer
- which paths should move or be reclassified
- how `agentic-os-development` should be positioned
- how Homebrew initialization should create a clean workspace without mixing product source and runtime state

After self-hosting migration landed, this layering issue now has one important execution-backed correction:

- `.github/` is repository-root infrastructure and must remain at root even when product source is self-hosted under `projects/agenticos/`

## Why This Matters

Without this separation, portability, migration, and agent predictability all suffer.

It also creates repeated confusion about whether implementation code like `mcp-server` belongs inside the standards project.

## Acceptance Criteria

- A documented layer model exists for product source, workspace, and runtime
- Current top-level paths are classified into those layers
- The intended position of `agentic-os-development` is defined
- The intended relationship between Homebrew install, product source, workspace, and runtime is defined
- Repository-root infrastructure exceptions such as `.github/` are explicitly classified and handled
