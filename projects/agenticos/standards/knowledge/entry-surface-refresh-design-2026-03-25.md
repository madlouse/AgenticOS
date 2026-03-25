# Entry Surface Refresh Design — 2026-03-25

## Problem

`projects/agenticos/standards/.context/quick-start.md` and `.context/state.yaml` are the first live resume surfaces for future agents.

The current gap is not that these files are missing. The gap is that they still depend on manual rewriting after merged issue work.

That creates two failure modes:

- merged standards knowledge exists, but the entry surfaces still describe stale work
- agents recover from the entry surfaces, not from the newest merged issue reports

## Design Reflection

The wrong solution would be a freeform summarizer that scans arbitrary merged documents and rewrites the entry surfaces heuristically.

That would be noisy, hard to verify, and likely to violate the memory-layer contract for:

- `quick-start.md` as concise orientation
- `state.yaml` as mutable operational state

The right solution is a bounded refresh command:

- input is structured merged-work data
- output is deterministic quick-start and state content
- refresh remains concise and resume-oriented
- verification can be direct and fixture-based

## Chosen Design

Add one command:

- `agenticos_refresh_entry_surfaces`

It accepts:

- target `project_path`
- concise merged-work `summary`
- high-level `status`
- `current_focus`
- optional `issue_id`
- optional `facts`, `decisions`, `pending`
- optional landed `report_paths`
- optional `recommended_entry_documents`

It then:

1. resolves project identity from `.project.yaml`, with explicit overrides allowed
2. rewrites `.context/quick-start.md` using a deterministic resume format
3. rewrites `.context/state.yaml` using deterministic operational-state updates
4. persists a bounded `entry_surface_refresh` section in state for later auditability

## Why This Scope Is Correct

This solves the actual automation gap without:

- inventing AI summarization rules for arbitrary docs
- turning `quick-start.md` into an append-only log
- turning `state.yaml` into a second knowledge base
- coupling refresh to GitHub API availability

It also composes cleanly with later work:

- `#97` can report entry-surface freshness
- later post-merge automation can call this command
- later review tooling can inspect `entry_surface_refresh`

## Non-Goals

This issue does not:

- auto-detect every merged issue without structured input
- refresh arbitrary archived files
- redesign the memory-layer contract
- replace standards knowledge reports as the canonical detailed record

## Acceptance Shape

The feature is complete when:

- refresh is deterministic
- quick-start remains concise
- state remains operational
- landed report paths and next-step backlog can be injected without manual file editing
- runtime tests prove the refresh logic at 100 percent statements, branches, functions, and lines coverage
