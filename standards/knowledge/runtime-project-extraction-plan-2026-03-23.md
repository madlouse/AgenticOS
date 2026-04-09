# Runtime Project Extraction Plan - 2026-03-23

## Summary

After self-hosting landed, the AgenticOS source repository has one canonical product-source project:

- `projects/agenticos`

The remaining tracked `projects/*` entries are now much easier to classify as runtime content or fixture content.

This document defines:
- the classification
- the extraction sequence
- the de-tracking strategy
- the resulting repository boundary

## Classification

Canonical product source:
- `projects/agenticos`

Runtime projects:
- `projects/2026okr`
- `projects/360teams`
- `projects/agentic-devops`
- `projects/ghostty-optimization`
- `projects/okr-management`
- `projects/t5t`

Fixture/example candidate:
- `projects/test-project`

Machine-readable classification lives in:
- `projects/agenticos/.meta/runtime-project-classification.yaml`

## Goal State

The AgenticOS product source repository should no longer need to carry real runtime projects under `projects/`.

Goal state:
- source repo keeps `projects/agenticos`
- runtime projects live in the workspace home rooted at `AGENTICOS_HOME`
- fixture content is either regenerated on demand or kept as explicit fixture content with that role documented

## Extraction Sequence

### Phase 1: Freeze classification

Done by this plan:
- classify host product
- classify runtime projects
- classify fixture candidate

### Phase 2: Prepare destination workspace

As a migration step, create or confirm a clean workspace home outside the
product source project root, for example:
- `~/AgenticOS-workspace`

This external workspace example is phase-specific migration guidance, not the
final storage model. The final target remains one workspace home with child
projects under `projects/*`.

The destination should contain:
- `.agent-workspace/`
- `projects/`

### Phase 3: Copy runtime projects out

For each runtime project:
1. copy project directory to the live workspace
2. verify project-local Git data remains intact where present
3. verify project-local context files remain intact
4. verify no source-repo-relative assumptions break

Projects in the recommended first wave:
- `2026okr`
- `360teams`
- `agentic-devops`
- `ghostty-optimization`
- `okr-management`
- `t5t`

### Phase 4: De-track from source repo

After verifying the copied runtime projects in the live workspace:
1. remove the tracked runtime project directories from the product source repository index
2. keep explicit documentation that these projects belong in the live workspace, not in the source repo
3. retain only `projects/agenticos` plus any explicitly accepted fixture/example content

### Phase 5: Decide fixture handling

`projects/test-project` should not be treated as product source.

Two acceptable outcomes:
- keep it as an explicit fixture/example project
- remove it from the source repo and regenerate it on demand during tests or demos

## De-Tracking Strategy

The source repo should treat de-tracking as a repository-boundary change, not as project deletion.

Required rule:
- do not delete the runtime projects until the copied workspace versions are verified

Recommended sequence:
1. copy out
2. verify copied projects
3. commit source-repo de-tracking change
4. update root docs to describe the new boundary

## Documentation Impact

After extraction:
- root README should describe `projects/agenticos` as the only product-source project under `projects/`
- root AGENTS/CLAUDE guidance should stop treating remaining `projects/*` entries as part of the source tree
- bootstrap docs should point live projects to `AGENTICOS_HOME`, not to the product source project root

## Acceptance Judgment

This plan satisfies the current planning milestone for issue `#38` because it now provides:
- explicit runtime-project classification
- explicit fixture classification
- an extraction sequence
- a de-tracking strategy
- a clear target boundary between source repo and live workspace

Actual filesystem extraction remains an execution step and should follow this
plan rather than improvising on the live product source project root.
