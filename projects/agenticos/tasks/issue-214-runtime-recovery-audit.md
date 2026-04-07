---
issue: 214
title: runtime recovery audit for workspace/source cutover
status: in_progress
owners:
  - codex
created: 2026-04-07
---

## Goal

Add one executable audit surface that reports whether the local machine is ready
to recover from the temporary external AgenticOS workspace back toward the
canonical workspace/source model.

## Why

Recent recovery work exposed multiple independent blockers:

- user config files still point `AGENTICOS_HOME` at `/Users/jeking/AgenticOS-workspace`
- the current MCP session can lag behind newly merged source changes
- the Homebrew-installed runtime can lag behind `origin/main`
- multiple Homebrew taps can make the effective runtime ambiguous
- the current source checkout is still a Git root, so it is not yet a safe final
  workspace home

Recovery cannot be treated as one config rewrite. It needs an explicit,
repeatable gate.

## Deliverables

- add a script under `projects/agenticos/tools/` that audits recovery readiness
- report results using `PASS`, `WARN`, and `BLOCK`
- cover at least:
  - configured `AGENTICOS_HOME` values across local agent config surfaces
  - `launchctl` session environment
  - installed runtime freshness markers
  - multiple formula/tap ambiguity
  - whether the target source root is still a Git root

## Self-check

### Rule-based

- the audit must be read-only
- the audit must produce deterministic structured output
- blocker conditions must be explicit rather than inferred from prose

### Executable

- run the script against the current local machine
- confirm it flags the temporary external workspace binding
- confirm it flags install/runtime ambiguity when present
- confirm it exits non-zero when any `BLOCK` check exists
