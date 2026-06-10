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

Install AgenticOS, set `AGENTICOS_HOME` explicitly, then either run `agenticos-bootstrap --workspace "$AGENTICOS_HOME" --first-run --auto-configure-hooks` or bootstrap one supported agent manually, restart that agent, and explicitly verify `agenticos_list` works before relying on project-intent routing.
On macOS, `--first-run` also enables `launchctl` persistence for GUI/session inheritance.
It also installs the AgenticOS activation Skill for local-skill-capable agents — Codex, Claude Code, Cursor, Gemini CLI, and Hermes Agent — so switch/status/pwd/switch-out prompts route to AgenticOS MCP before filesystem guessing.
With `--auto-configure-hooks`, Claude Code receives switch-in/switch-out per-call cwd guidance hooks and Hermes Agent receives the `agenticos-cwd-applicator` plugin so Hermes runtime tools apply AgenticOS workdirs automatically after `agenticos_switch` and `agenticos_switch_out`.
Use `agenticos-config --validate` and `agenticos-bootstrap --workspace "$AGENTICOS_HOME" --all --install-skills --auto-configure-hooks --verify` to audit the Homebrew/runtime bootstrap state, activation Skill state, cwd applicator state, and optional persistence layers without mutating them.
`--apply` and `--first-run` also record bootstrap metadata in `$AGENTICOS_HOME/.agent-workspace/bootstrap-state.yaml`.

After any local upgrade, reinstall, or source rebuild of `agenticos-mcp`, restart the current AI client before assuming its MCP tools reflect the new server behavior.
MCP registration can be correct while the live client session is still holding an older server process.

When the client supports a pre-edit hook or local command wrapper, point that layer at `agenticos-edit-guard` so implementation edits fail closed unless project alignment, matching issue bootstrap evidence, and matching PASS preflight evidence already exist.

For stop-event reminders, prefer `agenticos-record-reminder`.
The old root `tools/check-edit-boundary.sh` and `tools/record-reminder.sh` paths should now be treated as legacy compatibility shims.

If you still have a legacy Claude Code stop hook that points at a source-checkout script under an old workspace checkout, migrate it to the installed command.
For example, an older config may still contain:

```json
{
  "command": "bash /path/to/tools/record-reminder.sh",
  "timeout": 5,
  "type": "command"
}
```

Replace it with:

```json
{
  "command": "agenticos-record-reminder",
  "timeout": 5,
  "type": "command"
}
```

The stop hook remains an optional local reminder only. It should not be treated as a canonical guardrail or as a substitute for `agenticos_record`.

### Homebrew Post-Install Contract

If the user installed AgenticOS with Homebrew:

- Homebrew installs the binary only
- Homebrew does **not** create or select a workspace
- Homebrew does **not** edit Claude Code, Codex, Cursor, Gemini CLI, or Hermes Agent configuration
- Homebrew does **not** restart the AI tool
- Homebrew does **not** prove activation by itself

So post-install success only means the package landed. It does not mean the agent is already bootstrapped.

On Apple Silicon macOS, Homebrew caveats commonly use `/opt/homebrew/var/agenticos`
as the default runtime-home example for `AGENTICOS_HOME`.
That is a runtime home, not a source checkout path.

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
│   └── conversations/     # Tracked/display conversation contract surface
├── .private/
│   └── conversations/     # Raw transcript sidecar for public_distilled projects
├── knowledge/             # Durable synthesized insights, architecture, research
├── tasks/                 # Execution plans, briefs, and task decomposition
└── artifacts/             # Deliverables and concrete outputs
```

---

## 🤖 Supported Agent Bootstrap Standard

Bootstrap is complete only when:

1. the MCP server is registered for the target agent
2. the activation Skill is installed for local-skill-capable agents when natural-language routing is required
3. the agent has been restarted or reloaded if required
4. `agenticos_list` succeeds

Transport bootstrap and project-intent routing are different concerns.

- **transport bootstrap** proves the tool is registered and callable
- **routing** proves the agent is reading project instructions and choosing the tool when appropriate

### Activation Skill Layer

AgenticOS follows the same split seen in GBrain/Hermes-style integrations:
Skills sit in the agent's pre-tool routing layer, while MCP remains the
execution and state surface. The activation Skill is deliberately small. It
teaches the agent to discover and call AgenticOS MCP for project switching,
`pwd`, current-project, project-status, and worktree-status requests before
using raw `cd`, filesystem search, or git branch inference.

Bootstrap installs the Skill only on agents that currently have a local Skill
surface:

- Codex: `~/.codex/skills/agenticos/SKILL.md`
- Claude Code: `~/.claude/skills/agenticos/SKILL.md`
- Cursor: `~/.cursor/skills-cursor/agenticos/SKILL.md`

Install or update it with:

```bash
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent codex --install-skills --apply
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent claude-code --install-skills --apply
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent cursor --install-skills --apply
```

`--first-run` implies `--install-skills`. Managed Skill files carry a content
hash so bootstrap can update stale AgenticOS-managed copies while refusing to
overwrite user-modified files. Pass `--force-skills` only when you intentionally
want to replace a local edit.

### Claude Code

- canonical bootstrap: `claude mcp add agenticos -s user -e AGENTICOS_HOME="$AGENTICOS_HOME" -- agenticos-mcp`
- canonical config location: `~/.claude/settings.json`
- activation Skill: `~/.claude/skills/agenticos/SKILL.md`
- verify:
  - `claude mcp list`
  - `/mcp`
  - `agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent claude-code --install-skills --verify`
  - explicit `agenticos_list`
- debug split:
  - if `agenticos` is missing from `claude mcp list`, fix MCP registration first
  - if `agenticos` exists but intent routing is weak, load `CLAUDE.md` / `AGENTS.md` and call the tool explicitly

### Codex

- canonical bootstrap: `codex mcp add --env AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp`
- canonical config location: `~/.codex/config.toml`
- activation Skill: `~/.codex/skills/agenticos/SKILL.md`
- verify:
  - `codex mcp list`
  - `agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent codex --install-skills --verify`
  - explicit `agenticos_list`
- debug split:
  - if `agenticos` is missing from `codex mcp list`, registration did not land in the active config
  - if it is present but prompts still do not route correctly, treat that as routing behavior rather than transport failure

### Cursor

- canonical bootstrap: add `agenticos` with explicit `env.AGENTICOS_HOME` to `~/.cursor/mcp.json`
- activation Skill: `~/.cursor/skills-cursor/agenticos/SKILL.md`
- project adapter rule: `.cursor/rules/agenticos.mdc` (`alwaysApply: true`)
- verify:
  - restart Cursor
  - check Cursor MCP settings or `cursor-agent mcp list` if the Cursor CLI is installed
  - `agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent cursor --install-skills --verify`
  - explicit `agenticos_list`
- debug split:
  - if `agenticos` never appears after restart, validate the JSON and executable path
  - if tools appear but project-intent routing is weak, verify the activation Skill and project rule, then use explicit tools

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

### Hermes Agent

Hermes Agent is a peer runtime alongside Codex, Claude Code, Cursor, and Gemini
CLI. AgenticOS bootstrap does not register Hermes MCP transport by itself; it
installs the managed activation Skill and user-level `agenticos-cwd-applicator`
plugin so Hermes routes project-intent prompts through AgenticOS MCP and applies
the returned switch/switch-out workdir when the Hermes runtime can already see
those tools.

```bash
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent hermes-agent --install-skills --apply
```

This writes `~/.hermes/skills/work/agenticos/SKILL.md`, installs
`~/.hermes/plugins/agenticos-cwd-applicator/`, and enables that plugin in
`~/.hermes/config.yaml`. It helps Hermes route "切换到 ... 项目", `pwd`, and
"切出/退出项目" prompts through AgenticOS MCP, then apply the returned project
or restore workdir to Hermes' runtime cwd.
It does not install Hermes, configure Discord, or prove gateway readiness.

Codex, Claude Code, and Hermes Agent apply AgenticOS workdirs differently:
Codex must pass the returned path as explicit tool `workdir`; Claude Code must
use the hook output as per-command cwd guidance or use absolute paths; Hermes
Agent uses `agenticos-cwd-applicator` to update its runtime cwd carrier when
Hermes supports that plugin hook.

Verify Skill state without Discord:

```bash
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent hermes-agent --install-skills --verify
```

### Optional Discord Channel Project Routing

Discord project routing is an optional channel integration, not a Hermes Agent
activation requirement. AgenticOS works the same on machines that do not have a
Hermes-side Discord gateway or Discord credentials.

The supported MVP flow is:

1. Hermes parses a project-entry command such as "切换到 AgenticOS 项目" or
   "新建 T5T 项目".
2. Hermes calls AgenticOS MCP `agenticos_project_ensure` first. It must not use
   `cd`, raw filesystem search, git branch detection, or `agenticos_switch` as
   a lookup shortcut.
3. If Discord is configured, Hermes creates or reuses a Discord project thread
   and records the private binding with `agenticos_external_thread_bind`.
4. Worker dispatch defaults to Codex. Explicit phrases such as "用 Claude Code"
   or "Claude Agent" select Claude Code.
5. Worker prompts must tell execution agents to use AgenticOS MCP and the
   explicit workdir returned by AgenticOS. Progress and blocked/setup messages
   are posted back to the Discord project thread.

Feishu thread routing is intentionally out of scope for the MVP. If Discord is
not configured, project ensure may still succeed and the response should say
Discord routing was skipped. If older installs are missing
`agenticos_project_ensure`, `agenticos_external_thread_get`, or
`agenticos_external_thread_bind`, upgrade AgenticOS, rerun bootstrap verification,
and restart the agent before retrying threaded routing.

Use the Discord readiness gate only when this channel integration is in scope:

```bash
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --all --install-skills --verify --verify-hermes-discord
```

Verification without real Discord credentials is covered by fake E2E tests.
For a real-gateway checklist, see
`standards/knowledge/hermes-discord-project-thread-rollout-2026-05-22.md`.

### Repairing Stale Registrations

The supported runtime entrypoint is `agenticos-mcp`.
Do not keep legacy source-checkout registrations such as `node /path/to/mcp-server/build/index.js`.

Claude Code repair flow:

```bash
claude mcp get agenticos
claude mcp remove agenticos -s user
claude mcp add agenticos -s user -e AGENTICOS_HOME="$AGENTICOS_HOME" -- agenticos-mcp
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

## Homebrew Installation

The canonical macOS install path is Homebrew. Homebrew installs the `agenticos-mcp`
binary only — it does not create a workspace, does not edit agent configuration,
and does not restart the AI tool.

### Fresh install

```bash
brew install agenticos
```

Then bootstrap your workspace and agent:

```bash
export AGENTICOS_HOME=/path/to/your/workspace   # any valid directory
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --first-run --auto-configure-hooks
```

Restart your AI tool and verify with `agenticos_list`.
If you rely on natural-language project switching, verify the activation Skill
as well:

```bash
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --all --install-skills --auto-configure-hooks --verify
```

### Repairing a stale Homebrew tap

If `brew info agenticos` reports the wrong version or fails to find the formula,
refresh the tap:

```bash
brew untap agenticos/tap
brew tap agenticos/tap https://github.com/madlouse/agenticos-homebrew
brew install agenticos
```

For agent-level MCP registration repair after any reinstall, see
**Repairing Stale Registrations** above.

On Apple Silicon macOS, the runtime home defaults to `/opt/homebrew/var/agenticos`
— that is a workspace directory, not a source checkout path.

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

For the recommended bootstrap walkthrough, see the Quick Start section above
and run `agenticos-bootstrap --workspace "$AGENTICOS_HOME" --first-run` first.

---

## 🛠️ Tools Reference

### agenticos_init
Create new project with standard structure.

**Parameters**:
- `name` (required) - Project name
- `topology` (required) - `local_directory_only`, `git_versioned`, or legacy-compatible `github_versioned`
- `context_publication_policy` (required for Git-backed projects, optional for `local_directory_only`) - `local_private`, `private_continuity`, or `public_distilled`
- `description` (optional) - What this project is about
- `path` (optional) - Custom location (otherwise uses $AGENTICOS_HOME/projects/{id})
- `repository` (required when `topology=git_versioned` unless the legacy `github_repo` shorthand is supplied) - object with `provider`, `remote`, `slug`, optional `default_base_branch`, and `review_system`
- `github_repo` (legacy shorthand; required only when `topology=github_versioned`) - `OWNER/REPO`
- `normalize_existing` (optional) - Normalize an existing project directory into the required contract instead of only creating a new one

**Returns**: Project created confirmation with path and ID

**Topology rubric**:
- choose `local_directory_only` for ongoing local work, knowledge evolution, weekly writing, and private operating material
- choose `git_versioned` for reusable Git-backed capabilities that should evolve through issue branch, PR/MR/review, CI, merge, and cleanup flow across GitHub, GitLab, Gitee, or generic Git
- keep `github_versioned` for existing installed GitHub projects until an explicit normalization flow rewrites metadata
- if the boundary is unclear, require explicit confirmation instead of guessing

**Context publication rubric**:
- `local_directory_only` projects default to `context_publication_policy=local_private`
- `git_versioned + private_continuity` means full AI continuity surfaces may live in the repo because the repo is private
- `git_versioned + public_distilled` means distilled context may ship, but raw session history and other non-publishable runtime surfaces must be isolated from the public source tree

**Current recovery contract**:
- `local_private`: Git is not the continuity recovery mechanism; `agenticos_save` keeps the existing narrow runtime-managed backup behavior
- `private_continuity`: `agenticos_save` stages the tracked continuity core for Git-backed recovery, including `.project.yaml`, quick-start, state, conversations, `knowledge/`, `tasks/`, and mirrored guidance such as `CLAUDE.md` / `AGENTS.md` when present and repo-local
- `public_distilled`: `agenticos_save` stages a distilled tracked continuity core for Git-backed recovery (`.project.yaml`, quick-start, state, `knowledge/`, `tasks/`, and mirrored guidance when present), while raw transcripts route to `.private/conversations/`

Publication policy is not the same as workflow topology or canonical source inclusion. A project can be `git_versioned` and still require `public_distilled`.

**Upgrade path**:
- a project may start as `local_directory_only`
- later, re-run `agenticos_init` with `normalize_existing=true`, `topology=git_versioned`, `context_publication_policy=private_continuity|public_distilled`, and `repository={provider, slug}` or the legacy `github_repo=OWNER/REPO` shorthand
- only do that when the project has clearly become a reusable capability surface
- existing `github_versioned`, `github_repo`, and `github_flow` metadata remains readable and operational; AgenticOS does not silently rewrite it during switch/status/preflight

### agenticos_switch
Switch to existing project and load context.

**Parameters**:
- `project` (required) - Project ID or name
- `repo_path` (optional) - Absolute checkout path (for example an issue worktree) to bind the MCP session to instead of the registry path. The checkout must contain a readable `.project.yaml` whose `meta.id` matches the registry project id.

**Returns**: Loaded context (project config, quick-start, state)

Use this when `agenticos_status` shows that no session project is bound or the bound project is not the intended one.

When working in an isolated issue worktree, pass `repo_path` so guardrail tools, record/save, and session binding all target the worktree instead of the canonical registry checkout.

The quick-start/state split is intentional:
- `quick-start.md` is a concise entry surface
- `state.yaml` is mutable operational state
- `conversations/` is the tracked/display conversation contract surface, not the default inline resume surface

### agenticos_list
List all projects with status.

**Returns**: Formatted list with the current session project highlighted when one is bound

### agenticos_record
Capture session activity and, when allowed, distill it into project continuity.

**Parameters**:
- `project` (optional) - Project ID, name, or registered path. Defaults to the current session project.
- `project_path` (optional) - Absolute project checkout path to write into. Use the issue worktree path when recording from an isolated worktree.
- `summary` (required) - What happened in this session.
- `decisions`, `outcomes`, `pending` (optional) - Structured continuity updates.
- `current_task` (optional) - `{ title, status }`.

**Behavior**:
- capture is attempted first so meaningful session facts are not lost
- when project-tree writes are allowed, record also updates distilled continuity (`state.yaml`, `CLAUDE.md`, marker, and registry metadata)
- when tracked writes are protected, record returns `RECORDED_CAPTURE_ONLY` with recovery actions instead of treating the block as the end state
- raw capture sidecars are runtime/private surfaces and must not be staged by `agenticos_save`

### agenticos_save
Save state and backup to Git.

**Parameters**:
- `project` (optional) - Project ID, name, or path. Defaults to the current session project.
- `project_path` (optional) - Absolute project checkout path for continuity resolution. Use the issue worktree when saving from an isolated worktree.
- `repo_path` (optional) - Absolute git checkout path for commit/push and canonical-main guard evaluation. Use the issue worktree when the git root differs from the registry project path.
- `message` (optional) - Commit message

**Returns**: Backup confirmation with timestamp

**Worktree binding**:
- when the registry path points at canonical main but edits happened in an issue worktree, pass the same worktree path as both `project_path` and `repo_path`
- `agenticos_switch(project, repo_path=...)` should be used first so session binding and save/evaluate tools agree on the active checkout

**Policy-aware behavior**:
- `private_continuity` validates the tracked continuity plan before mutating `state.yaml` or staging files
- if a required continuity path escapes the repo root, or no Git repo root can be proven, `agenticos_save` fails closed instead of writing a partial tracked state
- successful `private_continuity` saves stage the tracked continuity core rather than only the legacy runtime review subset
- `public_distilled` stages the distilled tracked continuity core and keeps raw transcripts in `.private/conversations/`
- if a `public_distilled` project has tracked raw transcript diffs under `.context/conversations/`, `agenticos_save` blocks instead of silently publishing them

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
- `project_path` (optional, but recommended when `repo_path` is inside a larger checkout or worktree)
- `worktree_root` (optional, deprecated compatibility input; AgenticOS derives `$AGENTICOS_HOME/worktrees/<project-id>` and rejects mismatched overrides)
- `remote_base_branch` (optional, default `origin/main`)

**Returns**: JSON with `CREATED` or `BLOCK`

### agenticos_pr_scope_check
Validate that the current branch diff stays within the intended issue scope.

**Parameters**:
- `issue_id` (required)
- `repo_path` (required)
- `project_path` (optional, but recommended when `repo_path` is a self-hosting checkout or larger worktree)
- `declared_target_files` (required)
- `remote_base_branch` (optional, default `origin/main`)

**Returns**: JSON with `PASS` or `BLOCK`

When `project_path` points at the managed project root and `repo_path` is an external issue worktree, runtime review surface paths are resolved relative to the managed project root instead of failing with a comparison-root escape.

### agenticos_health
Evaluate whether a canonical checkout and project context are fresh enough to trust before starting work.

**Parameters**:
- `repo_path` (required)
- `project_path` (optional)
- `remote_base_branch` (optional, default `origin/main`)
- `checkout_role` (optional, currently `canonical`)
- `check_standard_kit` (optional)

**Returns**: JSON with overall `PASS`, `WARN`, or `BLOCK`

For Git-backed projects, the health result also distinguishes stale
committed entry-surface state from canonical checkout runtime drift.
When `repo_path` is inside a managed repo or its derived project-scoped
worktree root, `agenticos_health` resolves the effective project automatically
and returns a `worktree_topology` payload sourced from `git worktree list
--porcelain`.
That topology gate reports:

- `PASS` when all non-canonical worktrees are under the derived project-scoped root
- `WARN` when misplaced clean worktrees still exist
- `BLOCK` when misplaced dirty worktrees or topology inspection failures exist

### agenticos_canonical_sync
Plan, snapshot, or prepare runtime-managed cleanup for a canonical checkout before manual branch resync.

**Parameters**:
- `repo_path` (required)
- `action` (optional: `plan`, `snapshot`, or `prepare`; default `plan`)
- `project_path` (optional)
- `remote_base_branch` (optional, default `origin/main`)
- `snapshot_label` (optional)

**Returns**: JSON with current repo-sync status plus optional snapshot / cleanup details

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

## Troubleshooting

### `agenticos_list` returns empty

1. Confirm `AGENTICOS_HOME` is set in the current shell:
   ```bash
   echo $AGENTICOS_HOME
   ```
2. Run:
   ```bash
   agenticos-config --validate
   agenticos-bootstrap --workspace "$AGENTICOS_HOME" --all --verify
   ```
3. If the workspace was never initialized, run:
   ```bash
   agenticos-bootstrap --workspace "$AGENTICOS_HOME" --first-run
   ```
4. Restart your AI tool, then try `agenticos_list` again

### Agent started but tools don't appear

1. Confirm the MCP server is registered: `claude mcp list` (or your agent's equivalent)
2. If `agenticos` is missing, re-register it:
   ```bash
   claude mcp remove agenticos -s user
   claude mcp add agenticos -s user -e AGENTICOS_HOME="$AGENTICOS_HOME" -- agenticos-mcp
   ```
3. Restart the AI tool completely (not just the current session)
4. Try `agenticos_list` again

### Tools appear but natural-language switch does not use AgenticOS

This is a routing problem, not necessarily a transport problem. Install or
verify the activation Skill for the local-skill-capable agent you use:

```bash
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent codex --install-skills --verify
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent claude-code --install-skills --verify
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent cursor --install-skills --verify
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent gemini-cli --install-skills --verify
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent hermes-agent --install-skills --verify
```

If verification fails, rerun the same command with `--apply`, restart or reload
the agent's skills, then retry the user-facing prompt. The Skill should make
requests like "switch to 360Teams", "pwd", and "切换到 360Teams 项目" discover
and call `agenticos_switch` or `agenticos_status` before shell directory search.

### `AGENTICOS_HOME` is not inherited by GUI tools

GUI applications (Claude Code desktop, Cursor, etc.) run outside your shell and
don't inherit shell profile variables. On macOS, `--first-run` sets up
`launchctl` persistence for this:

```bash
agenticos-bootstrap --workspace "$AGENTICOS_HOME" --first-run
```

If you set `AGENTICOS_HOME` manually, also add it to your shell profile
(`~/.zshrc` or `~/.bashrc`):

```bash
export AGENTICOS_HOME=/path/to/your/workspace
```

Then restart the GUI application.

### Stale source-checkout registration

If `claude mcp get agenticos` shows a path like `node /path/to/mcp-server/build/index.js`
instead of `agenticos-mcp`, remove the stale entry and re-register:

```bash
claude mcp get agenticos
claude mcp remove agenticos -s user
claude mcp add agenticos -s user -e AGENTICOS_HOME="$AGENTICOS_HOME" -- agenticos-mcp
```

### Runtime version mismatch

The installed `agenticos-mcp` binary may not match the source checkout version.
Compare them directly:

```bash
npm show agenticos-mcp version   # installed package version
cat package.json | jq .version   # source checkout version
```

If they differ, rebuild from source:

```bash
cd mcp-server
npm install
npm run build
```

Then re-register the binary (the installed `agenticos-mcp` on PATH takes precedence over
source-checkout paths regardless of how the MCP server was originally registered).

### `branch_bootstrap BLOCKED`

`agenticos_branch_bootstrap` requires a Git repository root. It fails when invoked
outside a git worktree or in a directory that is not itself a git repo.

Work inside `projects/agenticos/` or a registered AgenticOS worktree:

```bash
cd "$AGENTICOS_HOME/projects/agenticos"
git worktree list   # confirm the current context is inside a worktree
```

Do not run `branch_bootstrap` at the root of the AgenticOS source checkout unless that
checkout is itself a valid git repo and the intended worktree root.

### Session binding lost after MCP server restart

The MCP server is stateless per invocation. After a server restart (client restart,
machine reboot), the session binding that existed in the previous server process is gone.

To rebind:

```bash
agenticos_status        # confirms current binding; shows "no session project" if unbound
agenticos_switch <project>   # rebind to the intended project
```

This is expected behavior, not a bug. `agenticos_status` + `agenticos_switch` is the
correct recovery at every new session start.

### Stale Homebrew registration (version mismatch)

If Homebrew reports that the installed version does not match the tap version,
the Homebrew formula is stale. Repair with:

```bash
brew update && brew upgrade agenticos
```

`brew update` must run first so Homebrew refreshes tap metadata; `brew upgrade`
only installs a version the local Homebrew cache already knows about.

If `brew update && brew upgrade` still reports nothing to upgrade but the version
still mismatches, the local Homebrew tap cache is stale. Force a refresh:

```bash
brew untap agenticos/tap
brew tap agenticos/tap https://github.com/madlouse/agenticos-homebrew
brew install agenticos
```

After any Homebrew repair, restart your AI tool and verify `agenticos_list` succeeds.

---

## FAQ

**What's the difference between `AGENTICOS_HOME` and the AgenticOS source checkout?**

`AGENTICOS_HOME` is the runtime workspace — it holds managed projects, worktrees,
state, and session history. The AgenticOS source checkout (typically
`projects/agenticos/` inside `AGENTICOS_HOME`) is the product itself. They are
separate: `AGENTICOS_HOME` is where AgenticOS operates; the source checkout is
what AgenticOS is built from.

**Why does `agenticos_status` show no session binding after restart?**

The MCP server is stateless per invocation. After a client restart, machine reboot,
or MCP server restart, the session binding from the previous process is gone.
Run `agenticos_switch` to rebind the session to your project. This is normal
behavior, not an error. See **Session binding lost after MCP server restart** in
Troubleshooting for the full recovery flow.

**How do I check if my installed runtime matches the source?**

```bash
npm show agenticos-mcp version   # installed binary version
cat package.json | jq .version  # source checkout version
```

If they differ, rebuild from source with `npm run build` in the mcp-server
directory. See **Runtime version mismatch** in Troubleshooting for details.

---

## 🔒 Privacy & Security

- All data stored locally under `AGENTICOS_HOME`
- No external servers or telemetry
- Git backup is optional and user-controlled
- Safe for public npm distribution

## 📄 License

MIT
