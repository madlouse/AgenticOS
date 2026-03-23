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

## Next Steps

1. Stop writing new canonical standards records into the retired standalone repo
2. Land issue `#72` so standard-kit adoption and upgrade-check become first-class commands
3. Decide whether status surfaces should summarize latest guardrail evidence more explicitly
4. Only open a new selective-merge issue if one specific archived artifact is later proven to fill a real canonical gap
