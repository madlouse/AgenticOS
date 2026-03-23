# Standalone Standards Retirement Resolution - 2026-03-23

## Summary

After the first consolidation wave landed in PR `#69`, the remaining delta between:

- retired standalone repo: `projects/agentic-os-development`
- canonical standards area: `projects/agenticos/standards`

was audited again.

Final judgment:

- one remaining high-signal closure report deserved canonical merge
- all other remaining standalone-only artifacts should remain archive-only
- no second broad canonical merge wave is needed

## Remaining Standalone-Only Artifacts After PR #69

Standalone-only files that still existed after the first consolidation wave:

- `runtime-project-extraction-closure-report-2026-03-23.md`
- `runtime-project-extraction-execution-follow-up-2026-03-23.md`
- `runtime-project-extraction-planning-report-2026-03-23.md`
- `runtime-project-extraction-wave1-report-2026-03-23.md`
- `runtime-project-extraction-wave2-report-2026-03-23.md`
- `self-hosting-migration-resolution-draft-2026-03-23.md`

## Classification

### Canonical merge

Keep and merge:

- `runtime-project-extraction-closure-report-2026-03-23.md`

Reason:
- it captures the final completed state of the runtime extraction program
- it provides a concise outcome summary not otherwise preserved in one dedicated report

### Archive-only

Keep archived, but do not merge as canonical:

- `runtime-project-extraction-execution-follow-up-2026-03-23.md`
- `runtime-project-extraction-planning-report-2026-03-23.md`
- `runtime-project-extraction-wave1-report-2026-03-23.md`
- `runtime-project-extraction-wave2-report-2026-03-23.md`
- `self-hosting-migration-resolution-draft-2026-03-23.md`

Reasons:

- the runtime extraction planning and wave reports are superseded by canonical main-repo documents:
  - `knowledge/runtime-project-extraction-plan-2026-03-23.md`
  - `knowledge/runtime-project-extraction-wave1-execution-2026-03-23.md`
  - `knowledge/runtime-project-extraction-wave2-execution-2026-03-23.md`
  - `knowledge/orphaned-gitlink-residue-repair-2026-03-23.md`
- the self-hosting draft resolution is superseded by:
  - `knowledge/self-hosting-migration-resolution-v1-2026-03-23.md`

## Retirement Decision

The standalone repo should now be treated as:

- retired
- archive-only
- non-canonical

That means:

- do not create new standards records there
- do not treat its `.context/state.yaml` as live state
- do not plan a second broad merge wave unless a specific archived artifact is later found to fill a real canonical gap

## Result

The intended durable model is now fully stable:

1. the main AgenticOS repository is the only active repository for ongoing standards work
2. `projects/agenticos/standards/` is the only canonical standards area
3. `archive/standalone-agentic-os-development-2026-03-23/` is retained only for provenance

## Follow-Up

Future follow-up, if any, should be narrowly scoped:

- identify one specific archived artifact
- justify why current canonical records are insufficient
- merge only that artifact in a dedicated issue

Until then, the retired standalone repo should remain untouched.
