<!-- agenticos-template: v12 -->
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
- Optional local stop-hook reminders should call `agenticos-record-reminder`, not a source-checkout `tools/record-reminder.sh` path.
- If migrating from a legacy source-checkout hook, replace `bash /path/to/tools/record-reminder.sh` with the installed `agenticos-record-reminder` command.
## Optional Stop-Hook Reminder

If your runtime supports local stop hooks or command reminders, the preferred installed command is:

```json
{
  "command": "agenticos-record-reminder",
  "timeout": 5,
  "type": "command"
}
```

This remains an optional local reminder layer rather than a canonical guardrail.
## Task Intake Rule

**Before writing any code or plan, verify three things:**

1. **Intent**: What is the operator actually trying to achieve? (Not what they said — what they mean)
2. **Data Source**: What source should I trust? Do not assume; verify.
3. **Scope**: Can this be done in one session? If not, where are the checkpoints?

If any of these cannot be answered clearly, **stop and ask**. Do not proceed with fuzzy assumptions.

Once intent is resolved, collapse it into a clean execution objective. Do not carry the full intake rubric through every later step.
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
- `project_path`: optional absolute issue worktree path when the session is operating outside the registered canonical checkout

`agenticos_record` is capture-first. If tracked continuity writes are protected, it must still preserve a safe capture when possible and return `RECORDED_CAPTURE_ONLY` with next actions. Do not treat capture-only as a terminal failure; follow the returned recovery path before ending the session.

### When to Record

1. After completing any meaningful unit of work
2. Before ending the session (MANDATORY — context is lost otherwise)

After recording, call `agenticos_save` to commit distilled continuity to Git when the current checkout is allowed to save.

### Session Start

On session start, align the runtime before meaningful work:
1. call `agenticos_status` to confirm the current session project, current task, pending work, and latest recorded state
2. if no session project is bound or the bound project is not `AgenticOS`, call `agenticos_switch`
3. read `.project.yaml`, `standards/.context/quick-start.md`, and `standards/.context/state.yaml`; use the conversation-history contract surface for recovery when needed (`standards/.context/conversations/` for tracked continuity, or the publication-policy raw sidecar such as `.private/conversations/` when applicable)
4. review the latest guardrail evidence and latest `agenticos_issue_bootstrap` record before implementation-affecting work
5. if implementation work is requested, follow the Guardrail Protocol above exactly before editing

Then greet the user with: project name, last progress, current pending items, suggested next step.

## Design Philosophy

### Why AgenticOS Exists

AI-assisted development has a fundamental problem: **context loss**.

When an AI agent starts a task:
- Session interruption → context gone
- Switch to another agent/tool → cannot resume
- Need to trace a decision → no record

AgenticOS's goal: **make AI development traceable, resumable, and collaborative**.

### Core Mechanisms

1. **Persistent Context**: Write decisions to disk via MCP tools, not just memory
2. **Isolated Execution**: Each issue uses an independent Git worktree for reproducibility
3. **Progressive Disclosure**: Universal patterns in canonical docs, contextual knowledge loaded on demand

### Ultimate Effects

| Effect | What Users Get |
|--------|---------------|
| **Continuity** | Resume work in 30 seconds after any interruption |
| **Agent Interoperability** | Claude Code, Codex, Cursor collaborate on the same project |
| **Zero Loss** | Every decision is recorded, every task has checkpoints |

### What This Means for You

- Every session ends with `agenticos_record` + `agenticos_save` — or context is lost forever
- Every implementation starts with guardrail checks — not as bureaucracy, but as reproducibility infrastructure
- Task intake is not formality — it is the moment to verify intent, data source, and scope before building the wrong thing

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
