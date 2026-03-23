# AgenticOS Baseline Bootstrap Protocol

> Date: 2026-03-23
> Purpose: define how a newborn AgenticOS project repository enters the normal issue/branch/worktree workflow

## 1. Why Bootstrap Exists

Normal AgenticOS workflow assumes:
- the repository already has an initial commit
- `main` exists as a meaningful baseline
- feature branches can be created from that baseline
- isolated worktrees can be attached to those branches

For a newborn repository, those assumptions are false.

So a bootstrap phase is required before normal issue-first branch/worktree rules can fully apply.

## 2. Bootstrap Trigger

A repository is in `bootstrap` state if any of the following is true:
- `git status --branch` reports `No commits yet on main`
- there is no baseline commit to branch from
- canonical AgenticOS starter files have not been established yet

## 3. Bootstrap Goal

Bootstrap is not "early development".
Bootstrap is a narrow phase whose only purpose is to create a stable baseline so normal workflow can begin.

Its goal is to produce:
- a valid initial repository baseline
- canonical project identity files
- enough context files for future agents to start correctly
- a first commit on `main`

## 4. Minimum Baseline Scope

Bootstrap may include only baseline-establishing assets such as:
- `.project.yaml`
- `.context/quick-start.md`
- `.context/state.yaml`
- `AGENTS.md`
- agent-specific overlay such as `CLAUDE.md`
- `knowledge/` starter files
- `tasks/` starter files
- `.gitignore`
- minimal README or changelog if part of the standard

Bootstrap must not include unrelated feature work, product implementation, or opportunistic cleanup.

## 5. Bootstrap Issue Handling

Bootstrap should still be issue-driven.

Recommended rule:
- use a dedicated bootstrap issue type or clearly marked issue
- scope the issue explicitly to baseline creation only

Example framing:
- `bootstrap: establish initial AgenticOS project baseline`

## 6. Allowed and Forbidden Actions During Bootstrap

### Allowed

- create canonical baseline files
- define initial project metadata
- define initial quick-start and state
- create the first baseline commit
- record the bootstrap rationale and exit condition

### Forbidden

- unrelated feature implementation
- policy expansion unrelated to baseline creation
- bundling multiple future issues into the baseline commit
- treating bootstrap as a permanent exemption from worktree rules

## 7. Bootstrap Exit Criteria

A repository exits bootstrap only when all of the following are true:

1. an initial commit exists on `main`
2. canonical starter files exist
3. project identity is established
4. session-start context is loadable
5. future work can branch from the baseline cleanly

Once these conditions are true, the repository is no longer in bootstrap state.

## 8. Transition to Normal Workflow

After bootstrap exit:
- normal issue-first workflow applies
- implementation work must use branch + isolated worktree
- bootstrap exception is no longer available for ordinary work

The transition rule should be strict.
Otherwise every new repo can remain permanently "special".

## 9. Suggested Pseudocode

```text
function classify_repo_state(repo):
  if repo.has_no_initial_commit():
    return "bootstrap"
  return "normal"

function allow_task(repo, task):
  state = classify_repo_state(repo)

  if state == "bootstrap":
    if task.scope_is_baseline_only():
      return allow_with_bootstrap_constraints()
    return block("repo_bootstrap_not_complete")

  return enforce_normal_issue_branch_worktree_protocol()
```

## 10. Current Relevance

This standards project is itself an example of why this protocol is needed.

At the time of writing:
- `/Users/jeking/dev/AgenticOS/projects/agentic-os-development`
- is still on `No commits yet on main`

So the project currently cannot cleanly claim full branch/worktree compliance until baseline bootstrap is formally completed.
