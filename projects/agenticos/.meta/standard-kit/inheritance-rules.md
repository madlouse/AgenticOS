# Inheritance Rules

## Rule 0: Memory Layer Contracts Are Part Of The Kit

Downstream projects inherit not just files, but the role boundaries between:

- `.project.yaml`
- `.context/quick-start.md`
- `.context/state.yaml`
- `.context/conversations/`
- `knowledge/`
- `tasks/`
- `artifacts/`

Implication:
- quick-start stays concise and project-level
- state stays mutable and operational
- conversations stay append-only
- knowledge stays synthesized
- tasks stay future-facing

## Rule 1: Generated Files vs Copied Templates

There are two inheritance modes.

### Generated files

- `AGENTS.md`
- `CLAUDE.md`

These are generated or upgraded by the distillation layer.

Implication:
- downstream projects should not treat them as free-form scratch files
- local project-specific content may exist, but upgrades must preserve the canonical guardrail protocol and template marker
- generated adapter surfaces must preserve one canonical cross-agent execution contract even when runtime-specific guidance differs

### Copied templates

- `.project.yaml`
- `.context/quick-start.md`
- `.context/state.yaml`
- `tasks/templates/agent-preflight-checklist.yaml`
- `tasks/templates/issue-design-brief.md`
- `tasks/templates/submission-evidence.md`

These are copied into each project and then become project-owned working files.

Implication:
- downstream projects are expected to customize them
- later upgrades should be explicit and reviewable, not silently overwritten
- the copied templates still carry the canonical memory-layer contract and should not be repurposed arbitrarily

## Rule 2: Repository-Root Infrastructure Is Not Part Of The Project Kit

The downstream standard kit is project-scoped.

It does not include:
- `.github/`
- release workflows
- root-only CI policies
- local runtime directories such as `.runtime/` or `.claude/worktrees/`

These belong to repository or local runtime layers, not to the project-scoped standard package.

## Rule 3: Standards History Is Reference Material, Not Default Payload

`projects/agenticos/standards/` is the design and product-definition area.

Downstream projects should consume:
- the generated instructions
- the execution templates
- the packaging rules

They should not need the full internal standards history unless they are doing standards work themselves.

## Rule 4: Upgrade Safety

Generated files:
- may be upgraded automatically when template markers change
- must preserve user-extended sections where supported by the generator
- must not drift into agent-specific policy forks

Copied templates:
- must not be silently replaced after project adoption
- should be reviewed against canonical sources during explicit upgrade work

## Rule 5: Package Conflicts Resolve Toward The Kit

If older guidance elsewhere in `.meta/` conflicts with this package:
- the standard kit wins
- the conflicting file should be treated as legacy until updated

## Rule 6: Adapter Surfaces Are Not Independent Policy Sources

`AGENTS.md` and `CLAUDE.md` are adapter surfaces over the same canonical policy.

They may vary in runtime-specific bootstrap and operator guidance, but they must not diverge on:

- issue-first execution semantics
- guardrail protocol meaning
- recording protocol requirements
- what counts as compliant implementation flow
