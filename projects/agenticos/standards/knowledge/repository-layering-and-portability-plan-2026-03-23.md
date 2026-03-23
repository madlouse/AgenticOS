# AgenticOS Repository Layering and Portability Plan

> Date: 2026-03-23
> Purpose: clarify which parts of the current AgenticOS repository are runtime data, which are standards, which are implementation, and how to improve portability

## 1. Core Diagnosis

The current top-level `AgenticOS` repository mixes four different concerns:

1. **standards and specifications**
2. **product implementation**
3. **user workspace and managed projects**
4. **agent runtime byproducts**

That mixed model makes it hard to answer:
- what should be installed by Homebrew
- what should be versioned as product source
- what should be portable across machines
- what should never be committed because it is runtime-only

This is the main source of confusion around whether `agentic-os-development` belongs inside the top-level repo, whether `.claude` is product data, and whether `mcp-server` should move into the standards project.

## 2. Classification of Current Top-Level Content

### A. Standards / specification assets

These define the rules, templates, and contracts that downstream projects should follow.

Examples:
- `projects/agentic-os-development/`
- `.meta/templates/`
- `.meta/rules.md`
- `.meta/agent-guide.md`
- top-level guidance such as `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`

These are **not runtime data**.
They are part of the product standard and should be versioned deliberately.

### B. Product implementation assets

These are the actual implementation of AgenticOS as a tool.

Examples:
- `mcp-server/`
- `homebrew-tap/`
- `tools/`
- `.github/`

These are also **not runtime data**.
They are the code and packaging machinery that implement the standard.

`mcp-server` belongs here.
It should **not** be moved into the standards project.

Reason:
- the standards project defines the contracts
- the MCP server implements those contracts
- mixing the implementation back into the standards project would collapse specification and implementation into one layer again

### C. Workspace / managed project data

These are the projects managed by AgenticOS for real user work.

Examples:
- `projects/360teams`
- `projects/ghostty-optimization`
- `projects/agentic-devops`
- `projects/test-project`

These are neither core implementation nor global runtime temp data.
They are user workspace content.

They may be portable and optionally backed up in Git, but they should not be confused with product source code.

### D. Runtime / ephemeral agent data

These are produced while the system is running and should usually not be treated as canonical product content.

Examples:
- `.claude/worktrees/`
- temporary worktree copies
- local caches
- lock files or temp execution traces
- active session pointers that can be regenerated

These should be treated as **runtime state**, not product source.

In the current repo, `.claude` is mixed:
- `.claude/commands/` is closer to agent integration assets
- `.claude/worktrees/` is runtime byproduct

That mixed directory is a design smell and should be split conceptually.

### E. Borderline workspace metadata

Examples:
- `.agent-workspace/registry.yaml`

This is not pure runtime trash, but it is also not core implementation source.

It is **workspace metadata**.
It should be portable, but it should not be confused with the product's own source repo.

## 3. Recommendation: Three-Layer Model

AgenticOS should move toward a cleaner three-layer model.

### Layer 1: Product source repository

This is the GitHub repository for AgenticOS itself.

It should contain:
- standards/specification assets
- implementation code
- packaging and release assets
- example or fixture content only when intentional

It should not contain:
- user-specific managed projects as live mutable workspace state
- runtime worktree copies
- user-local ephemeral execution traces

### Layer 2: User workspace

This is what Homebrew or the install flow prepares for the user.

It should contain:
- managed projects
- portable workspace metadata
- project context and knowledge

It may optionally be committed by the user for backup and migration.

This is where `projects/` belongs in the long term.

### Layer 3: Runtime state

This should hold:
- temporary worktrees
- session-local caches
- generated temp execution state
- lock files
- tool-specific runtime artifacts

This layer should be excluded from normal source control and should be safe to rebuild.

## 4. Practical Interpretation for Current Paths

### Keep as product source

- `mcp-server/`
- `homebrew-tap/`
- `.meta/`
- `.github/`
- `tools/`
- root docs

### Keep as standards content, but treat carefully

- `projects/agentic-os-development/`

This project is a standards/meta-project.
It can remain conceptually part of the product-definition layer, but it should not be mistaken for ordinary user workspace content.

Long-term, it likely deserves one of these forms:
- a dedicated `standards/agentic-os-development/` area inside the product source repo
- or a dedicated standalone repository if you want full lifecycle separation

### Move out of product source or stop treating as canonical source

- ordinary managed projects under `projects/`
- `.claude/worktrees/`

These belong to workspace/runtime, not to the core source repository.

### Split or redesign

- `.claude/`
  - keep reusable agent command assets in product source
  - move worktree/runtime artifacts into a runtime-only location

- `.agent-workspace/registry.yaml`
  - keep as workspace metadata, not as product source of truth

## 5. Portability-Oriented Target State

If a user installs AgenticOS on a new machine via Homebrew, the ideal model is:

1. Homebrew installs the product implementation.
2. AgenticOS initializes a clean user workspace.
3. The workspace contains managed projects and portable project metadata.
4. Runtime temp data is kept separate from portable workspace content.

That means "new machine migration" should move:
- workspace projects
- project context
- portable workspace metadata

But it should not need to move:
- temp worktrees
- agent-specific runtime residue

## 6. Recommendation on MCP Server

`mcp-server` should stay in the product implementation layer.

It should not be moved into the standards project.

The right relationship is:
- standards project defines the protocol
- `mcp-server` implements the protocol
- installer/bootstrap machinery distributes and activates the implementation

If anything should move closer to the standards project, it is:
- canonical templates
- protocol schemas
- guardrail definitions

not the server implementation itself.

## 7. Recommended Structural Direction

The most coherent direction is:

1. Keep `madlouse/AgenticOS` as the **product source repository**
2. Treat `mcp-server`, `homebrew-tap`, `.meta`, `.github`, and root docs as product source
3. Gradually stop using the product source repo as the user's live workspace
4. Move runtime artifacts like `.claude/worktrees/` out of source control semantics
5. Treat `agentic-os-development` as the canonical standards/meta-project, but decide explicitly whether it lives:
   - inside product source as a standards area, or
   - as a standalone repository with its own remote
6. Treat ordinary downstream projects as workspace projects, not product source

### Immediate Practical Rule

Until the larger migration is complete, use this operational rule:

- develop AgenticOS source in the product repo checkout
- run real AgenticOS-managed projects from a separate `AGENTICOS_HOME`
- do not treat the source repo checkout as the default live workspace
- exclude runtime artifacts from product source control wherever possible

## 8. Final Judgment

The main problem is not whether one folder is "wrong".

The main problem is that the current top-level repository is simultaneously acting as:
- source repo
- package repo
- standards repo
- workspace home
- runtime scratch space

That is too many roles for one tree.

For portability, maintainability, and predictable agent behavior, AgenticOS should explicitly separate:
- **standard**
- **implementation**
- **workspace**
- **runtime**
