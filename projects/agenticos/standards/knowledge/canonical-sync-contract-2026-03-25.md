# Canonical Sync Contract — 2026-03-25

## Purpose

This contract defines when the current local AgenticOS source checkout may be trusted as the canonical local base and when the live standards entry surfaces may be treated as fresh resume context.

For the current layout, use:

- `AGENTICOS_SOURCE_ROOT` = the current local AgenticOS source checkout root
- `AGENTICOS_PRODUCT_SOURCE` = `$AGENTICOS_SOURCE_ROOT/projects/agenticos`

The goal is to prevent a familiar failure mode:

- `origin/main` has already moved forward
- the local canonical checkout has not been fast-forwarded
- `projects/agenticos/standards/.context/quick-start.md` and `.context/state.yaml` are therefore stale
- a later Agent starts from old local context and reasons from the wrong repository state

## Source-of-Truth Order

When these differ, trust order is:

1. `origin/main`
2. an isolated issue worktree branched from the current `origin/main`
3. the local canonical source checkout at `AGENTICOS_SOURCE_ROOT`
4. archived snapshots and retired project history

The local canonical checkout is only trustworthy when it has been explicitly resynced to `origin/main`.

## Canonical Sync Procedure

Run from the local AgenticOS source checkout:

```bash
export AGENTICOS_SOURCE_ROOT="/absolute/path/to/current-agenticos-source-root"
git -C "$AGENTICOS_SOURCE_ROOT" fetch origin --prune
git -C "$AGENTICOS_SOURCE_ROOT" checkout main
git -C "$AGENTICOS_SOURCE_ROOT" pull --ff-only origin main
git -C "$AGENTICOS_SOURCE_ROOT" status --short --branch
```

Expected result:

- branch is `main`
- checkout is not ahead of `origin/main`
- checkout is not behind `origin/main`
- working tree is clean

Trusted status looks like:

```text
## main...origin/main
```

If the checkout is dirty, ahead, or cannot fast-forward cleanly, it is not a trusted canonical starting point for Agent work.

## Live Standards Freshness Contract

The standards entry surfaces:

- `projects/agenticos/standards/.context/quick-start.md`
- `projects/agenticos/standards/.context/state.yaml`

must be refreshed whenever merged work changes any of these:

- canonical standards decisions
- backlog shape
- canonical execution rules
- visible entry-surface behavior
- the set of issues that a newly entering Agent should treat as the current next-step queue

This means freshness is based on semantic resume impact, not just file churn.

## Required Refresh Policy

After a merged issue lands, use this rule:

1. if the issue changes canonical standards knowledge or Agent entry behavior, update the standards entry surfaces in the same issue flow or an immediate follow-up issue
2. `quick-start.md` must summarize the new state at a human-readable resume level
3. `state.yaml` must reflect the current task, current known facts, current decisions, and the new pending queue
4. neither file should become an append-only dump of every historical detail

## Freshness Verification

After sync, verify:

```bash
export AGENTICOS_SOURCE_ROOT="/absolute/path/to/current-agenticos-source-root"
export AGENTICOS_PRODUCT_SOURCE="$AGENTICOS_SOURCE_ROOT/projects/agenticos"
ruby -e 'require "yaml"; YAML.load_file(ENV.fetch("AGENTICOS_PRODUCT_SOURCE") + "/standards/.context/state.yaml"); puts "state-ok"'
rg -n "#98|canonical sync|higher-order backlog|#99|#97|#96|#95|#94" "$AGENTICOS_PRODUCT_SOURCE/standards/.context/quick-start.md" "$AGENTICOS_PRODUCT_SOURCE/standards/.context/state.yaml"
```

Verification intent:

- `state.yaml` must remain valid YAML
- the live entry surfaces must mention the currently relevant post-remaining-six state, not the superseded pre-closure backlog

## Non-Goals

This contract does not:

- replace isolated worktrees for implementation work
- make the local canonical checkout a place for feature development
- require archived historical files to be continuously refreshed
- attempt to auto-summarize every merged document into the live entry surfaces

## Outcome

The local AgenticOS source checkout is a trusted base checkout only after explicit fast-forward sync.

The live standards entry surfaces are fresh only when they reflect the current post-merge resume reality for the next Agent, not just the last time someone edited those files.
