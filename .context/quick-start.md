# AgenticOS - Quick Start

## Project Overview

Self-hosting AgenticOS product project. Canonical operational context lives under standards/.context while the root .context files remain compatibility shims.

## Current Status

- **Status**: aligned
- **Last Action**: Issue #248 merged — Workspace topology truth and downstream standard-kit conformance are both normalized on main after PRs #243 and #249.
- **Current Focus**: AgenticOS now treats AGENTICOS_HOME as workspace home, projects/<id> as the project root, and downstream standard-kit conformance as restored for the self-hosting product project.
- **Resume Here**: Use the workspace-home/project-source model from #235 as the default assumption for future project creation, audits, and runtime recovery work.
- **Refreshed At**: 2026-04-09T07:21:27.101Z

## Key Facts
- PR #243 merged at commit e3343973199c1c911a291339a346d073d93756f7.
- PR #249 merged at commit ffa98bdcb5b55dc0fa1ab22308fb75d82cff6e43.
- Issue #235 and issue #248 are both closed.
- agenticos_standard_kit_conformance_check now passes on the main checkout.

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
