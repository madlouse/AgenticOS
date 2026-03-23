# 开源协作开发流程研究报告

> 会话日期：2026-03-21
> 目的：为 AgenticOS 建立标准的开源协作开发流程
> 状态：研究完成，设计方案需修订

---

## 1. 研究背景

用户希望 AgenticOS 的开发流程转为开源协作模式：
- **Issue 驱动**：每个改动先创建 GitHub Issue
- **Worktree 隔离**：Agent 在独立分支开发，不影响 main
- **PR 合并**：通过 PR 关联 Issue 进行审查和合并

## 2. 关键发现

### 2.1 GStack 模式（最成熟的参考）

[GStack](https://github.com/garrytan/gstack) (10,000+ stars) 的核心理念：
- **角色约束**：每个 slash command 专注一个职责（Think → Plan → Build → Review → Test → Ship → Reflect）
- **约束范围使输出更相关**：限制每个角色的 scope 能减少修改轮次
- 所有 skills 放在 `.claude/skills/`，`git clone` 即可工作
- 支持 Conductor 模式并行 10-15 个 sprint

### 2.2 Claude Code GitHub Actions（官方集成）

- `anthropics/claude-code-action@v1` 提供自动 PR 审查、Issue-to-PR 工作流
- `/install-github-app` 自动配置 GitHub App + Secrets
- 支持 `@claude` 在 PR/Issue 中被提及后响应
- v1.0 将所有 CLI 参数合并到 `claude_args` 参数

### 2.3 GitHub Agentic Workflows（新兴标准）

- 技术预览阶段：在 `.github/workflows/` 中用自然语言描述自动化目标
- 56+ 现成模板（Issue 分类、测试改进、自动合并等）
- 只读默认权限 + 安全输出

### 2.4 AGENTS.md 最佳实践

来自 GitHub Blog 对 2,500+ 仓库的分析：
- AGENTS.md 是专为 AI Agent 编写的文档，与人类指南分离
- 应包含：开发环境、测试指令、PR 标准、项目边界、技术栈版本
- 关键：**简洁 + 具体 > 详尽 + 模糊**

### 2.5 Conventional Commits + semantic-release

- AgenticOS git log 已部分采用 `feat:`/`fix:` 前缀
- semantic-release 可自动化：版本号、changelog、npm 发布、GitHub Release
- commitlint 可在 CI 中强制执行格式

### 2.6 MCP Server 发布规范

- 版本号遵循 semver 格式："1.2.3"（非 "v1.2.3"）
- 当前 `index.ts` 硬编码 `0.1.0` 与 `package.json` 的 `0.2.0` 不一致

## 3. 当前状态（PR #6 已创建但需修订）

### 已完成
- GitHub Issue #5 已创建
- PR #6 已提交，包含 9 个文件
- Issue 模板、PR 模板、CONTRIBUTING.md、LICENSE、.gitignore 基本可用

### 需要修订
- **CLAUDE.md 定位错误**：写成了"开发规范文档"而非"Agent 快速启动配置"
- **AGENTS.md 与 CLAUDE.md 重复**：应该 DRY —— AGENTS.md 为规范来源，CLAUDE.md 引用并添加 Claude 特有能力
- **没有遵循渐进式披露**：把 commit convention 详细示例、forbidden operations 完整列表等全塞进了第一层

## 4. 修订方向

### AGENTS.md（规范来源）
- 项目概览（一句话）
- 仓库地图（简洁表格）
- 快速启动命令
- 开发协议要点（Issue-First、分支命名、Conventional Commits —— 各一行）
- 指向 CONTRIBUTING.md 获取详细规范

### CLAUDE.md（Claude Code 特有扩展）
- 引用 AGENTS.md 作为基础
- 添加 Claude Code 特有能力：
  - worktree 隔离（`isolation: "worktree"`）
  - MCP tools（agenticos_record/save）
  - slash commands
  - Plan Mode 使用场景

## 5. 未解决的问题

### 子 Agent 上下文断裂
- `agenticos_switch` 恢复主会话状态，但 spawn 出去的子 Agent 是"失忆"的
- 需要机制让子 Agent 继承项目知识（至少读 CLAUDE.md + knowledge/ 关键文件）

### 设计产出物持久化
- 研究和设计方案应保存到文件，而非仅存在于对话上下文
- 对话压缩后可通过文件重新加载
- 建议：重要输出 → `knowledge/` 或 `artifacts/`，对话中引用文件路径

---

## 6. 参考资源

- [GStack](https://github.com/garrytan/gstack) — 角色约束的 Agent 开发框架
- [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions) — 官方 CI/CD 集成
- [GitHub Agentic Workflows](https://github.blog/changelog/2026-02-13-github-agentic-workflows-are-now-in-technical-preview/) — 自然语言驱动的自动化
- [How to write a great agents.md](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-2500-repositories/) — AGENTS.md 最佳实践
- [semantic-release](https://github.com/semantic-release/semantic-release) — 自动化版本管理
- [Conventional Commits](https://www.conventionalcommits.org/) — 提交信息规范
