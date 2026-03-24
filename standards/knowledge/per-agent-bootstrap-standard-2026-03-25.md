# Per-Agent Bootstrap Standard - 2026-03-25

## Design Reflection

Issue `#29` is not about whether AgenticOS should support many agents.

That product direction is already set.

The actual gap is that bootstrap behavior was being described in several places with different supported-agent sets, different config assumptions, and no clean separation between:

1. **MCP transport availability**
2. **project-intent routing behavior**

Without that split, failures get misdiagnosed:

- a missing MCP registration looks like a routing problem
- weak natural-language triggering looks like an install problem
- outdated config examples create fake incompatibility between agents

The adopted design is:

- freeze one canonical machine-readable agent bootstrap matrix
- align the root README and MCP server README to that matrix
- define verification and debug steps per agent
- keep Homebrew caveats for issue `#30`
- keep fallback-mode product choices for issue `#31`

## Canonical Supported Agents

Officially covered in this issue:

1. Claude Code
2. Codex
3. Cursor
4. Gemini CLI

All other MCP-capable tools remain experimental unless they have the same level of bootstrap, verification, and debugging documentation.

## Required Per-Agent Contract

For each officially supported agent, the standard must define:

1. canonical bootstrap method
2. canonical config location or CLI-managed config surface
3. mandatory restart expectation if applicable
4. mandatory verification steps
5. transport-debug steps
6. routing-debug steps

## Transport vs Routing

This issue freezes one important product rule:

- **transport bootstrap** means `agenticos` is registered and callable
- **routing** means the agent actually chooses or suggests the right `agenticos_*` tools at the right time

Transport success does not prove routing quality.

That distinction must appear in every canonical bootstrap document.

## Canonical Source of Truth

The machine-readable source of truth is:

- `projects/agenticos/.meta/bootstrap/agent-bootstrap-matrix.yaml`

Human-facing summaries should align to it rather than inventing separate support lists.
