---
name: Feature Request
about: Add guardrails and helper commands so agent workflow rules are enforced rather than only documented
title: "feat: build agent preflight guardrail and worktree bootstrap helper"
labels: enhancement
---

## Problem Statement

AgenticOS now has stronger workflow and execution protocol definitions, but they are still mostly documentary.

An agent can still skip:
- task classification
- issue-first checks
- worktree checks
- acceptance definition
- verification planning

if there is no runtime guardrail.

Real execution added two concrete failure modes that must now be treated as first-class guardrail targets:

- opening a PR from a branch cut from a local `main` ahead of `origin/main`
- assuming repository-root infrastructure such as `.github/` can be relocated like ordinary product-source content

## Proposed Solution

Design and implement a guardrail layer that can:
- run preflight checks before implementation starts
- fail closed when issue/branch/worktree prerequisites are missing
- help bootstrap the correct branch/worktree when possible
- surface clear reasons when work is blocked

Potential outputs:
- a helper command for issue branch + worktree setup
- a machine-checkable preflight command
- refusal or warning behavior in protected contexts
- integration points for Claude, Codex, and other supported agents
- remote-base ancestry checks before branch creation or PR opening
- diff-scope checks that detect unrelated commits relative to the intended remote base
- a root-scoped infrastructure exception list used during repository-structure operations

Guardrail v1 should cover four machine-checkable layers:

1. task gate
   - classify discussion/doc/implementation/bootstrap correctly
2. repository gate
   - verify repo identity, branch, worktree type, remote base, and branch ancestry
3. scope gate
   - verify declared target files, PR diff scope, and root-scoped infrastructure exceptions
4. reproducibility gate
   - verify clean install/build/test expectations before structure-changing work

Suggested commands:
- `agenticos_preflight`
- `agenticos_branch_bootstrap`
- `agenticos_pr_scope_check`

Related design artifact:
- `knowledge/agent-guardrail-design-v1-2026-03-23.md`
- `knowledge/agent-guardrail-command-contracts-v1-2026-03-23.md`

Related machine-checkable schema:
- `tasks/templates/agent-preflight-checklist.yaml`

## Why This Matters

The project has already observed that written rules alone do not reliably control agent behavior.

## Acceptance Criteria

- A concrete guardrail design exists
- Preflight can be evaluated in a machine-checkable way
- Missing issue/branch/worktree prerequisites can block or redirect implementation work
- A helper path exists to create the required branch/worktree correctly
- The guardrail can detect when a branch is based on the wrong baseline relative to `origin/main`
- The guardrail can detect or encode root-scoped infrastructure exceptions such as `.github/`
- The guardrail can distinguish `BLOCK` from `REDIRECT` when helper automation can safely repair setup
- A machine-readable preflight schema includes remote-base ancestry, scope checks, and reproducibility gates
- Command contracts exist for `agenticos_preflight`, `agenticos_branch_bootstrap`, and `agenticos_pr_scope_check`
- The command contracts separate checker responsibilities from mutating helper responsibilities
