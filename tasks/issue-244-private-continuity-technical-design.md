# Issue #244 Technical Design: Private Continuity Surface Persistence

## Purpose

Define the implementation plan for making `agenticos_save` persist the full
tracked continuity surface for `github_versioned + private_continuity`
managed projects.

This issue is not another runtime-home redesign. `#262` already fixed the
runtime project-resolution model. The gap here is narrower and policy-specific:

- private GitHub-managed projects still do not get full cross-machine
  continuity from `agenticos_save`

## Problem Restatement

Current `agenticos_save` stages only the narrow runtime review surface plus the
`CLAUDE.md` state mirror.

Current implementation path:

- `mcp-server/src/tools/save.ts`
- `mcp-server/src/utils/runtime-review-surface.ts`

That surface is intentionally thin:

- `state.yaml`
- `.last_record`
- configured conversations dir
- optional `CLAUDE.md`

This is not sufficient for `private_continuity`, because the declared policy
means the repository itself is allowed to carry the full tracked continuity
surface needed for a fresh clone to resume naturally.

So today the product has a contract mismatch:

- publication policy says full tracked continuity may remain in repo
- save behavior still persists only a thin runtime subset

## Goal

For `source_control.context_publication_policy = private_continuity`,
`agenticos_save` should persist the tracked continuity surface that allows:

- fresh clone
- latest pushed state
- no manual backup reconstruction

to restore usable project continuity.

## Non-Goals

Do not solve these in `#244`:

- raw conversation isolation for `public_distilled` projects
  - that belongs to `#245`
- schema redesign of project context paths
- runtime-home or session-local project resolution changes
  - already handled by `#262`
- archive import policy changes
- automatic migration of historical project content

## Design Principles

### 1. Policy-Driven, Not Heuristic-Driven

The continuity surface must be determined from the explicit managed-project
contract:

- topology
- context publication policy
- configured agent context paths

Do not infer save behavior from ad hoc path naming.

### 2. One Shared Policy / Path Authority

`#244` and `#245` must not introduce separate drifting path planners.

Introduce one shared policy/path resolver layer first, then build issue-specific
planning on top of it. That shared layer is responsible for:

- resolving publication policy
- resolving configured context paths
- determining the raw conversation write path
- determining the tracked continuity inclusion set
- determining sidecar-only exclusions
- enforcing repo-boundary rules fail-closed

`#244` should then add a continuity-surface planner that consumes this shared
authority instead of re-deriving policy/path rules in `save.ts`.

### 3. Separate “Continuity Surface” From “Runtime Review Surface”

The existing runtime review surface should not be stretched to mean backup or
continuity policy.

Reason:

- runtime review exclusion is a narrow operational concept
- continuity persistence is a higher-level product contract
- `#245` needs a different answer for public projects than `#244`

So `#244` should introduce a new continuity planner instead of overloading
`runtime-review-surface.ts`.

### 4. Fail Closed On Unsupported Policy Shapes

If a project does not declare a valid publication policy, or declares a policy
class whose continuity behavior is not implemented in the current command,
surface that explicitly instead of silently staging the wrong paths.

### 5. Full Continuity Does Not Mean “Everything In The Repo”

`private_continuity` means the repo carries the canonical tracked continuity
surface. It does not mean `git add .`.

The continuity planner must still exclude:

- machine-local caches
- `node_modules/`
- coverage/build junk
- `.context/.last_record`
- sidecar transcript areas
- archive blobs unless separately allowed
- transient runtime scratch files

## Operator Contract

`#244` should make the operator-facing recovery contract explicit.

| Policy | Raw conversation write path | Tracked continuity in repo | `agenticos_save` contract | Recovery guarantee |
| --- | --- | --- | --- | --- |
| `local_private` | local configured path | local only | keep current narrow runtime behavior | Git is not the recovery mechanism |
| `private_continuity` | configured conversations path | full tracked continuity surface | stage full tracked continuity set | fresh private clone + latest pushed state restores usable continuity |
| `public_distilled` | sidecar path from policy resolver | distilled tracked continuity only | not widened in this issue | raw history requires private sidecar and belongs to `#245` |

For `#244`, the required operator truth is:

- `private_continuity` means full tracked continuity is recoverable from Git
- it does not imply every repo file is continuity-critical
- it does not imply sidecar/private runtime surfaces become tracked

## Current-State Analysis

### Current Save Behavior

`save.ts` currently:

1. updates `state.yaml`
2. syncs `CLAUDE.md`
3. finds git root
4. stages only `resolveRuntimeReviewSurfacePaths(...).tracked_review_excluded_paths`

That is structurally too narrow for `private_continuity`.

### Current Context Inputs Already Exist

The system already has enough source inputs to build the continuity planner:

- `projectYaml.source_control.context_publication_policy`
- `resolveManagedProjectContextPaths()`
- `resolveManagedProjectContextDisplayPaths()`

So `#244` does not require a schema invention first.

### Current Drift Risks

Today policy/path logic is already spread across:

- `agent-context-paths.ts`
- `save.ts`
- `record.ts`
- `init.ts`
- templates
- generated adapter guidance

If `#244` adds private continuity staging without shared authority, `#245` will
recreate drift immediately.

## Proposed Solution

## A. Introduce A Shared Policy / Path Resolver First

Add one shared utility family that becomes the authoritative source for managed
project continuity behavior.

Suggested new utility:

- `mcp-server/src/utils/context-policy-plan.ts`

Suggested output shape:

```ts
interface ContextPolicyPlan {
  policy: 'local_private' | 'private_continuity' | 'public_distilled';
  project_root: string;
  repo_root: string | null;
  tracked_context_paths: {
    project_file: string;
    quick_start: string;
    state: string;
    conversations: string;
    knowledge: string;
    tasks: string;
    last_record: string;
  };
  raw_conversations_dir: string;
  tracked_conversations_dir: string | null;
  sidecar_only_paths: string[];
  repo_boundary_violations: string[];
}
```

This shared layer answers:

- what policy is active
- what configured paths exist
- which path is the raw conversation destination
- which tracked paths are continuity-relevant
- which paths are sidecar-only
- whether any configured path escapes the authoritative repo root

Issue-specific planners then consume this:

- `#244`: continuity-surface planner for `save`
- `#245`: conversation-routing planner for `record`

## B. Add A Continuity Surface Planner For `save`

Add:

- `mcp-server/src/utils/continuity-surface.ts`

Suggested output shape:

```ts
interface ContinuitySurfacePlan {
  policy: 'local_private' | 'private_continuity' | 'public_distilled';
  tracked_continuity_paths: string[];
  excluded_paths: string[];
  required_guidance_paths: string[];
  optional_guidance_paths: string[];
  unsupported_reasons: string[];
}
```

This planner should be built from `ContextPolicyPlan`, not from raw path
guessing inside `save.ts`.

## C. Define The `private_continuity` Inclusion Contract

Minimum tracked continuity set for `private_continuity`:

- `.project.yaml`
- configured quick-start path
- configured current state path
- configured conversations directory
- configured knowledge directory
- configured tasks directory

Required tracked continuity does not include optional mirrored guidance by
default. Guidance surfaces are classified separately:

- required tracked continuity:
  - the minimum set above
- optional tracked guidance surfaces:
  - `CLAUDE.md` when present and project-local
  - `AGENTS.md` when present and project-local

Operator contract:

- continuity correctness must not depend on `CLAUDE.md` / `AGENTS.md`
- if they exist as project-local canonical guidance, `save` should stage them
- if they are absent, continuity is still valid

Notes:

- use configured agent context paths, not hard-coded defaults
- only include paths inside the authoritative repo root
- do not assume repo root equals project root

## D. Define The Exclusion Contract

Explicit exclusions:

- configured last-record marker path
- `node_modules/`
- coverage outputs
- transient build outputs unless they are canonical checked-in source
- `.private/conversations/`
- `.meta/transcripts/`
- archive/reference dump areas
- any configured path outside the authoritative repo root

## E. Repo-Boundary Rules Must Be Fail-Closed

`#244` needs a deterministic rule when project root and git root differ.

Authoritative staging root:

- the git repo root returned for the managed project target

Rules:

1. build the shared `ContextPolicyPlan`
2. resolve the authoritative repo root
3. for every candidate tracked continuity path:
   - if inside repo root, it is eligible
   - if outside repo root, record a boundary violation
4. if any required tracked continuity path escapes repo root:
   - block `agenticos_save`
   - return an explicit unsupported / boundary error
5. if an optional guidance path escapes repo root:
   - exclude it
   - report that exclusion clearly

Do not silently downgrade the required continuity contract.

## F. Save Command Contract

`agenticos_save` should:

1. resolve the managed project target
2. build `ContextPolicyPlan`
3. validate publication policy and repo-boundary conditions
4. build `ContinuitySurfacePlan`
5. decide whether the command is allowed to proceed before mutating tracked
   state files
6. only after the plan is supported:
   - update `state.yaml`
   - sync `CLAUDE.md` / guidance mirrors if applicable
   - stage `tracked_continuity_paths`
7. continue to commit/push as today
8. report the actual operator-facing contract in the result text

Degraded / fail-closed rule:

- unsupported policy
- required repo-boundary violation
- invalid continuity plan

must be detected before tracked state mutation.

Recommended contract:

- do not update `state.yaml`
- do not rewrite `CLAUDE.md`
- do not stage partial continuity state
- return a structured failure explaining why continuity persistence was blocked

Do not allow a partially updated local continuity state that then fails before
the tracked contract can be satisfied.

Required result truth for `private_continuity`:

- actual tracked continuity paths staged
- optional guidance paths staged or skipped
- whether the saved state is fully recoverable from Git alone

If the policy is:

- `private_continuity`
  - fully supported in this issue
- `local_private`
  - keep the current narrow runtime behavior
- `public_distilled`
  - do not expand to full continuity here
  - leave public raw-history isolation to `#245`

## G. Documentation And Generated Guidance Contract

Completion of `#244` is not just code in `save.ts`.

The following operator-facing surfaces must stop teaching a universal or
policy-agnostic continuity model:

- `mcp-server/README.md`
- product-level `README.md` where recovery semantics are described
- `.meta/templates/.project.yaml` comments if they imply one universal meaning
- `.meta/templates/quick-start.md` when it teaches universal conversations-path
  semantics
- `mcp-server/src/utils/distill.ts`
- generated `CLAUDE.md` / `AGENTS.md` guidance if they present conversations as
  a universal tracked startup surface
- conformance checks that validate template/runtime truth

At minimum, the docs must state:

- `private_continuity` persists full tracked continuity
- `public_distilled` is different and not covered by `#244`
- `CLAUDE.md` / `AGENTS.md` are optional mirrored guidance surfaces, not the
  required continuity core

## File-Level Change Plan

### New

- `mcp-server/src/utils/context-policy-plan.ts`
- `mcp-server/src/utils/continuity-surface.ts`
- `mcp-server/src/utils/__tests__/context-policy-plan.test.ts`
- `mcp-server/src/utils/__tests__/continuity-surface.test.ts`

### Update

- `mcp-server/src/tools/save.ts`
- `mcp-server/src/tools/__tests__/save.test.ts`
- `mcp-server/src/utils/distill.ts`
- `mcp-server/README.md`
- product `README.md` if recovery semantics are exposed there
- `.meta/templates/.project.yaml`
- `.meta/templates/quick-start.md`
- conformance / standard-kit checks that encode continuity truth

## Test Plan

### Shared Policy / Path Resolver

Cover at minimum:

1. resolves policy and configured paths correctly
2. resolves repo root vs project root correctly
3. flags required tracked paths outside repo root
4. classifies `.private/conversations/` as sidecar-only
5. keeps `public_distilled` distinct from `private_continuity`

### Continuity Planner

Cover at minimum:

1. `private_continuity` returns the full required tracked set
2. custom configured paths are respected
3. required vs optional guidance surfaces are classified correctly
4. exclusions omit marker/junk paths
5. `public_distilled` does not accidentally resolve to full continuity

### Save Command

Cover at minimum:

1. `agenticos_save` stages:
   - `.project.yaml`
   - quick-start
   - state
   - conversations
   - knowledge
   - tasks
2. `CLAUDE.md` and `AGENTS.md` are staged only when present and repo-local
3. marker path is not staged
4. repo-boundary violations block the command clearly
5. result text explains Git-only recoverability truthfully
6. `public_distilled` still does not stage raw sidecar-only content in this
   issue
7. no-policy or invalid-policy projects fail clearly
8. unsupported plans fail before tracked state mutation

## Rollout Plan

### Tranche 1

- add shared `context-policy-plan` utility
- add shared planner tests

### Tranche 2

- add continuity-surface planner
- wire `save.ts` for `private_continuity`
- extend `save.test.ts`

### Tranche 3

- update docs/templates/generated guidance/conformance
- confirm release notes if behavior ships

## Open Questions

These should be answered during implementation, but none block the design:

1. Should `artifacts/` ever be included by default for `private_continuity`?
   - current recommendation: no, unless later subdirectories are explicitly
     classified as continuity-critical
2. Should `AGENTS.md` always be staged whenever present?
   - current recommendation: yes, if it is project-local canonical guidance
3. Should `local_private` remain on the current narrow runtime surface?
   - current recommendation: yes, do not widen it in `#244`

## Final Recommendation

Implement `#244` as:

1. one shared policy/path authority layer
2. one `private_continuity` continuity planner built on that authority
3. one `save` surface upgrade with explicit repo-boundary and operator recovery
   guarantees

Do not try to solve `public_distilled` transcript isolation inside the same
issue.

That keeps the sequencing clean:

1. `#244` makes private GitHub-managed projects recoverable from normal saved
   state
2. `#245` then adds the public-project sidecar isolation mode without
   contaminating the private continuity contract
