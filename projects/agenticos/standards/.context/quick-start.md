# AgenticOS Standards - Quick Start

## Project Overview

`projects/agenticos/standards/` is the canonical standards and protocol area inside the main AgenticOS product repository.

Its job is to define and evolve:

- project metadata and context conventions
- executable agent workflow rules
- reusable downstream standards and templates
- migration and execution reports that future agents can resume from

## Current Status

- canonical standards location has been frozen in the main repo by issue `#66` / PR `#67`
- the old standalone `projects/agentic-os-development` repo is now treated as a retired archive-only snapshot
- issue `#68` has already landed as PR `#69`
- selected high-signal standards reports from the retired standalone repo have been backfilled into `knowledge/`
- `knowledge/runtime-project-extraction-closure-report-2026-03-23.md` has now also been restored as the final remaining high-signal closure report
- the retired standalone `.context/`, issue-draft history, and entry files are now preserved under:
  - `archive/standalone-agentic-os-development-2026-03-23/`
- live standards guidance now points only to this main-repo standards area
- `knowledge/standalone-standards-retirement-resolution-2026-03-23.md` now records the final decision that no second broad merge wave is needed
- reusable downstream templates are canonically surfaced under:
  - `projects/agenticos/.meta/templates/`
  - `projects/agenticos/.meta/standard-kit/`
- `non-code-evaluation-rubric.yaml` has been restored into the main template surface as part of this consolidation wave
- issue `#72` is now implementing first-class standard-kit commands for adopt and upgrade-check
- `knowledge/standard-kit-command-design-v1-2026-03-23.md` records the command contract for the first slice
- `knowledge/standard-kit-command-implementation-report-2026-03-23.md` records the landed implementation scope and verification
- issue `#74` now upgrades project status output to summarize the latest persisted guardrail evidence
- `knowledge/status-guardrail-evidence-implementation-report-2026-03-24.md` records the status-surface implementation and verification
- issue `#76` now extends the same compact latest-guardrail summary into `agenticos_switch`
- `knowledge/switch-guardrail-evidence-implementation-report-2026-03-24.md` records the switch-surface implementation and verification
- issue `#79` now reconciles the historical open backlog against landed self-hosting, standards, and guardrail changes
- `knowledge/backlog-reconciliation-matrix-2026-03-24.md` records which old issues were closed, which remain open, and which required scope rewrite
- issue `#78` now restores `/Users/jeking/dev/AgenticOS` as a clean canonical working copy aligned with `origin/main`
- `knowledge/canonical-working-copy-cleanup-report-2026-03-24.md` records what was preserved, what was removed from the source checkout, and how the local main checkout was verified
- issue `#24` now fixes `agenticos_record` so JSON-stringified array arguments are normalized into real persisted list items instead of degrading into malformed state updates
- `knowledge/record-array-parsing-fix-report-2026-03-24.md` records the fix, regression coverage, and verification for the restored `#24` work
- issue `#23` now upgrades `agenticos_switch` so it returns inline actionable project context instead of only file paths
- `knowledge/switch-inline-context-implementation-report-2026-03-24.md` records the landed switch-context formatter, quick-start fallback, and verification
- issue `#25` now enforces fail-closed project-boundary validation for record, save, and context reads
- `knowledge/project-boundary-isolation-implementation-report-2026-03-25.md` records the boundary-proof design, coverage evidence, and verification
- issue `#26` now freezes the canonical memory-layer contract and pushes it into the downstream standard kit and templates
- `knowledge/memory-layer-contract-spec-2026-03-25.md` records the contract itself
- `knowledge/memory-layer-contract-implementation-report-2026-03-25.md` records the template, kit, and documentation alignment work
- issue `#28` now defines the canonical sub-agent inheritance packet and verification echo requirements for delegated non-trivial work
- `knowledge/sub-agent-inheritance-protocol-2026-03-25.md` records the protocol itself
- `knowledge/sub-agent-inheritance-implementation-report-2026-03-25.md` records the template, standards-doc, and standard-kit adoption changes
- issue `#29` now defines the canonical per-agent bootstrap standard for Claude Code, Codex, Cursor, and Gemini CLI
- `projects/agenticos/.meta/bootstrap/agent-bootstrap-matrix.yaml` is now the machine-readable source of truth for supported-agent bootstrap
- `knowledge/per-agent-bootstrap-standard-2026-03-25.md` records the transport-vs-routing contract and official support surface
- `knowledge/per-agent-bootstrap-standard-implementation-report-2026-03-25.md` records the landed matrix, parser, and docs alignment work
- issue `#30` now defines the Homebrew post-install contract as reminder-only, not automatic agent activation
- `knowledge/homebrew-post-install-contract-2026-03-25.md` records the product decision for install vs activation
- `knowledge/homebrew-post-install-implementation-report-2026-03-25.md` records the formula, tap README, root README, and MCP README alignment work
- issue `#31` now defines the canonical integration mode matrix for MCP-native, MCP + Skills Assist, CLI Wrapper, and Skills-only Guidance
- `projects/agenticos/.meta/bootstrap/integration-mode-matrix.yaml` is now the machine-readable source of truth for primary vs fallback integration modes
- `knowledge/integration-mode-matrix-2026-03-25.md` records the product decision for primary and fallback modes
- `knowledge/integration-mode-matrix-implementation-report-2026-03-25.md` records the parser, docs, and roadmap alignment work
- issue `#92` now closes the last strict-verification gap left after `#25` by raising the touched project-boundary runtime files to full branch coverage
- `knowledge/project-boundary-coverage-closure-report-2026-03-25.md` records the added fallback-path regression cases and the final `100 / 100 / 100 / 100` targeted coverage result

## Recommended Entry Documents

Start here:

1. `knowledge/standalone-standards-repo-consolidation-audit-2026-03-23.md`
2. `knowledge/standalone-standards-first-consolidation-wave-2026-03-23.md`
3. `knowledge/standalone-standards-retirement-resolution-2026-03-23.md`
4. `knowledge/product-positioning-and-design-review-2026-03-22.md`
5. `knowledge/agent-preflight-and-execution-protocol-2026-03-23.md`
6. `knowledge/guardrail-flow-wiring-report-2026-03-23.md`
7. `knowledge/standard-kit-command-design-v1-2026-03-23.md`
8. `knowledge/standard-kit-command-implementation-report-2026-03-23.md`
9. `knowledge/status-guardrail-evidence-implementation-report-2026-03-24.md`
10. `knowledge/switch-guardrail-evidence-implementation-report-2026-03-24.md`
11. `knowledge/backlog-reconciliation-matrix-2026-03-24.md`
12. `knowledge/canonical-working-copy-cleanup-report-2026-03-24.md`
13. `knowledge/record-array-parsing-fix-report-2026-03-24.md`
14. `knowledge/switch-inline-context-implementation-report-2026-03-24.md`
15. `knowledge/project-boundary-isolation-implementation-report-2026-03-25.md`
16. `knowledge/memory-layer-contract-spec-2026-03-25.md`
17. `knowledge/memory-layer-contract-implementation-report-2026-03-25.md`
18. `knowledge/sub-agent-inheritance-protocol-2026-03-25.md`
19. `knowledge/sub-agent-inheritance-implementation-report-2026-03-25.md`
20. `knowledge/per-agent-bootstrap-standard-2026-03-25.md`
21. `knowledge/per-agent-bootstrap-standard-implementation-report-2026-03-25.md`
22. `knowledge/homebrew-post-install-contract-2026-03-25.md`
23. `knowledge/homebrew-post-install-implementation-report-2026-03-25.md`
24. `knowledge/integration-mode-matrix-2026-03-25.md`
25. `knowledge/integration-mode-matrix-implementation-report-2026-03-25.md`
26. `knowledge/project-boundary-coverage-closure-report-2026-03-25.md`

## Next Steps

1. Use the reconciled open backlog, not the pre-self-hosting issue list, as the canonical remaining work queue
2. Treat `/Users/jeking/dev/AgenticOS` as the trusted local canonical checkout again; use isolated worktrees for changes
3. Reassess the remaining backlog now that `#25`, `#26`, `#28`, `#29`, `#30`, and `#31` are all frozen and fully verified
4. Decide whether any additional entry surfaces need the same compact guardrail summary beyond `agenticos_status` and `agenticos_switch`
5. Only open a new selective-merge issue if one specific archived artifact is later proven to fill a real canonical gap
