# Issue #193: Root Workspace Topology Separation

## Summary

`AgenticOS` still mixes the live workspace root and the product source repository into the same enclosing directory.

This issue defines the root-level contract needed to finish the self-hosting model cleanly:

1. `AGENTICOS_HOME` is a workspace home, not the default product-source Git root.
2. `projects/*` entries are child projects with explicit project topology.
3. `projects/agenticos` is the canonical AgenticOS product project.
4. normal workspace operations must not dirty canonical product source unexpectedly.

GitHub issue:

- https://github.com/madlouse/AgenticOS/issues/193

## Current Contradictions

- the enclosing `AgenticOS/` root is still a Git repository
- the same root also holds `.agent-workspace/`, `worktrees/`, `.private/`, and `projects/*`
- the README already says a source checkout should stay separate from the live workspace
- normal operations such as project switching still mutate workspace files inside the Git-backed root

## Target Model

- `AGENTICOS_HOME`
  - pure workspace root
  - may contain registry, runtime files, local projects, and user-managed backups
  - should not implicitly be the canonical AgenticOS product repo
- `projects/agenticos`
  - canonical AgenticOS product project
  - versioned and upgraded through standard issue / branch / PR flow
- sibling projects under `projects/`
  - either `github_versioned`
  - or `local_directory_only`

## Acceptance Criteria

- root workspace responsibilities are explicitly documented
- product-source responsibilities are explicitly documented
- migration guidance exists from the current mixed self-hosting layout
- implementation follow-ups can be split into phase-specific issues instead of ad hoc cleanup

## Planned Execution Waves

1. freeze the root contract and target topology
2. identify which root paths remain legitimate product-source exceptions
3. move runtime and workspace writes away from canonical source assumptions
4. migrate local-only project roots out of canonical source control semantics
5. remove the remaining dependency on a Git-backed workspace root
