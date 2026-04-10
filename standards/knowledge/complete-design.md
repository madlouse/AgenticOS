# AgenticOS 完整设计文档

## 1. 核心理念

### Agent First ≠ Agent Only
- **Agent First**: 结构优先考虑 AI 解析和自主操作
- **Human Readable**: 人类也能直接阅读和理解
- **平衡点**: 结构化数据（YAML/JSON）+ 清晰命名 + 注释说明

### 设计原则
1. **AI 自主性** - Agent 读文档、自己配置、自己执行
2. **完整记录** - 所有对话、决策、演进全部追溯
3. **跨工具兼容** - 不绑定特定 AI 工具
4. **可移植性** - Git 同步，换机器即用
5. **渐进增强** - 基础功能 → MCP 增强 → Agent 专用优化

## 2. 三层架构

### Layer 1: 通用协议层（Universal Layer）
**目标**: 任何 AI 工具都能理解

**文件结构**:
```
project/
├── .project.yaml          # 项目元数据
├── .context/
│   ├── quick-start.md     # 快速启动（人类可读）
│   ├── state.yaml         # 会话状态（结构化）
│   └── conversations/     # 对话历史
├── knowledge/             # 知识库
│   ├── design-decisions.md
│   ├── trade-offs.md
│   └── evolution.md
├── tasks/                 # 任务管理
└── artifacts/             # 产出物
```

**特点**:
- 纯文本 + 结构化数据
- 无工具依赖
- Git 友好

### Layer 2: MCP Server 层（Integration Layer）
**目标**: 提供跨工具的增强功能

**实现**: `agenticos-mcp` npm 包

**核心工具**:
- `agenticos_init` - 创建项目
- `agenticos_switch` - 绑定当前会话项目
- `agenticos_list` - 列出项目
- `agenticos_save` - 保存备份

**核心资源**:
- `agenticos://context/current` - 当前会话项目上下文

**Registry 管理**:
- 位置: `~/AgenticOS/.agent-workspace/registry.yaml`
- 作用: 跟踪所有已注册项目与兼容性元数据；当前项目不再由 home-global registry authoritative 决定
- 格式: 人类可读的 YAML

### Layer 3: Agent 适配层（Agent-Specific Layer）
**目标**: 针对特定工具的优化

**配置文件**:
- `~/.claude/CLAUDE.md` - Claude Code 全局配置
- `~/.cursor/CURSOR.md` - Cursor 全局配置
- 项目级 `CLAUDE.md` - 项目专用配置

**功能**:
- 智能触发逻辑
- 自动状态管理
- 工具特定优化

## 3. 触发机制

### 显式触发（Explicit）
用户明确指令:
- "切换到 XX 项目"
- "创建新项目"
- "列出项目"

→ Agent 直接调用 MCP 工具

### 智能触发（Intelligent）
Agent 分析对话，检测信号:

**复杂度信号**:
- 需要 3+ 步骤
- 涉及多个文件
- 跨会话追踪

**持续性信号**:
- 用户提到"项目"、"长期"、"持续"
- 迭代开发
- 需要决策追踪

**触发流程**:
1. Agent 检测到信号
2. 询问用户确认
3. 用户同意 → 调用 `agenticos_init`
4. 加载项目上下文
5. 开始工作

### 触发规则配置
位置: `~/.claude/CLAUDE.md`（用户级别）

Agent 每次会话自动读取 → 应用规则 → 智能判断

## 4. 数据流

```
用户表达意图
    ↓
Agent 读取 CLAUDE.md 触发规则
    ↓
检测复杂度和持续性信号
    ↓
[显式触发] → 直接执行
[智能触发] → 询问确认
    ↓
调用 MCP 工具（agenticos_init/switch）
    ↓
加载项目上下文
    ├── .project.yaml
    ├── quick-start.md
    └── state.yaml
    ↓
执行任务（记录到 conversations/）
    ↓
更新状态（state.yaml）
    ↓
保存备份（agenticos_save）
    ├── Git commit
    └── Git push
```

## 5. 安装部署

### Agent 自主安装
**用户**: "安装 AgenticOS"

**Agent 执行**:
1. 读取 MCP Server README
2. 添加 mcp.json 配置
3. 添加 CLAUDE.md 触发逻辑
4. 初始化 registry
5. 验证配置
6. 报告完成

**关键**: 用户只需一句话，Agent 完成所有配置

### 跨机器迁移
1. 新机器: "安装 AgenticOS"（Agent 自动配置）
2. Clone 项目: `git clone <repo> ~/AgenticOS/projects/xxx`
3. Agent 自动识别现有项目
4. 继续工作

## 6. 可移植性

### 跨工具
- **Claude Code**: ✅ 通过 MCP + CLAUDE.md
- **Cursor**: ✅ 通过 MCP + CURSOR.md
- **Codex**: ✅ 通过 MCP 直接调用
- **Windsurf**: ✅ 只要支持 MCP

### 跨平台
- **macOS**: ✅ ~/AgenticOS
- **Linux**: ✅ ~/AgenticOS
- **Windows**: ✅ %USERPROFILE%/AgenticOS

### 数据同步
- 通过 Git 同步项目内容
- Registry 可选同步（或每台机器独立）

## 7. 关键设计决策

### Decision 1: Agent First 设计理念
- 结构化数据优先
- AI 自主管理
- 分层上下文加载

### Decision 2: 分层规范设计
- 通用层保证兼容
- Agent 专用层提供增强
- 灵活可扩展

### Decision 3: 完整记录机制
- 对话日志（原始）
- 项目日志（时间线）
- 记忆流（结构化）— 通过 state.yaml 实现
- 知识库（提炼）

> 注: memory.jsonl 和项目级 changelog.md 已推迟到未来版本，当前 conversations/ + state.yaml + knowledge/ 构成完整的持久化方案。

### Decision 4: 智能意图识别
- 显式命令直接执行
- 复杂任务智能提示
- 用户确认机制

### Decision 5: MCP Server 实现
- 跨工具兼容
- 标准协议
- 易于分发
- 独立演进

## 8. 实现细节

### MCP Server 结构
```
agenticos-mcp/
├── src/
│   ├── index.ts           # MCP Server 入口
│   ├── tools/
│   │   ├── init.ts        # 创建项目
│   │   ├── project.ts     # 切换/列出
│   │   ├── record.ts      # 会话记录
│   │   └── save.ts        # 保存备份
│   ├── resources/
│   │   └── context.ts     # 项目上下文
│   └── utils/
│       └── registry.ts    # Registry 管理
├── package.json
├── tsconfig.json
└── README.md              # Agent 操作手册
```

### Registry 格式
```yaml
version: "1.0.0"
last_updated: "2026-03-16T08:52:20Z"
active_project: null   # legacy compatibility field, not current-session truth
projects:
  - id: "my-project"
    name: "My Project"
    path: "/Users/xxx/AgenticOS/projects/my-project"
    status: "active"
    created: "2026-03-16"
    last_accessed: "2026-03-16T08:52:20Z"
```

### 项目配置格式
```yaml
meta:
  name: "My Project"
  id: "my-project"
  description: "Project description"
  created: "2026-03-16"
  version: "1.0.0"

agent_context:
  quick_start: ".context/quick-start.md"
  current_state: ".context/state.yaml"

tech:
  languages: ["TypeScript", "Python"]
  tools: ["Node.js", "Git"]
```

## 9. 使用场景

### 场景 1: 新功能开发
```
用户: "帮我实现用户认证功能"
Agent: 检测到复杂任务 → 询问是否创建项目
用户: "是"
Agent: 调用 agenticos_init → 创建项目 → 开始开发
```

### 场景 2: 跨会话恢复
```
用户: "继续昨天的认证功能"
Agent: 调用 agenticos_switch → 加载上下文 → 继续工作
```

### 场景 3: 跨工具协作
```
在 Claude Code 中开发 → agenticos_save 备份
切换到 Cursor → agenticos_switch 加载 → 继续开发
```

## 10. 扩展性

### 添加新工具
在 `src/tools/` 添加新的工具实现

### 支持新 Agent
创建对应的配置文件（如 `GEMINI.md`）

### 自定义项目模板
修改 `init.ts` 中的结构生成逻辑

### 集成外部服务
通过 MCP 工具调用外部 API

## 11. 最佳实践

### For Users
- 复杂任务使用 AgenticOS 管理
- 定期让 Agent 保存备份
- 通过 Git 同步到多台机器

### For AI Agents
- 主动检测复杂任务
- 询问用户确认后创建项目
- 定期调用 agenticos_save
- 记录所有重要决策到 knowledge/

### For Developers
- 保持 README Agent-friendly
- 文档即操作手册
- 优先结构化数据
- 保持向后兼容

## 12. 未来演进

### 短期
- ✅ MCP Server 核心完成
- 通过 GitHub Releases + Homebrew 分发
- 验证跨工具兼容性

### 中期
- 添加更多工具（archive、restore、export）
- 支持项目模板
- 增强搜索功能

### 长期
- 可视化界面（可选）
- 团队协作功能
- 云端同步（可选）
