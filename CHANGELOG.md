# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_No unreleased changes._

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
