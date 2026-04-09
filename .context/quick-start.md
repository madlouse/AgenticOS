# AgenticOS - Quick Start

## Project Overview

Self-hosting AgenticOS product project. Canonical operational context lives under standards/.context while the root .context files remain compatibility shims.

## Current Status

- **Status**: aligned
- **Last Action**: Issue #235 merged — Workspace-home versus project-source truth surfaces are normalized on main after PR #243, with AGENTICOS_HOME validated as /Users/jeking/dev/AgenticOS and projects/agenticos retained as the AgenticOS source project.
- **Current Focus**: Post-#235 topology truth is the active baseline: AGENTICOS_HOME is the runtime workspace home, projects/<id> is the project root, and source control topology is declared per project.
- **Resume Here**: Use the workspace-home/project-source model from #235 as the default assumption for future project creation, audits, and runtime recovery work.
- **Refreshed At**: 2026-04-09T07:04:48.483Z

## Key Facts
- PR #243 merged to origin/main at commit e3343973199c1c911a291339a346d073d93756f7.
- Issue #235 is closed.
- Focused verification on the main checkout passes; the remaining audit warning is only that launchctl does not expose AGENTICOS_HOME in this local shell environment.

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
