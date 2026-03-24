# Homebrew Post-Install Implementation Report - 2026-03-25

## Scope

Issue `#30` aligns the Homebrew-facing install surfaces to one product contract:

- installation is real
- activation is still manual
- verification is mandatory

## Landed Changes

- updated root `README.md`
- updated `projects/agenticos/homebrew-tap/README.md`
- updated `projects/agenticos/homebrew-tap/Formula/agenticos.rb`
- updated `projects/agenticos/mcp-server/README.md`
- added a Homebrew docs consistency test

## Product Decision

Homebrew is reminder-only today.

It does not silently mutate user Claude Code, Codex, Cursor, or Gemini CLI configuration.

Future opt-in bootstrap helpers may exist later, but default install-time config mutation is out of scope.

## Verification

- `npm install`
- `npm run build`
- `npm test -- --run src/utils/__tests__/bootstrap-matrix.test.ts src/utils/__tests__/homebrew-bootstrap-docs.test.ts`
- targeted coverage for `src/utils/bootstrap-matrix.ts`
- `npm test`
- YAML parsing for standards state
- docs consistency test across root README, tap README, formula, and MCP server README
