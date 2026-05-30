# Changelog

All notable changes to the AgenticOS product source are documented in this
file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- bootstrap/docs: Claude Code MCP registration examples and recovery commands
  now place the `agenticos` server name before options, matching Claude Code
  CLI 2.1.x argument parsing and avoiding `missing required argument
  'commandOrUrl'` during install or repair (#493, #494).

## [0.4.32] — 2026-05-28

### Added
- source-control: `git_versioned` is now the canonical topology for Git-backed projects, with a provider-aware `source_control.repository` contract for GitHub, GitLab, Gitee, and generic Git remotes (#490).
- standards: documented the host-neutral AgenticOS Git-backed development workflow, including issue-first worktrees, preflight/edit-guard gates, PR/MR evidence, merge-commit rollback, and current host-provider limits (#490).

### Changed
- compatibility: legacy `github_versioned`, `github_repo`, and `github_flow` metadata continue to resolve while new project initialization and normalization can emit the generic Git-backed contract (#490).
- guardrails: branch bootstrap, preflight, edit guard, save validation, project resolution, and standard-kit templates now use Git-backed project semantics instead of assuming GitHub-only metadata (#490).
- standards: design and review documentation now require install, upgrade, migration, compatibility, rollback, and operator runbook analysis before implementation (#489).

## [0.4.31] — 2026-05-24

### Added
- bootstrap: managed AgenticOS activation Skill is now installed for Gemini CLI at `~/.gemini/skills/agenticos/SKILL.md` via the same `--install-skills` / `--force-skills` flow already shipped for Codex, Claude Code, and Cursor (#483 Phase 1).

### Changed
- bootstrap matrix: Gemini CLI now declares an official `activation_skill` block and updated routing-debug guidance instead of stating Skill install is unsupported.
- docs/Homebrew caveats: Gemini CLI is included in activation-skill install guidance alongside Codex, Claude Code, and Cursor.
- guardrails: `agenticos_switch` and `agenticos_save` accept optional worktree `repo_path` / `project_path` binding so session git operations stay on the active issue worktree instead of the managed registry checkout (#482).
- guardrails: `agenticos_pr_scope_check` resolves runtime review comparison roots against external worktrees via managed project fallback (#482).
- release: Homebrew tap bump is skipped with an explicit workflow notice when `HOMEBREW_TAP_PAT` is unset; source formula sync still runs (#438).

## [0.4.30] — 2026-05-24

### Added
- bootstrap/docs: Cursor activation Skill and project-rule parity are now documented alongside Codex and Claude Code, including Homebrew caveats, `agenticos-bootstrap --agent cursor --install-skills`, and the managed project rule at `.cursor/rules/agenticos.mdc` (#480 Phase 3).
- standard-kit: Cursor project-rule adopt/upgrade/conformance is handled through a dedicated bridge so standard-kit core stays unchanged while still creating and validating `.cursor/rules/agenticos.mdc`.

### Changed
- bootstrap matrix: Cursor now declares an official `activation_skill` block and updated routing-debug guidance instead of stating Skill install is unsupported.
- standard-kit manifest: Cursor project rule remains required for adoption/conformance but is generated outside the AGENTS/CLAUDE generated-files loop to avoid mis-rendering adapter content.

## [0.4.29] — 2026-05-24

### Added
- standard-kit: managed Cursor project rule is now generated at `.cursor/rules/agenticos.mdc` with `alwaysApply: true`, sha256-managed template versioning, and the same canonical guardrail/recording/session-start policy as `AGENTS.md` and `CLAUDE.md` (#480 Phase 2).
- init: new projects receive the Cursor adapter rule during `agenticos_init`, alongside the existing Claude and Codex adapter surfaces.
- conformance: standard-kit adapter checks now validate the Cursor adapter surface and required Cursor runtime guidance.

## [0.4.28] — 2026-05-23

### Added
- bootstrap: managed AgenticOS activation Skill is now installed for Cursor at `~/.cursor/skills-cursor/agenticos/SKILL.md` via the same `--install-skills` / `--force-skills` flow already shipped for Codex and Claude Code. The Skill body is rendered from the single canonical template and sha256-guarded, so Codex, Claude Code, and Cursor share one drift-tracked routing contract (#480 Phase 1, follow-up to #432/#434).
- bootstrap: `--verify` now reports `OK cursor-skill: Skill state: current ...` for Cursor instead of `SKIP cursor-skill: unsupported`, closing the activation-Skill coverage gap left open when #432 landed for Codex/Claude Code only.

## [0.4.27] — 2026-05-22

### Fixed
- bootstrap: generated AgenticOS activation Skills now start with YAML frontmatter so Codex can load them, while legacy managed copies with pre-frontmatter comments are upgraded automatically.

## [0.4.26] — 2026-05-22

### Added
- mcp-server: Hermes Discord worker dispatch helper can now start a routed Codex or Claude Code worker from an AgenticOS project thread, record backend/session/process metadata, and post startup or blocked status back to the Discord thread.
- mcp-server: fake E2E smoke coverage now validates the Discord project-thread path from user command through AgenticOS project ensure, Discord thread binding, worker selection, and thread progress.
- docs: Hermes Discord project-thread rollout guidance now documents optional setup, Homebrew verification, Discord-only MVP behavior, Codex default backend, and manual smoke expectations.

### Changed
- docs: Hermes/Discord routing guidance now explicitly treats topic and source projects as one AgenticOS project-entry operation before thread routing.

## [0.4.25] — 2026-05-21

### Added
- bootstrap: managed AgenticOS activation Skills can now be installed for Codex and Claude Code with `agenticos-bootstrap --install-skills`; `--first-run` installs them by default for supported agents.
- bootstrap: `--force-skills` explicitly overwrites user-modified AgenticOS Skill files, while normal installs update only missing or AgenticOS-managed stale copies.
- config audit: AgenticOS activation Skill state is now reported alongside MCP registration and cwd guidance hook state.

### Changed
- docs: Homebrew, bootstrap matrix, and README guidance now document the GBrain/Hermes-style split where Skills provide pre-tool routing and MCP remains the source of truth for project switching, status, and workdir guidance.

## [0.4.24] — 2026-05-20

### Fixed
- mcp-server: `agenticos_switch` now validates the registered project path before binding session context, so stale or missing paths fail closed instead of producing a successful switch.
- mcp-server: path validation now rejects control characters and uses path-aware containment checks for `AGENTICOS_HOME` instead of raw prefix matching.
- mcp-server: Claude Code cwd guidance now shell-quotes project paths and suppresses unsafe hook output for control-character paths.

### Changed
- mcp-server: switch output now describes the project path as the recommended explicit workdir for tool calls and clarifies that MCP output cannot mutate the client shell PWD.
- bootstrap: `--verify` now checks the Claude Code cwd guidance hook and reports recovery commands when the hook is missing.

## [0.4.23] — 2026-05-20

### Added
- mcp-server: Claude Code PWD guidance hook binary `agenticos-claude-pwd-hook` now ships with the package and can be auto-configured by bootstrap.
- mcp-server: project status now reads runtime bootstrap state from `${AGENTICOS_HOME}/.agent-workspace/bootstrap-state.yaml` before falling back to legacy project-local state.
- ci: release workflow now publishes `agenticos-mcp.tgz` and performs Homebrew formula synchronization from the tag release flow.

### Fixed
- mcp-server: Claude Code hook setup no longer relies on a brittle inline shell snippet and now parses Claude `PostToolUse` input in TypeScript.
- mcp-server: Codex and shell PWD alignment guidance now shell-quotes project paths, including paths with spaces, quotes, semicolons, and command substitutions.
- mcp-server: bootstrap guidance uses the correct `--agent claude-code` option and documents that Claude hooks provide cwd guidance rather than mutating the parent shell.
- release: Homebrew bump automation now uses a single pinned action path, checks out the source repository before syncing the source formula, rewrites both current and legacy tarball URL shapes, and pushes the source formula sync commit.

### Changed
- docs: PWD alignment and Homebrew distribution guidance now reflect the installed hook binary, stable release artifact name, and pinned Homebrew bump action.

## [0.4.5] — 2026-04-21

### Fixed
- standard-kit: template marker version registry corrected (v10 to v11 for AGENTS.md and CLAUDE.md), enabling `agenticos_standard_kit_upgrade_check` to detect content drift accurately
- standard-kit: legacy `.meta/agent-guide.md` and `.meta/rules.md` retired with legacy banners, eliminating conflicts with the canonical standard-kit
- standard-kit: `tools/audit-product-root-shell.sh` stub created, removing dead-end documentation references
- mcp-server: `agenticos_switch` now has 14 tests covering explicit selection, session binding, registry fallback, missing/invalid/archived projects
- mcp-server: all `any`-typed YAML parsing replaced with typed `ProjectYamlSchema` and `StateYamlSchema` interfaces across 6 files

### Added
- mcp-server: `preflight` actively enforces `structural_move` — detects renamed files via `git diff --name-status --diff-filter=R`; blocks if undeclared, executes gate commands if declared
- mcp-server: `edit_guard` post-edit scope advisory — logs files outside `declared_target_files` as recovery_action warnings
- mcp-server: `resolveProjectTarget()` canonical unified function in `repo-boundary.ts`, eliminating ~120 duplicate lines in `guardrail-evidence.ts`
- mcp-server: new `version_freshness` health gate — compares installed npm version vs source checkout; WARN in dev mode, BLOCK if stale
- standard-kit: template version markers (`<!-- agenticos-template: v1 -->`) added to all 8 copied templates
- standard-kit: `standards/knowledge/README.md` index of all 96 knowledge files with LIVE/SPEC/SUPERSEDED markers
- docs: mcp-server/README.md rewritten with user value proposition, "Your First Project" tutorial, Troubleshooting (4 failure modes), FAQ (3 questions)
- docs: CHANGELOG.md filled for versions 0.2.2, 0.3.0, and 0.4.0

### Changed
- architecture: root-Git exit complete — `projects/agenticos/` is now the sole canonical product source; workspace root has only pointer docs

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
