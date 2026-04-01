# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_No unreleased changes._

## [0.3.1] — 2026-04-01

### Added
- **360Teams Todo CLI** (`projects/360teams/clis/360teams/todo.js`): CLI commands for managing OA approvals and work-order todos from 360Teams:
  - `opencli 360teams todo list [--limit N]` — list pending todos with status, from, and overtime indicators
  - `opencli 360teams todo view --id N` — view todo detail panel
  - `opencli 360teams todo approve --id N [--comment TEXT]` — approve OA or agree to work order
  - `opencli 360teams todo reject --id N [--comment TEXT]` — reject OA or dismiss work order
  - `opencli 360teams todo forward --id N --to PERSON [--comment TEXT]` — forward OA to another approver
  - `opencli 360teams todo assign --id N --to PERSON [--comment TEXT]` — assign work order to another person
- `knowledge/cdp-patterns.md` — CDP webview V8 constraint documentation (Electron webview rejects `const`/`let`/arrow functions in `page.evaluate()` strings)
- Unit tests for `todo.js` pure functions (`parseTodoFromText`, `truncate`, `formatWaiting`) — 23 tests

### Fixed
- CDP evaluate strings rewritten to use `var` + `function` + string concatenation for Electron webview V8 compatibility
- Navigation validation: `navigateToTodo` now throws on failure instead of silently continuing on wrong page
- Confirm dialog: `handleConfirmDialog` removed blind fallback click (only explicit confirm labels)
- `performAction` returns `success: false` when confirm dialog does not appear on approve/reject actions
- CDP target selection now validates URL contains `360teams` or `360td` to avoid attaching to unrelated Electron apps

## [0.2.1] — 2026-03-22

### Added
- Unit test suite with 42 passing vitest tests (#19)

### Fixed
- CI: replace `npm ci` with `npm install` to fix lock file sync issues (#21)
- Release workflow: same `npm ci` → `npm install` fix

## [0.2.0] — 2026-03-22

### Added
- Claude Code slash commands: `/develop`, `/review`, `/release`
- `agenticos_record` tool for session recording
- `agenticos_status` tool for project status
- Template versioning with auto-upgrade on project switch
- GitHub Actions CI pipeline (lint, build)
- Open-source development workflow (CONTRIBUTING.md, AGENTS.md)

### Fixed
- Init idempotency: duplicate project detection and handling (#2)
- Save error handling: phased git status reporting (#3)
- Version consistency across package.json, index.ts, formula (#16)

### Changed
- Distribution via GitHub Releases + Homebrew (not npm)
- Narrowed scope: deferred memory.jsonl and changelog.md to future versions

## [0.1.0] — 2026-03-19

### Added
- AgenticOS MCP Server core implementation
- MCP tools: `init`, `switch`, `list`, `save`
- MCP resource: `agenticos://context/current`
- Homebrew tap distribution
- Cross-machine portability support
- `--version` flag
- Knowledge base for AgenticOS development

### Fixed
- Cross-machine path resolution
- Homebrew Formula sha256
