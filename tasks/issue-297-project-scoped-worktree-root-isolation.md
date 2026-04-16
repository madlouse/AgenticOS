# Issue #297: Project-Scoped Worktree Root Isolation

## Summary

`#297` closes the remaining topology gap left after the runtime-home and
project-source model was clarified.

The intended model is already clear:

- `AGENTICOS_HOME` is the runtime workspace home
- managed projects live under `AGENTICOS_HOME/projects/<project>`
- each Git-backed project is its own source and repo boundary
- issue worktrees must not be created under an unrelated project's helper tree

The remaining problem is that `agenticos_branch_bootstrap` still accepts an
arbitrary caller-provided `worktree_root` and treats that path as the source of
truth. That means a shared helper path such as
`/Users/jeking/dev/AgenticOS/worktrees` can become a mixed physical sink for
multiple unrelated projects.

This is not a Git identity violation. It is a worktree-placement enforcement
gap.

## Problem Statement

Current bootstrap behavior is too weak in three ways:

1. worktree root selection is delegated to the caller
2. the selected root is not derived from the managed project contract
3. audit/status surfaces do not clearly report misplaced worktrees

That leaves the runtime model partially normalized, but not strongly enforced.

## Design Goal

For any `github_versioned` managed project, the effective issue-worktree root
must be deterministic and project-scoped.

The system should make the correct placement automatic, reject unrelated roots,
and expose clear topology diagnostics for already-misplaced worktrees.

## Recommended V1 Rule

Derive the effective worktree root from runtime home plus managed project id:

```text
$AGENTICOS_HOME/worktrees/<project-id>/
```

Examples:

- `agenticos` -> `$AGENTICOS_HOME/worktrees/agenticos`
- `360teams` -> `$AGENTICOS_HOME/worktrees/360teams`

The resulting issue worktree path remains:

```text
$AGENTICOS_HOME/worktrees/<project-id>/<repo-name>-<issue>-<slug>
```

This keeps the placement:

- workspace-home helper area, partitioned by managed project id
- deterministic
- isolated by managed project
- independent of whether the project source checkout itself lives inside
  `AGENTICOS_HOME/projects/`

## Contract Decision

### Public tool contract

`agenticos_branch_bootstrap` should no longer require `worktree_root` as caller
input.

Recommended V1 behavior:

- remove `worktree_root` from the required schema
- treat `worktree_root` as deprecated compatibility input
- when supplied, only accept it if it exactly matches the derived project root
- otherwise fail closed with a clear error that shows:
  - requested root
  - expected root
  - target project id

This preserves compatibility for older clients while removing the unsafe
selection semantics.

For V1, "exactly matches" means normalized path equivalence, not raw string
equality. Trailing `/`, `.` and `..` path spellings must normalize to the same
derived root.

### Project metadata

Do not add a new per-project configuration field in V1.

Reason:

- the placement rule is part of the workspace contract, not project taste
- introducing a configurable override before the default is enforced recreates
  the ambiguity that caused this incident
- a future controlled override can be added only if there is a concrete
  operator requirement and an audit trail requirement

## Audit And Status Surfaces

`#297` should add machine-checkable topology inspection for Git-backed managed
projects.

Minimum V1 behavior:

- derive the expected worktree root for the target project
- inspect `git worktree list --porcelain` for the target repo
- classify worktrees into:
  - canonical main checkout
  - correctly placed non-canonical worktrees
  - misplaced clean worktrees
  - misplaced dirty worktrees

Recommended operator-facing surfaces:

- `agenticos_status`
  - show expected worktree root
  - show a concise misplaced-worktree summary when present
- `agenticos_health`
  - add a topology gate
  - `PASS` when no misplaced worktrees exist
  - `WARN` when only misplaced clean worktrees exist
  - `BLOCK` when any misplaced dirty worktree exists
  - `BLOCK` when topology inspection itself fails

This gives both a human summary and a machine-checkable enforcement signal.

Review resolution:

- `health` is the machine-truth surface
- `status` is only a rendered human summary
- topology inventory must use `git worktree list --porcelain` as the source of
  truth
- topology evidence must not be persisted into tracked project state

## Migration Guidance

`#297` should define the classification used for cleanup:

### Preserve and migrate

Use when the misplaced worktree is still needed and clean.

Procedure:

1. verify whether the branch has unique commits, upstream, and/or an open PR
2. recreate the worktree from the canonical repo under the derived root
3. verify the new worktree resolves to the same branch/HEAD
4. remove the old misplaced worktree

Do not move the directory with bare `mv`.

### Stash first, then migrate or discard

Use when the misplaced worktree has uncommitted changes.

Procedure:

1. record branch and HEAD
2. `stash -u` or create a temporary safety commit
3. recreate the worktree under the derived root
4. restore the changes
5. only then remove the old misplaced worktree

Do not move the directory with bare `mv`.

### Safe deletion

Use when the misplaced worktree is obsolete, duplicated, or otherwise
superseded.

Before deletion, verify:

- there are no unique commits that still matter
- there is no upstream branch or PR that still depends on it
- the worktree path is not the only recovery location for uncommitted changes

V1 implementation only needs to provide the detection and operator procedure.
Automatic relocation can remain out of scope for now.

## Concrete Implementation Slice

### 1. Root derivation utility

Add a shared utility that:

- derives `$AGENTICOS_HOME/worktrees/<project-id>`
- validates an optional requested root against that derived root
- returns a normalized expected root and mismatch diagnostics

This utility should remain mostly pure so path normalization and compatibility
behavior can be covered directly in unit tests.

### 2. Branch bootstrap hardening

Update `mcp-server/src/tools/branch-bootstrap.ts` so it:

- resolves the target managed project first
- derives the effective worktree root from project id
- rejects mismatched compatibility overrides
- creates worktrees only under the derived root
- persists:
  - `requested_worktree_root`
  - `expected_worktree_root`
  - `effective_worktree_root`
  - `deprecated_override_used`

V1 keeps `worktree_root` in the public contract only as a deprecated
compatibility input. It is no longer required and it no longer chooses the
root.

### 2a. Guardrail boundary propagation

The derived worktree root must be accepted by the rest of the guardrail chain,
not just bootstrap.

That means:

- `resolveGuardrailProjectTarget(...)` must treat paths under the derived
  project-scoped worktree root as belonging to the same managed project
- `validateGuardrailRepoIdentity(...)` must allow the derived worktree root as
  a valid `gitWorktreeRoot`
- `execution.source_repo_roots` remains the proof for the canonical/common repo
  root

Without this, bootstrap could create a worktree that later fails `preflight`,
`issue_bootstrap`, or `pr_scope_check`.

### 3. Topology inspection utility

Add a utility that:

- resolves the expected root for a project
- lists repo worktrees
- classifies placement and dirtiness
- returns a summary suitable for both health/status output and future repair
  tooling

Minimum per-worktree fields should include:

- `path`
- `branch`
- `placement`
- `dirty`
- `upstream`
- `suggested_action`

### 4. Health/status wiring

Update:

- `mcp-server/src/utils/health.ts`
- `mcp-server/src/tools/project.ts`

so topology drift is surfaced explicitly.

`health` should add a dedicated topology gate rather than folding topology into
the existing `repo_sync` gate.

### 5. Docs and operator guidance

Update:

- `mcp-server/README.md`
- this task file
- `standards/knowledge/agent-guardrail-command-contracts-v1-2026-03-23.md`
- root `README.md`

to document the derived-root contract and the migration classifications.

## Explicit Non-Goals

`#297` should not:

- automatically move or rewrite existing worktrees during bootstrap
- widen into a general project-path migration engine
- reintroduce a configurable global `active_project` dependency
- permit arbitrary shared roots as a normal operator choice

## Acceptance Criteria

`#297` is complete when:

1. `agenticos_branch_bootstrap` cannot create an issue worktree under an
   unrelated shared root
2. the effective worktree root is deterministic from `AGENTICOS_HOME` plus
   project id
3. status/health surfaces clearly report misplaced worktrees
4. misplaced clean and dirty worktrees are distinguishable
5. documentation tells the operator how to classify and clean up existing
   misplaced worktrees
6. tests fully cover:
   - derived-root happy path
   - deprecated override accepted when equal
   - deprecated override rejected when mismatched
   - misplaced clean worktree reporting
   - misplaced dirty worktree reporting
