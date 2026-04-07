# AgenticOS Root Git Dependency Inventory

> Date: 2026-04-07
> Issue: #200
> Purpose: enumerate what still depends on the AgenticOS workspace home also being a Git repository, before removing the root-level `.git`

## 1. Decision Boundary

The target model is already fixed:

- the enclosing `AgenticOS/` directory remains the workspace home
- the workspace home should eventually stop being a Git repository
- concrete Git/versioned behavior should attach to child projects, especially `projects/agenticos`

This inventory asks a narrower question:

what still breaks or becomes ambiguous if the root-level `.git` disappears?

## 2. Blocker Categories

The remaining dependencies fall into five categories:

1. repository-root automation
2. root-level compatibility entrypoints
3. root-scoped operator and documentation contracts
4. local absolute-path assumptions
5. external local agent configuration coupling

These categories are small enough to drive implementation slices.

## 3. Repository-Root Automation

These files are coupled to the current repository root because GitHub discovers them at repo root.

### Evidence

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `.github/ISSUE_TEMPLATE/*`
- `.github/pull_request_template.md`

### Why this blocks root Git removal

If the workspace home stops being the Git repository root, these paths cannot remain attached to the enclosing workspace.

GitHub Actions and issue/PR templates belong to the actual product repository.

### Destination / handling rule

- move product-repository ownership to the concrete product source project
- in practice, these files must live at the Git root of the final `projects/agenticos` repository
- they are not workspace-home assets

## 4. Root-Level Compatibility Entrypoints

These files exist at workspace root only to preserve compatibility with older expectations.

### Evidence

- `tools/check-edit-boundary.sh`
- `tools/record-reminder.sh`
- root `AGENTS.md`
- root `CLAUDE.md`

Specific proof:

- `tools/check-edit-boundary.sh` delegates to `../projects/agenticos/tools/check-edit-boundary.sh`
- `README.md` explicitly says the root keeps a legacy-compatible `tools/record-reminder.sh` path

### Why this blocks root Git removal

These are currently root-level shim surfaces, not true workspace-home data.

As long as callers still assume these root paths exist, the enclosing workspace root keeps behaving like a product repository shell.

### Destination / handling rule

- migrate callers to project-scoped paths under `projects/agenticos`
- keep temporary shims only for bounded compatibility windows
- remove root shims once callers no longer depend on them

## 5. Root-Scoped Operator and Documentation Contracts

A large body of guidance still describes the enclosing root as if it were the trusted product checkout.

### Evidence

- `README.md`
- `CONTRIBUTING.md`
- root `AGENTS.md`
- canonical sync contracts under `projects/agenticos/standards/knowledge/`

Concrete examples:

- `CONTRIBUTING.md` says to resync `/Users/jeking/dev/AgenticOS`
- `README.md` still contains the sentence about keeping source checkout separate from live `AGENTICOS_HOME`
- `README.md` still documents root-level hook wrapper usage
- canonical sync docs still treat `/Users/jeking/dev/AgenticOS` as the trusted local checkout

### Why this blocks root Git removal

Operator guidance still treats the enclosing root as the trusted product repository.

Even if the filesystem is migrated, the operating model remains wrong until these instructions are rewritten.

### Destination / handling rule

- rewrite operator docs to distinguish:
  - workspace home
  - product project repository
  - installed runtime
- replace root-checkout assumptions with product-project assumptions
- rewrite canonical sync around the future `projects/agenticos` repo root

## 6. Local Absolute-Path Assumptions

Some files still hardcode local paths under the current workspace-root layout.

### Evidence

- `CONTRIBUTING.md` references `/Users/jeking/dev/AgenticOS`
- `projects/agenticos/standards/knowledge/canonical-sync-contract-2026-03-25.md` references `/Users/jeking/dev/AgenticOS`
- `projects/360teams/skills/t5t/collect_messages.py` uses `/Users/jeking/dev/AgenticOS/projects/t5t`
- `projects/360teams/skills/t5t/aggregate_messages.py` uses `/Users/jeking/dev/AgenticOS/projects/t5t`

### Why this blocks root Git removal

These paths will drift or break once the workspace home and product repository are no longer the same root.

### Destination / handling rule

- replace hardcoded absolute paths with:
  - `AGENTICOS_HOME`
  - project metadata
  - explicit runtime arguments
- keep path assumptions out of canonical product behavior

## 7. External Local Agent Configuration Coupling

The current machine still has local agent configs that reference the workspace or source checkout directly.

### Evidence

- `~/.codex/config.toml`
- `~/.cursor/mcp.json`
- `~/.claude/settings.json`

### Why this blocks root Git removal

This does not block repository migration by itself, but it does block a safe cutover if the configs are not deliberately repointed.

It is an operational dependency, not a source dependency.

### Destination / handling rule

- treat local agent configs as migration consumers
- update them only after the final workspace-home path and product-repo path are settled
- keep this as a runbook item, not as canonical product source

## 8. Non-Blockers

These are not primary blockers to removing root Git:

- ordinary child projects under `projects/*`
- local-only project content itself
- the distinction between `github_versioned` and `local_directory_only`

Those are already child-project concerns and do not require the workspace home itself to be Git-backed.

## 9. Implementation Slices Suggested by the Inventory

This inventory suggests four follow-up slices:

1. product-repo automation relocation
   - `.github/`
   - release/CI assumptions

2. compatibility shim retirement
   - root `tools/*`
   - root `AGENTS.md`
   - root `CLAUDE.md`

3. operator contract rewrite
   - `README.md`
   - `CONTRIBUTING.md`
   - canonical sync docs

4. absolute-path cleanup
   - hardcoded `/Users/jeking/dev/AgenticOS/...` references
   - project-specific local scripts

## 10. Final Judgment

Removing root Git is no longer blocked by project topology confusion.

It is now blocked by a much narrower set of concrete dependencies:

- root-scoped GitHub automation
- temporary root compatibility shims
- docs that still describe the enclosing root as the product checkout
- hardcoded absolute paths
- local agent config cutover steps

That is a tractable migration surface.
