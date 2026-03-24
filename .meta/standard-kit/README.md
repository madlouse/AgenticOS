# AgenticOS Downstream Standard Kit

Versioned standard package for downstream AgenticOS-managed projects.

## Purpose

This kit defines the canonical files, generated files, inheritance rules, and upgrade model for the executable AgenticOS workflow standard.

It exists so a downstream project can adopt the AgenticOS execution model without relying on chat history or reverse-engineering the main product repository.

## Scope

This kit covers:
- project-scoped agent instructions
- execution templates
- memory layer contracts
- generated project files
- versioning and upgrade rules

This kit does not include repository-root infrastructure such as:
- `.github/`
- release automation
- root-only CI wiring

Those remain repository-level concerns and must be handled separately.

## Canonical Sources

### Canonical generated files

These are generated or upgraded by `projects/agenticos/mcp-server/src/utils/distill.ts`:
- `AGENTS.md`
- `CLAUDE.md`

### Canonical copied templates

These live under `projects/agenticos/.meta/templates/`:
- `.project.yaml`
- `quick-start.md`
- `state.yaml`
- `agent-preflight-checklist.yaml`
- `issue-design-brief.md`
- `non-code-evaluation-rubric.yaml`
- `submission-evidence.md`

### Standards reference area

The standards rationale, design history, and protocol documents live under:
- `projects/agenticos/standards/`

Downstream projects should inherit the templates and generated rules, not the full standards history by default.

## Memory Layer Contract

The downstream kit now carries a canonical contract for:

- `.project.yaml`
- `.context/quick-start.md`
- `.context/state.yaml`
- `.context/conversations/`
- `knowledge/`
- `tasks/`
- `artifacts/`

The contract distinguishes:

- canonical vs derived layers
- mutable vs append-only layers
- operational state vs durable synthesis
- project orientation vs raw session history

The canonical rationale lives in:

- `projects/agenticos/standards/knowledge/memory-layer-contract-spec-2026-03-25.md`

## Package Contents

See:
- `manifest.yaml`
- `inheritance-rules.md`
- `adoption-checklist.md`

## Operational Commands

The standard kit is also exposed through first-class MCP commands:

- `agenticos_standard_kit_adopt`
- `agenticos_standard_kit_upgrade_check`

Use `agenticos_standard_kit_adopt` to materialize the kit into a downstream project.
Use `agenticos_standard_kit_upgrade_check` to compare an adopted project against the current canonical kit without mutating project-owned templates.

## Packaging Rule

If there is a conflict between older `.meta` guidance and this package:
- this standard kit wins

Files such as `.meta/agent-guide.md` and `.meta/rules.md` are retained only as legacy references unless they are explicitly updated to match this package.
