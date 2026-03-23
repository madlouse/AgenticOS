---
name: Feature Request
about: Standardize AgenticOS bootstrap across Claude Code, Codex, Cursor, Gemini, and others
title: "feat: define per-agent bootstrap standard for AgenticOS integration"
labels: enhancement
---

## Problem Statement

Cross-agent compatibility is a core product promise, but actual bootstrap behavior is inconsistent.

One agent may have:
- MCP configured
- trigger logic configured
- user-level config visible

Another may have:
- no MCP entry
- unclear config source
- no project-intent recognition

## Proposed Solution

Define a per-agent bootstrap standard covering:
- config location
- MCP server registration method
- trigger/intention recognition mechanism
- restart requirements
- post-install verification steps
- debugging steps when switching/creation commands do not trigger correctly

Start with:
- Claude Code
- Codex
- Cursor
- Gemini CLI

## Alternatives Considered

- Keep agent integrations loosely documented in separate places
- Let each agent integration evolve independently

## Additional Context

Without a bootstrap standard, "works across agents" is difficult to verify or maintain.

## Acceptance Criteria

- Each supported agent has a documented bootstrap path
- Each path includes verification and debugging instructions
- The standard distinguishes MCP transport from project-intent routing
- Docs and install output reference the same bootstrap contract
