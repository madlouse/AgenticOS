# Canonical Working Copy Cleanup Report - 2026-03-24

## Summary

Issue `#78` restores the local directory `/Users/jeking/dev/AgenticOS` into a clean canonical working copy aligned with `origin/main`.

The main goal was to stop treating that directory as a mixed historical workspace and restore it as the trusted local base checkout for future agent work.

## Problem Before Cleanup

The local checkout had drifted in four different ways at once:

- local `main` was both ahead of and behind `origin/main`
- tracked root files had local modifications against an outdated structure
- staged deletions still reflected the retired standalone standards repo removal
- untracked runtime-project and nested-repo residue still lived under the source checkout

That meant a future agent entering `/Users/jeking/dev/AgenticOS` could infer the wrong repository layout and the wrong remaining work.

## Preservation Before Cleanup

Before any destructive cleanup, the local state was preserved under:

- `/Users/jeking/worktrees/agenticos-working-copy-78-backup/2026-03-24/`

Preserved artifacts include:

- `working.patch`
- `staged.patch`
- `status.txt`
- `head.txt`
- `untracked.txt`
- `untracked-tree/`
- `local-main-ahead-commits.patch`

The previous local-only `main` state was also preserved on:

- `preserve/local-main-2026-03-24`

## Local-Only Commits Preserved

Two local commits on `main` were identified as real but unpublished work:

- `9700790` `fix(record): defensively parse JSON-stringified array args (fixes #24)`
- `fc40133` `feat(switch): inline project context in switch output (fixes #23)`

These were preserved before resetting `main`, because they correspond to still-open issues and should be re-executed through normal issue/worktree flow rather than kept as hidden local drift on the canonical checkout.

## Cleanup Actions

The cleanup then performed these steps:

1. reset `/Users/jeking/dev/AgenticOS` `main` to `origin/main`
2. remove untracked runtime-project and retired-structure residue from the source checkout
3. verify that the source checkout now reflects the canonical self-hosted layout

Removed source-checkout residue included:

- runtime project leftovers under `projects/2026okr/`
- runtime project leftovers under `projects/360teams/`
- runtime project leftovers under `projects/agentic-devops/`
- runtime project leftovers under `projects/ghostty-optimization/`
- retired standalone repo residue under `projects/agentic-os-development/`
- orphaned local project leftovers under `projects/okr-management/` and `projects/t5t/`
- local-only helper files such as `projects/t5t.js`

## Verification

Verification completed after cleanup:

- `git -C /Users/jeking/dev/AgenticOS fetch origin --prune`
- `git -C /Users/jeking/dev/AgenticOS status --short --branch`
- confirmed `/Users/jeking/dev/AgenticOS/projects/agenticos/standards` exists
- confirmed `/Users/jeking/dev/AgenticOS/projects/agenticos/mcp-server` exists
- confirmed `/Users/jeking/dev/AgenticOS/projects/agentic-os-development` no longer exists as an active source-checkout structure

Result:

- local checkout now reports clean `main...origin/main`

## Outcome

`/Users/jeking/dev/AgenticOS` can now be treated as the trusted local canonical checkout again.

Future implementation work should not accumulate there.

Instead:

- keep this checkout clean
- branch from it
- work in isolated issue worktrees

## Follow-Up

The preserved local-only work for open issues should now be replayed correctly:

- `#23`
- `#24`

Those changes should be reintroduced on isolated issue branches, not kept as hidden local commits on the canonical main checkout.
