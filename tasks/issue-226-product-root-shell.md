# Issue #226 — Product-Root Shell Readiness

## Goal

Prepare `projects/agenticos` to act as the future standalone AgenticOS
product-repository root so the enclosing workspace home can stop being the Git
root later.

## Scope

- add the minimum future repo-root shell under `projects/agenticos`
- mirror workflow and repository metadata needed for standalone maintenance
- add a repeatable audit that verifies product-root shell readiness

## Validation

- `projects/agenticos/tools/audit-product-root-shell.sh --project-root projects/agenticos`
- `test -f projects/agenticos/.github/workflows/ci.yml`
- `test -f projects/agenticos/.github/workflows/release.yml`
- `test -f projects/agenticos/.github/workflows/readme-lint.yml`
- `test -f projects/agenticos/CHANGELOG.md`
- `test -f projects/agenticos/ROADMAP.md`
- `test -f projects/agenticos/CLAUDE.md`
