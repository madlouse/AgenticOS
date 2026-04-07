# Issue #230 — Mode-1 Product-Repo Extraction Execution

## Goal

Execute the approved mode-1 migration path: replace the current AgenticOS
repository history with the standalone product-repository history rooted at
`projects/agenticos`.

## Scope

- create reversible pre-extraction recovery points
- generate and validate subtree-split candidate history
- remove source-layout blockers that prevent `projects/agenticos` from acting as
  a standalone product repository
- keep remote mutation blocked until standalone validation passes locally

## Validation

- `projects/agenticos/tools/audit-product-repo-extraction-readiness.sh --workspace-root /Users/jeking/dev/AgenticOS --product-root /Users/jeking/dev/AgenticOS/projects/agenticos`
- `cd projects/agenticos/mcp-server && npm test`
- standalone split checkout passes `tools/audit-product-root-shell.sh --project-root .`
