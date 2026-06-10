# Project Lifecycle

## 1. Overview

Project lifecycle is the foundation of AgenticOS. It creates or resolves a
managed project, assigns stable identity, records topology, and exposes a
machine-readable contract so agents do not treat arbitrary directories as
projects.

Public surfaces:

- `agenticos_init`
- `agenticos_project_resolve`
- `agenticos_project_ensure`
- `agenticos_list`
- `.project.yaml`
- runtime registry under `$AGENTICOS_HOME/.agent-workspace/`

User value: a user can say "create/switch/continue this project" and the agent
can bind to a known project identity instead of guessing from cwd, git branch, or
directory name.

## 2. Detailed Design

Project identity is path-bound and metadata-bound. `.project.yaml` carries the
project name, id, kind, context publication policy, and source-control topology.
The registry provides discovery and compatibility data, but normal project
commands must prove the checkout identity before mutating state.

Core flow:

1. A project is created with `agenticos_init` or resolved with
   `agenticos_project_resolve`.
2. Git-backed projects declare source-control metadata and source repo roots.
3. Local-only projects keep private continuity and avoid pretending to have a
   PR/release workflow.
4. Topic and project routing share the same managed project shell while
   retaining `project_kind` for internal behavior.
5. Legacy `github_versioned` metadata remains readable; migration to
   `git_versioned` is explicit.

Invariants:

- Project id is stable.
- Registry display concerns must not override `.project.yaml` identity.
- Metadata normalization is explicit, not a side effect of status/switch.
- Missing project context must fail closed for task/state mutations.

Failure modes:

- Registry and project path drift.
- Display name differs from canonical slug.
- Work is run from an external worktree but guardrails compare against the wrong
  checkout.
- Older projects still use GitHub-only topology fields.

## 3. Implementation Mapping

| Surface | Files/Tests | Notes |
| --- | --- | --- |
| Project creation | `mcp-server/src/tools/init.ts`, `src/tools/__tests__/init.test.ts` | Creates project layout and metadata. |
| Project resolve/ensure | `mcp-server/src/tools/project-resolve.ts`, `src/tools/__tests__/project-resolve.test.ts` | Used by project entry and optional channel routing. |
| Registry/contract | `mcp-server/src/utils/registry.ts`, `project-contract.ts`, `project-target.ts` | Maintains identity and path checks. |
| Topology model | `standards/knowledge/git-backed-development-workflow-standard-2026-05-28.md` | Defines `git_versioned` host-neutral contract. |

Issue cluster: 83 lifecycle issues. Open gaps are `#521`, `#516`, and `#514`.

Status: implemented and tested. The current risk is not absence of lifecycle
support; it is duplicated identity resolution across guardrail tools.

## Gaps

- `#521`: add `display_name` so UI/user-facing labels can differ from canonical
  id/slug without breaking resolution.
- `#514`: extract a unified checkout-identity resolver.
- `#516`: persist session project binding across MCP reconnects.
