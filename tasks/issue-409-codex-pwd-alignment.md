# Issue #409: Codex PWD Alignment Regression

## Minimal Reproduction

Observed in Codex on 2026-05-16:

1. Call `agenticos_switch` for a managed project.
2. The MCP server reports the selected project path.
3. Run `pwd` with an explicit shell-tool `workdir` set to that path.
4. Run `pwd` without an explicit `workdir`.

Result: the explicit `workdir` command prints the project path, while the
default shell command keeps the Codex session's original cwd.

## Root Cause

`agenticos_switch` binds AgenticOS session state inside the MCP server and
persists the selected managed project. The MCP server response is returned to
Codex as tool output text. There is no structured response field or installed
Codex hook in the current runtime that mutates the current Codex shell-tool
default cwd after a tool call.

The prior Codex-specific hint, `codex -C <projectPath>`, starts a new Codex
session in that directory. It does not and cannot change the cwd of the current
Codex session that already called the MCP tool.

MCP can observe `process.cwd()` for the MCP server process, but that is not the
same thing as the client shell/tool cwd. The client shell cwd is unavailable to
AgenticOS MCP unless a future client integration passes it explicitly.

## Classification

Current Codex behavior requires explicit per-command `workdir` in the active
session. Global current-session cwd mutation from `agenticos_switch` is not
available through the current MCP text response contract.

## Fix

`agenticos_switch` now reports:

- the managed project path,
- the project path to use as the filesystem `workdir` for tool calls,
- the observed MCP process PWD, labeled as MCP process state only,
- that the client shell PWD is unavailable to MCP,
- that Codex current-session cwd cannot be changed by MCP output,
- and that `codex -C <projectPath>` is only for starting a new Codex session.

This overlaps with issue #408's output-contract requirement and leaves issue
#406 focused on opt-in hook/config detection rather than treating Codex current
session cwd mutation as already supported.
