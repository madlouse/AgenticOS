<!-- agenticos-template: v11 -->
# CLAUDE.md — AgenticOS

## Adapter Role

`CLAUDE.md` is the Claude Code adapter surface for this project.
It must expose the same canonical policy as other agent adapters while allowing Claude-specific operator guidance.

## Canonical Policy (Shared Across Agents)

- This project has one canonical AgenticOS execution policy across Claude Code, Codex, and other supported agents.
- Implementation work must stay issue-first, preflighted, and inside the guardrail-controlled branch/worktree flow.
- PR creation or merge must not happen before executable scope validation passes.
- Recording and save flow remain canonical project requirements rather than runtime-specific preferences.
## Claude Runtime Notes

- Claude CLI-managed user MCP config is the canonical Claude bootstrap surface.
- Claude-specific stop hooks remain optional local stop-hook reminders rather than canonical guardrails.
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

- At task intake, recover operator intent before treating named methods or workflow fragments as the full plan.
- Separate goals, hard constraints, useful signals, and candidate methods before choosing an execution path.
- Once intent is resolved, collapse it into a clean execution objective instead of carrying the full intake rubric through every later step.
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

> This is an AgenticOS project. All session activity MUST be recorded.
> Recording is not optional — it is the core function of this system.

### During Session

After completing any meaningful unit of work (feature, fix, design decision, analysis), call `agenticos_record`:

```
agenticos_record({
  summary: "what happened",
  decisions: ["decision 1", ...],
  outcomes: ["outcome 1", ...],
  pending: ["next step 1", ...],
  current_task: { title: "task name", status: "in_progress" }
})
```

### Before Session Ends

When the user signals session end (says goodbye, thanks, done, or stops responding), you MUST:

1. Call `agenticos_record` with a complete session summary
2. Call `agenticos_save` to commit to Git

**If you skip this step, all context from this session is permanently lost.**

---

## Session Start Protocol

When you open this project in a new session, **immediately do the following**:

1. Call `agenticos_status` to confirm the current session project, current task, pending work, and latest recorded state
2. If no session project is bound or the bound project is not `AgenticOS`, call `agenticos_switch`
3. Read `.project.yaml`, the "Current State" section below, `standards/.context/quick-start.md`, and `standards/.context/state.yaml`; use the conversation-history contract surface for recovery when needed (`standards/.context/conversations/` for tracked continuity, or the publication-policy raw sidecar such as `.private/conversations/` when applicable)
4. Review the latest guardrail evidence and latest `agenticos_issue_bootstrap` record before implementation-affecting work
5. Greet the user with a brief status report:

```
📍 项目：AgenticOS
📌 上次进展：[current_task title + status]
🎯 当前待办：[top pending items]
💡 建议下一步：[recommended next action]

继续上次的工作，还是有新的方向？
```

6. If implementation work is requested, enter the Guardrail Protocol above before editing
7. Wait for the user's direction before proceeding

---

## Project DNA

**一句话定位**: Self-hosting AgenticOS product project. Canonical operational context lives under standards/.context while the root .context files remain compatibility shims.

**核心设计原则**: (待补充 — 在项目推进中逐步完善)

**技术栈**: (待补充)
## Current State

<!-- AGENT_CONTEXT_START -->
**Last Updated**: 2026-04-10T08:55:55.177Z

**Current Task**: design/implement #262 concurrent runtime project resolution and legacy fallback downgrade (status: in_progress)

**Active Items**:
- Finish #262 runtime semantic unification across MCP tools, templates, and docs.
- Verify remaining normative references versus historical records, then split any migration-only work into #263.

**Recent Decisions**:
- Treat session-local project binding, explicit project selection, and repo-path proof as authoritative; runtime target resolution no longer falls back through legacy registry state.
- Keep `registry.active_project` as compatibility-only state rather than a home-global enforcement primitive.
- Handle legacy project migration separately in #263 with compatibility-on-read and targeted repair, not a one-shot mutate-first rewrite.

**Next Action**: Complete #262 residual runtime/doc cleanup, rerun verification, then record and save the landed design state.
<!-- AGENT_CONTEXT_END -->

---

## Navigation

| 目录/文件 | 用途 |
|-----------|------|
| `.project.yaml` | 项目元信息 |
| `standards/.context/quick-start.md` | 快速项目概览 |
| `standards/.context/state.yaml` | 当前会话状态及工作记忆 |
| `standards/.context/conversations/` | 会话历史契约层；tracked continuity surface，raw transcript 路径受 publication policy 约束 |
| `knowledge/` | 持久化知识文档 |
| `tasks/` | 任务追踪 |
| `tasks/templates/agent-preflight-checklist.yaml` | preflight 模板 |
| `tasks/templates/issue-design-brief.md` | 设计循环模板 |
| `tasks/templates/non-code-evaluation-rubric.yaml` | 非代码评估模板 |
| `tasks/templates/submission-evidence.md` | 提交证据模板 |
| `artifacts/` | 产出物 |
