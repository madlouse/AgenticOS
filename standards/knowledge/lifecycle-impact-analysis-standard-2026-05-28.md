# Lifecycle Impact Analysis Standard

> Date: 2026-05-28
> Status: live
> Issue: #489
> Purpose: require install, upgrade, migration, and operator workflow impact analysis during AgenticOS design and review.

## Problem

Feature work can be correct in code while still failing operators during fresh install, upgrade, or migration. This happens when design and review only look at source changes and do not explicitly model generated files, runtime config, persisted state, local services, external integrations, or operator workflows.

AgenticOS treats this as a development standard rather than a project-specific lesson.

## Required Trigger

Lifecycle impact analysis is required when a change touches any of these surfaces:

- setup, bootstrap, install, release, or upgrade instructions
- runtime config, persisted state, storage, callback paths, or local service wiring
- generated project templates or generated adapter surfaces
- external integrations, tokens/secrets configuration, or platform-specific setup
- operator-facing commands, repair flows, migration commands, or workflow expectations

If none of these apply, the issue or PR may state `N/A` with a short rationale.

## Required Fields

Each applicable design or review must answer:

- Fresh install path: required prompts, flags, defaults, generated outputs, and validation commands.
- Existing upgrade path: whether the release is code-only or requires migration, repair, aliases, compatibility handling, or explicit operator review.
- Change surface: source files, generated templates/files, runtime config/state, local services or launch agents, external integrations, and operator-facing commands/workflows.
- Data/config migration: exact files or fields affected, dry-run/apply model, rollback guidance, audit evidence, and verification command.
- Tests/evidence: fresh-install scenario and legacy-upgrade scenario when setup/config or persisted state behavior changes.

## Review Gate

Reviewers should treat missing lifecycle impact as a finding when the change touches a lifecycle surface. The finding can be closed by either:

- a complete lifecycle impact section, or
- a defensible `N/A` statement showing that no setup, config, storage, service, generated-template, integration, migration, or operator-workflow surface changes.

## Upgrade Boundary

Normal code upgrades must not silently mutate runtime config or persisted operator state.

Explicit migration or repair flows must be:

- previewable before mutation where practical
- auditable through command output, logs, or recorded evidence
- reversible or backed by documented rollback guidance where practical
- separately verifiable through a named validation command

## Standard-Kit Surface

The downstream standard kit carries this requirement through:

- generated adapter guidance in `AGENTS.md` and `CLAUDE.md`
- `tasks/templates/issue-design-brief.md`
- `tasks/templates/agent-preflight-checklist.yaml`
- `tasks/templates/submission-evidence.md`
- `.meta/standard-kit/README.md`, `adoption-checklist.md`, and `inheritance-rules.md`

Downstream projects may customize copied templates after adoption, but they should preserve equivalent lifecycle checks when they modify setup, upgrade, migration, or operator workflow behavior.
