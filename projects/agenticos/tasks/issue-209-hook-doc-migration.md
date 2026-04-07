# Issue #209 — Hook Doc Migration

## Goal

Make installed-runtime hook commands the recommended entrypoints in docs.

## Scope

- update root README
- update root AGENTS
- update `projects/agenticos/mcp-server/README.md`

## Validation

- `rg -n "agenticos-edit-guard|agenticos-record-reminder|legacy compatibility" README.md AGENTS.md projects/agenticos/mcp-server/README.md`
