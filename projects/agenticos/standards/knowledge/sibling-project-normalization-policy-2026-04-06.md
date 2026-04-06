# Sibling Project Normalization Policy

> Issue: #175
> Date: 2026-04-06
> Status: decision complete

---

## Scope

Normalize the status of sibling project roots and local mirror/helper trees currently present in the canonical `AgenticOS` checkout.

This policy answers one question only:

**Does this root belong in canonical managed-project review, archived provenance, or local-machine-only exclusion?**

It does not migrate project contents or rewrite those projects.

---

## Classification Rules

### 1. Active managed downstream project

A root is treated as an active managed downstream project when all of the following are true:

- it is registered in AgenticOS as a project
- it has project metadata (`.project.yaml`)
- operators are expected to switch into it and continue work there
- its runtime state belongs to that project, not to the root `AgenticOS` product

Implication:

- the project root is legitimate under `projects/`
- its runtime surfaces remain runtime-managed and must stay out of normal product review slices
- its durable changes must flow through that downstream project's issue/branch/PR process, not through root `AgenticOS` cleanup PRs

### 2. Archived/reference-only project

A root is treated as archived/reference-only when it exists to preserve historical context but is not an implementation target.

Implication:

- the root may remain on disk under `projects/`
- it must declare an archive/reference contract
- operators should not route new implementation work into it
- canonical implementation should redirect to the replacement managed project

### 3. Excluded local mirror/helper tree

A root is treated as excluded local machine state when it is a helper mirror, private operator workspace, or worktree artifact rather than a managed project.

Implication:

- it is not part of canonical product review
- it must not be normalized through product implementation PRs
- it may remain on disk for local workflows, but policy must treat it as outside the durable review surface

---

## Current Decisions

| Root | Decision | Reason |
| --- | --- | --- |
| `projects/agent-cli-api/` | Active managed downstream project | Present in registry, has `.project.yaml`, contains its own project assets, and is an expected operator target. |
| `projects/agenticresearch/` | Active managed downstream project | Present in registry, has `.project.yaml`, and is being used as a managed project even though it is currently knowledge-heavy. |
| `projects/ghostty-optimization/` | Active managed downstream project | Present in registry, has `.project.yaml`, and its runtime/doc surfaces belong to that downstream project. |
| `projects/agentic-os-development/` | Archived/reference-only project | Already declares `archive_contract` with `managed_project: false` and points operators back to `projects/agenticos`. |
| `mcp-server/` | Excluded local mirror/helper tree | Root-local mirror outside managed project boundaries; not a canonical project root. |
| `.private/` | Excluded local mirror/helper tree | Operator-private machine state, not durable product source. |
| `worktrees/` | Excluded local mirror/helper tree | Implementation infrastructure for isolated execution, not product source. |

---

## Review Surface Consequences

### Canonical `AgenticOS` product review

Canonical `AgenticOS` product review should include only:

- root `AgenticOS` product files intentionally scoped for the current issue
- the target managed project selected for the current issue
- declared target files inside that target project's canonical source surface

Canonical `AgenticOS` product review should not treat the following as normal product diff:

- downstream project runtime state
- downstream project durable work that belongs to a different managed project issue flow
- archived/reference-only project contents
- local mirror/helper trees

### Cleanup behavior

When canonical dirty-tree cleanup sees one of these roots:

- active managed downstream project:
  route durable changes into that project's own issue flow
- archived/reference-only project:
  preserve as reference unless a separate archival migration issue says otherwise
- excluded local mirror/helper tree:
  keep outside review scope and do not normalize through product PRs

---

## Metadata Follow-Ups

This issue only lands classification policy. It does not silently rewrite project metadata.

Follow-up work may still be needed for:

- adding `execution.source_repo_roots` where downstream projects are missing explicit source binding
- deciding whether `agent-cli-api/.git` is the intended long-term source layout or should be normalized differently
- tightening registry/status behavior so archived/reference-only projects cannot accidentally look like normal active implementation targets

Those are separate implementation issues, not part of this policy decision.

---

## Operator Rule

If a path under `projects/` feels ambiguous, do not infer from the directory name alone.

Resolve it in this order:

1. project registry status
2. `.project.yaml` metadata
3. archive contract, if present
4. this normalization policy

If those signals still conflict, open a new scoped issue instead of routing the path through an ad hoc cleanup PR.
