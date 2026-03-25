# OKR Management 恢复来源与边界说明

## 恢复模型

本项目采用 **external-source wrapper** 恢复模型。

这意味着：

- `projects/okr-management/` 现在是一个可用的 AgenticOS 项目入口
- 但它不是原始丢失目录的逐字节 Git 恢复
- 当前最强可验证内容源在外部工作语料目录中

## 已验证事实

### 1. 项目历史存在性

Claude file-history 中的 registry 快照证明：

- `id: okr-management`
- `path: /Users/jeking/dev/AgenticOS/projects/okr-management`

因此可以确认它曾是正式 AgenticOS managed project。

### 2. Git 历史边界

AgenticOS 源仓库没有保留一个可恢复的正常 tracked directory。

已知情况是：

- 历史中出现 orphaned `160000` gitlink
- 没有足够项目级文件可用于正常 Git 目录恢复

### 3. 当前最强内容源

最强可验证 external source：

- `/Users/jeking/work/02.目标绩效/00.OKR管理/`

关键已验证文件：

- `/Users/jeking/work/02.目标绩效/00.OKR管理/2026/CLAUDE.md`
- `/Users/jeking/work/02.目标绩效/00.OKR管理/2026/2026年度OKR.md`
- `/Users/jeking/work/02.目标绩效/00.OKR管理/2026/2026Q1-OKR.md`

### 4. 旁证

- OKR Writer skill 快照：
  - `~/.claude/file-history/b566355d-87e2-4a29-bfb8-e69124698d29/ddc514090cee3d37@v4`
  - `~/.claude/file-history/97f1a2a5-116f-4117-862d-be0172e0283b/ddc514090cee3d37@v3`

## 当前项目内保留的内容

1. 项目级元数据与上下文入口
2. external source 索引
3. 恢复边界说明
4. 关键年度 / 季度 OKR 快照

## 当前不应宣称的事情

1. 不能声称已经恢复原始 `projects/okr-management` 完整目录
2. 不能声称当前项目本体就是 canonical content source
3. 不能声称所有历史 OKR 文档都已经导入本仓库

## 后续升级路径

若未来发现更强证据，可按以下顺序升级：

1. 找到原始项目级 `.project.yaml`
2. 找到原始项目级 `.context/`
3. 找到原始项目级 `knowledge/` 或 `tasks/`
4. 再决定是否把 wrapper 升级为 fuller recovered snapshot
