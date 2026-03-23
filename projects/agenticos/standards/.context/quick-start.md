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
- the old standalone `projects/agentic-os-development` repo is now treated as a retired transitional snapshot
- issue `#68` is the first real consolidation wave
- selected high-signal standards reports from the retired standalone repo have been backfilled into `knowledge/`
- the retired standalone `.context/`, issue-draft history, and entry files are now preserved under:
  - `archive/standalone-agentic-os-development-2026-03-23/`
- live standards guidance now points only to this main-repo standards area
- reusable downstream templates are canonically surfaced under:
  - `projects/agenticos/.meta/templates/`
  - `projects/agenticos/.meta/standard-kit/`
- `non-code-evaluation-rubric.yaml` has been restored into the main template surface as part of this consolidation wave

## Recommended Entry Documents

Start here:

1. `knowledge/standalone-standards-repo-consolidation-audit-2026-03-23.md`
2. `knowledge/standalone-standards-first-consolidation-wave-2026-03-23.md`
3. `knowledge/product-positioning-and-design-review-2026-03-22.md`
4. `knowledge/agent-preflight-and-execution-protocol-2026-03-23.md`
5. `knowledge/guardrail-flow-wiring-report-2026-03-23.md`
6. `knowledge/downstream-standard-kit-implementation-report-2026-03-23.md`

## Next Steps

1. Land issue `#68` so the main repo becomes the only place where live standards work is updated
2. Decide whether any archived standalone artifacts still deserve a second canonical merge wave
3. Decide whether standard-kit adoption and upgrade should become first-class commands
4. Decide whether status surfaces should summarize latest guardrail evidence more explicitly
