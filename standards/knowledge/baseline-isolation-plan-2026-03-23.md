# AgenticOS Baseline Isolation Plan

> Date: 2026-03-23
> Purpose: define how to establish a clean, verifiable starting point before any self-hosting migration execution begins

## 1. Why Isolation Is Required

The current top-level AgenticOS repository is not in a clean execution state.

Observed conditions:
- unstaged product-source changes exist at root
- staged deletions exist for `projects/agentic-os-development` in the parent repo
- unrelated runtime project changes and untracked files also exist

That means the current main worktree is not a trustworthy migration baseline.

If migration starts from this state:
- verification results become ambiguous
- rollback becomes unsafe
- unrelated changes can be mixed into structural migration

## 2. Isolation Goal

Before any real file moves begin, create a migration environment that is:
- clean
- isolated from unrelated work
- reproducible
- easy to verify
- easy to abandon or recreate

## 3. Current Dirty-State Categories

### A. Root product-source modifications

Examples currently visible:
- `.gitignore`
- `AGENTS.md`
- `README.md`
- `homebrew-tap/Formula/agenticos.rb`
- `homebrew-tap/README.md`
- `mcp-server/README.md`
- `mcp-server/package-lock.json`

### B. Parent-repo staged deletions for the standards subproject

These staged deletions reflect the earlier split of `projects/agentic-os-development` from the parent repo.

They should not be mixed into self-hosting migration execution.

### C. Runtime project noise

Examples:
- `projects/360teams/*`
- `projects/agentic-devops/*`
- `projects/test-project/*`
- other runtime project deltas

These are not part of the host-product migration itself.

## 4. Recommended Isolation Strategy

Use a **fresh dedicated worktree** outside the current root working tree.

Recommended model:

1. preserve the current dirty state without destroying it
2. create a dedicated migration branch from a known commit
3. create a fresh external worktree for that branch
4. verify the new worktree is clean
5. execute migration work only there

## 5. Recommended Branch and Worktree Model

### Branch

Use a dedicated branch such as:

```text
feat/self-hosting-migration
```

### Worktree location

Use an external path, not inside runtime worktree directories:

```text
~/worktrees/agenticos-self-hosting
```

Avoid:
- the current root worktree
- `.claude/worktrees/`
- any runtime-only temp path that may be cleaned automatically

## 6. Baseline Preservation Before Isolation

Before creating the migration worktree, preserve the current state in one of these forms:

### Preferred

- a dedicated checkpoint branch or commit for the current planning state

### Acceptable fallback

- explicit patch exports for staged and unstaged changes

At minimum, capture:

```bash
git status --short --branch
git diff > /safe/path/agenticos-root-working.patch
git diff --cached > /safe/path/agenticos-root-staged.patch
git rev-parse HEAD
```

The goal is not to clean the current worktree destructively.
The goal is to make it recoverable and ignorable.

## 7. Verification Gates for Isolation

### Gate 1: Baseline captured

Required evidence:
- `git status --short --branch` recorded
- current HEAD recorded
- patch or checkpoint mechanism recorded

### Gate 2: Fresh migration worktree created

Required commands should succeed:

```bash
git worktree add /target/path -b feat/self-hosting-migration <base-commit>
cd /target/path
git status --short --branch
```

Pass condition:
- new worktree is clean
- branch name is correct

### Gate 3: Build baseline verified inside isolated worktree

Required command:

```bash
cd /target/path/mcp-server
npm ci
npm run build
```

Pass condition:
- clean install and build both succeed from the isolated worktree before any migration move

## 8. Stop Conditions

Stop before migration execution if:
- the fresh worktree is not clean
- the base commit is unclear
- the current dirty state has not been preserved
- clean install does not pass in the isolated worktree
- build does not pass in the isolated worktree

## 9. Rollback Principle

Isolation rollback is simple:
- abandon the migration worktree
- keep the preserved patches or checkpoint branch
- do not "repair" the original dirty main worktree as part of migration execution

This is why isolation should happen first.

## 10. Immediate Next Action

Turn this isolation plan into an execution checklist with:
- exact base commit choice
- exact branch name
- exact worktree path
- exact preservation commands
