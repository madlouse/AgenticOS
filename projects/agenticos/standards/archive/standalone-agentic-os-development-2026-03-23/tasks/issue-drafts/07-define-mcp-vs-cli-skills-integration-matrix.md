---
name: Feature Request
about: Evaluate fallback and compatibility modes beyond MCP
title: "feat: define integration matrix for MCP-native and CLI+Skills fallback modes"
labels: enhancement
---

## Problem Statement

MCP is the primary integration model for AgenticOS, but practical agent compatibility may require fallback paths.

Some agents or environments may have:
- weak MCP support
- hard-to-debug MCP behavior
- missing bootstrap automation
- strong prompt/skill support but weaker MCP ergonomics

## Proposed Solution

Define an integration matrix for AgenticOS, for example:
- MCP-native mode
- CLI-wrapper mode
- Skills-only routing mode
- mixed mode

For each mode, document:
- supported capabilities
- limitations
- debugging ergonomics
- portability
- maintenance cost
- when the mode should be used

## Alternatives Considered

- Keep MCP as the only supported mode
- Add ad hoc fallbacks without a product model

## Additional Context

This should be treated as a product design choice, not just a transport implementation detail.

## Acceptance Criteria

- A formal comparison exists for MCP and fallback modes
- A product decision is made on primary vs fallback integration modes
- The decision is reflected in docs and roadmap
- Any fallback mode has a clear scope and non-goals
