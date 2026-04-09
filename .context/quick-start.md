# AgenticOS - Quick Start

## Project Overview

Self-hosting AgenticOS product project. Canonical operational context lives under standards/.context while the root .context files remain compatibility shims.

## Current Status

- **Status**: aligned
- **Last Action**: Issue #250 merged — Canonical context path handling now honors configured agent_context across refresh, generated adapters, and self-hosting entry surfaces after PR #251.
- **Current Focus**: AgenticOS canonical operational context is declared by .project.yaml.agent_context and now consistently renders as standards/.context/* for the self-hosting project.
- **Resume Here**: Use the workspace-home/project-source model from #235 as the default assumption for future project creation, audits, and runtime recovery work.
- **Refreshed At**: 2026-04-09T11:02:22.835Z

## Key Facts
- PR #251 merged at commit 3ef00a93954b4cdd5f59a64d111b69da372139fc.
- Issue #250 is closed.
- Full mcp-server test suite and lint pass after the canonical context alignment changes.
- The self-hosting AGENTS.md and CLAUDE.md now point at standards/.context/* rather than root .context/*.

## Latest Landed Reports

- standards/knowledge/workspace-home-vs-project-source-model-2026-04-07.md
- standards/knowledge/workspace-migration-runbook-2026-04-07.md
- standards/knowledge/runtime-project-extraction-plan-2026-03-23.md

## Recommended Entry Documents

1. standards/knowledge/workspace-home-vs-project-source-model-2026-04-07.md
2. standards/knowledge/workspace-migration-runbook-2026-04-07.md
3. standards/knowledge/runtime-project-extraction-plan-2026-03-23.md

## Canonical Layers
- Operational state: `.context/state.yaml`
- Session history: `.context/conversations/`
- Durable knowledge: `knowledge/`
- Execution plans: `tasks/`
- Deliverables: `artifacts/`
