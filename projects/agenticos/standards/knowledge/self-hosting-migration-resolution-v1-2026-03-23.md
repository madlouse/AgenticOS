# AgenticOS Self-Hosting Migration Resolution v1

> Date: 2026-03-23
> Status: draft resolution v1
> Purpose: freeze the target model for AgenticOS self-hosting migration before structural moves begin

## 1. Resolution

AgenticOS will move toward a self-hosting workspace model.

The frozen target model for v1 is:

1. The public product identity remains `AgenticOS`.
2. The current top-level `AgenticOS` directory becomes the workspace home.
3. The canonical managed product project path becomes `projects/agenticos`.
4. Current standards content should move under `projects/agenticos/standards/`.
5. Runtime-only artifacts should move under `.runtime/`.

## 2. Rationale

This model resolves the current ambiguity between:
- product source
- standards/meta project
- runtime workspace
- runtime byproducts

It also makes AgenticOS self-hosting explicit:
- AgenticOS becomes one managed project inside its own workspace
- standards and implementation are unified inside that product project

## 3. Scope of This Resolution

This resolution freezes the intended target model.

It does **not** yet execute:
- directory moves
- Git history migration
- CI path rewrites
- Homebrew path rewrites
- runtime project extraction

Those remain separate execution phases.

## 4. Impact Boundary

The migration should primarily target the AgenticOS host product itself.

That means:
- existing runtime projects should remain largely unaffected unless they need minimal path or workspace adjustments
- the migration should not become a forced redesign of all existing managed projects

## 5. Naming and Roles

### Workspace root

- current top-level `AgenticOS/`
- role: workspace home

### Main product project

- path: `projects/agenticos`
- role: canonical managed product project

### Standards area

- path: `projects/agenticos/standards/`
- role: home for current `agentic-os-development` content

### Runtime root

- path: `.runtime/`
- role: worktrees, caches, and other runtime-only artifacts

## 6. Non-Goals

This resolution does not imply:
- renaming the public product away from `AgenticOS`
- immediately moving every existing runtime project
- collapsing all projects into the main product project
- skipping phased verification and rollback boundaries

## 7. Required Follow-Up

The next implementation-facing work should:

1. enumerate exact paths that move into `projects/agenticos`
2. enumerate exact standards paths that move into `projects/agenticos/standards/`
3. enumerate root-relative paths that need rewriting
4. define phase-by-phase verification and rollback gates

## 8. Working Consequence

From this point on, planning should assume:
- `projects/agenticos` is the target canonical product project path
- `projects/agenticos/standards/` is the target standards location
- `.runtime/` is the target runtime-only location

Any alternative target model should now be treated as a deliberate change request, not as the default assumption.

## 9. Execution Correction

Real execution later established one important repository-level exception:

- `.github/` must remain at repository root

Reason:
- GitHub Actions workflow discovery is root-scoped

So the executed self-hosting model is:
- product source under `projects/agenticos/`
- standards under `projects/agenticos/standards/`
- runtime-only state under `.runtime/`
- repository automation under root `.github/`
