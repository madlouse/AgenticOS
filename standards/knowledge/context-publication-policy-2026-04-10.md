# Context Publication Policy - 2026-04-10

## Problem

Workflow topology and canonical source inclusion do not answer a third question:

- which context surfaces are allowed to live in tracked Git source for this project class?

Without that contract, later runtime behavior has to guess from topology and local convention. That is not precise enough for `github_versioned` projects.

## Canonical Field

The canonical field location is:

- `.project.yaml`
- `source_control.context_publication_policy`

## Allowed Values

### `local_private`

Use for:

- `local_directory_only` projects

Meaning:

- the project remains local/private by default
- AgenticOS should not assume raw or distilled continuity surfaces belong in a public or shared tracked source tree

### `private_continuity`

Use for:

- `github_versioned` projects whose repository is private and where cross-machine AI continuity matters more than transcript secrecy

Meaning:

- full continuity surfaces may be tracked in the repo
- `.context/conversations/` may remain a tracked project surface

### `public_distilled`

Use for:

- `github_versioned` projects whose repository is public or otherwise should not publish raw session history

Meaning:

- distilled context may be tracked in source
- raw session history and other non-publishable runtime surfaces must be isolated from the public source tree
- `.context/conversations/` must not remain a tracked public-tree path once enforcement work lands

## Interaction With Other Contracts

These are separate axes:

1. workflow topology
2. canonical source inclusion
3. context publication policy

Examples:

- `github_versioned` + `included_in_canonical_source` + `public_distilled`
  - tracked capability surface inside the main AgenticOS repo
  - public repo
  - raw conversations must be isolated
- `github_versioned` + standalone repo + `private_continuity`
  - separate GitHub repo
  - private continuity surfaces may remain tracked there
- `local_directory_only` + `excluded_local_root` + `local_private`
  - long-lived local project
  - not intended for tracked Git publication

## Current Enforcement Boundary

This issue defines the contract and pushes it into templates, initialization flow, and conformance checks.

It does not yet implement all publication-aware routing behavior.

Follow-up work:

- `#244` private continuity persistence behavior
- `#245` raw conversation isolation for public `github_versioned` projects

## Outcome

After this policy lands, later implementation issues can route `save`, `record`, and runtime sidecars against one explicit contract instead of inventing topology-based heuristics.
