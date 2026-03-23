# AgenticOS 架构设计

## 核心理念

### Agent First 原则
- **AI 是主要使用者** - 所有设计优先考虑 AI 的理解和使用
- **Agent 自主管理** - AI 自己读文档、自己配置、自己执行
- **结构化优先** - YAML/JSON 而非自由文本
- **完全自动化** - 用户只需表达意图，Agent 完成所有操作

### 设计目标
1. **跨工具兼容** - Claude Code、Cursor、Codex、Windsurf 等
2. **跨平台可移植** - 通过 Git 同步，换电脑即用
3. **智能触发** - 自动识别复杂任务，主动建议创建项目
4. **完整记录** - 所有对话、决策、演进全部追溯

## 架构层次

### 1. 通用协议层（Universal Layer）
**目标**：任何 AI 工具都能理解

**核心文件**：
- `.project.yaml` - 项目元数据
- `.context/quick-start.md` - 快速启动指南
- `.context/state.yaml` - 会话状态
- `knowledge/` - 知识库
- `tasks/` - 任务管理

**特点**：
- 标准化结构
- 纯文本 + 结构化数据
- 无工具依赖

### 2. MCP Server 层（Integration Layer）
**目标**：提供跨工具的增强功能

**实现**：`agenticos-mcp` npm 包

**提供工具**：
- `agenticos_init` - 创建项目
- `agenticos_switch` - 切换项目
- `agenticos_list` - 列出项目
- `agenticos_save` - 保存备份

**提供资源**：
- `agenticos://context/current` - 当前项目上下文

**特点**：
- 基于 MCP 标准协议
- 跨工具兼容
- 易于分发（npm）

### 3. Agent 适配层（Agent-Specific Layer）
**目标**：针对特定 AI 工具的增强

**文件**：
- `CLAUDE.md` - Claude Code 专用配置
- `CURSOR.md` - Cursor 专用配置
- `GEMINI.md` - Gemini CLI 专用配置

**功能**：
- 智能触发逻辑
- 自动状态管理
- 工具特定优化

## 数据流

```
用户意图
    ↓
AI Agent 分析（通过 CLAUDE.md 触发规则）
    ↓
判断是否需要项目管理
    ↓
询问用户确认
    ↓
调用 MCP 工具（agenticos_init/switch）
    ↓
加载项目上下文（.project.yaml + state.yaml）
    ↓
执行任务
    ↓
自动保存（agenticos_save）
    ↓
Git 备份
```

## 触发机制

### 显式触发
用户明确说：
- "切换到 XX 项目"
- "创建新项目"
- "开一个项目管理 XXX"

→ 直接调用 MCP 工具

### 智能触发
AI 检测到复杂任务信号：
- 需要 3+ 步骤
- 跨会话追踪
- 多文件修改
- 用户提到"项目"、"长期"、"持续"

→ 询问用户："是否需要创建 AgenticOS 项目来管理？"

### 触发规则配置
位置：`~/.claude/CLAUDE.md`（用户级别）

Agent 读取规则 → 自动判断 → 询问确认 → 执行操作

## 安装部署

### Agent 自主安装流程

**用户说**："安装 AgenticOS" 或 "配置 AgenticOS"

**Agent 执行**：
1. 读取 MCP Server 的 README.md
2. 按照 Agent Installation Protocol 执行
3. 添加 mcp.json 配置
4. 添加 CLAUDE.md 触发逻辑
5. 初始化 registry
6. 验证配置
7. 报告完成

**关键**：README 是给 Agent 看的操作手册，不是给人看的说明书

## 可移植性

### 跨机器迁移
1. 新机器安装 MCP Server（Agent 自动）
2. Clone Git 仓库到 ~/AgenticOS
3. Agent 自动识别现有项目
4. 继续工作

### 跨工具使用
- Claude Code：通过 CLAUDE.md 触发
- Cursor：通过 CURSOR.md 触发
- Codex：通过 MCP 直接调用
- 其他：只要支持 MCP 即可

## 版本控制

### Git 集成
- 每个项目独立 Git 仓库
- `agenticos_save` 自动 commit + push
- 完整历史追溯

### Registry 同步
- Registry 存储在 ~/AgenticOS/.agent-workspace/
- 可选：将 registry 也纳入 Git 管理

## 扩展性

### 添加新工具
在 MCP Server 中添加新的 tool handler

### 添加新 Agent 支持
创建对应的 `{AGENT}.md` 配置文件

### 自定义项目模板
修改 `init.ts` 中的项目结构生成逻辑
