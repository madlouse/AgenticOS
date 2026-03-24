# Integration Mode Matrix Implementation Report - 2026-03-25

## Scope

Issue `#31` lands the product decision about primary and fallback integration modes.

The landed slice includes:

1. a machine-readable integration mode matrix
2. a parser and tests
3. README / MCP README / ROADMAP alignment

## Product Decision

- `MCP-native` is the canonical primary mode
- `MCP + Skills Assist` is the supported fallback
- `CLI Wrapper` is a limited operator fallback
- `Skills-only Guidance` is experimental

## Verification

- `npm install`
- `npm run build`
- `npm test -- --run src/utils/__tests__/integration-matrix.test.ts src/utils/__tests__/integration-mode-docs.test.ts`
- targeted coverage for `src/utils/integration-matrix.ts`
- `npm test`
- README / MCP README / ROADMAP consistency through the docs test
