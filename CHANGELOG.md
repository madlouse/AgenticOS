# Changelog

All notable changes to the AgenticOS product source are documented in this
file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_No unreleased changes._

## [0.4.4] — 2026-04-19

### Fixed
- installed/runtime AgenticOS now includes the merged `private_continuity`
  tracked-save behavior from `#244` / PR `#270`, so Git-backed private projects
  can persist their tracked continuity surface instead of falling back to the
  older narrow runtime-only save behavior
- installed/runtime AgenticOS now includes the merged `public_distilled`
  transcript-isolation behavior from `#245` / PR `#278`, so raw transcripts no
  longer rely on tracked public conversation paths in the shipped runtime
- Homebrew formula metadata is now aligned with the shipped release artifact
  instead of pointing at the stale `v0.4.2` package

### Changed
- release artifact packaging is now prepared from `0.4.4`, which is the first
  shipped version expected to carry the post-`0.4.3` continuity and transcript
  behavior already merged on `main`

## [0.4.3] — 2026-04-10

### Fixed
- Homebrew-installed runtime now includes the merged `#260` and `#262`
  project-resolution fixes, so runtime command resolution no longer depends on
  a home-global authoritative `registry.active_project`
- explicit project selection, session-bound project tools, and guardrail
  `repo_path` proof are no longer vetoed by unrelated cross-project current
  selection drift in the installed runtime
- registry business-path writes now use patch-based locked atomic updates on
  the shipped runtime paths, which reduces cross-session metadata replay and
  stale full-registry overwrite risk

### Changed
- `agenticos_switch` now binds the current MCP session instead of mutating a
  home-global runtime current-project selector
- generated `AGENTS.md` and `CLAUDE.md` guidance now describes session-local
  project alignment instead of a shared active-project model

## [0.4.2] — 2026-04-09

### Fixed
- Homebrew-installed runtime now includes the canonical context alignment
  changes, so self-hosting AgenticOS surfaces honor configured
  `agent_context` paths instead of rendering root `.context/*` as the primary
  operational entry
- generated `AGENTS.md` and `CLAUDE.md` adapter surfaces now ship with truthful
  `standards/.context/*` navigation for the self-hosting product project

## [0.4.0] — 2026-04-06

### Added
- task intake rule: codified operator-intent recovery before treating named
  methods or workflow fragments as the full plan
- standard-kit adoption and upgrade-check tooling for downstream projects
- distilled conversation surface with configurable truncation
- `distill.ts` utility improvements: stronger truncation, word-boundary respect,
  ellipsis placement

### Changed
- Homebrew formula updated to reflect new release artifact layout and artifact
  naming conventions
- standard-kit manifest updated with revised inheritance rules
- template and documentation improvements across `issue-design-brief.md` and
  Homebrew README

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

## [0.2.2] — 2026-04-01

### Changed
- Homebrew formula now provisions a workspace in `post_install` for a smoother
  first-run experience; no user-facing API changes

## [0.3.0] — 2026-04-01

### Added
- fail-fast `AGENTICOS_HOME` enforcement: AgenticOS now requires an explicit
  `AGENTICOS_HOME` to be set and refuses to operate without it
- `agenticos_edit_guard` tool: fail-closed project boundary enforcement before
  implementation edits
- `agenticos_standard_kit_conformance_check` and
  `agenticos_standard_kit_upgrade_check` tools for downstream project audits
- cross-agent policy freeze: codified boundaries between MCP-native, MCP +
  Skills Assist, CLI Wrapper, and Skills-only guidance modes
- `agenticos_non_code_evaluate` tool: rubric-backed non-code evaluation
- `agenticos_health` command: canonical checkout freshness evaluation
- `agenticos_refresh_entry_surfaces` command: deterministic quick-start and
  state refresh from merged-work inputs
- `agenticos_archive_import_evaluate` tool: archive import classification
- guardrail summary now surfaces in `agenticos_status` and `agenticos_switch`
  output

### Fixed
- `agenticos_pr_scope_check` now correctly preserves literal dots in path
  matching instead of treating them as wildcards

### Changed
- distribution now via GitHub Releases and Homebrew
- narrowed scope: deferred `memory.jsonl` and project-level changelog surfaces

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
