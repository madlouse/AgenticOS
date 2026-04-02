# Agent-Friendly README 深度研究报告

> 会话日期：2026-04-02
> Issue: #154 — feat: define Agent-Friendly README standard with codified validation rules
> 状态：研究完成，待规范规格化
> 研究来源：2 个专项 Agent 研究 + 8+ 权威资料交叉验证

---

## 执行摘要

1. **Agent-Friendly 不是自然结果**：主流开源项目 README 以人类可读性为目标，AI 可理解性需要专门的结构优化，不能靠默认排版实现。

2. **install.md 和 llms.txt 构成完整 AI 文档分层**：前者负责执行（9 个必需元素），后者负责理解（高层索引），中间通过标准化格式连接。

3. **一致性优于丰富性**：Bold+em-dash 工具描述、编号安装步骤、markdown-alert 警告——一致性格式使 AI 可靠提取；丰富的装饰格式反而增加解析负担。

4. **AI 可执行文档存在明确的结构要求**：install.md 的 9 个必需元素（OBJECTIVE / DONE WHEN / TODO / EXECUTE NOW 等）提供了可直接复用的模板。

5. **markdownlint 规则可复用但不足**：60+ 规则中仅部分与 Agent-Friendly 相关；尚无专门针对 AI 可理解性的 lint 工具，这是规范建立的价值所在。

---

## 1. 研究方法

### 1.1 研究范围

本研究的范围界定：README.md（项目主入口文档），不含 AGENTS.md、CHANGELOG.md、docs/ 子目录的深度文档。

### 1.2 参考资料（按优先级）

| # | 来源 | 类型 | 核心贡献 |
|---|------|------|---------|
| 1 | [GitHub Blog: AGENTS.md](https://github.blog/changelog/2024-05-23-new-clone-of-claude-md-clauses/) | 官方规范 | AI 专用文档的标准化格式 |
| 2 | [Mintlify install.md](https://github.com/mintlify/install-md) | 行业规范 | 9 要素 AI 可执行安装文档标准 |
| 3 | [openai-agents-python](https://github.com/openai/openai-agents-python) | 案例研究 | 安装/工具描述结构分析 |
| 4 | [anthropics/claude-code](https://github.com/anthropics/claude-code) | 案例研究 | 平台分区、markdown-alert 使用 |
| 5 | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) | 案例研究 | Bold+em-dash 工具描述一致性 |
| 6 | [langchain-ai/langchain](https://github.com/langchain-ai/langchain) | 案例研究 | llms.txt 集成、代码优先策略 |
| 7 | [pydantic/pydantic](https://github.com/pydantic/pydantic) | 案例研究 | markdownlint 配置、AI vs 人类权衡 |
| 8 | [DavidAnson/markdownlint](https://github.com/DavidAnson/markdownlint) | 工具研究 | 60+ 规则体系、CI 集成模式 |

---

## 2. 核心概念定义

### 2.1 Agentic Documentation（主体型文档）

**定义**：明确"为 AI 代理撰写"的文档，由 AI 代理直接执行和依赖。

**代表形式**：

| 文件 | 提出方 | 核心特征 |
|------|--------|---------|
| `AGENTS.md` | GitHub/Microsoft | 项目级 AI 工作指令，无强制格式 |
| `CLAUDE.md` | Anthropic | Claude Code 专用上下文文件 |
| `install.md` | Mintlify | AI 可执行安装指令，9 要素强制结构 |
| `.agents/skills/*/SKILL.md` | Microsoft VSCode | 结构化任务指令集 |
| `llms.txt` | Mintlify | AI 优化的高层索引文档 |

### 2.2 Agent-Friendly Documentation（亲和型文档）

**定义**：原本为人类撰写，但经过优化以提升 AI 理解准确性的文档。

**核心区别**：

| 维度 | Agentic | Agent-Friendly |
|------|---------|----------------|
| 撰写目的 | AI 代理直接执行 | 人类可读，AI 也能准确理解 |
| 典型受众 | AI | 人类 + AI |
| 格式严格性 | 强制结构（install.md 9 要素） | 推荐结构（README 模板） |
| 执行能力 | AI 可直接照做 | AI 需理解后决策执行 |
| 典型文件 | install.md、SKILL.md | README.md、CONTRIBUTING.md |

### 2.3 文档层级体系

```
项目概览 ────── README.md       （人类+AI 共同入口）
AI 索引 ────── llms.txt         （AI 高效理解项目结构）
AI 执行 ────── install.md       （AI 自主执行安装步骤）
AI 工作 ────── AGENTS.md        （AI 开发工作指南）
AI 专项 ────── .agents/skills/* （具体任务指令集）
```

---

## 3. Agent 解析 README 的 6 大失败模式

### F1: 命令模糊性

**描述**：安装/运行命令缺少包管理器标识、版本约束或适用平台说明，AI 无法确定具体执行环境。

**触发条件**：命令块中出现 `npm install`、`pip install` 等无上下文命令。

**影响**：AI 可能选择错误的包管理器，或在错误环境中执行命令。

**反面示例**：
```markdown
## Installation

npm install
```

**正面示例**：
```markdown
## Installation

Requires: Node.js >= 18.0.0, npm >= 9.0.0

npm install
node --version   # verify: should output 18.x or higher
```

**对应规则**：AFR-002

---

### F2: 上下文缺失

**描述**：命令依赖的前置条件（环境变量、依赖项、网络访问权限）未声明，AI 执行时缺失败。

**触发条件**：文档缺少 PREREQUISITES、ENVIRONMENT 或前置检查步骤。

**影响**：AI 执行命令后得到环境错误，需回退重试。

**反面示例**：
```markdown
## Setup

git clone https://github.com/xxx.git
npm install   <!-- 未说明需要 Node.js -->
```

**正面示例**：
```markdown
## Prerequisites

- Node.js >= 18 (`node --version` to verify)
- Git
- GitHub account with MCP access

## Setup

git clone https://github.com/xxx.git
npm install
```

**对应规则**：AFR-002、AFR-006

---

### F3: 解析歧义

**描述**：同一功能存在多个等效路径（多包管理器、多安装方式），但未说明适用场景，AI 随机选择或混淆。

**触发条件**：文档中同时出现 `brew install`、`npm install`、`curl 脚本` 等多条等效路径。

**影响**：AI 选择了不适合当前环境的方式，导致安装失败或行为不一致。

**反面示例**：
```markdown
## Installation

npm install my-package
# or
yarn add my-package
# or
pnpm add my-package
```

**正面示例**：
```markdown
## Installation

### Node.js project (recommended)
npm install my-package

### Homebrew (macOS/Linux server)
brew install my-package
```

**对应规则**：AFR-002、AFR-008

---

### F4: 格式干扰

**描述**：非核心内容（徽章、贡献者列表、历史变更记录、FAQ）淹没在核心安装步骤之前，AI 在前 20 行内无法找到有效信息。

**触发条件**：README 前 20 行包含超过 5 个徽章/图片，或 FAQ 章节在安装步骤之前。

**影响**：AI 对项目形成错误的第一印象，或跳过关键步骤。

**反面示例**：
```markdown
# MyProject

[![CI](...)][![Coverage](...)][![NPM](...)][![License](...)][![Stars](...)]
[![Build](...)][![Downloads](...)]

We are grateful to our 200 contributors...

## FAQ
...

## Installation
```

**正面示例**：
```markdown
# MyProject

> CLI tool for automating X. Works with Node.js >= 18.

## Quick Start   <!-- 核心内容前置 -->
npm install -g my-project
my-project --version

---

## Badges (完整列表见底部)
```

**对应规则**：AFR-010

---

### F5: 标题层级混乱

**描述**：README 缺少标准标题层级（H1→H2→H3 连续结构），AI 无法可靠地导航到所需章节。

**触发条件**：README 无 `#` 标题；或仅有 H3；或 H3 出现在首个 H2 之前。

**影响**：AI 无法通过锚点或搜索定位内容；依赖顺序匹配导致脆弱。

**反面示例**：
```markdown
# MyProject

### Quick Start    <!-- 跳级：H3 直接出现在 H1 后 -->
...
## Install
...
### Advanced
```

**正面示例**：
```markdown
# MyProject

## Quick Start
### Prerequisites
### Installation
## Usage
## Architecture
```

**对应规则**：AFR-001

---

### F6: 缺少验证步骤

**描述**：安装或配置完成后没有验证命令，AI 无法确认操作是否成功。

**触发条件**：安装步骤缺少 DONE WHEN 或等效验证命令块。

**影响**：AI 完成安装后直接进入下一步，不知道已失败；错误会向后传播。

**反面示例**：
```markdown
npm install

Now you're ready to use the package.
```

**正面示例**：
```markdown
npm install

<!-- Verify -->
npm list my-package   # should show my-package@x.x.x
my-package --help     # should output usage information
```

**对应规则**：AFR-002、AFR-006

---

## 4. 三大核心区域规范

### 4.1 安装与使用步骤

**核心原则**：OBJECTIVE / DONE WHEN / TODO 清单 / 编号步骤 / EXECUTE NOW

**install.md 9 要素**（最完整的 AI 可执行安装格式）：

1. H1 标题（小写、连字符分隔）
2. 摘要块引用（单行用途描述）
3. 对话式开场白：`I want you to install [product] for me. Execute all the steps below autonomously.`
4. OBJECTIVE：简明目标陈述
5. DONE WHEN：可测量的成功条件
6. TODO 复选框（3-7 个）
7. 详细步骤（编号子标题 + 显式命令）
8. EXECUTE NOW 结尾
9. llms.txt 引用（可选）

**在 README.md 中内嵌的等效格式**：

```markdown
## Quick Start

**OBJECTIVE**: 安装并验证 AgenticOS MCP 服务器。
**DONE WHEN**: `agenticos-list` 输出可用项目列表。

- [ ] 检查前置条件
- [ ] 安装 agenticos-mcp
- [ ] 配置 MCP
- [ ] 验证安装

### Step 1: Check Prerequisites
Node.js >= 18.0.0 required:
node --version

### Step 2: Install
npm install -g agenticos-mcp

### Step 3: Verify
agenticos-list

<!-- EXECUTE NOW: Complete the above TODO list -->
```

**命令三要素**：
- **包管理器**：`npm`/`brew`/`pip` — 必须明确
- **版本约束**：`>= 18.0.0`、`^1.0.0` — 必须标注
- **验证命令**：`--version`、`verify`、`list` — 必须包含

---

### 4.2 架构设计描述

**核心原则**：一致性 + 层次化 + 边界明确

**一致性格式**（Bold + em-dash）：

```markdown
## Architecture

AgenticOS consists of three layers:

- **agenticos-mcp** — MCP server implementation, exposes all tools
- **AgenticOS workspace** — Project state and memory stored at `$AGENTICOS_HOME`
- **Agent adapters** — Per-agent transport and session management (Claude Code, Codex, Cursor, Gemini CLI)
```

**分层描述模板**：

```
Level 1: 系统概览（1-2 句）
    ↓
Level 2: 核心组件（bold+em-dash 格式，每组件一句话）
    ↓
Level 3: 数据流或依赖关系（可选 Mermaid/ASCII 图）
    ↓
Level 4: 边界和约束（警告、限制）
```

**图表辅助**：

| 类型 | 适用场景 | AI 解析效果 |
|------|---------|------------|
| Mermaid flowchart | 数据流、状态机 | 好（结构化，可转文本） |
| ASCII diagram | 简单拓扑 | 中（需要等宽字体环境） |
| 文字描述 | 复杂关系 | 好（AI 原生理解文字） |

**推荐**：对复杂系统使用 Mermaid，对简单拓扑用 ASCII，对有向关系用文字。

---

### 4.3 功能与特性描述

**核心原则**：工具名 Bold 化 + 参数明确 + 警告前置

**工具/API 一致性格式**：

```markdown
## API Reference

### agenticos_init
Creates a new AgenticOS project.

**Parameters**:
- `name` (string, required): Project identifier
- `description` (string, optional): Project description
- `path` (string, optional): Custom workspace path

**Returns**: `{ project_id, path, status }`

> [!NOTE]
> Project names must be lowercase, hyphenated (e.g., `my-feature`).

### agenticos_switch
Switches the active project context.

**Parameters**:
- `project` (string, required): Project ID or name

> [!WARNING]
> Switching projects does not save the current project state.
> Call `agenticos_save` before switching.
```

**关键特征**：
- 工具名使用 Bold（`**name**`）
- 参数用列表或表格，标注类型和必选/可选
- 返回值明确声明结构
- 警告使用 markdown-alert（`> [!WARNING]`）前置

---

## 5. 10 条 AFR 规则草稿

| ID | 规则 | 级别 | 检验逻辑方向 | 自动化 | 对应失败模式 |
|----|------|------|------------|--------|------------|
| AFR-001 | 标题层级完整性 | ERROR | 首行 H1，存在 ≥1 个 H2，H3 不先于 H2 | YES | F5 |
| AFR-002 | 安装命令无歧义 | ERROR | 包管理器+版本约束+验证命令三要素；无未标注的多路径 | PARTIAL | F1/F2/F6 |
| AFR-003 | 代码块语言标识 | WARNING | ` ``` ` 后紧跟语言名 | YES | - |
| AFR-004 | 工具引用一致性 | WARNING | 同义工具名混用检测 | PARTIAL | - |
| AFR-005 | 警告标记语义化 | WARNING | 正则检测未标记警告文本 | YES | - |
| AFR-006 | AI 执行入口存在性 | RECOMMENDATION | EXECUTE NOW 或 Quick Start 含可执行命令 | YES | F6 |
| AFR-007 | 链接完整性 | WARNING | 相对 .md 链接目标存在性 | PARTIAL | - |
| AFR-008 | 文档单一性原则 | WARNING | 安装步骤集中不重复 | YES | F3 |
| AFR-009 | llms.txt 或等效 AI 文档 | RECOMMENDATION | llms.txt 等文件存在性 | YES | - |
| AFR-010 | README 长度控制 | INFO | ≤500 行；前 20 行徽章 ≤5 | YES | F4 |

---

## 6. 与现有标准的关系

### 6.1 与 AGENTS.md / CLAUDE.md 的边界

| 文件 | 用途 | Agent-Friendly 规范适用 |
|------|------|---------------------|
| README.md | 项目概览 + 安装 + 使用 | ✅ 适用 |
| AGENTS.md | AI 开发工作指令 | ❌ 不适用（另有规范） |
| CLAUDE.md | Claude Code 上下文注入 | ❌ 不适用 |
| CONTRIBUTING.md | 贡献指南 | ✅ 参照执行 |
| install.md | AI 可执行安装步骤 | ✅ 直接适用 |

### 6.2 与 GitHub Flow 规范（Issue #08）的关联

Issue #08 定义的 GitHub Flow 规范中，PR 合入前的验证步骤应包含 README 质量检查。

本规范（Issue #154）应作为 Issue #08 的下游依赖：
- Issue #08 提供分支/PR 生命周期
- Issue #154 提供 README 内容质量标准
- 两者共同构成完整的文档驱动开发规范

### 6.3 与 Standard Kit 的继承关系

本规范以 `recommended`（非强制）等级注册到 `manifest.yaml` 的 `downstream_doc_standards` 节，下游项目可选采纳。

---

## 7. 开放问题（留待规范阶段决策）

1. **AFR-004 的别名表维护策略**：别名表需要手动维护（Claude Code / claude-code / ClaudeCode），谁来更新？如何触发？

2. **install.md vs README.md 内嵌格式的选择**：install.md 是否作为独立文件存在，还是所有项目的 README.md 都内嵌 install.md 等效格式？

3. **AFR-002 的语义判断边界**：多包管理器共存何时算"歧义"（ERROR）vs"合理多平台支持"（PASS）？

4. **README 行数限制的合理性**：500 行是否适合所有规模的项目？大型项目的阈值是否应单独定义？

5. **规范版本演进机制**：当规范 v1.0 发布后，发现新失败模式或规则时，通过什么流程升级版本？
