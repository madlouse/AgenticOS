# Memory Layer Contract Spec - 2026-03-25

## Design Reflection

Issue `#26` is not a request to invent more memory layers.

Those layers already exist.

The real problem is that the same information can currently leak across:

- `.context/quick-start.md`
- `.context/state.yaml`
- `.context/conversations/`
- `knowledge/`
- `tasks/`

That creates two failure modes:

1. recovery becomes noisy because the same fact appears in the wrong places
2. future automation cannot safely validate or lint project memory because the layers have no enforceable contract

Three design options were considered:

1. collapse memory into fewer files
2. keep the current loose conventions and just document them better
3. freeze a canonical contract and push it into the standard kit and templates

The adopted design is option 3.

Why:

- option 1 would destroy useful distinctions between operational state, raw history, and durable synthesis
- option 2 would keep the drift problem alive
- option 3 gives downstream projects a machine-readable and human-readable baseline without forcing a full runtime rewrite

The goal here is to define the contract first and encode it into the default project kit.

Later validation and linting can build on it.

## Canonical Layer Matrix

| Layer | Purpose | Source of Truth | Mutability | What Belongs Here | What Must Not Be Written Here |
| --- | --- | --- | --- | --- | --- |
| `.project.yaml` | stable project identity and layer map | canonical | rare change | project id, name, description, path roles | session logs, pending items, derived summaries |
| `.context/quick-start.md` | concise entry orientation | canonical | mutable | project goal, current focus, resume pointer, key facts | full conversation history, detailed task decomposition, exhaustive decision logs |
| `.context/state.yaml` | mutable operational working state | canonical | mutable | current task, working memory, loaded context, latest guardrail evidence | append-only transcripts, long-form research, durable architecture docs |
| `.context/conversations/` | raw session history | canonical | append-only | timestamped session records | synthesized architecture, canonical project overview |
| `knowledge/` | durable synthesized understanding | canonical | mutable but review-oriented | architecture, product judgments, research, decision syntheses | raw transcript dumps, scratch task checklists |
| `tasks/` | future-facing execution artifacts | canonical | mutable | issue briefs, plans, checklists, templates | session narrative, long-term architecture rationale |
| `artifacts/` | concrete outputs and deliverables | canonical for outputs | mutable | generated outputs, deliverables, exported files | memory/state/history by default |
| `AGENTS.md` / `CLAUDE.md` | derived agent-facing guidance | derived | generated/upgradeable | executable guidance distilled from templates and state | raw source-of-truth memory owned only here |

## Read Order

Default session-entry read order is:

1. `.project.yaml`
2. `.context/quick-start.md`
3. `.context/state.yaml`
4. relevant `knowledge/` docs
5. relevant `tasks/` docs

`conversations/` is not a first-pass entry surface.

It is a recovery and audit layer.

## Write Rules

### `.project.yaml`

- Canonical identity file
- Must remain stable and sparse
- Should only change when project identity or declared metadata changes

### `.context/quick-start.md`

- Human-first resume surface
- Keep concise and project-level
- Safe to rewrite when the current summary is still boilerplate or clearly stale
- Must not become a transcript sink

### `.context/state.yaml`

- Operational state only
- Safe for MCP tools to rewrite
- Current task and working memory live here
- Latest guardrail evidence may live here as structured derived state
- Must not become append-only history

### `.context/conversations/`

- Append-only session history
- One session record may be appended or created, but earlier entries should not be silently rewritten as summary

### `knowledge/`

- Durable synthesis
- Changes should be deliberate and reviewable
- Architecture and research belong here, not in state or quick-start

### `tasks/`

- Issue decomposition and execution planning
- Future-facing, not historical by default

## Invalid Examples

### Invalid for `quick-start.md`

- entire multi-day transcript dump
- every historical decision ever made
- full issue checklist copied verbatim from a task brief

### Invalid for `state.yaml`

- raw markdown session transcript
- long-form architecture rationale
- research notes intended to remain durable

### Invalid for `conversations/`

- rewritten architecture summary replacing the raw session record
- canonical current task state that should instead live in `state.yaml`

### Invalid for `knowledge/`

- scratch TODOs for tomorrow
- duplicated raw session record blocks

### Invalid for `tasks/`

- broad project overview duplicated from quick-start
- full historical narrative copied from conversations

## Template Implications

The standard kit should now encode this contract directly:

- `.project.yaml` declares the contract version and layer paths
- `quick-start.md` explicitly states that it is a concise orientation layer
- `state.yaml` explicitly states that it is mutable operational state
- project structure docs should describe `conversations/` as append-only history, `knowledge/` as synthesis, and `tasks/` as execution

## Enforcement Boundary For This Issue

This issue does not fully automate linting.

It does three concrete things:

1. defines the contract in canonical standards docs
2. pushes the contract into the standard-kit templates
3. aligns user-facing docs so new and existing projects inherit the same model

## Outcome

After this issue, later work can reference one canonical memory contract instead of restating the same distinctions from scratch.
