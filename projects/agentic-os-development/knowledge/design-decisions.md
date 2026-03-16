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
