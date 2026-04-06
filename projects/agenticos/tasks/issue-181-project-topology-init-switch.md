# Issue #181: Require Explicit Source-Control Topology for Init and Switch

## Summary

`AgenticOS` currently lets a project become active before its source-control topology is explicitly normalized.

This issue makes the first version of that contract executable:

1. `agenticos_init` requires a topology choice.
2. existing projects must be explicitly normalized before reuse.
3. `agenticos_switch` and shared managed-project resolution fail closed for projects that still lack the topology contract.

GitHub issue:

- https://github.com/madlouse/AgenticOS/issues/181

## Contract

- `local_directory_only`
  - local project directory
  - no GitHub/repo binding required
- `github_versioned`
  - GitHub-backed project
  - must declare `github_repo`
  - must declare repo binding through `execution.source_repo_roots`
  - branch strategy is fixed to `github_flow`

## Acceptance Criteria

- new projects cannot be created without `topology`
- legacy projects are not silently reactivated; they must be normalized first
- switch/resolution blocks non-normalized projects instead of letting work continue
