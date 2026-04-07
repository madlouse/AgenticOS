# AgenticOS Workspace Home vs Project Source Model

> Date: 2026-04-07
> Issue: #199
> Purpose: freeze the final storage model terminology and correct the temporary interpretation introduced during workspace pollution mitigation

## 1. Decision

The final AgenticOS model should use three terms only:

1. `installed runtime`
2. `workspace home`
3. `project source`

This is the correct end-state model:

- the enclosing `AgenticOS` directory is the `workspace home`
- the `workspace home` root should eventually stop being a Git repository
- `projects/*` holds the real child projects
- each child project carries its own source-control mode
- AgenticOS runtime execution comes from packaged install paths such as Homebrew, not from the workspace tree itself

## 2. Why Yesterday's Mitigation Was Not the Final Model

Moving the live workspace to `~/AgenticOS-workspace` solved an immediate operational problem:

- workspace operations were polluting a Git-backed root

That was a valid temporary mitigation.

But it also introduced a misleading interpretation:

- as if the permanent answer were "workspace somewhere else, source somewhere here"

That is not the actual long-term target.

The long-term target is different:

- keep the enclosing `AgenticOS` directory as the workspace home
- remove the root-level Git role from that workspace home
- attach Git only to concrete projects that need it

So:

- external workspace path = temporary mitigation
- workspace-home root without root Git = final target

## 3. The Three Layers

### Installed Runtime

This is the packaged execution layer.

Examples:

- `brew install agenticos`
- `agenticos-mcp`
- `agenticos-bootstrap`

Its job is:

- run the service
- expose the MCP tools
- bootstrap local agent integration

Its job is not:

- store user project content
- act as the project source tree

### Workspace Home

This is the user-owned AgenticOS home directory.

It should contain:

- `.agent-workspace/`
- `projects/`
- optional runtime/helper areas such as `.runtime/`, `.private/`, `worktrees/`

It is the container that organizes projects.

It should not itself be the canonical Git-backed AgenticOS product repository.

### Project Source

This is the source/content root for one specific project.

Examples:

- `projects/agenticos`
- `projects/360teams`
- `projects/t5t`

Each project may have a different lifecycle:

- `github_versioned`
- `local_directory_only`
- archived/reference-only

The key point is:

all of them still live under `projects/`.

They do not need separate containers just because their lifecycle differs.

## 4. The Important Clarification

The difference between projects is not "where they live".

The difference is "how they are governed".

So the correct model is:

- one workspace home
- one `projects/` container
- different project topology modes inside that same container

That means there is no need to invent two parallel spaces such as:

- one place for capability projects
- one place for local projects

Both belong under `projects/`.

The thing that changes is metadata and workflow, not the parent container.

## 5. Where AgenticOS Itself Fits

`AgenticOS` itself is one child project:

- path: `projects/agenticos`

It is special only because it is the product that defines the standards and tooling.

But architecturally it is still a project, not the whole workspace.

So the final model is:

- workspace home: enclosing `AgenticOS/`
- product project: `projects/agenticos`
- runtime binaries: installed separately by package manager

## 6. Final Target Layout

```text
AgenticOS/
  .agent-workspace/
  .runtime/                 # optional
  .private/                 # optional local helper area
  worktrees/                # optional local helper area
  projects/
    agenticos/              # Git-backed product source project
    360teams/               # local-only or Git-backed depending on project contract
    t5t/                    # local-only project
    2026okr/                # local-only project
    ...
```

In the final target:

- the enclosing `AgenticOS/` root has no product-level `.git`
- any Git repository belongs to a concrete project, not to the workspace home as a whole

## 7. Why This Model Is Cleaner

It resolves the exact ambiguity you pointed out:

1. what belongs to the workspace container
2. what belongs to one specific project
3. what belongs to packaged runtime/install

It also avoids the wrong mental model that the workspace itself must be Git-backed just because one of its projects is.

## 8. Transitional Rule

Until the final root-Git removal is complete:

- treat the current external workspace path as temporary
- do not treat it as the final architecture
- continue treating the root-level Git role as something to be removed, not something to be normalized permanently

## 9. Phased Restoration Path

### Phase A: freeze terminology and target model

- complete with this document

### Phase B: identify root-Git dependencies that still block removal

Examples:

- root-scoped docs
- root-scoped scripts
- GitHub automation assumptions
- release and packaging assumptions

### Phase C: move product-source ownership fully into `projects/agenticos`

This includes:

- product docs
- implementation
- automation needed by the product repository

### Phase D: remove root-level Git from the workspace home

At that point:

- the workspace home becomes a normal project container
- the temporary external workspace mitigation can be retired

### Phase E: restore the live workspace path back to the intended workspace home

Only after the root no longer acts as a product Git repository.

## 10. Final Judgment

The right correction is not:

- "keep the external workspace forever"

The right correction is:

- "keep the workspace-home concept"
- "remove root-level Git from that workspace home"
- "let concrete projects carry Git only where needed"

That is the model that matches:

- your original intent
- the project-container mental model
- the distinction between local-only projects and capability projects
- packaged runtime vs stored project content
