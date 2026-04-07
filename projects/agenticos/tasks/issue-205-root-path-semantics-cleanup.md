# Issue #205 — Root Path Semantics Cleanup

## Goal

Replace machine-local canonical root assumptions with `workspace home` and `source checkout` language in the targeted operator docs.

## Scope

- update root compatibility docs that still hard-code the old source root path
- update standards docs so validation commands use variables instead of one machine-local path
- keep this slice documentation-only

## Validation

- `rg -n "/Users/jeking/dev/AgenticOS" AGENTS.md CONTRIBUTING.md projects/agenticos/standards/knowledge/canonical-sync-contract-2026-03-25.md projects/agenticos/standards/knowledge/operator-checklist-v1-2026-03-23.md projects/agenticos/standards/knowledge/workspace-migration-runbook-2026-04-07.md`
- `rg -n "AGENTICOS_SOURCE_ROOT|AGENTICOS_WORKSPACE_HOME|current AgenticOS source checkout|workspace home" AGENTS.md CONTRIBUTING.md projects/agenticos/standards/knowledge/canonical-sync-contract-2026-03-25.md projects/agenticos/standards/knowledge/operator-checklist-v1-2026-03-23.md projects/agenticos/standards/knowledge/workspace-migration-runbook-2026-04-07.md`
