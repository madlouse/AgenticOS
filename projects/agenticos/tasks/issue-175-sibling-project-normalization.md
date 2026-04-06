# Issue #175: Normalize Managed Sibling Project Roots and Local Mirror Exclusions

## Summary

The canonical `AgenticOS` checkout contains a mixed set of downstream managed projects, archived reference projects, and local-only helper trees.

This issue makes that classification explicit so future cleanup, guardrails, and review slices stop re-litigating whether these roots belong in product review.

GitHub issue:

- https://github.com/madlouse/AgenticOS/issues/175

## Required Outcome

1. Classify each currently ambiguous root as one of:
   - active managed downstream project
   - archived/reference-only project
   - excluded local mirror/helper tree
2. Land a durable policy document under `projects/agenticos/standards/knowledge/`.
3. Identify metadata follow-ups separately instead of mixing them into this classification pass.

## Acceptance Criteria

- `projects/agent-cli-api`, `projects/agenticresearch`, `projects/ghostty-optimization`, and `projects/agentic-os-development` each have an explicit normalization decision.
- Root-local helper trees such as `mcp-server/`, `.private/`, and `worktrees/` have an explicit exclusion rule.
- The landed document explains what belongs in canonical product review and what must stay out of it.
