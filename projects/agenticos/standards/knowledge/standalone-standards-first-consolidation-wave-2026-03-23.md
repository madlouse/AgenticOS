# Standalone Standards First Consolidation Wave - 2026-03-23

## Summary

Issue `#68` executes the first real consolidation wave after the standalone-standards audit.

This wave does three bounded things:

1. backfills missing high-signal standards knowledge into the main repository
2. archives the retired standalone repo's raw context and local issue-draft history
3. rewrites live standards entry files so future work starts from the canonical main-repo standards area

## What Was Merged

The main standards knowledge area now includes previously missing execution-backed documents from the retired standalone repository, including:

- product positioning and design review
- workflow-model review
- self-hosting model, migration plan, resolution, and execution report
- agent execution protocol and guardrail design/contract reports
- baseline bootstrap and isolation reports
- Git transport fallback reports
- downstream standard-kit planning and implementation reports

This creates one canonical standards knowledge surface under:

- `projects/agenticos/standards/knowledge/`

## What Was Archived

The retired standalone repo snapshot is preserved under:

- `projects/agenticos/standards/archive/standalone-agentic-os-development-2026-03-23/`

The archive contains:

- raw `.context/` state and conversation history
- local `tasks/issue-drafts/` history
- old root entry files such as `.project.yaml`, `AGENTS.md`, `CLAUDE.md`, and `changelog.md`

The archive is read-only provenance, not the live standards surface.

## Live Guidance Cleanup

Active entry files were rewritten so they no longer treat the standalone repo as canonical:

- `.project.yaml`
- `AGENTS.md`
- `CLAUDE.md`
- `.context/quick-start.md`
- `.context/state.yaml`

These now point future work to:

- the main standards area
- the main reusable template surface under `projects/agenticos/.meta/templates/`
- the main downstream standard-kit under `projects/agenticos/.meta/standard-kit/`

## Additional Template Recovery

This consolidation wave also restores:

- `projects/agenticos/.meta/templates/non-code-evaluation-rubric.yaml`

The downstream standard-kit manifest and adoption checklist were updated so this template is part of the canonical reusable surface.

## Verification

Verification for this wave should confirm:

1. selected standards reports exist under `projects/agenticos/standards/knowledge/`
2. the archive snapshot exists under `projects/agenticos/standards/archive/`
3. live entry files point only to the main standards area as canonical
4. the recovered rubric exists under `projects/agenticos/.meta/templates/`
5. the updated standard-kit manifest parses cleanly

## Follow-up

After this first consolidation wave lands, the remaining decision is narrower:

- whether any archived standalone artifacts still deserve a second canonical merge wave

All new standards work should continue only inside the main AgenticOS repository.
