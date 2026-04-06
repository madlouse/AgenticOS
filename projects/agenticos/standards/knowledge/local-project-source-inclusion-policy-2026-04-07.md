# Local Project Source Inclusion Policy

## Purpose

`AgenticOS` must distinguish project workflow topology from canonical source-control inclusion.

These are different questions:

1. how should the project iterate?
2. should the project remain tracked inside the GitHub-backed canonical source tree?

## Workflow Topology

Workflow topology answers how the project operates.

- `local_directory_only`
  - local/private iteration
  - no GitHub Flow required
- `github_versioned`
  - issue/PR/release style iteration
  - GitHub Flow required

## Canonical Source Inclusion

Canonical source inclusion answers whether the project root should remain tracked inside the canonical `AgenticOS` repository.

Two source-inclusion modes matter in practice:

- `included_in_canonical_source`
  - the project root is tracked in the canonical GitHub-backed repository
- `excluded_local_root`
  - the project root lives under `AGENTICOS_HOME/projects/`, but is intentionally ignored by the canonical repository

## Policy Matrix

### `github_versioned` + included in canonical source

Use this for capability surfaces intentionally maintained inside the canonical source tree.

Examples:

- `projects/agenticos`
- `projects/360teams`

### `github_versioned` + standalone repo

Use this for downstream projects that are GitHub-managed but own their own repository root under `projects/`.

Examples:

- `projects/agent-cli-api`

### `local_directory_only` + excluded local root

Use this for long-lived local projects whose content should not be pushed through the canonical GitHub repository.

Examples:

- `T5T`
- private research notebooks
- local writing systems

## Decision Rule

If a project is `local_directory_only`, do not assume it belongs in canonical GitHub source control.

Ask a second question:

- does this project need to remain in the canonical repository for product reasons?

If not, prefer `excluded_local_root`.

## Migration Rule

When an already-tracked project is judged to be `local_directory_only` and private/local in nature:

1. preserve the local project root
2. stop tracking the project in canonical source control
3. add an explicit ignore rule for the project root
4. keep the project registered in AgenticOS as a local managed project

## Immediate Application

This policy applies directly to `T5T`.

`T5T` is a valid long-lived local managed project, but it should not be treated as a GitHub-backed capability surface.
Its next normalization step should therefore be extraction from canonical source control rather than a tracked metadata-only patch inside the repository tree.
