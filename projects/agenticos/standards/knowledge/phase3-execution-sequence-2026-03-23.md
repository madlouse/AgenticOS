# AgenticOS Phase 3 Execution Sequence

> Date: 2026-03-23
> Purpose: define the execution order, verification-first checkpoints, and rollback boundaries for self-hosting migration

## 1. Execution Principle

Every migration step must follow this pattern:

1. verify the preconditions
2. perform one bounded change
3. verify immediately
4. stop if verification fails
5. keep rollback local to the step

Do not batch multiple structural moves before verification.

## 2. Global Preconditions

Before Phase 3 starts, verify:

- the target model is frozen
- the path relocation checklist exists
- the current product still builds from the current root
- the current tracked runtime projects are intact
- a clean migration branch/worktree exists
- the current root Git state is snapshotted or otherwise recoverable

Suggested baseline checks:

```bash
git status --short --branch
git rev-parse HEAD
cd mcp-server && npm install && npm run build
```

## 3. Step Order

### Step 1: Prepare runtime root without relocating product source

Change:
- create `.runtime/` semantics and decide runtime subpaths
- ensure `.claude/worktrees/` is treated as runtime-only

Verification:
- `.gitignore` excludes runtime paths
- no canonical docs still describe worktrees as product source

Rollback boundary:
- revert only runtime-path documentation and ignore changes

### Step 2: Relocate standards area first

Change:
- move `projects/agentic-os-development` content into `projects/agenticos/standards/`
- do not move product source root yet

Why first:
- standards references are currently explicit and easier to isolate
- this reduces ambiguity before moving implementation code

Verification:
- standards docs are readable at the new path
- root docs updated to the new standards path still resolve
- no references remain to the old standards path unless intentionally transitional

Suggested verification:

```bash
rg -n "projects/agentic-os-development" .
```

Rollback boundary:
- revert only standards relocation and standards-path rewrites

### Step 3: Move agent command assets

Change:
- move `.claude/commands/` into `projects/agenticos/.claude/commands/`
- keep runtime worktrees separate

Verification:
- agent command docs still exist at the expected product-project path
- no runtime worktrees are accidentally pulled into product source

Rollback boundary:
- revert only command asset relocation

### Step 4: Move product-source directories

Change:
- move `mcp-server/`, `homebrew-tap/`, `.meta/`, and `tools/` into `projects/agenticos/`
- keep `.github/` at repository root and retarget workflows to the relocated product path

Verification:
- product tree structure matches the target layout
- no required product-source directory remains stranded at root unless explicitly transitional

Suggested verification:

```bash
find projects/agenticos -maxdepth 2 -mindepth 1 | sort
```

Rollback boundary:
- revert only product-source directory moves

### Step 5: Rewrite root-relative references

Change:
- update README, AGENTS, CLAUDE, CONTRIBUTING, workflows, formulas, and scripts to the new paths
- preserve root `.github/workflows` while rewriting their working directories and moved-path references

Verification:
- `rg` finds no stale root-relative references for moved paths
- docs point to valid locations
- workflow and formula paths resolve

Suggested verification:

```bash
rg -n "projects/agentic-os-development|mcp-server/|homebrew-tap/|\\.meta/|\\.github/|tools/" .
```

Rollback boundary:
- revert only reference rewrites

### Step 6: Verify product build from new location

Change:
- no new move; this is a verification gate

Verification:

```bash
cd projects/agenticos/mcp-server && npm install && npm run build
```

Also verify:
- release docs still make sense
- Homebrew formula references still point to valid assets

Rollback boundary:
- if build fails, revert the immediately preceding move/rewrite step first

### Step 7: Verify workspace semantics at root

Change:
- confirm the top-level root is now described and treated as workspace home

Verification:
- top-level docs describe workspace role clearly
- `projects/*` semantics are now consistent
- runtime projects remain intact

Suggested verification:

```bash
find projects -maxdepth 1 -mindepth 1 | sort
```

Rollback boundary:
- revert workspace-role documentation if needed without undoing the whole migration

## 4. Verification Priority Rules

### Rule 1

Do not proceed to the next step if the current step is not verified.

### Rule 2

Prefer verification commands that can be re-run cheaply and deterministically.

### Rule 3

When a step changes both structure and references, verify structure first, then references.

### Rule 4

If one verification fails, stop and fix that layer before touching another layer.

## 5. Minimum Verification Matrix

| Step | Required Verification |
|------|------------------------|
| 1 | runtime ignore rules and docs |
| 2 | standards path resolution and stale-reference scan |
| 3 | command asset relocation and runtime separation |
| 4 | expected directory layout under `projects/agenticos` |
| 5 | stale-reference scan and path validity |
| 6 | build verification from relocated product source |
| 7 | workspace-root semantic verification |

## 6. Rollback Strategy

Rollback should be local to the most recent verified step.

Do not respond to a late failure by manually improvising across multiple layers.

Preferred rollback behavior:
- revert last bounded move
- rerun verification
- only continue when green again

## 7. Immediate Next Action

Convert this execution sequence into:
- exact shell-safe move order
- exact `rg` verification command set
- exact per-step success/failure checklist
