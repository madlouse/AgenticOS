# AgenticOS MCP Server

AI-native project management for complex, persistent tasks.

---

## 📖 For Humans

### What is AgenticOS?

A project management system designed for AI collaboration. When you work on complex tasks with AI assistants, AgenticOS:

- **Records everything** - Conversations, decisions, code changes
- **Resumes seamlessly** - Pick up where you left off, even weeks later
- **Works everywhere** - Claude Code, Cursor, Codex, any MCP-compatible tool
- **Backs up automatically** - Git integration keeps your work safe
- **Stays organized** - AI manages the structure, you focus on building

### Quick Start

Install AgenticOS, set `AGENTICOS_HOME` explicitly, then either run `agenticos-bootstrap --workspace "$AGENTICOS_HOME" --first-run` or bootstrap one supported agent manually, restart that agent, and explicitly verify `agenticos_list` works before relying on project-intent routing.
On macOS, `--first-run` also enables `launchctl` persistence for GUI/session inheritance.
Use `agenticos-bootstrap --verify` to audit the selected agents and optional persistence layers without mutating them.
`--apply` and `--first-run` also record bootstrap metadata in `$AGENTICOS_HOME/.agent-workspace/bootstrap-state.yaml`.

After any local upgrade, reinstall, or source rebuild of `agenticos-mcp`, restart the current AI client before assuming its MCP tools reflect the new server behavior.
MCP registration can be correct while the live client session is still holding an older server process.

When the client supports a pre-edit hook or local command wrapper, point that layer at `agenticos-edit-guard` so implementation edits fail closed unless project alignment, matching issue bootstrap evidence, and matching PASS preflight evidence already exist.

For stop-event reminders, prefer `agenticos-record-reminder`.
The old root `tools/check-edit-boundary.sh` and `tools/record-reminder.sh` paths should now be treated as legacy compatibility shims.

### Homebrew Post-Install Contract

If the user installed AgenticOS with Homebrew:

- Homebrew installs the binary only
- Homebrew does **not** create or select a workspace
- Homebrew does **not** edit Claude Code, Codex, Cursor, or Gemini CLI configuration
- Homebrew does **not** restart the AI tool
- Homebrew does **not** prove activation by itself

So post-install success only means the package landed. It does not mean the agent is already bootstrapped.

### When to Use

AgenticOS is ideal for:
- Multi-step implementations
- Cross-session work (resume later)
- Complex refactoring
- Feature development with many decisions
- Any task where you want complete history

### Project Structure

Each project contains:
```
my-project/
├── .project.yaml          # Stable project identity, metadata, and layer map
├── .context/
│   ├── quick-start.md     # Concise orientation for fast resume
│   ├── state.yaml         # Mutable operational working state
│   └── conversations/     # Append-only raw session history
├── knowledge/             # Durable synthesized insights, architecture, research
├── tasks/                 # Execution plans, briefs, and task decomposition
└── artifacts/             # Deliverables and concrete outputs
```

---

## 🤖 Supported Agent Bootstrap Standard

Bootstrap is complete only when:

1. the MCP server is registered for the target agent
2. the agent has been restarted if required
3. `agenticos_list` succeeds

Transport bootstrap and project-intent routing are different concerns.

- **transport bootstrap** proves the tool is registered and callable
- **routing** proves the agent is reading project instructions and choosing the tool when appropriate

### Claude Code

- canonical bootstrap: `claude mcp add --transport stdio --scope user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp`
- verify:
  - `claude mcp list`
  - `/mcp`
  - explicit `agenticos_list`
- debug split:
  - if `agenticos` is missing from `claude mcp list`, fix MCP registration first
  - if `agenticos` exists but intent routing is weak, load `CLAUDE.md` / `AGENTS.md` and call the tool explicitly

### Codex

- canonical bootstrap: `codex mcp add --env AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp`
- canonical config location: `~/.codex/config.toml`
- verify:
  - `codex mcp list`
  - explicit `agenticos_list`
- debug split:
  - if `agenticos` is missing from `codex mcp list`, registration did not land in the active config
  - if it is present but prompts still do not route correctly, treat that as routing behavior rather than transport failure

### Cursor

- canonical bootstrap: add `agenticos` with explicit `env.AGENTICOS_HOME` to `~/.cursor/mcp.json`
- verify:
  - restart Cursor
  - check Cursor MCP settings or `cursor-agent mcp list` if the Cursor CLI is installed
  - explicit `agenticos_list`
- debug split:
  - if `agenticos` never appears after restart, validate the JSON and executable path
  - if tools appear but project-intent routing is weak, use explicit tools and project instructions

### Gemini CLI

- canonical bootstrap: `gemini mcp add -s user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos agenticos-mcp`
- canonical config location: `~/.gemini/settings.json`
- verify:
  - `gemini mcp list`
  - restart Gemini CLI
  - explicit `agenticos_list`
- debug split:
  - if `agenticos` is missing from `gemini mcp list`, bootstrap did not land
  - if it is present but behavior is weak, treat that as routing/instruction quality rather than MCP transport failure

### Other MCP-Compatible Tools

These are currently experimental. Do not describe them as first-class supported agents unless they have a documented bootstrap, verification, and debugging contract.

### Repairing Stale Registrations

The supported runtime entrypoint is `agenticos-mcp`.
Do not keep legacy source-checkout registrations such as `node /Users/jeking/dev/AgenticOS/mcp-server/build/index.js`.

Claude Code repair flow:

```bash
claude mcp get agenticos
claude mcp remove agenticos -s user
claude mcp add --transport stdio --scope user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp
```

Codex repair flow:

```bash
codex mcp list
codex mcp get agenticos
codex mcp remove agenticos
codex mcp add --env AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp
```

If Codex reports that `agenticos` does not exist yet, skip the remove step and add it directly.
If `codex mcp get agenticos` shows `env: -`, treat that registration as incomplete and re-add it with explicit `AGENTICOS_HOME`.
After any registration change, restart the agent, confirm the server appears in its MCP diagnostics, and call `agenticos_list`.

This verification remains manual by design.
`agenticos_health` is repo/project scoped and does not inspect or mutate per-agent MCP settings that live in user-owned config files.

## Integration Modes

AgenticOS does not treat every fallback as equal:

- `MCP-native` is the canonical primary mode
- `MCP + Skills Assist` is the supported fallback when transport works but routing or operator ergonomics need help
- `CLI Wrapper` is limited to diagnostics and temporary bootstrap recovery
- `Skills-only Guidance` is experimental and does not provide the canonical AgenticOS runtime surface

---

## Session-Start Contract

Every officially supported adapter must align the runtime before meaningful work begins:

1. call `agenticos_status` to confirm the current session project, current task, pending work, and latest recorded state
2. if no session project is bound or the bound project is wrong, call `agenticos_switch`
3. load the project's startup surfaces (`.project.yaml`, quick-start, state, and session history)
4. review the latest guardrail evidence and latest `agenticos_issue_bootstrap` record before implementation-affecting work
5. if implementation work is requested, enter the canonical guardrail flow below

This is canonical policy. Adapter-specific bootstrap notes must not replace it.

---

## Guardrail Flow

Implementation-affecting work uses one canonical issue-start chain:

1. call `agenticos_preflight`
2. if it returns `REDIRECT`, call `agenticos_branch_bootstrap` and continue in the returned worktree
3. after entering that worktree, perform the normal startup context load and record `agenticos_issue_bootstrap`
4. rerun `agenticos_preflight` in the active issue worktree
5. call `agenticos_edit_guard` immediately before implementation edits
6. call `agenticos_pr_scope_check` before PR creation or merge

`agenticos_issue_bootstrap` is the canonical issue-intake boundary for implementation-affecting work.
It proves the current issue packet, startup surfaces, and issue-bound repo/worktree before downstream guardrails continue.

---

## 🛠️ Tools Reference

### agenticos_init
Create new project with standard structure.

**Parameters**:
- `name` (required) - Project name
- `topology` (required) - `local_directory_only` or `github_versioned`
- `context_publication_policy` (required for `github_versioned`, optional for `local_directory_only`) - `local_private`, `private_continuity`, or `public_distilled`
- `description` (optional) - What this project is about
- `path` (optional) - Custom location (otherwise uses $AGENTICOS_HOME/projects/{id})
- `github_repo` (required when `topology=github_versioned`) - `OWNER/REPO`
- `normalize_existing` (optional) - Normalize an existing project directory into the required contract instead of only creating a new one

**Returns**: Project created confirmation with path and ID

**Topology rubric**:
- choose `local_directory_only` for ongoing local work, knowledge evolution, weekly writing, and private operating material
- choose `github_versioned` for reusable capabilities that should evolve through issue/PR/release flow
- if the boundary is unclear, require explicit confirmation instead of guessing

**Context publication rubric**:
- `local_directory_only` projects default to `context_publication_policy=local_private`
- `github_versioned + private_continuity` means full AI continuity surfaces may live in the repo because the repo is private
- `github_versioned + public_distilled` means distilled context may ship, but raw session history and other non-publishable runtime surfaces must be isolated from the public source tree

Publication policy is not the same as workflow topology or canonical source inclusion. A project can be `github_versioned` and still require `public_distilled`.

**Upgrade path**:
- a project may start as `local_directory_only`
- later, re-run `agenticos_init` with `normalize_existing=true`, `topology=github_versioned`, `context_publication_policy=private_continuity|public_distilled`, and `github_repo=OWNER/REPO`
- only do that when the project has clearly become a reusable capability surface

### agenticos_switch
Switch to existing project and load context.

**Parameters**:
- `project` (required) - Project ID or name

**Returns**: Loaded context (project config, quick-start, state)

Use this when `agenticos_status` shows that no session project is bound or the bound project is not the intended one.

The quick-start/state split is intentional:
- `quick-start.md` is a concise entry surface
- `state.yaml` is mutable operational state
- `conversations/` is append-only history, not the default inline resume surface

### agenticos_list
List all projects with status.

**Returns**: Formatted list with the current session project highlighted when one is bound

### agenticos_save
Save state and backup to Git.

**Parameters**:
- `message` (optional) - Commit message

**Returns**: Backup confirmation with timestamp

### agenticos_status
Show the status of the current session project, or an explicit project when provided.

**Returns**: Current task, pending items, and recent decisions

Call this first at session start to verify project alignment before meaningful work.

### agenticos_issue_bootstrap
Record canonical issue-start evidence for the current issue after the intended issue worktree is active and the normal startup load has completed.

**Parameters**:
- `issue_id` (required)
- `issue_title` (required)
- `repo_path` (required)
- `context_reset_performed` (required)
- `project_hot_load_performed` (required)
- `issue_payload_attached` (required)
- `project_path` (optional, but recommended when `repo_path` is a larger checkout or worktree)

**Returns**: JSON with `RECORDED` or `BLOCK`

### agenticos_preflight
Run machine-checkable guardrail preflight after issue bootstrap and before implementation or PR creation.

**Parameters**:
- `task_type` (required)
- `repo_path` (required)
- `project_path` (optional, but recommended when `repo_path` is a larger checkout or worktree rather than the managed project root)
- `issue_id` (required for implementation work)
- `declared_target_files` (required for implementation work)

**Returns**: JSON with `PASS`, `BLOCK`, or `REDIRECT`

### agenticos_edit_guard
Fail closed before implementation-affecting edits unless the resolved managed project identity, latest issue bootstrap evidence, and latest persisted PASS preflight evidence already match the intended edit.

**Parameters**:
- `repo_path` (required)
- `task_type` (required)
- `declared_target_files` (required)
- `issue_id` (required for implementation work)
- `project_path` (optional, but recommended when `repo_path` is a self-hosting checkout or larger worktree)

**Returns**: JSON with `PASS` or `BLOCK`

### agenticos_branch_bootstrap
Create an issue branch and isolated worktree from the intended remote base.

**Parameters**:
- `issue_id` (required)
- `slug` (required)
- `repo_path` (required)
- `worktree_root` (required)
- `remote_base_branch` (optional, default `origin/main`)

**Returns**: JSON with `CREATED` or `BLOCK`

### agenticos_pr_scope_check
Validate that the current branch diff stays within the intended issue scope.

**Parameters**:
- `issue_id` (required)
- `repo_path` (required)
- `declared_target_files` (required)
- `remote_base_branch` (optional, default `origin/main`)

**Returns**: JSON with `PASS` or `BLOCK`

### agenticos_health
Evaluate whether a canonical checkout and project context are fresh enough to trust before starting work.

**Parameters**:
- `repo_path` (required)
- `project_path` (optional)
- `remote_base_branch` (optional, default `origin/main`)
- `checkout_role` (optional, currently `canonical`)
- `check_standard_kit` (optional)

**Returns**: JSON with overall `PASS`, `WARN`, or `BLOCK`

### agenticos_migration_audit
Audit one managed project for legacy post-`#262` migration findings without mutating anything.

**Parameters**:
- `project_path` (optional) - Explicit project path to audit
- `project` (optional) - Managed project id, name, or path when `project_path` is not provided

**Returns**: JSON with `PASS`, `WARN`, or `BLOCK`, plus structured findings

Current behavior:
- report-only
- supports explicit project path, explicit project selector, or the current session project
- if neither `project_path` nor `project` is passed, a session-bound project must already exist or the audit fails closed
- fails closed when identity is ambiguous
- classifies findings into:
  - `compatible_only`
  - `safe_lazy_repair`
  - `explicit_migration_required`

### agenticos_migrate_project
Build a deterministic per-project migration plan for a legacy managed project.

**Parameters**:
- `project_path` (optional) - Explicit project path to migrate
- `project` (optional) - Managed project id, name, or path when `project_path` is not provided
- `mode` (optional) - `plan` or `apply`
- `apply_scope` (optional) - `safe_repairs_only` or `full`
- `expected_plan_hash` (optional) - Required for `mode=apply`

**Returns**: JSON with:
- `READY`, `BLOCK`, or `NOOP` in `mode=plan`
- `APPLIED` or `BLOCK` in `mode=apply`

Current behavior:
- requires an explicit `project` or `project_path`
- does not use session fallback
- builds a deterministic plan from the current audit state
- supports guarded per-project `apply` for the currently implemented deterministic actions
- separates:
  - planned actions
  - deferred compatible-only findings
  - manual blocks
- exposes a stable `plan_hash` and preconditions
- `mode=apply` requires `expected_plan_hash`
- `mode=apply` writes:
  - project-local migration evidence
  - latest migration summary pointer in state
  - patch-based registry repairs for supported deterministic actions
- current `apply` scope is still intentionally narrow:
  - no home-wide apply
  - no orphan discovery
  - no structural guessing for ambiguous identity/topology cases

### agenticos_migrate_home
Generate a registry-backed legacy-project migration inventory across one `AGENTICOS_HOME`.

**Parameters**:
- `report_only` (optional) - Must remain `true` for the current `#263` slice

**Returns**: JSON with aggregate `PASS`, `WARN`, or `BLOCK`, per-project summaries, and home-wide finding totals

Current behavior:
- report-only
- scans managed projects currently registered in the home registry without mutating them
- highlights blocked projects explicitly instead of skipping them silently
- is intended to be the operator-first inventory step before explicit per-project migration

### agenticos_refresh_entry_surfaces
Deterministically refresh the configured quick-start and state paths from structured merged-work inputs, honoring `.project.yaml.agent_context` when present and defaulting to root `.context/*` otherwise.

**Parameters**:
- `project_path` (required)
- `summary` (required)
- `status` (required)
- `current_focus` (required)
- `issue_id` (optional)
- `facts` (optional)
- `decisions` (optional)
- `pending` (optional)
- `report_paths` (optional)
- `recommended_entry_documents` (optional)

**Returns**: JSON with `REFRESHED`

### agenticos_non_code_evaluate
Validate a completed non-code evaluation rubric against the canonical contract and persist the latest structured evidence into project state.

**Parameters**:
- `project_path` (required)
- `rubric_path` (required)

**Returns**: JSON with `RECORDED`

---

## 📦 Resources Reference

### agenticos://context/current
Get complete context for the current session project.

**Returns**:
- Project configuration (.project.yaml)
- Quick start guide
- Current session state

---

## 🔒 Privacy & Security

- All data stored locally under `AGENTICOS_HOME`
- No external servers or telemetry
- Git backup is optional and user-controlled
- Safe for public npm distribution

## 📄 License

MIT
