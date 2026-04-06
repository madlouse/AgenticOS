# Issue #171: Archive Import And Runtime Review Surface

## GitHub

- Issue: https://github.com/madlouse/AgenticOS/issues/171
- Title: `Land archive-import and runtime review-surface mechanisms from cleanup triage`

## Scope

This slice normalizes the cleanup-triage mechanism work for:

- archive import allowlist / reject-list policy
- runtime-managed review surface classification

Primary targets:

- `projects/agenticos/mcp-server/src/utils/archive-import-policy.ts`
- `projects/agenticos/mcp-server/src/tools/archive-import-evaluate.ts`
- `projects/agenticos/mcp-server/src/utils/runtime-review-surface.ts`
- `projects/agenticos/mcp-server/src/tools/pr-scope-check.ts`
- `projects/agenticos/mcp-server/src/tools/save.ts`
- `projects/agenticos/mcp-server/src/tools/record.ts`
- `projects/agenticos/mcp-server/src/index.ts`
- `projects/agenticos/mcp-server/src/tools/index.ts`
- related tests and template metadata

## Intended Outcome

- archived file imports are classified before entering active project scope
- runtime-managed files are excluded from normal product review slices by default
- `save` stages only runtime-managed surfaces plus the CLAUDE state mirror
- `record` no longer rewrites `quick-start.md` opportunistically

## Notes

- This slice is extracted from the canonical dirty worktree tracked by issue `#169`.
- The branch should land as a coherent mechanism pass, not as another mixed cleanup batch.
