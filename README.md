# AgenticOS

AI-native project management that persists context across sessions for
MCP-capable AI tools.

This directory is the canonical product-source project for AgenticOS. If you
are changing AgenticOS itself, start here instead of treating the enclosing
workspace root as the authoritative product repository.

## Scope

`projects/agenticos/` owns:

- product documentation and operator contracts
- MCP server source under `mcp-server/`
- standards, templates, and downstream workflow kit
- Homebrew distribution assets under `homebrew-tap/`

The enclosing workspace root may still expose compatibility entrypoints while the root-Git split is in progress, but those root files are not the long-term authority path.

This project now also carries the future repository shell needed for root-Git
exit:

- `.github/`
- `.gitignore`
- `CLAUDE.md`
- `CHANGELOG.md`
- `ROADMAP.md`
- `LICENSE`
- `scripts/`

## Quick Start

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

After installation, set `AGENTICOS_HOME` explicitly, bootstrap one supported
agent manually or with `agenticos-bootstrap`, restart the current client, and
explicitly verify `agenticos_list` before assuming project-intent routing is
working.

`AGENTICOS_HOME` may be any valid workspace home, including a long-term
self-hosting AgenticOS workspace, as long as it is not the repo root of a
project such as `projects/agenticos`.

Requires: Node.js >= 20.0.0 for local build and packaged runtime workflows.

```bash
export AGENTICOS_HOME=/absolute/path/to/your/workspace

agenticos-bootstrap --workspace "$AGENTICOS_HOME" --first-run

claude mcp add --transport stdio --scope user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp
codex mcp add --env AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp
gemini mcp add -s user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos agenticos-mcp
```

Verify with `agenticos-mcp --version`, then restart the target MCP client and
confirm `agenticos_list` succeeds.

For Cursor, add `agenticos` with explicit `env.AGENTICOS_HOME` to
`~/.cursor/mcp.json`, then restart Cursor and verify `agenticos_list`.

If a previous registration still points at a source checkout instead of
`agenticos-mcp`, repair it manually:

```bash
claude mcp get agenticos
claude mcp remove agenticos -s user
claude mcp add --transport stdio --scope user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp

codex mcp get agenticos
codex mcp remove agenticos
codex mcp add --env AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp
```

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

## Current Boundary Rule

- `projects/agenticos/` is the only canonical AgenticOS product-source project under `projects/`
- the enclosing `AgenticOS/` path is the workspace home; product source lives under `projects/agenticos/`
- root-level `README.md`, `AGENTS.md`, and `CONTRIBUTING.md` currently remain as compatibility entrypoints during that migration

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
- `public_distilled`: tracked recovery stays distilled; raw transcript isolation remains a separate contract
