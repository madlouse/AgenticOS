# AgenticOS Workflow Model Review

> Date: 2026-03-23
> Purpose: clarify whether AgenticOS should use GitHub Flow or GitFlow, and define how worktree isolation fits into the operating model

## 1. Core Clarification

The main decision is not "GitHub Flow vs GitFlow" in isolation.

The real product question is:

- what collaboration model downstream AgenticOS projects should follow
- what must happen before an agent is allowed to edit code
- how to isolate active implementation work from the currently running or trusted workspace

`git worktree` is not itself a branching strategy.
It is a workspace-isolation mechanism.

So these decisions should be separated:

1. **Branching and release model**
   How changes move from idea to merged code.
2. **Workspace isolation model**
   Where agents are allowed to make those changes.

## 2. GitHub Flow vs GitFlow

### GitHub Flow

Characteristics:
- one long-lived `main` branch
- short-lived feature/fix/docs branches
- changes merge back through PRs
- releases usually come from `main`

Strengths:
- simple
- low coordination overhead
- works well for continuous delivery
- easier for solo maintainers and agent-driven iteration

Weaknesses:
- less explicit release stabilization structure
- teams with long QA/release hardening phases may want more branching ceremony

### GitFlow

Characteristics:
- multiple long-lived branches such as `main` and `develop`
- release branches and hotfix branches are first-class
- a more staged model between development and release

Strengths:
- useful when releases are infrequent, coordinated, and need explicit hardening windows
- clearer separation between ongoing development and release preparation

Weaknesses:
- materially more process overhead
- higher branch-management burden for agents
- easier for automation and sub-agents to drift or target the wrong branch
- usually overkill for fast-moving repositories that already rely on CI and PR checks

## 3. Recommendation for AgenticOS

AgenticOS should use **GitHub Flow as the primary branch model**, not GitFlow.

Reasoning:
- the project is agent-heavy and iteration-heavy
- the current repo already documents a single-`main` model
- automation and issue-first PR flow fit GitHub Flow naturally
- the main operational risk is not lack of release branches, but lack of enforced isolation before edits

So the correct refinement is:

**GitHub Flow + mandatory worktree isolation for implementation work**

This gives:
- low cognitive overhead
- simple downstream inheritance
- strong isolation from the active workspace
- compatibility with issue-first and PR-based evolution

## 4. What Worktree Actually Solves

Worktree should be treated as a protection mechanism, not as a release strategy.

It helps solve:
- accidental edits in the active workspace
- branch confusion during parallel agent work
- unsafe mixing of multiple issue implementations
- reduced trust when agents touch the same checkout repeatedly

It does **not** solve:
- release planning
- semantic versioning policy
- PR review rules
- issue taxonomy

## 5. Proposed AgenticOS Workflow Contract

### Primary model

For AgenticOS-managed repositories with a valid git baseline:

`Issue -> branch -> isolated worktree -> implementation -> verification -> PR -> merge -> automation`

### Mandatory rules

For implementation tasks:
- a GitHub Issue must exist or an accepted issue draft must be linked
- the agent must not implement directly in the protected active workspace
- the agent must use a task branch
- the agent must use a dedicated worktree for that branch

For discussion and analysis tasks:
- issue drafting, knowledge capture, and product analysis may happen without a feature worktree if no shipped code or runtime-sensitive files are being changed
- this exception should be explicit and narrow

### Required preflight

Before editing implementation files, the agent should verify:
- current repository identity
- current branch name
- whether the repo has an initial baseline commit
- whether a task issue exists
- whether the current workspace is an isolated worktree
- whether the target files are implementation-affecting or documentation-only

## 6. Independent Project Repos

This session exposed an important edge case:

some AgenticOS-managed subproject repos may still be on an unborn `main` branch with no initial commit.

In that state, normal branch/worktree flow is not fully available.

So the standard should define a bootstrap phase:

### Repository bootstrap phase

If a project repo has no initial commit yet:
- create the minimum baseline commit first
- establish canonical files and branch identity
- only then require branch/worktree isolation for implementation work

Without this bootstrap rule, the protocol becomes self-contradictory.

## 7. Suggested Product Framing

AgenticOS should avoid saying only:
- "we use GitHub Flow"

It should say:

- "AgenticOS uses GitHub Flow for branch lifecycle"
- "AgenticOS requires isolated worktrees for implementation work"
- "AgenticOS uses issue-first preflight before agent execution"

This is more precise and operationally useful than arguing over GitHub Flow vs GitFlow alone.

## 8. Recommended Changes to the Standard

1. Keep GitHub Flow as the canonical branch model.
2. Add a hard agent preflight protocol before implementation.
3. Make worktree isolation mandatory for implementation changes.
4. Define a narrow exception policy for docs/analysis-only work.
5. Require issue execution to begin with context loading and at least one design/critique loop before implementation.
6. Define executable acceptance criteria before implementation starts.
7. Define a bootstrap rule for repos that do not yet have an initial commit.
8. Add downstream templates and helper commands so the rule is easy to follow.

## 9. Working Conclusion

The main problem is not that AgenticOS picked the wrong named Git model.

The main problem is that the current workflow standard is not yet executable enough to stop agents from working in the wrong place.

So the next optimization target should be:

**turn GitHub Flow + worktree isolation + issue-first preflight into an enforceable agent protocol**
