# Issue #195: Workspace Migration off Source Checkout

## Summary

Migrate the live AgenticOS workspace off the product source checkout and onto a dedicated workspace root.

This is the first execution wave under issue `#193`.

GitHub issue:

- https://github.com/madlouse/AgenticOS/issues/195

## Goal

- move the live `AGENTICOS_HOME` away from the Git-backed AgenticOS source checkout
- preserve the current managed-project workspace data
- update supported local agent configs to point at the dedicated workspace
- prove that normal workspace operations no longer dirty the product source checkout

## Acceptance Criteria

1. `AGENTICOS_HOME` in local agent configs no longer points inside the source checkout.
2. a dedicated workspace root exists and contains `.agent-workspace/` and `projects/`.
3. `agenticos_list`, `agenticos_switch`, and `agenticos_status` work against the new workspace.
4. running a project switch does not introduce new Git dirtiness in the product source checkout.
5. the migration is documented and has a repeatable verification command.
