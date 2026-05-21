# Hermes Routing Scenario Coverage - 2026-05-21

## Purpose

Issue #453 turns the five Hermes-side routing paths from #441 into executable
AgenticOS coverage.

The risk is not that agents forget the words "Chat-only" or "GBrain knowledge".
The risk is that a future Hermes, Codex, or Claude Code integration treats
`cd`, raw directory search, git branch detection, or GBrain task duplication as
good enough substitutes for AgenticOS MCP. This document records the intended
scenarios, and `mcp-server/src/utils/hermes-routing-scenarios.ts` provides the
machine-checkable contract.

## Scenario Matrix

| Route | Owner | Durable write | AgenticOS MCP first? | Accepted behavior |
| --- | --- | --- | --- | --- |
| Chat-only | Hermes | none | no | Answer in the current chat; do not write durable state |
| Hermes memory | Hermes | Hermes local memory | no | Store only small assistant-continuity facts or preferences |
| GBrain knowledge | GBrain | distilled summary and reference links | no | Store semantic summaries/entities/relations/links only |
| AgenticOS topic | AgenticOS | topic state, tasks, knowledge, artifacts | yes | Call `agenticos_switch` or `agenticos_init`, then update topic surfaces |
| AgenticOS project | AgenticOS | issue/worktree/PR governed project state | yes | Call AgenticOS MCP and follow issue/worktree/preflight/PR/CI flow |

## Executable Contract

The executable contract lives in:

```text
mcp-server/src/utils/hermes-routing-scenarios.ts
mcp-server/src/utils/__tests__/hermes-routing-scenarios.test.ts
```

The tests enforce:

- all five routes exist and validate together
- AgenticOS topic/project routes require MCP before filesystem discovery
- `cd`, raw directory search, and git branch detection are rejected as project
  switch substitutes
- GBrain stores distilled summary and reference links only
- GBrain does not store active AgenticOS task state or a copied task board
- full AgenticOS project routing requires issue bootstrap, isolated worktree,
  preflight, edit guard, PR scope check, pull request, CI green, merge commit,
  and cleanup

## Route Expectations

### Chat-Only

Use when the request is one-off and has no durable state, task, or artifact.
No AgenticOS MCP call is required. No GBrain write is required.

Failure mode:

- Writing a one-off answer into AgenticOS state creates noise and false
  continuity.

### Hermes Memory

Use when the information is a small assistant-continuity fact, such as a stable
preference or identity cue. Hermes owns the write.

Failure mode:

- Storing active task state in Hermes memory makes task freshness invisible to
  AgenticOS.

### GBrain Knowledge

Use when the information should be retrievable across agents as semantic
knowledge. GBrain may store distilled summaries, entities, relations, timelines,
decisions, and links.

GBrain must not store:

- active AgenticOS task state
- `.context/state.yaml` snapshots
- full `tasks/*.yaml` boards
- project registry entries
- raw secrets or raw private captures

If a GBrain page suggests active work, the agent must call AgenticOS MCP to
switch/create the topic or project and then create/update AgenticOS tasks.

### AgenticOS Topic

Use when a personal or work topic becomes durable: current state, open
questions, tasks, artifacts, or evolving knowledge are needed.

Required behavior:

1. Call `agenticos_switch` for an existing topic or `agenticos_init` for a new
   topic.
2. Treat the returned project path and explicit workdir as authoritative.
3. Update `tasks/<task_id>.yaml`, `.context/state.yaml`, `knowledge/`, or
   `artifacts/` through the AgenticOS topic contract.
4. Optionally distill a GBrain summary with `agenticos://...` references.

Rejected substitutes:

- `cd`
- raw directory search
- git branch detection

### AgenticOS Project

Use when the work changes code, config, CI, releases, public docs, MCP servers,
skills, packages, or any rollback-managed product surface.

Required behavior:

1. Call AgenticOS MCP to align project identity.
2. Bootstrap the GitHub issue.
3. Create an isolated worktree.
4. Run preflight and edit guard.
5. Implement and test.
6. Run PR scope check.
7. Open a pull request.
8. Wait for CI green.
9. Merge with a merge commit and cleanup.

Shell `cd`, directory guessing, and git branch inspection do not satisfy project
switching. They can only happen after AgenticOS MCP has returned the
authoritative project path and explicit workdir.

## Regression Examples

| Regression | Expected test signal |
| --- | --- |
| A topic route no longer requires `agenticos_switch` or `agenticos_init` | `validateHermesRoutingScenarios` reports the missing MCP requirement |
| A project route accepts `cd` as switching | `validateHermesRoutingScenarios` reports the missing rejected substitute |
| GBrain route stores active AgenticOS task state | `validateHermesRoutingScenarios` reports a GBrain duplication violation |
| Full project route omits PR or CI | `validateHermesRoutingScenarios` reports the missing workflow gate |
| One of the five routes disappears | `validateHermesRoutingScenarios` reports the missing route |

## Decision

Keep the five-path Hermes routing model as executable AgenticOS source, not only
as prose. Documentation explains the behavior; tests keep the boundaries from
drifting.
