# Issue #203 — Root Product Docs Extraction

## Goal

Move authoritative product and operator documentation into `projects/agenticos` so the workspace root can shrink toward a compatibility layer.

## Scope

- add canonical `README.md`, `AGENTS.md`, and `CONTRIBUTING.md` under `projects/agenticos`
- update root `README.md`, `AGENTS.md`, and `CONTRIBUTING.md` to point at those canonical documents

## Validation

- `rg -n "canonical product-source|compatibility entrypoint" README.md AGENTS.md CONTRIBUTING.md`
- `test -f projects/agenticos/README.md`
- `test -f projects/agenticos/AGENTS.md`
- `test -f projects/agenticos/CONTRIBUTING.md`
