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
- context publication policy
- generated project files
- versioning and upgrade rules
- lifecycle impact analysis for install, upgrade, migration, and operator workflow changes

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
- `.context/conversations/` (tracked/display conversation contract path)
- `knowledge/`
- `tasks/`
- `artifacts/`

The contract distinguishes:

- canonical vs derived layers
- mutable vs append-only layers
- operational state vs durable synthesis
- project orientation vs raw session history
- topology/source inclusion vs publication visibility

For Git-backed projects, the canonical topology is `git_versioned` with
`source_control.repository.provider` set to `github`, `gitlab`, `gitee`, or
`generic`. Existing `github_versioned` / `github_repo` / `github_flow`
projects remain readable for installed machines, but downstream upgrades
should only rewrite them during an explicit normalization flow.

`.project.yaml` also carries the canonical context publication policy field:

- `local_private`
- `private_continuity`
- `public_distilled`

That field determines whether raw session history is allowed in tracked source for the project class, rather than forcing later tools to guess from topology alone.

For `public_distilled`, the downstream contract is split:

- `.context/conversations/` remains the tracked/display conversation contract path
- raw transcript writes should route to a private sidecar such as `.private/conversations/`
- quick-start and generated adapter surfaces should describe that split truthfully

The canonical rationale lives in:

- `projects/agenticos/standards/knowledge/memory-layer-contract-spec-2026-03-25.md`
- `projects/agenticos/standards/knowledge/context-publication-policy-2026-04-10.md`

## Sub-Agent Protocol

The kit now also carries the canonical sub-agent inheritance protocol.

Downstream projects inherit:

- `tasks/templates/sub-agent-handoff.md`
- sub-agent inheritance fields inside `tasks/templates/issue-design-brief.md`
- sub-agent verification fields inside `tasks/templates/submission-evidence.md`

The canonical rationale lives in:

- `projects/agenticos/standards/knowledge/sub-agent-inheritance-protocol-2026-03-25.md`

## Operator Intent Intake Protocol

The kit also carries a compact default rule for operator-intent resolution at task intake.

Downstream projects inherit this in two lightweight forms:

- generated adapter guidance in `AGENTS.md` and `CLAUDE.md`
- intake structure inside `tasks/templates/issue-design-brief.md`

The rule is intentionally compact in downstream runtime surfaces:

- interpret user input first
- recover intended outcome before treating named methods as the plan
- collapse the result into a clean execution objective before deeper autonomous work continues

Downstream projects should inherit the intake rule, not the whole standards-history discussion by default.

## Lifecycle Impact Protocol

The kit carries a lifecycle impact gate for changes that touch setup, runtime config, storage, service wiring, generated templates, install scripts, local services, external integrations, or operator workflows.

Downstream projects inherit this in three places:

- generated adapter guidance in `AGENTS.md` and `CLAUDE.md`
- planning fields inside `tasks/templates/issue-design-brief.md`
- preflight and submission evidence fields in `tasks/templates/agent-preflight-checklist.yaml` and `tasks/templates/submission-evidence.md`

The required analysis distinguishes a normal code upgrade from explicit migration or repair work. Normal upgrades must not silently mutate runtime config. Migration and repair flows must name the affected files or fields, provide dry-run/apply expectations when mutation is possible, include rollback guidance, and define verification evidence.

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
