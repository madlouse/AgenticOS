<!-- agenticos-template: v11 -->
# AGENTS.md — AgenticOS

## Adapter Role

`AGENTS.md` is the Codex/generic adapter surface for this project.
It must expose the same canonical policy as other agent adapters rather than defining a different workflow.

## Canonical Policy (Shared Across Agents)

- This project has one canonical AgenticOS execution policy across Claude Code, Codex, and other supported agents.
- Implementation work must stay issue-first, preflighted, and inside the guardrail-controlled branch/worktree flow.
- PR creation or merge must not happen before executable scope validation passes.
- Recording and save flow remain canonical project requirements rather than runtime-specific preferences.
## Codex / Generic Runtime Notes

- If natural-language routing is weak, use explicit `agenticos_*` tool calls before treating the issue as transport failure.
- Bootstrap differences are runtime concerns rather than policy changes.
## Task Intake Rule

- At task intake, recover operator intent before treating named methods or workflow fragments as the full plan.
- Separate goals, hard constraints, useful signals, and candidate methods before choosing an execution path.
- Once intent is resolved, collapse it into a clean execution objective instead of carrying the full intake rubric through every later step.
## Guardrail Protocol (MANDATORY)

Before implementation edits, confirm session/project alignment with `agenticos_status`; if no session project is bound or the bound project is not the intended one, call `agenticos_switch`.

Implementation work must use the executable guardrail flow:

1. call `agenticos_preflight`; if it returns `REDIRECT`, call `agenticos_branch_bootstrap` and continue in the returned worktree
2. after the issue worktree is active, perform the normal startup load and record `agenticos_issue_bootstrap`
3. rerun `agenticos_preflight` in that worktree before editing
4. use `agenticos_edit_guard` immediately before implementation edits
5. do not submit a PR before running `agenticos_pr_scope_check`

If any guardrail returns `BLOCK`, stop and resolve the blocking reason first.

## Recording Protocol (MANDATORY)

This project uses AgenticOS for persistent context management.
All session activity MUST be recorded via MCP tools.

### How to Record

Call the MCP tool `agenticos_record` with:
- `summary` (required): What happened in this session
- `decisions`: Key decisions made
- `outcomes`: What was accomplished
- `pending`: What remains to be done
- `current_task`: { title, status } to update current task

### When to Record

1. After completing any meaningful unit of work
2. Before ending the session (MANDATORY — context is lost otherwise)

After recording, call `agenticos_save` to commit to Git.

### Session Start

On session start, align the runtime before meaningful work:
1. call `agenticos_status` to confirm the current session project, current task, pending work, and latest recorded state
2. if no session project is bound or the bound project is not `AgenticOS`, call `agenticos_switch`
3. read `.project.yaml`, `standards/.context/quick-start.md`, and `standards/.context/state.yaml`; use the conversation-history contract surface for recovery when needed (`standards/.context/conversations/` for tracked continuity, or the publication-policy raw sidecar such as `.private/conversations/` when applicable)
4. review the latest guardrail evidence and latest `agenticos_issue_bootstrap` record before implementation-affecting work
5. if implementation work is requested, follow the Guardrail Protocol above exactly before editing

Then greet the user with: project name, last progress, current pending items, suggested next step.

## Project

**Name**: AgenticOS
**Description**: Self-hosting AgenticOS product project. Canonical operational context lives under standards/.context while the root .context files remain compatibility shims.

## Directory Structure

| Path | Purpose |
|------|---------|
| `.project.yaml` | Project metadata |
| `standards/.context/quick-start.md` | Quick project summary |
| `standards/.context/state.yaml` | Session state and working memory |
| `standards/.context/conversations/` | Conversation-history contract surface; tracked continuity path, while raw transcript routing depends on publication policy |
| `knowledge/` | Persistent knowledge documents |
| `tasks/` | Task tracking |
| `tasks/templates/agent-preflight-checklist.yaml` | Preflight checklist template |
| `tasks/templates/issue-design-brief.md` | Design-loop template |
| `tasks/templates/non-code-evaluation-rubric.yaml` | Non-code evaluation rubric |
| `tasks/templates/submission-evidence.md` | Submission evidence template |
| `artifacts/` | Outputs and deliverables |
