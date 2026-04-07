# Standalone Product-Repo Extraction Runbook

## Purpose

Convert `projects/agenticos` from a prepared future product root into the real
standalone AgenticOS Git product repository, while allowing the enclosing
workspace home to stop being the Git repository root.

## Target State

The final steady state is:

- `/Users/jeking/dev/AgenticOS` is `AGENTICOS_HOME`
- `/Users/jeking/dev/AgenticOS` is not itself a Git repository
- `projects/agenticos` is the AgenticOS product source project
- AgenticOS release, CI, and issue-flow ownership live with that product
  project
- packaged runtime remains separate from workspace content

## Non-Goals

- this runbook does not treat Homebrew install location as workspace home
- this runbook does not reclassify child project topology
- this runbook does not permit silent destructive migration

## Readiness Gate

Before any extraction work begins, run:

```bash
projects/agenticos/tools/audit-product-repo-extraction-readiness.sh \
  --workspace-root /Users/jeking/dev/AgenticOS \
  --product-root /Users/jeking/dev/AgenticOS/projects/agenticos
```

Proceed only if the result is `PASS`.

Required conditions:

1. product-root shell audit passes
2. sibling-project extraction audit passes
3. workspace runtime dirtiness is clean
4. the current Git remote is explicit

## Migration Strategy

### Phase 1: freeze recovery points

Create a reversible checkpoint before changing Git ownership:

1. snapshot current workspace root Git state
2. archive the current root `.git` directory or create a bare backup clone
3. export the current `origin` URL and HEAD commit
4. preserve current workspace runtime state separately from Git migration work

Verification:

- backup archive exists
- HEAD commit is recorded
- remote URL is recorded

Rollback:

- restore archived `.git`
- restore saved runtime state

### Phase 2: create product-only history candidate

Derive a candidate Git history rooted at `projects/agenticos`.

Recommended method:

```bash
git -C /Users/jeking/dev/AgenticOS subtree split \
  --prefix=projects/agenticos \
  -b migration/agenticos-product-root
```

Verification:

- split branch exists
- split branch tree root contains `mcp-server/`, `homebrew-tap/`, `.github/`,
  `README.md`, and `LICENSE`
- split branch no longer contains the enclosing `projects/` prefix

Rollback:

- delete the split branch
- no changes to the live workspace root are required yet

### Phase 3: prove standalone product repo locally

Create a local standalone checkout from the split branch and validate it as a
real product repository.

Example:

```bash
git clone /Users/jeking/dev/AgenticOS /tmp/agenticos-product-root-check
git -C /tmp/agenticos-product-root-check checkout migration/agenticos-product-root
```

Verification:

1. `git rev-parse --show-toplevel` points at the standalone checkout root
2. CI and release workflows parse from the checkout root
3. `cd mcp-server && npm install && npm test` passes
4. `tools/audit-product-root-shell.sh --project-root .` passes

Rollback:

- delete the temporary checkout

### Phase 4: decide remote handoff mode

This step must be explicit. There are only two acceptable modes:

1. replace the current `madlouse/AgenticOS` GitHub repository contents with the
   split history rooted at the product project
2. publish the split history to a new dedicated product repository and repoint
   release ownership there

No silent remote rewrite is allowed.

Verification:

- target remote URL is explicit
- release ownership target is explicit
- Homebrew formula update path is explicit

Rollback:

- keep the workspace-root Git repository unchanged
- do not detach the workspace root until the remote handoff decision is proven

### Phase 5: cut local workspace over

Only after the standalone product repository and remote ownership are proven:

1. place the standalone product repository at `projects/agenticos/.git`
2. remove the enclosing workspace-root `.git`
3. rerun workspace and product audits

Verification:

```bash
projects/agenticos/tools/audit-product-root-shell.sh --project-root projects/agenticos
projects/agenticos/tools/audit-root-git-exit.sh --workspace-root /Users/jeking/dev/AgenticOS
```

Pass conditions:

- `projects/agenticos` remains a valid product repo root
- `/Users/jeking/dev/AgenticOS` no longer reports `root-git-root: BLOCK`

Rollback:

- restore the archived workspace-root `.git`
- remove the nested `projects/agenticos/.git`

## Operator Notes

- do not mutate the current workspace-root Git ownership before the split
  history is validated in a separate checkout
- do not let runtime state become part of the migration diff
- do not couple remote handoff and local cutover into one command

## Success Definition

The migration is complete only when:

1. `projects/agenticos` is the real AgenticOS Git repository root
2. the enclosing workspace home is not a Git repository
3. release and CI ownership are aligned to the product repository
4. the workspace home can keep child projects without root-level Git pollution
