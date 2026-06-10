# Context Switching

## 1. Overview

Context switching lets an agent enter a managed project and later leave it. The
main product promise is not "MCP changes the parent shell cwd"; the promise is
that MCP returns authoritative project/restore workdirs and supported clients
apply them through their runtime mechanism.

Public surfaces:

- `agenticos_switch`
- `agenticos_switch_out`
- activation Skill v8
- Claude Code PostToolUse cwd hook
- Hermes `agenticos-cwd-applicator`
- Codex per-tool `workdir`

User value: after "切换到 X 项目", subsequent work should happen in X. After
"切出", subsequent non-project work should return to the original entry
directory or explicitly report that workdir application is incomplete.

## 2. Detailed Design

Switch-in binds AgenticOS session context and returns:

- `structuredContent.project_workdir`
- `structuredContent.explicit_workdir`
- text fallback lines such as `project_workdir: ...`

Switch-out clears active project context and returns:

- `structuredContent.target_workdir`
- `structuredContent.explicit_workdir`
- text fallback lines such as `target_workdir: ...`

The first `origin_cwd` passed to `agenticos_switch` is used as the switch-out
restore target. Nested A-to-B switches do not require stack unwinding; the
simple model restores to the original entry point.

Invariants:

- MCP is the source of truth for project identity and recommended workdir.
- The client must apply returned workdir before using relative paths.
- Agents must not claim switch success from `cd`, `find`, `pwd`, or git branch
  detection alone.
- Parent cwd mutation is never promised by MCP itself.

Failure modes:

- Agent calls shell search before MCP.
- Agent switches logically but continues shell/file operations in the previous
  cwd.
- Long-lived agent session caches older Skill or MCP behavior after upgrade.
- Old docs imply impossible parent-process cwd mutation.

## 3. Implementation Mapping

| Surface | Files/Tests | Notes |
| --- | --- | --- |
| Switch tools | `mcp-server/src/tools/project.ts`, `src/tools/__tests__/switch.test.ts`, `project.test.ts` | Core switch/switch-out behavior. |
| Structured result | `mcp-server/src/utils/tool-result.ts`, `tool-result.test.ts` | Stable machine-readable workdir extraction. |
| Skill contract | `mcp-server/src/utils/agent-skill.ts`, `agent-skill.test.ts` | v8 Skill requires MCP-first switching and workdir application. |
| Claude hook | `mcp-server/src/utils/claude-pwd-hook.ts`, `claude-pwd-hook.test.ts` | Per-command cwd guidance. |
| Hermes applicator | `mcp-server/src/utils/hermes-cwd-applicator.ts`, `hermes-cwd-applicator.test.ts` | Runtime cwd carrier plugin. |
| Bootstrap verification | `mcp-server/src/utils/bootstrap-cli.ts`, `bootstrap-cli.test.ts` | `*-switch-workdir` matrix. |

Issue cluster: 31 switching issues. Recent fixes include `#500`, `#506`,
`#540`, `#542`, and the `v0.4.37` release validation in `#544/#545`. Open gap
is `#517`.

Status: implemented, hardened, released to Homebrew in `v0.4.37`, and verified
locally for Codex, Claude Code, Cursor, Hermes Agent, plus clear Gemini CLI
absent-runtime reporting.

## Gaps

- `#517`: surface freshness/drift warnings in switch/status output.
