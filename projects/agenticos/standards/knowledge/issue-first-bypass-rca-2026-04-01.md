# Issue-First and Project-Switch Bypass RCA

> Issue: #112
> Date: 2026-04-01
> Status: completed analysis
> Author: sub-agent session under worktree `agenticos-112-issue-first-bypass-rca`

---

## Incident Summary

**Incident A — Codex session (date prior to 2026-04-01)**
A Codex agent edited AgenticOS product-source files in `projects/agenticos/` before calling `agenticos_preflight`, before confirming a GitHub issue was open, and before bootstrapping a task branch or worktree. Implementation work landed directly against the main checkout with no issue/preflight/branch-bootstrap sequence in place.

**Incident B — Agent-CLI-API session (2026-04-01)**
An Agent-CLI-API session working on a downstream project performed implementation-affecting edits without first switching the active AgenticOS project context to the target project. The active project in the registry did not match the project being edited. No `agenticos_switch` was called before edits began. This is the same class of bypass as Incident A applied to a downstream consumer.

---

## Failure Path Reconstruction

### Incident A — Codex

1. Codex agent received a task prompt that implied implementation work on AgenticOS product source.
2. No `agenticos_preflight` call was made before any file edit.
3. No GitHub issue was confirmed as the active work unit.
4. No `agenticos_branch_bootstrap` or equivalent worktree isolation was established.
5. File edits landed in the live working copy under the main checkout.
6. The guardrail sequence documented in `AGENTS.md` (`preflight → branch_bootstrap → implement`) was never entered.

Root observation: `agenticos_preflight` is advisory-by-invocation — the tool exists and works, but nothing prevents an agent from skipping it and writing files directly. The adapter instruction in `AGENTS.md` is prose guidance, not a mechanical gate.

### Incident B — Agent-CLI-API

1. Agent-CLI-API session began with the registry's `active_project` pointing at a project other than the target.
2. No `agenticos_switch` was called to align the active project.
3. Implementation edits proceeded against the target project's files.
4. `agenticos_edit_guard` (introduced in issue #113) was not yet deployed or called.
5. The registry-level project alignment was never verified before edits.

Root observation: even after `agenticos_preflight` was available, no mechanism blocked file writes when the active project was misaligned. The registry's `active_project` field is read by `agenticos_edit_guard`, but that tool must be called voluntarily.

---

## First Missed Executable Gate

Both incidents share the same structural root cause:

> **There is no mandatory, agent-side gate that intercepts file writes and checks issue/preflight/project-alignment before allowing them to proceed.**

The tools exist:
- `agenticos_preflight` evaluates issue linkage, worktree type, and branch ancestry.
- `agenticos_edit_guard` (post-#113) evaluates active-project alignment and preflight evidence.

What does not exist:
- Any mechanism that fires automatically at edit time without the agent choosing to call it.
- Any hook or wrapper that is wired into the agent's file-write path by default.
- Any enforcement at the MCP server level that blocks tool calls when edit-guard state is `BLOCK`.

The first missed gate in both incidents is the absence of an unconditional, pre-edit checkpoint. Preflight and edit-guard are checks the agent runs when it decides to run them. Neither is structurally prior to the edit action.

---

## Policy Gaps vs Implementation Gaps

| Gap | Type | Where it lives | What it means |
|-----|------|---------------|---------------|
| `AGENTS.md` and `CLAUDE.md` say "run preflight before implementation" but cannot enforce it | Policy gap | Adapter documentation | The rule exists only as prose — it depends entirely on the agent reading and obeying the instruction |
| No pre-edit hook is registered in Codex or Agent-CLI-API sessions by default | Implementation gap | Agent runtime / bootstrap | `check-edit-boundary.sh` exists but is not wired into any agent's file-write lifecycle automatically |
| `agenticos_edit_guard` is opt-in — agents call it only if they choose to | Implementation gap | MCP tool layer | The tool enforces correctly when called; it is never called by an agent that skips the sequence |
| `agenticos_preflight` does not persist a `BLOCK` that downstream tools check before allowing writes | Implementation gap | MCP tool layer | Preflight evidence is persisted to project state, but nothing reads that state before a write proceeds unless `agenticos_edit_guard` is explicitly invoked |
| Active-project mismatch has no blocking signal at session start | Policy gap | Session bootstrap protocol | No step in the bootstrap sequence requires or verifies `agenticos_switch` before any other tool call |
| `cross-agent-execution-contract.yaml` defines the canonical policy but no conformance check runs against it | Policy gap | Bootstrap metadata | The machine-readable contract exists; nothing enforces it against actual agent behavior at runtime |
| The guardrail sequence is mandatory by policy but the MCP server itself does not enforce call ordering | Implementation gap | MCP server | The server exposes all tools unconditionally; there is no stateful call-order enforcement at the protocol level |

---

## Concrete Remediation Issue List

1. **Wire `check-edit-boundary.sh` as a default pre-edit hook in both `CLAUDE.md` and `AGENTS.md` bootstrap sections**
   Adds: a shell-level enforcement path that fires before file writes in agents that support pre-edit hooks (Claude Code stop hooks, Codex pre-tool hooks). Converts the prose rule into an executed gate for supported runtimes.

2. **Add a session-start project-alignment check to the agent bootstrap sequence**
   Adds: a required step in `AGENTS.md` and `CLAUDE.md` that instructs agents to call `agenticos_status` at session start and fail or prompt for `agenticos_switch` when `active_project` does not match the intended project. Closes the project-switch bypass at the point where an agent begins work, not just before edits.

3. **Add a `require_preflight_pass` guard inside the MCP server's `agenticos_edit_guard` fallback path**
   Adds: when no persisted preflight evidence exists for the current project, `agenticos_edit_guard` should return `BLOCK` with a recovery instruction to run preflight first, rather than only reporting the missing evidence. Currently implemented but should be verified against the case where project state exists but preflight block was never called.

4. **Add a conformance checker that validates agent sessions against `cross-agent-execution-contract.yaml`**
   Adds: a tool or CI step that can compare a session's tool-call log against the canonical execution contract, flagging sessions that proceeded to implementation without a preceding `PASS` preflight and edit-guard invocation. Converts the machine-readable contract from metadata into an enforceable post-session audit.

5. **Gate write-affecting MCP tools at the server layer when edit-guard state is `BLOCK`**
   Adds: stateful enforcement inside the MCP server itself. After `agenticos_edit_guard` returns `BLOCK`, any subsequent call to tools that modify persistent project state (e.g., `agenticos_record`, `agenticos_save`) should carry a warning or require an explicit override. This is a defense-in-depth layer, not a replacement for hook-level enforcement.

6. **Document the Agent-CLI-API bootstrap path explicitly in the adapter matrix**
   Adds: `agent-adapter-matrix.yaml` currently covers `claude-code`, `codex`, `cursor`, and `gemini-cli`. Agent-CLI-API is not listed. Adding an entry forces the same required-runtime-guidance checks to apply to API-driven sessions and prevents the class of bypass in Incident B from being an undeclared adapter gap.
