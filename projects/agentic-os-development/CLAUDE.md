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
2. Call `agenticos_save` to commit to Git

**If you skip this step, all context from this session is permanently lost.**

---

## Session Start Protocol

When you open this project in a new session, **immediately do the following**:

1. Read the "Current State" section below
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

**一句话定位**: Agent-first 的项目管理操作系统，让 AI Agent 能自主管理项目状态、跨会话恢复上下文、跨工具协作。

**核心设计原则**:
- **Agent First**: AI 是主要用户，一切结构为 AI 理解优化
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
- Git 操作从 workspace root 执行（整个 AgenticOS 是一个仓库）

---

## Current State

<!-- AGENT_CONTEXT_START -->
**Last Updated**: 2026-03-21T05:49:33.899Z

**Current Task**: Homebrew Tap + Agent-friendly README (status: completed)

**Active Items**:
- E2E manual verification: opencli 360teams docs, opencli 360teams calendar — 需要 360Teams 运行中
- 如果需要，创建 docs-parser.test.js（但 docs.js 目前无可测试的导出函数）

**Recent Decisions**:
- tests/helpers.test.js 中 T5T helper 函数应从 helpers.js 导入（非 t5t.js），因为 helpers.js 包含完整数据转换函数，t5t.js 只导出 innerText 解析函数
- parseCalendarDayFromText 需要 null guard 防止 null 输入导致 TypeError
- docs.js 由于跨域 iframe 限制，仅实现 status 动作，这是已知技术约束而非设计缺陷

**Next Action**: E2E manual verification: opencli 360teams docs, opencli 360teams calendar — 需要 360Teams 运行中
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
| `artifacts/` | 产出物 |
| `changelog.md` | 变更日志 |

**获取更多上下文**:
- 架构全貌 → `knowledge/architecture.md`
- 为什么选 MCP 而非 CLI → `knowledge/cli-vs-mcp-analysis.md`
- 设计权衡 → `knowledge/trade-offs.md`
- MCP Server 源码 → `../../mcp-server/src/`
