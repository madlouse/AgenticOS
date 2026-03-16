# CLI 工具 vs MCP Server 深度对比

## 方案对比

### 方案 A: CLI 工具（如 `agenticos` 命令）

#### 实现方式
```bash
# 安装
npm install -g agenticos-cli

# 使用
agenticos init "My Project"
agenticos switch my-project
agenticos list
agenticos save
```

#### Agent 如何使用
Agent 通过 Bash 工具调用：
```typescript
await bash(`agenticos init "My Project"`)
await bash(`agenticos switch my-project`)
```

#### 优势
✅ **简单直接** - 就是普通的命令行工具
✅ **无需 MCP 支持** - 任何能执行 bash 的 AI 都能用
✅ **开发简单** - 不需要学习 MCP 协议
✅ **调试容易** - 直接在终端测试
✅ **人类友好** - 人也可以直接在终端使用

#### 劣势
❌ **Agent 体验差** - 需要解析命令行输出（字符串）
❌ **无结构化返回** - 返回的是文本，不是结构化数据
❌ **无资源系统** - 无法提供 `agenticos://context/current` 这样的资源
❌ **权限提示不友好** - 每次 bash 调用都可能触发权限确认
❌ **错误处理复杂** - 需要解析 stderr 和 exit code

#### Agent First 评分: 6/10
- Agent 能用，但体验不是为 Agent 优化的

---

### 方案 B: MCP Server

#### 实现方式
```json
// mcp.json
{
  "mcpServers": {
    "agenticos": {
      "command": "npx",
      "args": ["-y", "agenticos-mcp"]
    }
  }
}
```

#### Agent 如何使用
Agent 通过 MCP 工具调用：
```typescript
await mcp_tool('agenticos_init', { name: "My Project" })
await mcp_tool('agenticos_switch', { project: "my-project" })
```

#### 优势
✅ **Agent Native** - 专为 AI 设计的协议
✅ **结构化返回** - 返回 JSON，易于解析
✅ **资源系统** - 可以提供 `agenticos://context/current`
✅ **类型安全** - 参数有 schema 定义
✅ **权限友好** - MCP 工具权限管理更细粒度
✅ **跨工具标准** - Claude Code、Cursor、Codex 都支持
✅ **上下文感知** - 可以访问当前工作目录等上下文

#### 劣势
❌ **需要 MCP 支持** - AI 工具必须支持 MCP 协议
❌ **配置复杂** - 需要配置 mcp.json
❌ **开发成本高** - 需要学习 MCP SDK
❌ **调试困难** - 不能直接在终端测试
❌ **人类不友好** - 人无法直接使用（必须通过 AI）

#### Agent First 评分: 9/10
- 完全为 Agent 优化的体验

---

## 深度分析

### 1. Agent First 视角

**CLI 工具的问题**:
```
Agent: 调用 bash("agenticos list")
返回: "Projects:\n1. my-project (active)\n2. other-project\n"
Agent: 需要解析这个字符串... 😓
```

**MCP Server 的优势**:
```
Agent: 调用 agenticos_list()
返回: {
  projects: [
    { id: "my-project", name: "My Project", status: "active" },
    { id: "other-project", name: "Other", status: "archived" }
  ]
}
Agent: 直接使用结构化数据 ✨
```

### 2. 资源系统

**CLI 无法提供**:
- 无法实现 `agenticos://context/current` 这样的资源 URI
- Agent 需要自己读取多个文件拼接上下文

**MCP 原生支持**:
- Agent 请求资源 → MCP Server 返回完整上下文
- 一次调用获取所有需要的信息

### 3. 跨工具兼容性

**CLI 方式**:
- ✅ 任何 AI 都能调用（只要能执行 bash）
- ❌ 但体验都不好（都需要解析字符串）

**MCP 方式**:
- ⚠️ 需要 AI 工具支持 MCP
- ✅ 但支持的工具体验都很好
- ✅ MCP 正在成为标准（Claude Code、Cursor、Windsurf、Codex 都支持）

### 4. 人类使用

**CLI 方式**:
- ✅ 人可以直接在终端使用
- ✅ 调试方便

**MCP 方式**:
- ❌ 人无法直接使用
- ✅ 但可以通过 AI 使用（"列出项目"）
- 💡 如果真需要，可以同时提供 CLI wrapper

### 5. 开发和维护

**CLI 方式**:
- ✅ 开发简单（普通 Node.js CLI）
- ✅ 调试容易（直接运行）
- ❌ 输出格式需要考虑人类可读性

**MCP 方式**:
- ⚠️ 需要学习 MCP SDK
- ⚠️ 调试需要通过 AI 工具
- ✅ 输出格式只需考虑结构化

## 混合方案：CLI + MCP

### 方案 C: 两者都提供

**实现**:
```
agenticos/
├── cli/              # CLI 工具（人类使用）
│   └── index.ts
├── mcp/              # MCP Server（Agent 使用）
│   └── index.ts
└── core/             # 共享核心逻辑
    ├── project.ts
    ├── registry.ts
    └── git.ts
```

**优势**:
- ✅ Agent 用 MCP（最佳体验）
- ✅ 人类用 CLI（直接使用）
- ✅ 共享核心逻辑（避免重复）

**劣势**:
- ⚠️ 维护成本翻倍
- ⚠️ 需要保持两个接口同步

## 推荐方案

### 推荐：MCP Server（方案 B）

**理由**:

1. **Agent First 原则**
   - AgenticOS 的核心用户是 AI Agent
   - MCP 是为 Agent 设计的协议
   - 结构化返回 >> 字符串解析

2. **MCP 正在成为标准**
   - Claude Code ✅
   - Cursor ✅
   - Windsurf ✅
   - Codex ✅
   - 未来更多工具会支持

3. **人类使用的替代方案**
   - 通过 AI 使用（"列出项目"）
   - 如果真需要，后期可以加 CLI wrapper
   - 但实际上，AgenticOS 的设计就是让 AI 来管理

4. **资源系统的价值**
   - `agenticos://context/current` 让 Agent 一次获取完整上下文
   - CLI 无法提供这种能力

5. **开发成本可控**
   - MCP SDK 学习曲线不陡
   - 一次投入，长期受益

### 如果未来需要 CLI

可以轻松添加 CLI wrapper：
```typescript
// cli/index.ts
import { initProject, switchProject } from '../core/project.js';

// 调用核心逻辑，格式化输出给人类
```

核心逻辑复用，只是接口层不同。

## 结论

**选择 MCP Server**，因为：
- AgenticOS 的本质是 Agent First
- MCP 是 Agent Native 的协议
- 跨工具兼容性更好
- 未来可以按需添加 CLI

**不选择 CLI**，因为：
- 字符串解析对 Agent 不友好
- 无法提供资源系统
- 不符合 Agent First 理念
