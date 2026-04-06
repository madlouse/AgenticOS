# Issue #191: Separate Local Topology From Canonical Source Inclusion

## Summary

`local_directory_only` is about workflow shape, not about whether a project should remain tracked in the canonical GitHub-backed repository.

This issue adds the missing policy layer so private/local projects like `T5T` can be normalized correctly.

## Scope

- define the distinction between workflow topology and canonical source inclusion
- define when a local project should become an excluded local root
- capture `T5T` as the immediate motivating example

## Non-Goals

- do not yet perform the full `T5T` extraction in this issue
- do not change `github_versioned` downstream repo handling
