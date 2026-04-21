# AgenticOS

AgenticOS gives AI coding assistants (Claude Code, Codex, Cursor, Gemini CLI,
and any MCP-compatible tool) a persistent, structured memory of your
projects. Every conversation, decision, and working state is saved so you can
pick up exactly where you left off — even weeks later. No more re-explaining
context at the start of every session.

**If you use an AI coding assistant and want it to remember your project
across sessions, you are the target user.**

## Get to `agenticos_list` in 3 Steps

```bash
# 1. Install (macOS)
brew install madlouse/tap/agenticos

# 2. Set up your workspace and bootstrap your AI tool
export AGENTICOS_HOME=~/agenticos-workspace
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --first-run

# 3. Verify — restart your AI tool, then ask it to run agenticos_list
```

For full documentation, agent-specific setup, and advanced configuration,
see [mcp-server/README.md](mcp-server/README.md).

## Quick Start (from source)

Requires: node.js >= 20.0.0

```bash
cd mcp-server
npm install
npm run build
npm test
```

Verify with `cd mcp-server && npm test` and confirm all tests pass.

## Supported Integration Modes

AgenticOS does not treat every fallback as equal:

- `MCP-native` is the canonical primary mode
- `MCP + Skills Assist` is the supported fallback when transport works but
  routing or operator ergonomics need help
- `CLI Wrapper` is limited to diagnostics and temporary bootstrap recovery
- `Skills-only Guidance` is experimental and does not provide the canonical
  AgenticOS runtime surface

## Official Supported Agents

The official bootstrap surface currently covers:

- Claude Code
- Codex
- Cursor
- Gemini CLI

Bootstrap is complete only when:

1. the MCP server is registered for the target agent
2. the agent has been restarted if required
3. `agenticos_list` succeeds

## Homebrew Bootstrap Contract

Homebrew installs the `agenticos-mcp` binary only. It does **not** create or
select a workspace, does **not** edit Claude Code, Codex, Cursor, or Gemini
CLI configuration, does **not** restart the AI tool, and does **not** prove
activation by itself.

### Recommended: One-command bootstrap

After Homebrew installation, the fastest path to a working setup is:

```bash
export AGENTICOS_HOME=/absolute/path/to/your/workspace   # any valid workspace home
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --first-run
```

On macOS, `--first-run` also sets up `launchctl` persistence so GUI tools
inherit `AGENTICOS_HOME` across sessions. Then restart your AI tool and
confirm `agenticos_list` succeeds.

Use `agenticos-bootstrap --verify` to audit the current state without
mutating anything.

### Alternative: Per-agent manual setup

If you prefer to register the MCP server manually for each tool:

```bash
export AGENTICOS_HOME=/absolute/path/to/your/workspace

# Claude Code
claude mcp add --transport stdio --scope user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp

# Codex
codex mcp add --env AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp

# Gemini CLI
gemini mcp add -s user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos agenticos-mcp
```

For Cursor, add `agenticos` with explicit `env.AGENTICOS_HOME` to
`~/.cursor/mcp.json`, then restart Cursor and verify `agenticos_list`.

### Repairing a stale registration

If a previous registration still points at a source checkout instead of
`agenticos-mcp`, repair it with:

```bash
claude mcp get agenticos
claude mcp remove agenticos -s user
claude mcp add --transport stdio --scope user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp

codex mcp get agenticos
codex mcp remove agenticos
codex mcp add --env AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp
```

## Your First Project

Once `agenticos_list` succeeds (after bootstrap and a restart), create your
first managed project:

1. **Create the project** — ask your AI tool to run
   `agenticos_init` with a name and topology, e.g.
   `agenticos_init(name: "my-project", topology: "local_directory_only")`
2. **Switch to it** — ask the tool to run `agenticos_switch(project: "my-project")`
3. **Do real work** — complete a task across two or more sessions
4. **Verify persistence** — on the second session, ask the tool to run
   `agenticos_status` and confirm it shows your previous context

For a full walkthrough with `agenticos-bootstrap --first-run`, see
[mcp-server/README.md](mcp-server/README.md).

## Canonical Documents

- product overview and install surface:
  [mcp-server/README.md](mcp-server/README.md)
- implementation and operator instructions:
  [AGENTS.md](AGENTS.md)
- contribution and release flow:
  [CONTRIBUTING.md](CONTRIBUTING.md)
- standards and design knowledge:
  [standards/knowledge/](standards/knowledge/)
- product-root shell readiness:
  [standards/knowledge/product-root-shell-readiness-2026-04-07.md](standards/knowledge/product-root-shell-readiness-2026-04-07.md)

## Managed Project Contract

Managed projects now distinguish three separate questions:

- workflow topology: `local_directory_only` vs `github_versioned`
- canonical source inclusion: whether the project root is tracked in the canonical AgenticOS source tree
- context publication policy: `local_private`, `private_continuity`, or `public_distilled`

The canonical field location is `source_control.context_publication_policy` in `.project.yaml`.

The canonical rationale for context publication policy lives in [standards/knowledge/context-publication-policy-2026-04-10.md](standards/knowledge/context-publication-policy-2026-04-10.md).

Current save/recovery contract:

- `local_private`: Git is not the continuity recovery mechanism
- `private_continuity`: `agenticos_save` is expected to persist the tracked continuity core for Git-backed restore
- `public_distilled`: `agenticos_save` persists a distilled tracked continuity core for Git-backed restore, while raw transcripts route to a private sidecar such as `.private/conversations/`

---

## For Developers

This directory is the canonical product-source project for AgenticOS. If you
are changing AgenticOS itself, start here instead of treating the enclosing
workspace root as the authoritative product repository.

AgenticOS distinguishes two different paths:

- `projects/agenticos/` is the canonical product-source checkout for developing AgenticOS itself
- `AGENTICOS_HOME` is the runtime home used by installed binaries and managed projects

In the standard layout, the runtime home contains a `projects/` directory, and
the AgenticOS source project lives at `"$AGENTICOS_HOME/projects/agenticos"`.

`projects/agenticos/` owns:

- product documentation and operator contracts
- MCP server source under `mcp-server/`
- standards, templates, and downstream workflow kit
- Homebrew distribution assets under `homebrew-tap/`

This project also carries the repository shell for root-Git exit:

- `.github/`, `.gitignore`, `CLAUDE.md`, `CHANGELOG.md`, `ROADMAP.md`, `LICENSE`, `scripts/`
