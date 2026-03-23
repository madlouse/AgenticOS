---
name: Feature Request
about: Package the executable agent protocol and templates for downstream AgenticOS projects
title: "feat: package executable agent protocol as a downstream standard kit"
labels: enhancement
---

## Problem Statement

AgenticOS now has protocol drafts and reusable templates for:
- agent preflight
- design briefs
- non-code evaluation
- submission evidence

But these assets still live only inside the standards project.

Downstream projects do not yet have a clear, versioned, inheritable package that makes this protocol operational by default.

After self-hosting migration landed, these standards are now anchored at:

- `projects/agenticos/standards/`

That means the packaging problem is no longer abstract. It now needs to define how a real product repository exports inheritable standards while keeping repository-root exceptions separate.

## Proposed Solution

Define a downstream standard kit for the executable agent protocol.

It should specify:
- which files are canonical templates
- which files are generated per project
- which files are customizable
- how version markers are applied
- how later upgrades are propagated safely
- which assets are project-scoped standards versus root-scoped repository infrastructure
- how downstream projects consume standards without inheriting root-only exceptions like `.github/`

Potential outputs:
- a standard package layout
- inheritance rules
- template versioning rules
- downstream adoption checklist

## Why This Matters

Without a standard kit, the protocol remains local knowledge rather than a reusable operating standard.

## Acceptance Criteria

- A documented downstream package model exists
- Canonical versus customizable files are defined
- Template upgrade/versioning rules are defined
- A downstream project can adopt the protocol without relying on the original chat history
- The package model is consistent with the landed self-hosting layout under `projects/agenticos/standards/`
- Repository-root exceptions are explicitly excluded or handled separately
