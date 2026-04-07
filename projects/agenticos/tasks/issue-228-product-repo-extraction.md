# Issue #228 — Standalone Product-Repo Extraction

## Goal

Define the safe, reversible extraction path that turns `projects/agenticos` into
the real AgenticOS Git product repository and allows the enclosing workspace
home to stop being the Git root.

## Scope

- add a readiness audit for standalone product-repo extraction
- freeze a concrete runbook with explicit verification and rollback points
- make remote and release ownership handoff explicit instead of implicit

## Validation

- `bash -n projects/agenticos/tools/audit-product-repo-extraction-readiness.sh`
- `projects/agenticos/tools/audit-product-repo-extraction-readiness.sh --workspace-root /Users/jeking/dev/AgenticOS --product-root /Users/jeking/dev/AgenticOS/projects/agenticos`
- `test -f projects/agenticos/standards/knowledge/standalone-product-repo-extraction-runbook-2026-04-07.md`
