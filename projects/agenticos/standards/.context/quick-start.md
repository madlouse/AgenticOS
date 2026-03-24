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

## Next Steps

1. Use the reconciled open backlog, not the pre-self-hosting issue list, as the canonical remaining work queue
2. Treat `/Users/jeking/dev/AgenticOS` as the trusted local canonical checkout again; use isolated worktrees for changes
3. Continue with the remaining core backlog: `#25`, `#26`, `#28`, `#29`, `#30`, `#31`
4. Decide whether any additional entry surfaces need the same compact guardrail summary beyond `agenticos_status` and `agenticos_switch`
5. Only open a new selective-merge issue if one specific archived artifact is later proven to fill a real canonical gap
