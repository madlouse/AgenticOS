<!-- agenticos-template: v7 -->
# CLAUDE.md — Ghostty Optimization

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
## Task Intake Rule

- At task intake, recover operator intent before treating named methods or workflow fragments as the full plan.
- Separate goals, hard constraints, useful signals, and candidate methods before choosing an execution path.
- Once intent is resolved, collapse it into a clean execution objective instead of carrying the full intake rubric through every later step.
## Guardrail Protocol (MANDATORY)

For implementation-affecting work:

1. call `agenticos_preflight` before editing
2. if the result is `REDIRECT`, call `agenticos_branch_bootstrap` and continue in the returned worktree
3. before PR creation or merge, call `agenticos_pr_scope_check`

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

1. Read the "Current State" section below
2. Greet the user with a brief status report:

```
📍 项目：Ghostty Optimization
📌 上次进展：[current_task title + status]
🎯 当前待办：[top pending items]
💡 建议下一步：[recommended next action]

继续上次的工作，还是有新的方向？
```

3. Wait for the user's direction before proceeding

---

## Project DNA

**一句话定位**: (待补充)

**核心设计原则**: (待补充 — 在项目推进中逐步完善)

**技术栈**: (待补充)
## Current State

<!-- AGENT_CONTEXT_START -->
**Last Updated**: 2026-04-07T02:49:30.544Z

**Current Task**: Issue #9: configure and verify cmux socket automation mode (status: completed)

**Active Items**:
- Next highest-priority issue is homebrew-ghostty #3 or ghostty-optimization #16, depending on whether you want packaged verify UX or clean-machine acceptance first.

**Recent Decisions**:
- Keep the broader core-vs-optional package split out of this issue and leave it to issue #7.
- Use file-managed cmux settings.json as the reproducible automation configuration source because current official docs describe automation settings there.
- Do not depend on a cmux reload-config CLI because the local cmux 0.62.2 binary does not expose that command; use live socket smoke instead.

**Next Action**: Next highest-priority issue is homebrew-ghostty #3 or ghostty-optimization #16, depending on whether you want packaged verify UX or clean-machine acceptance first.
<!-- AGENT_CONTEXT_END -->

---

## Navigation

| 目录/文件 | 用途 |
|-----------|------|
| `.project.yaml` | 项目元信息 |
| `.context/quick-start.md` | 快速项目概览 |
| `.context/state.yaml` | 当前会话状态及工作记忆 |
| `.context/conversations/` | 会话记录（自动生成） |
| `knowledge/` | 持久化知识文档 |
| `tasks/` | 任务追踪 |
| `tasks/templates/agent-preflight-checklist.yaml` | preflight 模板 |
| `tasks/templates/issue-design-brief.md` | 设计循环模板 |
| `tasks/templates/non-code-evaluation-rubric.yaml` | 非代码评估模板 |
| `tasks/templates/submission-evidence.md` | 提交证据模板 |
| `artifacts/` | 产出物 |
