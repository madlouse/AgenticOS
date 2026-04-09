# Changelog

All notable changes to the AgenticOS product source are documented in this
file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_No unreleased changes._

## [0.4.2] — 2026-04-09

### Fixed
- Homebrew-installed runtime now includes the canonical context alignment
  changes, so self-hosting AgenticOS surfaces honor configured
  `agent_context` paths instead of rendering root `.context/*` as the primary
  operational entry
- generated `AGENTS.md` and `CLAUDE.md` adapter surfaces now ship with truthful
  `standards/.context/*` navigation for the self-hosting product project

## [0.4.1] — 2026-04-07

### Fixed
- canonical `main` checkout now refuses runtime guardrail and state writes in
  merged source implementation, which unblocks recovery toward a clean standard
  install and runtime model
- runtime recovery now has executable audit surfaces for detecting temporary
  workspace bindings, install-time drift, and root Git exit blockers before any
  cutover attempt

## [0.2.1] — 2026-04-01

### Fixed
- CI now uses `npm install` instead of `npm ci` where lock-file drift made
  release and verification brittle
- release workflow now matches the same install contract

## [0.2.0] — 2026-03-22

### Added
- Claude Code slash commands: `/develop`, `/review`, `/release`
- `agenticos_record` and `agenticos_status`
- template versioning with auto-upgrade on project switch
- GitHub Actions CI pipeline
- open-source workflow: Issue -> Branch -> PR

### Changed
- distribution via GitHub Releases and Homebrew
- narrowed scope: deferred memory.jsonl and project-level changelog surfaces

## [0.1.0] — 2026-03-19

### Added
- AgenticOS MCP server core implementation
- MCP tools: `init`, `switch`, `list`, `save`
- MCP resource: `agenticos://context/current`
- Homebrew tap distribution
- cross-machine portability support
