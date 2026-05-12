<!-- agenticos-template: v14 -->
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
## Stop-Hook (Optional)

If your runtime supports local stop hooks, configure `agenticos-record-reminder` as a local reminder. This is optional, not a canonical guardrail.

## Task Intake Rule

**Before writing any code or plan, verify three things:**

1. **Intent**: What is the operator actually trying to achieve? (Not what they said — what they mean)
2. **Data Source**: What source should I trust? Do not assume; verify.
3. **Scope**: Can this be done in one session? If not, where are the checkpoints?

If any of these cannot be answered clearly, **stop and ask**. Do not proceed with fuzzy assumptions.

Once intent is resolved, collapse it into a clean execution objective. Do not carry the full intake rubric through every later step.

## Guardrail Protocol (MANDATORY)

Before implementation edits, confirm session/project alignment with `agenticos_status`; if no session project is bound or the bound project is not the intended one, call `agenticos_switch`.

For implementation-affecting work:

1. call `agenticos_preflight`; if the result is `REDIRECT`, call `agenticos_branch_bootstrap` and continue in the returned worktree
2. after the issue worktree is active, perform the normal startup load and record `agenticos_issue_bootstrap`
3. rerun `agenticos_preflight` in that worktree before editing
4. call `agenticos_edit_guard` immediately before implementation edits
5. before PR creation or merge, call `agenticos_pr_scope_check`

If any guardrail command returns `BLOCK`, stop and resolve the blocking reason before continuing.

## MANDATORY: Recording Protocol

> All session activity MUST be recorded. If you skip this, context is lost forever.

**During session**: After completing any meaningful unit of work, call `agenticos_record` with summary, decisions, outcomes, pending, and current_task.

**Before session ends**: Call `agenticos_record` with complete summary, then `agenticos_save` to commit to Git.

## Session Start Protocol

On session start:

1. Call `agenticos_status` to confirm current project and task
2. If not on `AgenticOS` project, call `agenticos_switch`
3. Read `.project.yaml`, `standards/.context/quick-start.md`, and `standards/.context/state.yaml`
4. If implementation work requested, enter Guardrail Protocol before editing
5. Greet with: project name, last progress, pending items, suggested next step
