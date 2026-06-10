# Bootstrap And Agent Support

## 1. Overview

Bootstrap and agent support make AgenticOS usable in real agent runtimes. The
supported matrix currently includes Claude Code, Codex, Cursor, Gemini CLI, and
Hermes Agent.

Public surfaces:

- `agenticos-bootstrap`
- `agenticos-config`
- activation Skill v8
- Claude Code cwd hook
- Hermes cwd applicator
- Cursor project rule
- Homebrew caveats

User value: installing the binary is not enough. Agents need MCP registration,
activation/routing guidance, restart/reload, and verification that their runtime
can actually discover and use AgenticOS.

## 2. Detailed Design

Bootstrap separates transport from routing:

- Transport proves the MCP server is registered and callable.
- Routing proves the agent knows to call MCP for project intent.
- Workdir effect proves the agent can apply switch/switch-out workdirs.

Agent support matrix:

| Agent | Transport | Routing | Workdir Effect |
| --- | --- | --- | --- |
| Claude Code | `claude mcp add` | Skill + project docs | PostToolUse cwd guidance hook |
| Codex | `codex mcp add` | Skill + tool discovery | per-tool `workdir` |
| Cursor | `~/.cursor/mcp.json` | Skill + project rule | per-call workdir or absolute paths |
| Gemini CLI | `gemini mcp add` | Skill | per-call workdir or absolute paths |
| Hermes Agent | existing MCP availability | Skill | `agenticos-cwd-applicator` |

Invariants:

- Homebrew does not silently mutate user agent configs.
- User-modified managed Skills are not overwritten unless forced.
- Missing optional agents should not break other agents.
- Long-lived agents must be restarted or reloaded after installation/upgrade.

Failure modes:

- MCP registered but agent caches an older server process.
- Skill is stale after Homebrew upgrade.
- Claude hook covers switch-in but not switch-out.
- Hermes skill exists but applicator is missing or stale.

## 3. Implementation Mapping

| Surface | Files/Tests | Notes |
| --- | --- | --- |
| Bootstrap CLI | `mcp-server/src/utils/bootstrap-cli.ts`, `bootstrap-cli.test.ts` | Apply/verify/first-run and switch-workdir matrix. |
| Agent detection | `bootstrap-helper.ts`, tests | Supported agent ids and commands. |
| Skill install | `agent-skill.ts`, `agent-skill.test.ts` | Managed Skill v8 with sha256 marker. |
| Claude hook | `claude-pwd-hook.ts`, tests | Switch-in/out guidance. |
| Hermes applicator | `hermes-cwd-applicator.ts`, tests | Runtime cwd carrier. |
| Config audit | `config-audit.ts`, `agenticos_config` | Detects drift across surfaces. |

Issue cluster: 126 bootstrap/agent-adjacent issues. This broad count includes
agent docs, routing, and execution issues; the supported-agent bootstrap matrix
itself is implemented.

Status: implemented and released in `v0.4.37`; local Homebrew install verified
Skill v8 and switch-workdir checks for Codex, Claude Code, Cursor, and Hermes
Agent. Gemini CLI is absent on the current machine but reports a clear recovery
path with Skill v8 installed.

## Gaps

- Keep restart/reload and stale-process guidance visible so long-lived agents do
  not keep old MCP or Skill behavior after upgrade.
- Coordinate with `#517` so status/switch output makes stale activation
  warnings harder to miss.
