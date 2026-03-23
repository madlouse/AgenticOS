# AGENTS.md — AgenticOS Standards

## Canonical Standards Note

- all ongoing standards work for AgenticOS must be recorded in this main repository under `projects/agenticos/standards/`
- the retired standalone snapshot lives under `archive/standalone-agentic-os-development-2026-03-23/`
- archive contents are legacy reference material only; they are not the live canonical source

## Session Start

Before doing standards work, read:

1. `.project.yaml`
2. `.context/quick-start.md`
3. `.context/state.yaml`
4. the specific `knowledge/` documents relevant to the issue you are working on

Treat archived standalone material as read-only historical evidence, not as the authoritative current state.

## Working Rules

1. Standards work follows the main AgenticOS workflow: issue first, isolated branch/worktree, verification before merge.
2. Use `knowledge/` for durable decisions, execution reports, migration reports, and protocol changes.
3. Keep `.context/quick-start.md` and `.context/state.yaml` current enough that another agent can resume without chat history.
4. Do not create a second active standards repo or write new canonical records into `projects/agentic-os-development`.
5. Prefer canonical template surfaces under `projects/agenticos/.meta/templates/` and `projects/agenticos/.meta/standard-kit/` over ad hoc local template copies.

## Directory Structure

| Path | Purpose |
|------|---------|
| `.project.yaml` | Standards area metadata |
| `.context/quick-start.md` | Human-readable entry status for this standards area |
| `.context/state.yaml` | Structured current state and working memory |
| `knowledge/` | Canonical standards reasoning, design history, and execution reports |
| `archive/` | Retired standalone standards snapshots kept only for provenance |
| `changelog.md` | Historical change log carried forward from the standalone phase |
