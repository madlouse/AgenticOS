# AgenticOS Phase 2 Path Relocation Checklist

> Date: 2026-03-23
> Purpose: enumerate the concrete path moves and reference rewrites needed for the self-hosting migration

## 1. Phase 2 Objective

Prepare the self-hosting migration by freezing:
- which current root paths move into `projects/agenticos`
- which current standards paths move into `projects/agenticos/standards`
- which root paths remain at workspace level
- which references must be rewritten afterward

This phase is still planning.
It does not execute the file moves yet.

## 2. Root-Level Path Classification

### Move into `projects/agenticos`

These are current product-source paths and should become part of the canonical managed product project:

| Current Path | Target Path |
|--------------|-------------|
| `mcp-server/` | `projects/agenticos/mcp-server/` |
| `homebrew-tap/` | `projects/agenticos/homebrew-tap/` |
| `.meta/` | `projects/agenticos/.meta/` |
| `tools/` | `projects/agenticos/tools/` |
| `README.md` | `projects/agenticos/README.md` |
| `AGENTS.md` | `projects/agenticos/AGENTS.md` |
| `CLAUDE.md` | `projects/agenticos/CLAUDE.md` |
| `CONTRIBUTING.md` | `projects/agenticos/CONTRIBUTING.md` |
| `CHANGELOG.md` | `projects/agenticos/CHANGELOG.md` |
| `ROADMAP.md` | `projects/agenticos/ROADMAP.md` |
| `LICENSE` | `projects/agenticos/LICENSE` |

### Split rather than move directly

These paths need role separation rather than a blind move:

| Current Path | Action |
|--------------|--------|
| `.gitignore` | split into workspace-level ignore and product-project ignore |
| `.claude/` | split commands/config assets vs runtime worktrees |
| `.github/` | remain at repository root; rewrite workflow working directories to `projects/agenticos/` |

Recommended split:
- `.claude/commands/` -> `projects/agenticos/.claude/commands/`
- `.claude/worktrees/` -> `.runtime/worktrees/`

### Remain at workspace root

These belong to the workspace role:

| Path | Reason |
|------|--------|
| `.agent-workspace/` | workspace metadata |
| `projects/` | managed project container |
| `.runtime/` | runtime-only state root |

## 3. Standards Relocation Map

Current standards project:
- `projects/agentic-os-development/`

Target standards area:
- `projects/agenticos/standards/`

Recommended subtree mapping:

| Current Path | Target Path |
|--------------|-------------|
| `projects/agentic-os-development/.project.yaml` | `projects/agenticos/standards/.project.yaml` |
| `projects/agentic-os-development/.context/` | `projects/agenticos/standards/.context/` |
| `projects/agentic-os-development/knowledge/` | `projects/agenticos/standards/knowledge/` |
| `projects/agentic-os-development/tasks/` | `projects/agenticos/standards/tasks/` |
| `projects/agentic-os-development/artifacts/` | `projects/agenticos/standards/artifacts/` |
| `projects/agentic-os-development/AGENTS.md` | `projects/agenticos/standards/AGENTS.md` |
| `projects/agentic-os-development/CLAUDE.md` | `projects/agenticos/standards/CLAUDE.md` |
| `projects/agentic-os-development/changelog.md` | `projects/agenticos/standards/changelog.md` |

## 4. Existing Runtime Projects

These should remain managed projects under the workspace and are **not** the main migration target:

- `projects/2026okr`
- `projects/360teams`
- `projects/agentic-devops`
- `projects/ghostty-optimization`
- `projects/okr-management`
- `projects/t5t`

Still undecided:
- `projects/test-project`

## 5. Reference Rewrite Inventory

The following files already contain path assumptions that will break after relocation.

### Product root docs and instructions

- `AGENTS.md`
- `CLAUDE.md`
- `CONTRIBUTING.md`
- `README.md`

### Build, release, and packaging paths

- `.github/workflows/*`
- `homebrew-tap/Formula/agenticos.rb`

Execution correction:
- `.github/workflows/*` remain at repository root
- workflow `working-directory` values must point into `projects/agenticos/`

### Standards references

Current root files reference:
- `projects/agentic-os-development/knowledge/...`

These will need to point to the new standards location under:
- `projects/agenticos/standards/...`

### Product implementation references

Current root files reference:
- `mcp-server/...`
- `homebrew-tap/...`
- `.meta/...`
- `tools/...`

These will need to point to:
- `projects/agenticos/mcp-server/...`
- `projects/agenticos/homebrew-tap/...`
- `projects/agenticos/.meta/...`
- `projects/agenticos/tools/...`

## 6. Git and Repository Boundary Questions

Before physical moves happen, these must be answered explicitly:

1. Will the current Git history be preserved inside `projects/agenticos`?
2. Will the top-level workspace root itself remain under Git?
3. If the root remains under Git temporarily, what is tracked there after the product repo is relocated?

These are execution-phase decisions, but they must be answered before actual relocation.

## 7. Verification Checklist After Relocation

After the moves, verify:

- main product build commands still work
- CI workflow paths still resolve
- Homebrew references still resolve
- AGENTS and CLAUDE docs point to valid paths
- standards content is reachable under `projects/agenticos/standards`
- runtime worktrees are no longer treated as canonical source
- other runtime projects remain intact

## 8. Immediate Next Action

Use this checklist to produce the first execution-facing move plan:
- exact move order
- exact path rewrite order
- exact verification commands after each step
