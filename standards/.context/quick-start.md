# AgenticOS - Quick Start

## Project Overview

Self-hosting AgenticOS product project. Canonical operational context lives under `standards/.context` while the root `.context` files remain compatibility shims.

## Current Status

- **Status**: active
- **Last Action**: Unified release **v0.4.31** shipped (#483 Gemini activation Skill, #482 guardrail worktree binding, #438 release tap guard). Local machine bootstrap verified (Claude/Codex/Cursor/Gemini MCP + Skills).
- **Current Focus**: No open GitHub implementation issues. Next work is operator-driven (new issue intake) or product planning (topic lifecycle / knowledge evolution).
- **Resume Here**: Call `agenticos_status`, read this file and `standards/.context/state.yaml`, then open or create an issue worktree before implementation edits.
- **Refreshed At**: 2026-05-24T14:30:00Z

## Key Facts

- **v0.4.31** is the current release: GitHub Release published; Homebrew tap and local install at 0.4.31.
- Issues **#483**, **#482**, **#438** are closed and merged; AgenticOS repo has **0 open issues**.
- Machine bootstrap: `agenticos-bootstrap --all --install-skills --verify` passes; `agenticos-config --validate` passes.
- `HOMEBREW_TAP_PAT` secret exists on GitHub — verify it works on the next tag push so tap bump is fully automated.
- Sibling projects **360teams** and **qifu-web-opencli** local dirty git was committed in this refresh pass (branches may still be behind origin).

## Latest Landed Reports

- CHANGELOG.md — [0.4.31] — 2026-05-24
- standards/knowledge/agenticos-goal-completion-and-hermes-gbrain-matrix-review-2026-05-21.md

## Recommended Entry Documents

1. CHANGELOG.md
2. standards/.context/state.yaml
3. AGENTS.md / CLAUDE.md (adapter surfaces)

## Canonical Layers

- Operational state: `standards/.context/state.yaml`
- Session history: `standards/.context/conversations/`
- Durable knowledge: `knowledge/`
- Execution plans: `tasks/`
- Deliverables: `artifacts/`
