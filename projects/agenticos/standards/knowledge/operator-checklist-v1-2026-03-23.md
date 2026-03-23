# AgenticOS Operator Checklist v1

> Date: 2026-03-23
> Purpose: provide an execution-ready checklist for baseline isolation before self-hosting migration

## 1. Frozen Baseline Inputs

At planning time, the current baseline values are:

- source repo path: `/Users/jeking/dev/AgenticOS`
- current branch: `main`
- upstream branch: `origin/main`
- current HEAD: `fc401332bea49fdecdc2f4e489e30545d5061043`
- recommended migration branch: `feat/self-hosting-migration`
- recommended external worktree path: `/Users/jeking/worktrees/agenticos-self-hosting`

## 2. Scope of This Checklist

This checklist does **not** perform the structural migration yet.

It only prepares a safe execution baseline by:
- preserving current dirty state
- creating a dedicated migration branch/worktree
- verifying a clean isolated baseline

## 3. Operator Checklist

### Step 0: Record current state

Run:

```bash
cd /Users/jeking/dev/AgenticOS
git status --short --branch
git rev-parse HEAD
git rev-parse --abbrev-ref --symbolic-full-name @{upstream}
```

Pass condition:
- output matches the expected planning baseline closely enough to trust the checklist

Stop if:
- repo identity is not the expected product source repo
- current HEAD is not the intended baseline commit and no deliberate update was approved

### Step 1: Preserve unstaged and staged changes

Run:

```bash
mkdir -p /Users/jeking/worktrees/agenticos-migration-backups
cd /Users/jeking/dev/AgenticOS
git diff > /Users/jeking/worktrees/agenticos-migration-backups/root-working.patch
git diff --cached > /Users/jeking/worktrees/agenticos-migration-backups/root-staged.patch
git status --short --branch > /Users/jeking/worktrees/agenticos-migration-backups/root-status.txt
git rev-parse HEAD > /Users/jeking/worktrees/agenticos-migration-backups/root-head.txt
```

Pass condition:
- all four backup files exist

Verify:

```bash
ls -l /Users/jeking/worktrees/agenticos-migration-backups
```

Stop if:
- any backup artifact is missing

### Step 2: Create external worktree parent if needed

Run:

```bash
mkdir -p /Users/jeking/worktrees
```

Pass condition:
- `/Users/jeking/worktrees` exists

### Step 3: Create migration worktree

Run:

```bash
cd /Users/jeking/dev/AgenticOS
git worktree add /Users/jeking/worktrees/agenticos-self-hosting -b feat/self-hosting-migration fc401332bea49fdecdc2f4e489e30545d5061043
```

Pass condition:
- worktree add succeeds

Stop if:
- branch already exists unexpectedly
- worktree path is already occupied unexpectedly

### Step 4: Verify clean migration worktree

Run:

```bash
cd /Users/jeking/worktrees/agenticos-self-hosting
git status --short --branch
git rev-parse HEAD
```

Pass condition:
- branch is `feat/self-hosting-migration`
- HEAD is `fc401332bea49fdecdc2f4e489e30545d5061043`
- worktree is clean

Stop if:
- any tracked or untracked change appears in the fresh worktree unexpectedly

### Step 5: Verify build baseline in isolated worktree

Run:

```bash
cd /Users/jeking/worktrees/agenticos-self-hosting/mcp-server
npm ci
npm run build
```

Pass condition:
- clean install and build both succeed in the isolated worktree before any migration move

Stop if:
- `npm ci` fails
- build fails

### Step 6: Freeze execution starting point

Run:

```bash
cd /Users/jeking/worktrees/agenticos-self-hosting
git status --short --branch > /Users/jeking/worktrees/agenticos-migration-backups/migration-worktree-status.txt
git rev-parse HEAD > /Users/jeking/worktrees/agenticos-migration-backups/migration-worktree-head.txt
```

Pass condition:
- migration worktree status and head snapshots are written

At this point:
- migration planning can move into structural execution

## 4. Rollback for Isolation Step

If isolation setup itself must be abandoned:

```bash
git -C /Users/jeking/dev/AgenticOS worktree remove /Users/jeking/worktrees/agenticos-self-hosting
git -C /Users/jeking/dev/AgenticOS branch -D feat/self-hosting-migration
```

Only do this if:
- the worktree was created but should be discarded
- no intentional migration work needs to be preserved there

## 5. Operator Notes

- Do not run structural move commands in `/Users/jeking/dev/AgenticOS`
- Do not use `.claude/worktrees/` as the migration worktree path
- Do not destroy the original dirty state while preparing isolation

## 6. Next Action After This Checklist

Once all steps above pass, execute the self-hosting migration only from:

- `/Users/jeking/worktrees/agenticos-self-hosting`

and then follow:

- `knowledge/phase3-execution-sequence-2026-03-23.md`
- `knowledge/command-level-migration-playbook-v1-2026-03-23.md`
