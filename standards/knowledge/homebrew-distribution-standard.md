# Homebrew 分发标准

> 适用版本：v13+  
> 维护者：项目 owner  
> 最后更新：2026-04-24

## 目的

确保使用 Homebrew 分发的 managed projects 在每次 release tag push 时自动同步 formula 到对应 tap 仓库，消除手动维护 formula 带来的遗漏风险。

## 前提条件

- 项目有独立的 Homebrew tap 仓库（如 `madlouse/homebrew-<project-name>`）
- tap 仓库中存在 `*.rb` formula 文件
- 项目 owner 持有 GitHub `repo` scope PAT（可同时访问私有 source repo 和 public tap）

## 标准流程

### Step 1：添加调用层 workflow

在项目根目录创建 `.github/workflows/homebrew-bump.yml`：

```yaml
name: Homebrew Bump

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: read
  pull-requests: write

jobs:
  call-homebrew-bump:
    uses: madlouse/agenticos/.github/workflows/homebrew-bump.yml@main
    with:
      formula-name: <formula-name>        # Homebrew 中的包名
      formula-path: <formula-path>         # tap 仓库中的路径（根目录为空字符串）
      homebrew-tap: <owner>/homebrew-<tap-name>  # tap 仓库完整路径
    secrets:
      committer-token: ${{ secrets.HOMEBREW_TAP_PAT }}
```

### Step 2：添加 GitHub Secret

在项目仓库 Settings → Secrets → Actions 中添加：

| Secret 名称 | 说明 |
|-------------|------|
| `HOMEBREW_TAP_PAT` | GitHub PAT，scope `repo`，有效访问 source 仓库和 tap 仓库 |

创建 PAT：
```bash
gh auth token --scopes repo
# 或 https://github.com/settings/tokens/new 选择 repo scope
```

### Step 3：添加 workflow 文件到 tap 仓库

确保 tap 仓库中有对应版本的 formula 文件（`mislav/bump-homebrew-formula-action` 会自动更新它）。

### Step 4：验证

打一个测试 tag 观察 workflow 是否触发：
```bash
git tag v0.0.1-test -m "ci: test homebrew auto-bump"
git push origin v0.0.1-test
```

预期：tap 仓库收到 PR，内容包含新的 tag 和 revision。

## 模板参数速查

| 项目 | formula-name | formula-path | homebrew-tap |
|------|-------------|-------------|-------------|
| agent-cli-api | `agent-cli-api` | `agent-cli-api.rb` | `madlouse/homebrew-agent-cli-api` |
| agenticos | `agenticos` | `Formula/agenticos.rb` | `madlouse/homebrew-agenticos` |
| 360teams-opencli | `teams-opencli` | `teams-opencli.rb` | `madlouse/homebrew-360teams` |
| qifu-web-opencli | `qifu-web-opencli` | `qifu-web-opencli.rb` | `madlouse/homebrew-qifu-web-opencli` |

## Reusable Template 说明

模板定义在 `madlouse/agenticos/.github/workflows/homebrew-bump.yml`（`workflow_call` 类型），各项目通过 `uses:` 调用。

**设计原则**：
- PAT 放在**调用方仓库**，模板不持有 secrets（最小权限原则）
- prerelease tag（含 `-`）自动跳过，不污染 stable formula
- `mislav/bump-homebrew-formula-action@v4` 处理 fork + PR 全流程

## 常见问题

**Q: 私有仓库可以用吗？**  
A: 可以。PAT 用 `repo` scope 即可读写私有 source 仓库。

**Q: 已有 formula 的项目如何迁移？**  
A: 只需添加 workflow 文件 + secret。mislav action 会自动检测现有 formula 并更新。

**Q: 不想每次 release 都触发？**  
A: 改为 `workflow_dispatch` 手动触发，或在 workflow 中加 `if` 条件过滤。

**Q: 多个 formula 在同一个 tap？**  
A: 在调用层 job 中用 `needs:` 串联多个 `workflow_call`，或直接在一个 job 中调用多次（action 支持）。
