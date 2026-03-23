# AgenticOS Agent Guardrail Design v1

> Date: 2026-03-23
> Status: draft design candidate
> Purpose: turn the agent preflight protocol into a machine-checkable guardrail model informed by real execution failures

## 1. Guardrail Goal

The guardrail layer exists to stop an agent from entering implementation incorrectly.

It should not rely on:
- the model "remembering" process rules
- branch naming alone
- informal human review after the fact

It should produce a concrete pass/fail result before implementation or PR creation proceeds.

## 2. Why v1 Is Needed

Real execution exposed concrete failure modes that documentation alone did not prevent:

1. a PR branch can be cut from a local `main` that is ahead of `origin/main`
2. the resulting PR can accidentally include unrelated commits
3. a repository structure plan can incorrectly try to relocate root-scoped infrastructure such as `.github/`
4. structural work can start before clean reproducibility is proven

These are now design inputs, not hypotheticals.

## 3. Guardrail Scope

Guardrail v1 should cover four layers.

### Layer A: task gate

Checks:
- task type classified
- implementation versus docs-only distinguished
- high-risk/protocol work identified

Purpose:
- decide whether strict branch/worktree enforcement applies

### Layer B: repository gate

Checks:
- repo identity known
- current branch known
- current worktree type known
- target remote base known
- branch ancestry against remote base known

Purpose:
- prevent implementation from starting on the wrong baseline

### Layer C: scope gate

Checks:
- target files identified before editing
- executable standards versus ordinary docs distinguished
- root-scoped infrastructure exceptions recognized
- PR diff contains only issue-relevant commits

Purpose:
- prevent accidental broadening of scope

### Layer D: reproducibility gate

Checks:
- clean install/build/test gate defined where applicable
- baseline reproducibility proven before structural changes
- verification plan exists before edits

Purpose:
- prevent structurally correct work from resting on a false baseline

## 4. Root-Scoped Infrastructure Exceptions

Guardrail v1 needs an explicit exception list.

Initial required entries:
- `.github/`

Rule:
- these paths are repository-scoped infrastructure
- they must not be blindly treated as product-project paths during relocation logic

Example:

```text
if operation == "relocate product source":
  keep ".github/" at repo root
  rewrite workflow working-directory instead
```

This exception list should be versioned and auditable.

## 5. Remote-Base Ancestry Gate

This is the most important new hard gate from execution.

### Required checks

For implementation work:

1. determine intended remote base, default `origin/main`
2. determine branch fork point
3. verify branch ancestry is compatible with intended remote base
4. verify extra commits are only issue-relevant

### Fail condition

Example:

```text
if branch contains commits not intended for current issue relative to origin/main:
  preflight_passed = false
  block_reason = "branch includes unrelated commits relative to remote base"
```

### Consequence

The agent must not:
- open the PR
- continue implementation on that branch
- claim issue isolation is satisfied

The agent should instead:
- cut a fresh branch/worktree from the correct remote base
- re-apply only the intended change

## 6. PR-Scope Gate

Branch ancestry alone is not enough.

The guardrail should also check:
- changed files versus declared target files
- commit count versus expected issue scope
- unrelated commit headlines in the PR range

Example heuristic:

```text
if implementation issue expects one scoped fix
and PR range contains multiple unrelated commit subjects
then block PR creation
```

This can begin as heuristic rather than perfect static proof.

## 7. Structural-Change Gate

If the task changes repository structure, the guardrail must require:
- explicit path inventory
- root-scoped infrastructure exception check
- immediate post-move verification plan

Example:

```text
if task_category == "implementation" and structural_move == true:
  require root_scoped_exception_check == true
  require post_move_build_gate_defined == true
```

## 8. Suggested Helper Commands

Guardrail v1 should likely separate helper and checker responsibilities.

### `agenticos_preflight`

Role:
- evaluate machine-checkable preflight
- output pass/fail plus reasons

Possible outputs:
- `PASS`
- `BLOCK`
- `REDIRECT`

### `agenticos_branch_bootstrap`

Role:
- create issue branch from intended remote base
- create isolated worktree
- record base commit and worktree path

### `agenticos_pr_scope_check`

Role:
- compare current branch against intended remote base
- detect unrelated commits or out-of-scope files

## 9. Suggested Decision Model

```text
function run_guardrail(task, repo):
  classify_task(task)
  check_repo_identity(repo)
  check_issue_link(task)
  check_workspace_type(repo)
  check_remote_base(repo, default="origin/main")
  check_branch_ancestry(repo)
  check_scope_declared(task)
  check_root_scoped_exceptions(task)
  check_verification_plan(task)

  if any hard gate fails:
    return BLOCK

  if helper can resolve setup gap safely:
    return REDIRECT

  return PASS
```

## 10. Minimum v1 Acceptance Criteria

Guardrail v1 is good enough to advance if:

1. it can block implementation when no issue/branch/worktree alignment exists
2. it can detect wrong-base branch ancestry relative to `origin/main`
3. it can detect declared structural moves that ignore root-scoped exceptions such as `.github/`
4. it can require an explicit clean reproducibility gate before structure-changing work
5. it emits a machine-readable result, not just prose guidance
