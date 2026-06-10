# Standard Kit

## 1. Overview

The standard kit gives downstream projects consistent AgenticOS guidance,
adapter surfaces, context paths, and conformance checks. It is how AgenticOS
exports its operating discipline into other projects.

Public surfaces:

- `agenticos_standard_kit_adopt`
- `agenticos_standard_kit_upgrade_check`
- `agenticos_standard_kit_conformance_check`
- generated `AGENTS.md`
- generated `CLAUDE.md`
- Cursor project rule

User value: every managed project can present a predictable contract to agents,
with local project instructions, guardrail requirements, and context entry
points.

## 2. Detailed Design

The standard kit combines copied templates and generated guidance. It can adopt
missing files, check stale/diverged files, and validate workflow conformance.
Adapters are versioned so drift is visible.

Invariants:

- Standard kit changes should not silently overwrite user content unless the
  operation is an explicit managed update.
- Generated adapter surfaces must point agents at MCP guardrails, not bypass
  them.
- Cursor, Claude Code, and Codex guidance should stay semantically aligned.
- Project-specific context paths come from `.project.yaml`.

Failure modes:

- Stale adapter template says old cwd behavior.
- Project rule exists but is not always applied.
- Conformance checks validate file presence but not workflow contract.

## 3. Implementation Mapping

| Surface | Files/Tests | Notes |
| --- | --- | --- |
| Standard kit tools | `mcp-server/src/tools/standard-kit.ts`, tests | Adopt, upgrade check, conformance. |
| Standard kit utils | `mcp-server/src/utils/standard-kit.ts`, `standard-kit-merge.ts`, tests | Template generation/merge. |
| Cursor bridge | `cursor-project-rule.ts`, `standard-kit-cursor-bridge.test.ts` | Cursor always-applied project rule. |
| Adapter matrix | `agent-adapter-matrix.ts`, tests | Agent adapter support tracking. |
| Design sources | standard-kit design/implementation reports | Historical decisions and migration evidence. |

Issue cluster: 37 standard-kit issues. No open issue is directly scoped to the
standard kit cluster.

Status: implemented and conformance-tested.

## Gaps

- Keep standard-kit adapter wording aligned with the `#542` switch-workdir
  contract and the `v0.4.37` activation Skill behavior.
