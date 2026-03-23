# Standalone Standards Repo Consolidation Audit - 2026-03-23

## Summary

The standalone repository:

- `projects/agentic-os-development`

should no longer be treated as a long-term canonical repository.

The canonical standards location for future AgenticOS standards work is:

- `projects/agenticos/standards/`

inside the main AgenticOS product repository.

## Audit Result

The current standalone repository content does not fit a single all-or-nothing action.

The correct first-pass strategy is:

- merge canonical missing standards records into the main repository
- archive transitional raw context that is useful for traceability but not suitable as canonical state
- discard repository-local residue that has no long-term product value

In short:

- not full merge
- not full discard
- canonical merge plus legacy archive

## Category Rules

### Merge

Use this category for artifacts that are still valuable as durable standards history and are not yet present in the main repository.

Examples from the standalone repo:

- unique standards knowledge reports created during the self-hosting, runtime-extraction, guardrail, and Git-transport work
- unique standards analysis documents that still represent valid product reasoning
- `tasks/templates/non-code-evaluation-rubric.yaml`, which does not yet exist under the main repository template surface

### Archive

Use this category for artifacts that are useful for provenance or forensic history, but should not remain part of the canonical live standards surface.

Examples:

- standalone `.context/quick-start.md`
- standalone `.context/state.yaml`
- standalone `.context/conversations/2026-03-22.md`
- standalone `.context/conversations/2026-03-23.md`
- local issue-draft files whose substance is already represented by GitHub issues

These are historical execution traces, not the stable canonical standards model.

### Discard

Use this category for repository-local residue that should not be preserved as standards content.

Examples:

- `.git/`
- `.DS_Store`
- standalone-repo-only Git metadata
- temporary markers such as `.context/.last_record`

## Overlap Assessment

### Already present in main standards area

The following baseline standards documents already exist in both places and should keep the main-repo copy as canonical:

- `architecture.md`
- `cli-vs-mcp-analysis.md`
- `complete-design.md`
- `design-decisions.md`
- `evolution.md`
- `open-source-workflow-research.md`
- `session-retrospective-2026-03-21.md`
- `trade-offs.md`

For these files, consolidation should prefer:

- keep main copy
- avoid duplicate re-import
- only backfill if a specific standalone copy contains materially missing content

### Missing from main standards area

A large set of execution-backed reports exists only in the standalone repo today.

These should be treated as merge candidates unless superseded by a newer main-repo document.

Representative examples:

- `product-positioning-and-design-review-2026-03-22.md`
- `workflow-model-review-2026-03-23.md`
- `self-hosting-migration-plan-2026-03-23.md`
- `self-hosting-migration-resolution-v1-2026-03-23.md`
- `self-hosting-migration-execution-report-2026-03-23.md`
- `post-self-hosting-follow-up-plan-2026-03-23.md`
- `agent-guardrail-design-v1-2026-03-23.md`
- `agent-guardrail-command-contracts-v1-2026-03-23.md`
- `guardrail-preflight-implementation-report-2026-03-23.md`
- `guardrail-command-trio-implementation-report-2026-03-23.md`
- `guardrail-flow-wiring-report-2026-03-23.md`
- `guardrail-evidence-persistence-implementation-report-2026-03-23.md`
- `git-transport-fallback-documentation-report-2026-03-23.md`
- `git-transport-http11-refinement-report-2026-03-23.md`
- `runtime-project-extraction-closure-report-2026-03-23.md`

### Already superseded by main-repo structures

The standalone repo also contains artifacts whose canonical equivalents now live elsewhere in the main repository.

Examples:

- standalone issue drafts are largely superseded by GitHub issues
- standalone reusable templates are largely superseded by:
  - `projects/agenticos/.meta/templates/`
  - `projects/agenticos/.meta/standard-kit/`

These should usually be archived, not merged as canonical duplicates.

## First Consolidation Recommendation

For the first consolidation pass:

1. freeze canonical standards location to `projects/agenticos/standards/`
2. merge missing high-signal standards knowledge documents from the standalone repo into the main repo
3. merge only missing reusable assets that still matter, especially:
   - `non-code-evaluation-rubric.yaml`
4. archive the standalone repo's raw `.context` package and local issue-draft set as legacy history
5. mark the standalone repo as transitional / retired, not active canonical source

## What Should Not Happen

The first pass should not:

- blindly copy the entire standalone repository into main
- treat standalone `.context/state.yaml` as the canonical live state after consolidation
- reintroduce a second active Git history for standards work
- duplicate every local issue draft after GitHub issues already exist

## Final Judgment

The standalone standards repository should be retired as an active repo.

The durable result should be:

- one product repository
- one canonical standards area inside that repository
- one archived snapshot of the old standalone standards repo for historical reference

This keeps future work simple:

- standards evolve in the main AgenticOS repository
- the standalone repo becomes a legacy source to mine once, archive, and stop updating
