# 会话反思：开源协作流程建设

> 日期：2026-03-21
> 触发：用户要求建立开源协作开发流程
> 核心教训：Agent 工作流中的上下文断裂问题

---

## 发现的问题

### 1. 项目上下文未被充分加载

**现象**：`agenticos_switch` 返回了项目上下文指针，但后续工作没有先读取 `knowledge/` 目录中已有的设计决策和架构文档。

**影响**：3 个研究 Agent 从零开始搜索外部信息，而项目内部已有 5 个关键设计决策文档、完整系统设计、架构分析等。浪费了算力，更重要的是产出可能与已有设计不一致。

**根因**：`agenticos_switch` 的上下文恢复停留在"知道有这些文件"，没有机制确保"理解了这些内容再行动"。子 Agent 启动时完全不知道这些知识的存在。

**改进方向**：
- 在 spawn 子 Agent 之前，先读取 `knowledge/` 关键文件
- 将关键上下文摘要包含在子 Agent 的 prompt 中
- 或者：Root CLAUDE.md 中明确指示"开始任何工作前必须先读 knowledge/"

### 2. CLAUDE.md 与 AGENTS.md 定位混乱

**现象**：PR #6 中 CLAUDE.md 写成了"开发规范文档"（详细的 commit convention、forbidden operations 列表），而非 "Agent 快速启动配置"。

**根因**：没有先读取项目自身的 `distill.ts` 和 `agent-guide.md`，不理解这两个文件在 AgenticOS 设计体系中的定位。

**正确定位**：
- CLAUDE.md = Claude Code 的快速启动配置（和项目级 CLAUDE.md 同哲学）
- AGENTS.md = 同等定位的通用版本（Codex/Gemini CLI）
- 两者是**平行的**，共享大部分内容，差异化部分才分开
- 详细规范应在 CONTRIBUTING.md（渐进式披露的第二层）

### 3. 设计产出物未持久化

**现象**：3 个研究 Agent + 1 个设计 Agent 产出了大量有价值的分析，但全部困在对话上下文中。

**影响**：对话压缩后这些信息会丢失；其他会话或 Agent 无法访问。

**改进方向**：
- 重要研究和设计输出应立即保存到 `knowledge/` 或 `artifacts/`
- 对话中只保留文件引用，不保留大段内容
- 这应成为 AgenticOS 的标准工作规范

### 4. DRY 原则应用于 Agent 配置文件

**现象**：CLAUDE.md 和 AGENTS.md 各自独立编写，内容高度重复。

**改进方向**：
- AGENTS.md 作为规范来源（canonical source）
- CLAUDE.md 引用 AGENTS.md + 添加 Claude Code 特有扩展
- 其他 Agent 配置（GEMINI.md、.cursorrules）同理

---

## 行动项

- [ ] 修订 PR #6 中的 CLAUDE.md 和 AGENTS.md
- [ ] 建立"子 Agent 上下文注入"的标准做法
- [ ] 将"设计产出物持久化"写入开发规范
- [ ] 考虑 CLAUDE.md 引用 AGENTS.md 的机制设计
