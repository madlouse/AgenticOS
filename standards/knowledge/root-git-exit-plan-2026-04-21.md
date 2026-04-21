# Root-Git Exit Plan — Issue #311

**Date:** 2026-04-21
**Status:** Planned, not yet executed
**Root:** `/Users/jeking/dev/AgenticOS` (not a git repo)
**Canonical repo:** `/Users/jeking/dev/AgenticOS/projects/agenticos/` (git repo)

---

## Problem Statement

Root simultaneously served three roles: workspace home, product source, and git repo. The git repo is now correctly inside `projects/agenticos/`, but stale product-source duplicates remain at root. Root must become purely workspace home.

---

## Audit: Root Items Outside Protected Zones

Protected zones (untouched): `projects/agenticos/`, `.claude/`, `.runtime/`, `worktrees/`

| Item | Classification | Action |
|------|---------------|--------|
| `.agent-workspace/` | workspace-home | KEEP |
| `.github/` | product-source (GitHub infra) | MERGE → repo, then DELETE |
| `.gitignore` | product-source (root-level ignore) | MERGE additions → repo `.gitignore`, then DELETE |
| `AGENTS.md` | product-source (stale duplicate) | DELETE |
| `CLAUDE.md` | product-source (stale duplicate) | DELETE |
| `README.md` | product-source (stale duplicate) | DELETE |
| `CHANGELOG.md` | product-source (stale duplicate) | DELETE |
| `CONTRIBUTING.md` | product-source (stale duplicate) | DELETE |
| `ROADMAP.md` | product-source (stale duplicate) | DELETE |
| `LICENSE` | product-source (stale duplicate) | DELETE |
| `mcp-server/` | product-source (build artifacts only, no source) | DELETE |
| `scripts/` | product-source (identical to repo) | DELETE |
| `tools/` | product-source (subset of repo — repo is superset) | DELETE |
| `runtime-backups/` | workspace-home | KEEP |
| `.private/` | workspace-home (gitignored) | KEEP |
| `.DS_Store` | workspace-home (gitignored) | KEEP |
| `projects/` | multi-project workspace | KEEP |

---

## Detailed Divergence Analysis

### `.github/`
Root has: `ISSUE_TEMPLATE/`, `pull_request_template.md`, `workflows/`
Repo has: same structure
**Decision:** Merge root's additions into repo first; root `.github/` is then redundant.

### `mcp-server/`
Root: `build/`, `node_modules/` only (no source)
Repo: full TypeScript project with `src/`, `package.json`, `tsconfig.json`, etc.
**Decision:** Delete root `mcp-server/` — it's just build artifacts, not source. Source lives in `projects/agenticos/mcp-server/`.

### `scripts/`
Root and repo are identical (same files, same content).
**Decision:** Delete root `scripts/` — repo is the canonical source.

### `tools/`
Root: `check-edit-boundary.sh`, `record-reminder.sh`
Repo: those two + `audit-*.sh`, `verify-workspace-separation.sh`
**Decision:** Repo is superset. Delete root `tools/` after copying `record-reminder.sh` if it's not identical (verify with diff).

---

## Migration Sequence

### Phase 1 — Audit (DONE)
- Listed all root items outside protected zones
- Compared all overlapping directories between root and repo
- Root's duplicates are stale; repo is canonical for all product-source items

### Phase 2 — Merge GitHub infra (REQUIRED FIRST)
1. Diff root `.github/workflows/` vs repo `.github/workflows/` — copy any root-unique workflows into repo
2. Merge root `.gitignore` additions into `projects/agenticos/.gitignore` (add projects/ entries that aren't already present)
3. Commit these merges in the repo first

### Phase 3 — Delete stale duplicates (after Phase 2)
1. `rm -rf /Users/jeking/dev/AgenticOS/mcp-server/`
2. `rm -rf /Users/jeking/dev/AgenticOS/scripts/`
3. `rm -rf /Users/jeking/dev/AgenticOS/tools/`
4. `rm /Users/jeking/dev/AgenticOS/AGENTS.md /Users/jeking/dev/AgenticOS/CLAUDE.md /Users/jeking/dev/AgenticOS/README.md /Users/jeking/dev/AgenticOS/CHANGELOG.md /Users/jeking/dev/AgenticOS/CONTRIBUTING.md /Users/jeking/dev/AgenticOS/ROADMAP.md /Users/jeking/dev/AgenticOS/LICENSE`
5. `rm /Users/jeking/dev/AgenticOS/.gitignore`
6. `rm -rf /Users/jeking/dev/AgenticOS/.github/`

### Phase 4 — Workspace entry surfaces (after Phase 3)
Replace deleted product-source files with lightweight workspace pointers:
- **AGENTS.md (workspace):** One-paragraph pointer: "AgenticOS product docs are at `projects/agenticos/AGENTS.md`"
- **CLAUDE.md (workspace):** Minimal — workspace-level guidance only (AGENTICOS_HOME, project switching), no product workflow
- **README.md (workspace):** Install + workspace setup instructions only

---

## Risks

1. **Reference breaking:** Any external tool or config pointing to root-level product files (e.g., `~/dev/AgenticOS/AGENTS.md`) will break. Mitigated by Phase 4 pointer docs.
2. **`.github/` divergence:** Root workflows not present in repo will be lost unless captured in Phase 2.
3. **Hardcoded paths:** Any `AGENTICOS_HOME` config referencing root paths needs updating.
4. **Worktree references:** Worktrees inside `projects/agenticos/` are unaffected; they are inside the git repo.

---

## Verification

After Phase 4:
```bash
# Root is no longer a git repo (already true) and has no product source
ls /Users/jeking/dev/AgenticOS/
# Expected: .agent-workspace/ .claude/ .private/ projects/ runtime-backups/ worktrees/
# Plus: AGENTS.md CLAUDE.md README.md (workspace pointers only)
# NOT expected: .github/ .gitignore AGENTS.md CLAUDE.md README.md CHANGELOG.md CONTRIBUTING.md ROADMAP.md LICENSE mcp-server/ scripts/ tools/

# Repo is still the canonical product source
ls /Users/jeking/dev/AgenticOS/projects/agenticos/
# Expected: full product source including .git/ AGENTS.md CLAUDE.md README.md mcp-server/ scripts/ tools/ .github/ .gitignore etc.
```