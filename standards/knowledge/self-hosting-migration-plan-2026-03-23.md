# AgenticOS Self-Hosting Migration Plan

> Date: 2026-03-23
> Purpose: define a concrete migration path if AgenticOS adopts the self-hosting workspace model

## 1. Migration Goal

Adopt the self-hosting model by changing roles as follows:

- current top-level `AgenticOS` directory becomes the **workspace home**
- the AgenticOS product source becomes a managed project under `projects/agenticos`
- `agentic-os-development` stops being a sibling runtime project and becomes the standards area inside the AgenticOS product project

## 2. Target Structure

```text
~/AgenticOS/
  .agent-workspace/
  .runtime/
    worktrees/
    caches/
  projects/
    agenticos/
      .git/
      standards/
      mcp-server/
      homebrew-tap/
      .github/
      .meta/
      tools/
      README.md
      AGENTS.md
      CLAUDE.md
      CONTRIBUTING.md
      CHANGELOG.md
      ROADMAP.md
    360teams/
    2026okr/
    agentic-devops/
    ghostty-optimization/
    okr-management/
    t5t/
```

## 3. Main Structural Decisions

### Product project name

Use:
- `projects/agenticos`

Reason:
- aligns with the product name
- avoids overloading `agentic-os-development`
- makes the main product project obviously canonical

### Standards location

Absorb current `projects/agentic-os-development` into:
- `projects/agenticos/standards/`

This keeps:
- one main product project
- one standards area inside it

### Runtime location

Move temporary runtime artifacts under:
- `.runtime/worktrees/`
- `.runtime/caches/`

This avoids mixing them with reusable agent command/config assets.

## 4. Migration Phases

### Phase 1: Freeze the target model

Outputs:
- approved target structure
- approved naming
- approved treatment of `agentic-os-development`
- approved runtime path rules

No physical moves yet.

### Phase 2: Prepare product project relocation

Tasks:
- choose the future canonical repo root inside `projects/agenticos`
- identify all root-relative paths in CI, docs, release scripts, and formulas
- identify all references to `projects/agentic-os-development`
- identify all references to `.claude/worktrees`

Outputs:
- relocation checklist
- path rewrite checklist

### Phase 3: Move standards into the product project

Tasks:
- move `projects/agentic-os-development` content into `projects/agenticos/standards/`
- preserve history carefully if desired
- update references in docs and templates

Outputs:
- one main product project with an internal standards area

### Phase 4: Relocate product source

Tasks:
- move current root product source content into `projects/agenticos/`
- ensure Git history is preserved in the product project
- update CI/release/Homebrew/docs paths

Outputs:
- top-level root no longer acts as product source repo

### Phase 5: Convert top-level root into workspace home

Tasks:
- keep workspace metadata at top level
- keep runtime state in `.runtime/`
- ensure `projects/*` are managed project directories

Outputs:
- root is now clearly a workspace, not a mixed source/runtime tree

### Phase 6: Extract or reclassify remaining tracked runtime projects

Tasks:
- keep actual runtime projects under `projects/`
- decide which are fixtures/examples versus real managed projects
- ensure source-only content no longer lives at root

## 5. Path Rewrite Scope

The following path families will need updates:

- CI workflow paths under `.github/workflows`
- Homebrew formula references
- README and install documentation
- AGENTS and CLAUDE references to standards files
- release and build commands
- any scripts assuming root contains `mcp-server` directly

## 6. Git Strategy

This migration should not be done as one blind file move.

Recommended Git strategy:

1. finalize target model
2. create a dedicated migration issue/branch
3. move standards first
4. update references
5. move product source
6. verify CI/docs/build/release paths
7. only then declare self-hosting active

## 7. Verification Requirements

Before the migration is considered complete:

- the main AgenticOS product project can still build
- MCP server paths still work
- Homebrew docs and formulas still point to valid locations
- agent startup docs still point to valid standards files
- runtime worktrees are no longer treated as canonical source
- the root workspace role is unambiguous

## 8. Rollback Principle

Each migration phase should be reversible.

Do not combine:
- standards relocation
- product source relocation
- runtime relocation

into one irreversible step.

## 9. Recommended Next Action

Create a dedicated execution issue for self-hosting migration planning and sequencing.
