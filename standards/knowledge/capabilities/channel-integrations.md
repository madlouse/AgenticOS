# Channel Integrations

## 1. Overview

Channel integrations are optional. They must not be confused with core MCP
project support or Hermes Agent activation. Discord project threads are the MVP
threaded channel surface; machines without Discord keep normal project create,
resolve, switch, and switch-out behavior.

Public surfaces:

- `agenticos_external_thread_bind`
- `agenticos_external_thread_get`
- `agenticos_external_thread_list`
- Hermes Discord router/worker dispatch utilities
- `--verify-hermes-discord`

User value: when a Discord gateway is configured, project-oriented channel
messages can be routed into a durable project thread and dispatched to Codex or
Claude Code workers while keeping AgenticOS as the project source of truth.

## 2. Detailed Design

Optional Discord routing flow:

1. Parse project-entry intent.
2. Call `agenticos_project_ensure`.
3. Create or reuse a Discord project thread.
4. Store private thread binding with external thread tools.
5. Dispatch worker with explicit project workdir.
6. Post progress/results back to the project thread.

Invariants:

- Hermes Agent activation is not Discord readiness.
- Discord absence must not weaken normal MCP workflows.
- Thread bindings are private runtime sidecar data, not public project docs.
- Feishu thread routing is out of MVP scope.
- Worker dispatch must use AgenticOS project resolution and explicit workdir.

Failure modes:

- Treating "Hermes support" as "Discord support".
- Claiming thread routing without Discord credentials/permissions.
- Creating threads from raw directory guesses instead of project ensure.

## 3. Implementation Mapping

| Surface | Files/Tests | Notes |
| --- | --- | --- |
| External thread tools | `mcp-server/src/tools/external-thread.ts`, tests | Bind/get/list private sidecar records. |
| Hermes router | `mcp-server/src/utils/hermes-discord-router.ts`, tests | Project-entry and routing behavior. |
| Worker dispatch | `mcp-server/src/utils/hermes-worker-dispatch.ts`, tests | Codex/Claude worker prompt construction. |
| Readiness | `integration-readiness.ts`, tests | Optional verification flag. |
| Design docs | `hermes-discord-project-thread-rollout-2026-05-22.md`, `hermes-routing-scenario-coverage-2026-05-21.md` | Channel design. |

Issue cluster: 5 channel issues. No open issue in this cluster at refresh time.

Status: optional integration implemented; not required for core AgenticOS use.

## Gaps

No current issue gap. Product documentation must continue to keep Discord and
Hermes Agent separate because earlier conversations blurred that boundary.
