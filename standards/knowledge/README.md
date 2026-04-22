# AgenticOS Standards Knowledge Index

---
status: live
date: 2026-04-21
issue: "#313"
---

Index of all documents in `standards/knowledge/`. Status markers:
- **LIVE** — current guidance, use as reference
- **SPEC** — design spec under consideration, not yet canonical
- **SUPERSEDED** — replaced by newer or more complete docs

Files without explicit frontmatter are implicitly LIVE unless the filename or content shows otherwise.

---

## Architecture

| File | Status | Description |
|------|--------|-------------|
| `architecture.md` | LIVE | Core architecture design: Agent First principles, layer model, cross-tool compatibility |
| `complete-design.md` | LIVE | Comprehensive design document covering all layers and principles |
| `design-decisions.md` | LIVE | Indexed design decisions with context, options, rationale |
| `evolution.md` | LIVE | Version history and product evolution from concept to current state |
| `trade-offs.md` | LIVE | Structural trade-offs analysis (structured vs flexibility, etc.) |
| `product-positioning-and-design-review-2026-03-22.md` | LIVE | Product positioning and canonical meta-project identity |
| `workflow-model-review-2026-03-23.md` | LIVE | GitHub Flow vs GitFlow decision and worktree isolation model |
| `cli-vs-mcp-analysis.md` | LIVE | CLI tool vs MCP server depth comparison for integration mode decision |
| `root-workspace-topology-analysis-2026-04-07.md` | LIVE | Workspace topology analysis and root-Git exit decision (supersedes earlier topology docs) |
| `workspace-home-vs-project-source-model-2026-04-07.md` | LIVE | Final storage model terminology: installed runtime, workspace home, project source |
| `root-git-dependency-inventory-2026-04-07.md` | LIVE | Inventory of what still depends on root-level .git before removal |
| `product-root-shell-readiness-2026-04-07.md` | LIVE | Canonical shell surfaces prepared for standalone product-repo extraction |
| `standalone-product-repo-extraction-runbook-2026-04-07.md` | LIVE | Runbook for converting agenticos into a standalone product repository |
| `workspace-migration-runbook-2026-04-07.md` | LIVE | Transitional workspace migration runbook (historical; superseded by final model) |
| `local-project-source-inclusion-policy-2026-04-07.md` | LIVE | Policy for when project source should stay inside Git-backed canonical tree |
| `project-topology-decision-rubric-2026-04-07.md` | LIVE | Decision rubric for choosing github_versioned vs local_directory_only topology |
| `sibling-project-normalization-policy-2026-04-06.md` | LIVE | Policy for normalizing status of sibling project roots and helper trees |

---

## Guardrail Design

| File | Status | Description |
|------|--------|-------------|
| `agent-guardrail-design-v1-2026-03-23.md` | SPEC | Draft guardrail model: preflight gate, machine-checkable pass/fail, evidence persistence |
| `agent-guardrail-command-contracts-v1-2026-03-23.md` | SPEC | Draft command contracts for guardrail commands: preflight, branch-bootstrap, edit-guard, scope-check |
| `agent-execution-loop-2026-03-23.md` | LIVE | Core execution loop: synthesize fragmented intent, infer goals, propose/improve solutions |
| `agent-preflight-and-execution-protocol-2026-03-23.md` | SPEC | Draft preflight and execution contract for downstream agent conformance |
| `delegated-work-enforcement-design-2026-04-01.md` | SPEC | Design for runtime enforcement of sub-agent handoff completeness and verification echoes |
| `guardrail-summary-surface-review-2026-04-01.md` | LIVE | Decision on which MCP entry surfaces expose compact guardrail summary |
| `issue-first-bypass-rca-2026-04-01.md` | LIVE | Root cause analysis of two issue-first bypass incidents (Codex and Agent-CLI-API sessions) |

---

## Memory Layer

| File | Status | Description |
|------|--------|-------------|
| `memory-layer-contract-spec-2026-03-25.md` | LIVE | Memory layer contract spec: quick-start, state, conversations, knowledge, tasks roles |
| `memory-layer-contract-implementation-report-2026-03-25.md` | LIVE | Phase 1 implementation report: contract encoded into default templates, runtime aligned |
| `entry-surface-refresh-design-2026-03-25.md` | LIVE | Design for deterministic entry surface refresh from structured merged-work inputs |
| `entry-surface-refresh-implementation-report-2026-03-25.md` | LIVE | Implementation report for agenticos_refresh_entry_surfaces command |
| `context-publication-policy-2026-04-10.md` | LIVE | Policy for which context surfaces are publishable into tracked Git source by project class |
| `okr-management-wrapper-recovery-report-2026-03-25.md` | LIVE | Recovery of projects/okr-management as external-source wrapper project |
| `t5t-reconstruction-report-2026-03-25.md` | LIVE | Reconstruction of projects/t5t as recovered snapshot with explicit provenance tracking |

---

## Agent Protocol

| File | Status | Description |
|------|--------|-------------|
| `sub-agent-inheritance-protocol-2026-03-25.md` | LIVE | Protocol for sub-agent startup: required inheritance packet and verification echo loop |
| `sub-agent-inheritance-implementation-report-2026-03-25.md` | LIVE | Implementation: handoff template, design/submission template updates, standards-area rules |
| `cross-agent-execution-contract-2026-03-29.md` | LIVE | Cross-agent execution contract: identical policy semantics across Claude Code and Codex |
| `claude-codex-adapter-parity-2026-03-29.md` | LIVE | Claude/Codex adapter parity: canonical policy block vs runtime-specific guidance blocks |
| `per-agent-bootstrap-standard-2026-03-25.md` | LIVE | Per-agent bootstrap standard with MCP transport availability vs project-intent routing split |
| `per-agent-bootstrap-standard-implementation-report-2026-03-25.md` | LIVE | Bootstrap matrix, canonical human-facing docs, parser and verification harness |

---

## Non-Code Evaluation

| File | Status | Description |
|------|--------|-------------|
| `non-code-evaluation-command-design-2026-03-25.md` | LIVE | Design for rubric-backed non-code evaluation as a first-class command |
| `non-code-evaluation-command-implementation-report-2026-03-25.md` | LIVE | Implementation of agenticos_non_code_evaluate command |

---

## Standards

| File | Status | Description |
|------|--------|-------------|
| `agent-friendly-readme-spec-v1.md` | LIVE | Canonical Agent-Friendly README standard with 9 required elements (install.md, llms.txt) |
| `agent-friendly-readme-research-2026-04-02.md` | SUPERSEDED | Superseded by agent-friendly-readme-spec-v1.md |
| `integration-mode-matrix-2026-03-25.md` | LIVE | Integration mode matrix: MCP-native primary, MCP+Skills fallback, CLI wrapper limited |
| `integration-mode-matrix-implementation-report-2026-03-25.md` | LIVE | Integration mode implementation: matrix, parser, README/MCP README/ROADMAP alignment |
| `homebrew-post-install-contract-2026-03-25.md` | LIVE | Homebrew post-install contract: install real, activation manual, verification mandatory |
| `homebrew-post-install-implementation-report-2026-03-25.md` | LIVE | Homebrew surface alignment: README, tap README, formula post_install, caveats |
| `standard-kit-command-design-v1-2026-03-23.md` | LIVE | Standard-kit command design: agenticos_standard_kit_adopt, agenticos_standard_kit_upgrade_check |
| `standard-kit-command-implementation-report-2026-03-23.md` | LIVE | Standard-kit command implementation report |
| `health-command-design-2026-03-25.md` | LIVE | Health command design: bounded pre-work health surface (repo_sync, entry_surface, guardrail) |
| `health-command-implementation-report-2026-03-25.md` | LIVE | Health command implementation: agenticos_health with compact structured output |
| `canonical-sync-contract-2026-03-25.md` | LIVE | Canonical sync contract: when local checkout is trustworthy, source-of-truth ordering |
| `canonical-sync-implementation-report-2026-03-25.md` | LIVE | Canonical sync implementation: contract applied and verified against real checkout |
| `downstream-standard-kit-implementation-report-2026-03-23.md` | LIVE | Standard kit package landed at .meta/standard-kit/ with manifest, README, copied templates |
| `downstream-standard-package-plan-2026-03-23.md` | LIVE | Downstream standard package plan: kit contents, canonical vs customizable, adopt commands |

---

## Reviews

| File | Status | Description |
|------|--------|-------------|
| `open-source-workflow-research.md` | SUPERSEDED | Superseded by agent-friendly-readme-spec-v1.md and the current open-source workflow (worktree isolation, issue-first) |
| `review-comprehensive-team-review-2026-04-21.md` | LIVE | Comprehensive team review (2026-04-21): architecture 7.5, MCP 7.5, product 4, kit 6 — root-Git exit is the single most important structural fix |

---

## Implementation Reports (Historical — LIVE as execution record)

### Self-Hosting Migration
| File | Status | Description |
|------|--------|-------------|
| `self-hosting-workspace-model-2026-03-23.md` | LIVE | Self-hosting workspace model: workspace home, managed projects/, runtime artifacts |
| `self-hosting-migration-plan-2026-03-23.md` | LIVE | Migration plan: target structure, execution phases |
| `self-hosting-migration-resolution-v1-2026-03-23.md` | LIVE | Frozen target model v1 resolution |
| `self-hosting-migration-execution-report-2026-03-23.md` | LIVE | PR #46 merged: self-hosting migration landed |
| `baseline-isolation-plan-2026-03-23.md` | LIVE | Baseline isolation plan before migration |
| `baseline-isolation-execution-report-2026-03-23.md` | LIVE | Baseline isolated to /Users/jeking/worktrees/agenticos-self-hosting-baseline/ |
| `baseline-bootstrap-protocol-2026-03-23.md` | LIVE | Bootstrap protocol for newborn repositories |
| `operator-checklist-v1-2026-03-23.md` | LIVE | Execution-ready baseline isolation checklist |
| `command-level-migration-playbook-v1-2026-03-23.md` | LIVE | Command-level verification-first migration playbook |
| `phase2-path-relocation-checklist-2026-03-23.md` | LIVE | Phase 2 path classification and relocation checklist |
| `phase3-execution-sequence-2026-03-23.md` | LIVE | Phase 3 execution sequence with verification checkpoints |
| `post-self-hosting-follow-up-plan-2026-03-23.md` | LIVE | Post-migration follow-up priorities and lessons learned |

### Guardrail Implementation
| File | Status | Description |
|------|--------|-------------|
| `guardrail-preflight-implementation-report-2026-03-23.md` | LIVE | PR #47: agenticos_preflight landed |
| `guardrail-command-trio-implementation-report-2026-03-23.md` | LIVE | PRs #47/48/49: preflight, branch-bootstrap, pr_scope_check landed |
| `guardrail-flow-wiring-report-2026-03-23.md` | LIVE | PR #50: guardrail trio wired into AGENTS.md, CLAUDE.md, develop.md |
| `guardrail-evidence-persistence-implementation-report-2026-03-23.md` | LIVE | PR #65: guardrail evidence persisted into state.yaml |
| `status-guardrail-evidence-implementation-report-2026-03-24.md` | LIVE | agenticos_status upgraded with compact guardrail summary |
| `switch-guardrail-evidence-implementation-report-2026-03-24.md` | LIVE | agenticos_switch upgraded with compact guardrail summary |
| `switch-inline-context-implementation-report-2026-03-24.md` | LIVE | agenticos_switch return value includes actionable project context |
| `record-array-parsing-fix-report-2026-03-24.md` | LIVE | JSON array string argument parsing bug fixed |

### Repository Cleanup & Backlog
| File | Status | Description |
|------|--------|-------------|
| `canonical-working-copy-cleanup-report-2026-03-24.md` | LIVE | Issue #78: local checkout restored to clean canonical state |
| `backlog-reconciliation-matrix-2026-03-24.md` | LIVE | Open backlog reconciled against landed work, spurious issues closed |

### Runtime Project Extraction
| File | Status | Description |
|------|--------|-------------|
| `runtime-project-extraction-plan-2026-03-23.md` | LIVE | Runtime project extraction plan: classification, sequence, de-tracking |
| `runtime-project-extraction-closure-report-2026-03-23.md` | LIVE | Issues #53/#56 closed: extraction fully completed |
| `runtime-project-extraction-wave1-execution-2026-03-23.md` | LIVE | Wave 1: 2026okr, 360teams extracted |
| `runtime-project-extraction-wave2-execution-2026-03-23.md` | LIVE | Wave 2: agentic-devops, ghostty-optimization extracted |
| `orphaned-gitlink-residue-repair-2026-03-23.md` | LIVE | okr-management, t5t gitlink residue repaired |

### Standards Consolidation
| File | Status | Description |
|------|--------|-------------|
| `standalone-standards-first-consolidation-wave-2026-03-23.md` | LIVE | Issue #68: first consolidation wave — missing standards backfilled into main repo |
| `standalone-standards-repo-consolidation-audit-2026-03-23.md` | LIVE | Audit: canonical standards moved to projects/agenticos/standards/ |
| `standalone-standards-retirement-resolution-2026-03-23.md` | LIVE | Standalone repo retired, one remaining closure report merged |
| `repository-layering-and-portability-plan-2026-03-23.md` | LIVE | Repository layering: standards, implementation, workspace data, runtime byproducts |

### Git Transport & Issue #113
| File | Status | Description |
|------|--------|-------------|
| `git-transport-fallback-documentation-report-2026-03-23.md` | LIVE | PR #59: GitHub transport fallback documented |
| `git-transport-http11-refinement-report-2026-03-23.md` | LIVE | PR #61: HTTP/1.1 compatibility note added to fallback docs |
| `issue-113-design-brief-2026-03-29.md` | LIVE | Issue #113 design brief: fail-closed edit boundaries, edit_guard, structural_move support |
| `project-boundary-coverage-closure-report-2026-03-25.md` | LIVE | Issue #92: 100/100/100/100 branch coverage for project-boundary resolver |
| `project-boundary-isolation-implementation-report-2026-03-25.md` | LIVE | Issue #25: fail-closed project-boundary resolver, canonical identity proof before mutation |
| `project-layout-restoration-report-2026-03-25.md` | LIVE | Issue #104: overreaching self-hosting interpretation corrected, legacy operator paths preserved |
| `missing-project-source-audit-2026-03-25.md` | LIVE | Issue #106: audit of t5t and okr-management recoverability — asymmetric result |

### Session & Context
| File | Status | Description |
|------|--------|-------------|
| `session-retrospective-2026-03-21.md` | LIVE | Session retrospective: open-source collaboration, context断裂 lesson |