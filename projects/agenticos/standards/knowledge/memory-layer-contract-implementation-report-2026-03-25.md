# Memory Layer Contract Implementation Report - 2026-03-25

## Summary

Issue `#26` turns the AgenticOS memory model from a loose convention into a canonical contract carried by the standards area and downstream standard kit.

This issue does not introduce a large runtime rewrite.

Instead it:

- defines the contract explicitly
- encodes the contract into default templates
- aligns user-facing structure docs with the same model

## Landed Artifacts

Canonical spec:

- `projects/agenticos/standards/knowledge/memory-layer-contract-spec-2026-03-25.md`

Updated downstream kit and templates:

- `projects/agenticos/.meta/standard-kit/manifest.yaml`
- `projects/agenticos/.meta/standard-kit/README.md`
- `projects/agenticos/.meta/standard-kit/inheritance-rules.md`
- `projects/agenticos/.meta/templates/.project.yaml`
- `projects/agenticos/.meta/templates/quick-start.md`
- `projects/agenticos/.meta/templates/state.yaml`

Aligned product-facing structure docs:

- `projects/agenticos/mcp-server/README.md`

Regression coverage for template adoption:

- `projects/agenticos/mcp-server/src/tools/__tests__/standard-kit.test.ts`

## Key Product Decisions

The most important decisions frozen by this issue are:

- `quick-start.md` is a concise orientation layer, not a task tracker or transcript sink
- `state.yaml` is mutable operational working state, not durable knowledge and not append-only history
- `conversations/` is append-only raw session history
- `knowledge/` is durable synthesis
- `tasks/` is future-facing execution structure
- `artifacts/` is for deliverables, not memory by default

## Verification

Verification completed in the isolated `#26` worktree:

- `npm install`
- `npm run build`
- `npm test -- --run src/tools/__tests__/standard-kit.test.ts`
- `npm test`
- Ruby YAML parse for:
  - `projects/agenticos/.meta/standard-kit/manifest.yaml`
  - `projects/agenticos/.meta/templates/.project.yaml`
  - `projects/agenticos/.meta/templates/state.yaml`

## Outcome

New downstream projects now inherit the memory-layer contract by default through the standard kit instead of depending on chat explanations or standards-history discovery.

This gives later issues a stable base:

- `#28` can assume there is a canonical distinction between operational state and durable knowledge
- `#29` and `#30` can bootstrap against one stable project-memory model
- `#31` can compare integration modes without redefining what project context is supposed to contain
