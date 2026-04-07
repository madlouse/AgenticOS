# Issue #212 — Canonical Main Write Guard

## Goal

Prevent canonical `main` checkouts from receiving runtime persistence writes.

## Scope

- add a shared canonical-main write-protection helper
- block guardrail evidence persistence into canonical `main`
- block registry writes when `AGENTICOS_HOME` resolves to canonical `main`

## Validation

- `cd projects/agenticos/mcp-server && npm run lint`
- `cd projects/agenticos/mcp-server && npx vitest run src/utils/__tests__/canonical-main-guard.test.ts src/utils/__tests__/guardrail-evidence.test.ts src/utils/__tests__/registry.test.ts`
