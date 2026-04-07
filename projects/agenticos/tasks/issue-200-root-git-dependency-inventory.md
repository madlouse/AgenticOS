# Issue #200: Root Git Dependency Inventory

## Summary

Inventory every dependency that still assumes the AgenticOS workspace home is also a Git repository.

GitHub issue:

- https://github.com/madlouse/AgenticOS/issues/200

## Goal

Before removing the root-level `.git`, enumerate the remaining blockers and classify each by migration strategy.

## Acceptance Criteria

1. every blocker is classified into a small set of categories
2. each category includes concrete file-path evidence
3. each blocker category has a proposed destination or handling rule
4. the inventory is sufficient to drive follow-up implementation slices without rediscovery work
