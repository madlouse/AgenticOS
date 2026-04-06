# Issue #177: Declare Downstream Source Repo Roots

## Summary

Policy issue `#175` confirmed that some roots under `projects/` are active managed downstream projects, but not all of them are in the same canonical source state.

This issue covers the tracked downstream project metadata that already exists on `origin/main` and still lacks explicit `execution.source_repo_roots`.

GitHub issue:

- https://github.com/madlouse/AgenticOS/issues/177

## Scope

1. Add `execution.source_repo_roots` for tracked downstream project metadata that is already in canonical source control.
2. Verify the declaration matches the actual Git common repo root.
3. Keep local-only downstream roots out of scope and route them through their own normalization issue.

## Split

- `projects/ghostty-optimization` is present on `origin/main` and is handled here.
- `projects/agent-cli-api` and `projects/agenticresearch` are local-only roots in the canonical dirty tree and are handled separately under issue `#178`.

## Acceptance Criteria

- `projects/ghostty-optimization/.project.yaml` declares the correct repo root.
- Guardrail resolution can prove the project's source root without a missing-declaration failure.
