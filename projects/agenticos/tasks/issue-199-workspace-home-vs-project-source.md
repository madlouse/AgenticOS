# Issue #199: Workspace Home vs Project Source Model

## Summary

Clarify the final AgenticOS storage model and correct the temporary interpretation introduced during workspace pollution mitigation.

GitHub issue:

- https://github.com/madlouse/AgenticOS/issues/199

## Core Clarification

The final target model is:

- the enclosing `AgenticOS` directory remains the workspace home
- the workspace home root should eventually stop being a Git repository
- concrete child projects under `projects/` carry their own source-control mode
- packaged runtime stays separate from stored workspace/project content

The earlier move to an external path such as `~/AgenticOS-workspace` is a transitional mitigation only.
It is not the intended long-term architecture.

## Required Terminology

- `installed runtime`
- `workspace home`
- `project source`

Do not continue using mixed terms such as:

- live workspace
- source workspace
- product space

## Acceptance Criteria

1. the final three-layer terminology is explicit and stable
2. the temporary external-workspace mitigation is marked as transitional
3. the final target layout keeps all child projects under `projects/`
4. a phased restoration path exists from the temporary mitigation back to the intended workspace-home model
