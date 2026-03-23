<!-- agenticos-template: v2 -->
# CLAUDE.md — AgenticOS Development

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
2. Call `agenticos_save` to commit to this project's Git repo

**If you skip this step, all context from this session is permanently lost.**

---

## Session Start Protocol

When you open this project in a new session, **immediately do the following**:

1. Read `.context/quick-start.md`
2. Read `.context/state.yaml`
3. Read `knowledge/product-positioning-and-design-review-2026-03-22.md`
4. Read `knowledge/agent-preflight-and-execution-protocol-2026-03-23.md`
2. Greet the user with a brief status report in this format:

```
📍 项目：AgenticOS Development
📌 上次进展：[current_task title + status]
🎯 当前待办：[top pending items]
💡 建议下一步：[recommended next action]

继续上次的工作，还是有新的方向？
```

3. Wait for the user's direction before proceeding

---

## Project DNA

**一句话定位**: AgenticOS 的规范项目和产品定义项目，用来演进项目上下文结构、Agent 行为协议和协作工作流标准。

**核心设计原则**:
- **Agent First**: AI 是主要用户，一切结构为 AI 理解优化
- **Executable Protocols**: 原则必须落成规则、检查单、伪代码和可验证标准
- **完整记录**: 所有决策、对话、变更完整留痕
- **跨工具兼容**: Claude Code / Cursor / Codex 均可使用
- **可移植性**: Git 备份，路径相对化存储，跨机器可用

**三层架构**:
1. **通用层** (Universal): `.project.yaml` + `.context/state.yaml` + `knowledge/` + `tasks/` — 纯文本+结构化数据，无工具依赖
2. **MCP 层**: `agenticos-mcp` npm 包，5 个工具 (init/switch/list/record/save) + 1 个资源
3. **Agent 适配层**: `CLAUDE.md` / `CURSOR.md` — 每个工具的专用配置和行为指令

**技术栈**: TypeScript, Node.js (ES2022), MCP SDK, YAML, Git

**关键设计约束**:
- 路径在 YAML 中存储为相对路径，运行时解析为绝对路径
- Registry 位于 `~/.agent-workspace/registry.yaml`（AgenticOS Home 下）
- Git 操作从当前项目根目录执行（`projects/agentic-os-development/` 是独立仓库，不依赖上层 `AgenticOS` 仓库）

---

## Mandatory Execution Rules

Before implementation or non-trivial doc/protocol changes:
- classify the task using `knowledge/agent-preflight-and-execution-protocol-2026-03-23.md`
- complete preflight before editing
- for `implementation`, use a dedicated branch and isolated worktree
- define executable acceptance criteria before editing
- complete at least one design/critique loop for non-trivial doc/protocol work

Reusable templates:
- `tasks/templates/agent-preflight-checklist.yaml`
- `tasks/templates/issue-design-brief.md`
- `tasks/templates/non-code-evaluation-rubric.yaml`
- `tasks/templates/submission-evidence.md`

## Current State

<!-- AGENT_CONTEXT_START -->
**Last Updated**: 2026-03-23T01:51:19.639Z

**Current Task**: calendar create 能力补全 (status: completed)

**Active Items**:
- TODO: calendar.js 参与人搜索 sleep(2000) 改为 waitFor 轮询 input[type=checkbox] 出现（6000ms timeout），解决网络延迟导致搜索结果未加载问题

**Recent Decisions**:
- attendee 搜索结果不显示判断为网络异步加载问题，当前 sleep(2000) 不足以等待，后续用 waitFor 替代
- dispatchMouseEvent 是 Element UI 组件点击的唯一可靠方式
- button.add-user-button 通过 querySelector 动态查找，比文字匹配或坐标硬编码更可靠

**Next Action**: TODO: calendar.js 参与人搜索 sleep(2000) 改为 waitFor 轮询 input[type=checkbox] 出现（6000ms timeout），解决网络延迟导致搜索结果未加载问题
<!-- AGENT_CONTEXT_END -->

---

## Navigation

| 目录/文件 | 用途 |
|-----------|------|
| `.project.yaml` | 项目元信息（名称、ID、版本、技术栈） |
| `.context/state.yaml` | 当前会话状态、工作记忆、待办事项 |
| `.context/quick-start.md` | 人类可读的项目概览 |
| `.context/conversations/` | 历史对话记录 |
| `knowledge/` | 持久化知识：架构设计、决策记录、权衡分析 |
| `knowledge/architecture.md` | 核心架构设计（三层架构详解） |
| `knowledge/design-decisions.md` | 5 个关键设计决策及理由 |
| `knowledge/complete-design.md` | 完整系统设计文档 |
| `tasks/` | 任务追踪 |
| `tasks/templates/` | 可执行模板：preflight、design brief、rubric、submission evidence |
| `artifacts/` | 产出物 |
| `changelog.md` | 变更日志 |

**获取更多上下文**:
- 架构全貌 → `knowledge/architecture.md`
- 为什么选 MCP 而非 CLI → `knowledge/cli-vs-mcp-analysis.md`
- 设计权衡 → `knowledge/trade-offs.md`
- MCP Server 源码 → `../../mcp-server/src/`
