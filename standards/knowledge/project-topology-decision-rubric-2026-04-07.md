# Project Topology Decision Rubric

## Purpose

`AgenticOS` supports two explicit project topologies:

- `local_directory_only`
- `github_versioned`

This rubric defines when to choose each one, when to stop and confirm, and how a local project can later upgrade into GitHub Flow.

## Direct Rules

Choose `local_directory_only` when the project is primarily:

- ongoing work execution
- weekly or periodic writing
- local knowledge synthesis
- private operating material
- project-specific documentation that does not need public or shared version control

Choose `github_versioned` when the project is primarily:

- a reusable capability
- a tool, CLI, plugin, skill, library, or automation surface
- a standard, framework, or process asset expected to evolve through issue/PR review
- something that will be released, reused across projects, or maintained as a durable product surface

## Fail-Closed Rule For Ambiguous Projects

Do not guess when the project sits between the two modes.

An explicit confirmation is required when the project could plausibly be either:

- a private knowledge/workstream project
- a reusable product capability

The confirmation question is:

1. Is the long-term goal continuous content/work output, or continuous capability growth?
2. Will this project need issue/PR/release style iteration as a first-class operating mode?

If the answer is still unclear after those questions, default to confirmation rather than automatic topology selection.

## Examples

Use `local_directory_only` for:

- weekly planning or reporting projects such as T5T
- private research notebooks
- local writing systems
- role-specific operating playbooks

Use `github_versioned` for:

- OpenCLI adapters
- release automation
- reusable writing or publish tooling
- a standard kit or review framework intended for repeated reuse

## Upgrade Path

`local_directory_only` is not a dead end.

Projects may upgrade to `github_versioned` later when they cross the boundary from local work product to reusable capability.

The upgrade rule is:

1. create or identify the target GitHub repository
2. re-run `agenticos_init` with `normalize_existing=true`, `topology=github_versioned`, and `github_repo=OWNER/REPO`
3. treat the project as GitHub Flow managed from that point onward

Do not silently upgrade a project just because it starts containing code.
The upgrade must be explicit.

## Policy Boundary

GitHub Flow is for capability growth.

A local project that only evolves private knowledge, writing, or working material should remain `local_directory_only` even if it changes frequently.

Only the capability-like subset should move into GitHub Flow.
When necessary, split that subset into its own project rather than forcing the whole local project into a versioned workflow.
