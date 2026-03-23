---
name: Feature Request
about: Improve Homebrew install so AgenticOS is actually ready after install
title: "feat: define Homebrew post-install bootstrap for supported agents"
labels: enhancement
---

## Problem Statement

Homebrew currently installs the `agenticos-mcp` binary and workspace, but does not ensure that supported agents are actually bootstrapped afterward.

This creates a gap between:
- package installation
- real product activation

## Proposed Solution

Define the Homebrew post-install product contract.

At minimum, Homebrew install should:
- clearly state what was installed
- clearly state what remains manual
- point to exact config paths or commands for each supported agent
- remind the user to restart the AI tool
- explain how to verify activation

Longer term, evaluate safe automation options:
- auto-create missing config directories
- auto-merge MCP entries where safe
- opt-in bootstrap command after install

## Alternatives Considered

- Keep Homebrew as binary-only distribution and rely on docs
- Attempt fully automatic config mutation immediately

## Additional Context

This is both a packaging issue and a product-activation issue.

## Acceptance Criteria

- Homebrew caveats/post-install output cover Claude Code, Codex, and Gemini CLI explicitly
- The main README and tap README describe the same limitation and next steps
- A clear decision exists on reminder-only vs auto-bootstrap behavior
- Verification steps after install are documented
