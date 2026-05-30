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

`--first-run` also installs the AgenticOS activation Skill for Codex and
Claude Code when those clients are selected, so natural-language requests like
"switch to 360Teams" or "切换到 360Teams 项目" are routed through AgenticOS MCP
instead of raw filesystem guessing.

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

## Optional Hermes + Discord Project Threads

Hermes-side Discord routing is optional. A machine without Hermes or Discord
keeps the normal AgenticOS MCP workflow: `agenticos_project_ensure` can still
resolve or create a project, and Discord thread routing is skipped.

When a Discord gateway is configured, Hermes can treat "切换到 AgenticOS 项目"
and "新建 T5T 项目" as the same project-entry operation:

1. call AgenticOS MCP `agenticos_project_ensure`
2. create or reuse one Discord project thread
3. persist the private thread binding with `agenticos_external_thread_bind`
4. dispatch Codex by default, or Claude Code only when explicitly requested

Discord is the only threaded surface in the MVP. Feishu does not get a thread
path yet. Older AgenticOS installs that are missing `agenticos_project_ensure`
or external thread binding tools must be upgraded and the agent restarted
before Hermes should claim threaded routing is available.

Real Discord validation requires credentials and permissions, so automated
tests use fake adapters only. See
[standards/knowledge/hermes-discord-project-thread-rollout-2026-05-22.md](standards/knowledge/hermes-discord-project-thread-rollout-2026-05-22.md)
for the rollout checklist.

## Official Supported Agents

The official bootstrap surface currently covers:

- Claude Code
- Codex
- Cursor
- Gemini CLI

Bootstrap is complete only when:

1. the MCP server is registered for the target agent
2. the activation Skill is installed for Codex or Claude Code when natural-language routing is required
3. the agent has been restarted or reloaded if required
4. `agenticos_list` succeeds

## Homebrew Bootstrap Contract

Homebrew installs the `agenticos-mcp` binary only. It does **not** create or
select a workspace, does **not** edit Claude Code, Codex, Cursor, or Gemini
CLI configuration, does **not** restart the AI tool, and does **not** prove
activation by itself.

### Recommended: One-command bootstrap

After Homebrew installation, the fastest path to a working setup is:

```bash
export AGENTICOS_HOME=/absolute/path/to/your/workspace   # any valid workspace home
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --first-run --auto-configure-hooks
```

On macOS, `--first-run` also sets up `launchctl` persistence so GUI tools
inherit `AGENTICOS_HOME` across sessions. It installs the AgenticOS activation
Skill for local-skill-capable agents: Codex, Claude Code, Cursor, and Gemini CLI.
`--auto-configure-hooks` adds the Claude Code PostToolUse hook that reads the
`agenticos_switch` result from hook stdin and feeds the selected project path
back into Claude as explicit cwd guidance. The hook cannot mutate a parent
shell process; keep using the reported project path as the explicit workdir
and run `cd <path>` when your client shell PWD differs. Then restart your AI
tool and run:

```bash
agenticos-config --validate
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --all --install-skills --verify
```

Then confirm the server appears in the tool's MCP diagnostics and
`agenticos_list` succeeds.

Use `agenticos-bootstrap --workspace "$AGENTICOS_HOME" --all --install-skills --verify`
to audit the current transport and activation-skill state without mutating
anything. If you have intentionally edited the generated Skill, bootstrap will
not overwrite it unless you pass `--force-skills`.

### Alternative: Per-agent manual setup

If you prefer to register the MCP server manually for each tool:

```bash
export AGENTICOS_HOME=/absolute/path/to/your/workspace

# Claude Code
claude mcp add agenticos -s user -e AGENTICOS_HOME="$AGENTICOS_HOME" -- agenticos-mcp

# Codex
codex mcp add --env AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp

# Gemini CLI
gemini mcp add -s user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos agenticos-mcp
```

For Cursor, add `agenticos` with explicit `env.AGENTICOS_HOME` to
`~/.cursor/mcp.json`, then restart Cursor and verify `agenticos_list`.
Install or refresh the Cursor activation Skill with:

```bash
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent cursor --install-skills --apply
```

For Gemini CLI, install or refresh the activation Skill with:

```bash
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent gemini-cli --install-skills --apply
```

Managed projects also receive the always-applied project rule at
`.cursor/rules/agenticos.mdc` during `agenticos_init` and standard-kit adopt.

### Repairing a stale registration

If a previous registration still points at a source checkout instead of
`agenticos-mcp`, repair it with:

```bash
claude mcp get agenticos
claude mcp remove agenticos -s user
claude mcp add agenticos -s user -e AGENTICOS_HOME="$AGENTICOS_HOME" -- agenticos-mcp

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
   Switching binds AgenticOS context; it does not guarantee the client shell cwd changed.
3. **Do real work** — complete a task across two or more sessions
4. **Verify persistence** — on the second session, ask the tool to run
   `agenticos_status` and confirm it shows your previous context

For natural-language switch requests such as "switch project", "enter project",
"continue project", "切换项目", or "进入项目", agents should discover and call
AgenticOS MCP `agenticos_switch` before shell directory search. In Codex-like
clients where MCP tools may be deferred, use `tool_search` to discover
AgenticOS MCP tools first. Fall back to shell directory search only when
AgenticOS MCP is unavailable or cannot resolve the requested project.

The AgenticOS activation Skill exists for this routing layer only. It should
make the agent remember to discover and call AgenticOS MCP; it must not replace
MCP as the source of truth for project identity, session binding, or workdir
guidance.

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
