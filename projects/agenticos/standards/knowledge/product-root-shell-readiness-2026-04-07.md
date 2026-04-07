# Product-Root Shell Readiness

## Purpose

Prepare `projects/agenticos/` to act as the future standalone AgenticOS
product-repository root before the enclosing workspace home stops being the Git
root.

## Canonical Shell Surfaces

The product project now carries its own future repo-root shell:

- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `ROADMAP.md`
- `LICENSE`
- `.gitignore`
- `.github/`
- `scripts/`
- `tools/`

These files do not retire the workspace-root copies yet. They make the future
destination explicit so the remaining root-owned shell can be reduced without
guesswork.

## Verification

Run:

```bash
projects/agenticos/tools/audit-product-root-shell.sh --project-root projects/agenticos
```

Pass conditions:

1. no required shell paths are missing
2. `.github/` workflows and repo helper scripts no longer reference
   `projects/agenticos` as a nested working directory
3. the product project is self-sufficient enough to become the future Git root

## Non-Goals

- this step does not remove the current workspace-root `.git`
- this step does not yet retire root compatibility shims
- this step does not move GitHub remote ownership
