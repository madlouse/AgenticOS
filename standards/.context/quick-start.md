# AgenticOS - Quick Start

## Project Overview

Self-hosting AgenticOS product project. Canonical operational context lives under standards/.context while the root .context files remain compatibility shims.

## Current Status

- **Status**: in_progress
- **Last Action**: Issue #262 now removes runtime target resolution dependence on legacy registry.active_project, standardizes session-local project semantics, hardens registry patch writes, and refreshes normative docs to the runtime-home/project model.
- **Current Focus**: Finish #262 residual review, then prepare the branch for issue/PR update.
- **Resume Here**: Review any remaining historical docs that should only get superseded notes rather than body edits.
- **Refreshed At**: 2026-04-10T10:58:11.098Z

## Key Facts
- AGENTICOS_HOME is modeled as a long-term runtime workspace, not necessarily a source checkout.
- Projects under AGENTICOS_HOME/Projects may be source-managed or local knowledge/runtime-only.
- Multi-agent and multi-project concurrency requires fail-closed resolution when no explicit or session-local target is available.

## Latest Landed Reports

- tasks/issue-262-concurrent-runtime-project-resolution.md
- tasks/issue-263-legacy-project-migration-plan.md

## Recommended Entry Documents

1. tasks/issue-262-concurrent-runtime-project-resolution.md
2. tasks/issue-263-legacy-project-migration-plan.md
3. mcp-server/README.md
4. standards/knowledge/complete-design.md

## Canonical Layers
- Operational state: `standards/.context/state.yaml`
- Session history: `standards/.context/conversations/`
- Durable knowledge: `knowledge/`
- Execution plans: `tasks/`
- Deliverables: `artifacts/`
