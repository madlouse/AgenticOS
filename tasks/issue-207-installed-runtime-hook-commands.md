# Issue #207 — Installed Runtime Hook Commands

## Goal

Add installed-runtime hook commands so root-level compatibility scripts are no longer the only callable surfaces.

## Scope

- expose `agenticos-edit-guard`
- expose `agenticos-record-reminder`
- add unit coverage for both command behaviors

## Validation

- `cd projects/agenticos/mcp-server && npm run lint`
- `cd projects/agenticos/mcp-server && npm test`
