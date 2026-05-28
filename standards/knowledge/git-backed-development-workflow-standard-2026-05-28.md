# Git-Backed Development Workflow Standard

---
status: live
date: 2026-05-28
issue: "#490"
scope: AgenticOS Git-backed project metadata, guardrails, and provider boundaries
---

## Purpose

AgenticOS development work is Git-bound, not GitHub-bound. GitHub, GitLab,
Gitee, and generic Git remotes use the same issue/task boundary, isolated
worktree, verification, scope-check, review, merge, and cleanup standard.

## Project Metadata

New Git-backed projects should use the host-neutral topology:

```yaml
source_control:
  topology: git_versioned
  context_publication_policy: public_distilled
  repository:
    provider: github # github | gitlab | gitee | generic
    remote: origin
    slug: owner/repo
    default_base_branch: origin/main
    review_system: pull_request # pull_request | merge_request | none
  branch_strategy: issue_branch_review_merge
execution:
  source_repo_roots:
    - .
```

Existing installed projects that declare `github_versioned`, `github_repo`,
and `github_flow` remain readable and operational. AgenticOS must not rewrite
those fields during normal `switch`, `status`, `preflight`, `edit_guard`,
`save`, or health flows.

## Normalization

Metadata migration is explicit:

1. Run `agenticos_init` with `normalize_existing=true`.
2. Set `topology=git_versioned`.
3. Provide `repository={provider, slug}` or `github_repo=OWNER/REPO` as a
   GitHub shorthand.
4. Verify `.project.yaml` now uses `source_control.repository` and
   `branch_strategy=issue_branch_review_merge`.

Do not silently normalize old GitHub fields while resolving project identity.

## Enforcement Layers

- Guidance layer: generated adapter surfaces, skills, templates, and docs
  describe the Git-backed standard.
- MCP guardrail layer: `preflight`, `branch_bootstrap`, `issue_bootstrap`,
  `edit_guard`, `pr_scope_check`, and policy enforcement fail closed when
  project identity, source roots, branch ancestry, or scope are unproven.
- Runtime/repository layer: supported agent runtimes may add pre-edit hooks or
  wrappers, and Git hosts must enforce branch protection, required checks, and
  review rules when hard remote enforcement is needed.

Provider adapters can prove different amounts of evidence. GitHub and GitLab
have bundled CLI adapters. Gitee and generic Git initially require manual or
host-side evidence for review/CI enforcement while still sharing the local
AgenticOS guardrail flow.
