# Design Decisions

## 2026-03-16

### Decision 1: Agent First 设计理念

**Context**: 用户希望建立 AI 协作项目管理系统

**Options Considered**:
1. Human First - 按人类思维组织（docs/、code/、notes/）
2. Agent First - 按 AI 工作流程组织（.context/、knowledge/、tasks/）

**Decision**: Agent First

**Rationale**:
- AI 是主要使用者，应该优先考虑 AI 的理解和使用
- 结构化数据（YAML/JSON）比自由文本更易于 AI 解析
- 分层上下文加载减少 AI 的认知负担
- 状态持久化支持会话恢复

**Trade-offs**:
- ✅ AI 使用效率高
- ✅ 跨会话状态恢复
- ⚠️ 人类阅读需要适应
- ⚠️ 初期学习成本

---

### Decision 2: 分层规范设计

**Context**: 需要支持多种 AI Agent（Claude、Gemini、Cursor）

**Options Considered**:
1. 单一规范文件 - 所有 Agent 共用一个文件
2. 多个独立文件 - 每个 Agent 一个文件
3. 分层规范 - 通用层 + Agent 专用层

**Decision**: 分层规范

**Rationale**:
- 通用层（.project.yaml, quick-start.md）保证最小兼容性
- Agent 专用层（CLAUDE.md, GEMINI.md）提供增强功能
- 灵活可扩展，新 Agent 只需添加专用文件

**Trade-offs**:
- ✅ 跨 Agent 兼容
- ✅ 灵活可扩展
- ⚠️ 文件数量增加
- ⚠️ 需要维护多个文件

---

### Decision 3: 完整记录机制

**Context**: 用户要求记录所有想法、对话、决策

**Options Considered**:
1. 单一日志文件 - 所有内容放在一个文件
2. 分类记录 - 按类型分文件（对话、决策、洞察）
3. 多层记录 - 对话日志 + 项目日志 + 记忆流 + 知识库

**Decision**: 多层记录

**Rationale**:
- 对话日志（conversations/）- 原始对话，便于追溯
- 项目日志（changelog.md）- 时间线视图，快速了解进展
- 记忆流（memory.jsonl）- 结构化事件，便于程序处理
- 知识库（knowledge/）- 提取的洞察和决策

**Trade-offs**:
- ✅ 信息完整
- ✅ 多视角查看
- ✅ 便于不同用途
- ⚠️ 需要维护多个文件
- ⚠️ 可能有信息重复

---

### Decision 4: 智能意图识别 + 双层激活机制

**Context**: 如何让 AgenticOS 在未来会话中自动生效？

**Options Considered**:
1. 仅 Claude Code Skill - 显式命令调用（/aios）
2. 仅用户级别 CLAUDE.md - 自动检测和加载
3. 两者结合 - CLAUDE.md 自动检测 + Skill 显式命令

**Decision**: 两者结合，命令统一为 `/agenticos`

**Rationale**:
- **用户级别 CLAUDE.md**: 提供智能意图识别
  - 分析对话内容理解用户意图
  - 强信号（明确提到项目）→ 自动加载
  - 弱信号（可能相关）→ 询问确认
  - 无信号 → 不触发
- **Claude Code Skill**: 提供显式命令
  - `/agenticos init` - 创建项目
  - `/agenticos switch` - 切换项目
  - `/agenticos list` - 列出项目
  - `/agenticos save` - 保存状态

**Intent Detection Rules**:
- **强信号**（直接执行）:
  - "切换到 XX 项目"
  - "继续 XX 的工作"
  - "在 XX 项目中..."
- **弱信号**（询问确认）:
  - "我想做 XXX"
  - "帮我优化 XXX"
- **无信号**（不触发）:
  - 一般性问题
  - 与项目无关的对话

**Trade-offs**:
- ✅ 自动化（CLAUDE.md）+ 精确控制（Skill）
- ✅ 智能意图识别，减少误触发
- ✅ 用户确认机制，避免错误操作
- ⚠️ 需要维护两套机制
- ⚠️ 意图识别可能不完美

---

### Decision 5: MCP Server 实现方案

**Context**: 如何实现跨工具、跨平台的可移植增强系统？

**Options Considered**:
1. Claude Code Plugin - 深度集成但仅限 Claude Code
2. MCP Server - 通用协议，跨工具兼容

**Decision**: MCP Server

**Rationale**:
- **通用性** - 支持所有 MCP 兼容工具（Claude Code、Cursor、Codex、Windsurf）
- **可移植** - 通过 Git 同步，换电脑只需配置 mcp.json
- **标准协议** - 基于开放标准，不绑定特定工具
- **易分发** - 发布到 npm，`npx agenticos-mcp` 即可使用
- **独立演进** - 不依赖特定工具的版本更新

**Implementation**:
- 提供 4 个核心工具：init、switch、list、save
- 提供 1 个资源：agenticos://context/current
- 自动备份通过 save 工具触发 Git 操作
- Registry 存储在 ~/AgenticOS/.agent-workspace/registry.yaml

**Trade-offs**:
- ✅ 跨工具兼容（Claude Code、Cursor、Codex 等）
- ✅ 跨平台可移植
- ✅ 易于分发和安装
- ✅ 符合开放标准
- ⚠️ 无法使用 Claude Code 特有的 Hook（但可通过工具模拟）
- ⚠️ 需要用户手动配置 mcp.json
