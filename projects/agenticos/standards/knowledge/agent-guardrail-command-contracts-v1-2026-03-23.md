# AgenticOS Guardrail Command Contracts v1

> Date: 2026-03-23
> Status: draft command-contract candidate
> Purpose: define executable input/output contracts for the first guardrail commands

## 1. Why Command Contracts Are Needed

The guardrail design is not actionable enough until the command boundaries are fixed.

These contracts should answer:
- what each command consumes
- what each command returns
- what it is allowed to fix automatically
- what it must block instead of mutating

## 2. Contract Set

Guardrail v1 should expose three commands:

1. `agenticos_preflight`
2. `agenticos_branch_bootstrap`
3. `agenticos_pr_scope_check`

## 3. `agenticos_preflight`

### Responsibility

Evaluate whether the current task is allowed to proceed into implementation.

### Required input

```yaml
issue_id: "36"
task_type: implementation
repo_path: "/abs/path/to/repo"
remote_base_branch: "origin/main"
declared_target_files:
  - "projects/agenticos/mcp-server/src/..."
structural_move: false
worktree_required: true
```

### Optional input

```yaml
risk_level: high
root_scoped_exceptions:
  - ".github/"
clean_reproducibility_gate:
  - "npm ci"
  - "npm run build"
  - "npm test"
issue_relevant_knowledge_files:
  - "projects/agenticos/standards/knowledge/..."
```

### Required checks

- repo identity
- issue linkage
- task classification
- current workspace type
- remote-base ancestry
- target-file declaration
- root-scoped exception check if `structural_move == true`
- verification-plan presence

### Output shape

```yaml
status: PASS | BLOCK | REDIRECT
summary: ""
repo_identity_confirmed: true
branch_ancestry_verified: true
branch_based_on_intended_remote: true
worktree_ok: true
scope_ok: true
reproducibility_gate_defined: true
block_reasons: []
redirect_actions: []
evidence:
  current_branch: ""
  current_head: ""
  remote_base_branch: ""
  branch_fork_point: ""
```

### Status semantics

#### `PASS`

Use only if:
- no hard gate failed
- current branch/worktree/base are acceptable
- implementation may continue

#### `BLOCK`

Use if:
- branch is based on wrong remote ancestry
- issue/worktree alignment is missing and cannot be repaired safely in place
- structural move ignores root-scoped exceptions
- clean reproducibility gate is required but undefined

#### `REDIRECT`

Use if:
- work can proceed only after safe setup automation
- example: issue exists, but correct branch/worktree is missing and can be created by helper

### Non-goals

`agenticos_preflight` should not:
- mutate repository structure
- silently create branches
- silently rewrite task scope

It is a checker, not an executor.

## 4. `agenticos_branch_bootstrap`

### Responsibility

Create the correct issue branch and isolated worktree from the intended remote base.

### Required input

```yaml
issue_id: "36"
branch_type: "feat"
slug: "guardrail-helper"
repo_path: "/abs/path/to/repo"
remote_base_branch: "origin/main"
worktree_root: "/abs/path/to/worktrees"
```

### Output shape

```yaml
status: CREATED | BLOCK
branch_name: "feat/36-guardrail-helper"
base_commit: ""
worktree_path: ""
notes: []
```

### Hard rules

- must derive the branch from the intended remote base, not the local current branch
- must record the exact base commit used
- must fail if target branch or worktree path already exists unexpectedly

### Allowed mutation

- create branch
- create worktree
- record setup metadata

### Disallowed mutation

- applying user code changes
- rebasing unrelated local work
- deleting existing worktrees automatically

## 5. `agenticos_pr_scope_check`

### Responsibility

Validate that the current branch diff is scoped to the intended issue relative to the intended remote base.

### Required input

```yaml
issue_id: "36"
repo_path: "/abs/path/to/repo"
remote_base_branch: "origin/main"
declared_target_files:
  - "projects/agenticos/..."
expected_issue_scope: "single_guardrail_feature"
```

### Required checks

- commit range relative to remote base
- changed files relative to declared target files
- unrelated commit subject detection
- optional heuristic on suspicious extra scope

### Output shape

```yaml
status: PASS | BLOCK
summary: ""
commit_count: 0
changed_files: []
unexpected_files: []
unrelated_commit_subjects: []
```

### Fail conditions

Block if:
- unrelated commits exist in the branch range
- changed files escape the declared target scope without explicit justification
- current branch is not comparable to the intended remote base

### Non-goal

This command should not merge, rebase, or prune commits.

It is a scope validator only.

## 6. Shared Result Rules

All guardrail commands should:
- return machine-readable status first
- include concrete evidence fields, not only prose
- explain block reasons as actionable statements

Recommended top-level invariant:

```text
no implementation command should proceed if the latest guardrail result is BLOCK
```

## 7. Minimum Implementation Order

Recommended order:

1. `agenticos_preflight`
2. `agenticos_branch_bootstrap`
3. `agenticos_pr_scope_check`

Reason:
- preflight defines the gates
- bootstrap fixes safe setup gaps
- PR scope check protects submission

## 8. Minimum v1 Acceptance

The command-contract layer is ready for implementation if:

1. each command has fixed required inputs
2. each command has fixed status values
3. mutating versus non-mutating responsibilities are separated
4. wrong-base ancestry and root-scoped exceptions are represented explicitly
5. `BLOCK` versus `REDIRECT` semantics are unambiguous
