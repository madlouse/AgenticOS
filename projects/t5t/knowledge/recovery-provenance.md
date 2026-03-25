# T5T 恢复来源与可信度说明

## 恢复结论

本项目不是从原始 Git 目录直接恢复，而是从已验证本地来源重建的 **recovered snapshot**。

恢复可信度分层：

- **A 级**：可直接读取到项目文件正文
- **B 级**：可直接读取到已发布周报正文
- **C 级**：可直接读取到结构化或半结构化发布内容，可重建但不保证原文件字节级一致
- **D 级**：只有间接证据，暂不做原样恢复

## 已验证来源

### A 级：项目知识正文

- `CLAUDE.md`
  - 来源：`~/.claude/file-history/5d63a2f8-3098-4a3d-b395-43757bfb36c2/dba1237008031423@v8`
- `knowledge/role-and-okr.md`
  - 来源：`~/.claude/file-history/85a40588-78d8-406d-b899-234d2a159f68/fcd7503e45b125b5@v2`
- `knowledge/t5-collect-rules.md`
  - 来源：`~/.claude/file-history/85a40588-78d8-406d-b899-234d2a159f68/b6f55d290d75286e@v3`
- `knowledge/t5-writing-rules.md`
  - 来源：`~/.claude/file-history/5d63a2f8-3098-4a3d-b395-43757bfb36c2/e057d20a2441b2df@v3`
- `knowledge/t5-review-rules.md`
  - 来源：`~/.claude/file-history/85a40588-78d8-406d-b899-234d2a159f68/1c5db2c7038d7da9@v3`
- `knowledge/t5-evolution-log.md`
  - 来源：`~/.claude/file-history/ca4b566c-c68c-4e4d-aca2-105909af9f2d/a75c896f30c0ff45@v3`

### B 级：已发布周报正文

- `Week-2026-02-02/t5t-final.md`
  - 来源：`~/.claude/file-history/85a40588-78d8-406d-b899-234d2a159f68/a3c9d310757e94b0@v2`
- `Week-2026-02-04/t5t-final.md`
  - 来源：`~/.claude/file-history/85a40588-78d8-406d-b899-234d2a159f68/c31c77fff0a32eaf@v2`
- `Week-2026-03-01/t5t-final.md`
  - 来源：`~/.claude/file-history/85a40588-78d8-406d-b899-234d2a159f68/3621729dd9e5211e@v2`
- `Week-2026-03-02/t5t-final.md`
  - 来源：`~/.claude/file-history/85a40588-78d8-406d-b899-234d2a159f68/7eb4c0016b337337@v2`
- `Week-2026-03-03/t5t-final.md`
  - 来源：`~/.claude/file-history/85a40588-78d8-406d-b899-234d2a159f68/04d35cb56a6c1f37@v2`

### C 级：可重建内容

- `Week-2026-03-04/t5t-final.md`
  - 来源：`~/.claude/file-history/b29f6a0c-b3f1-4102-b8db-28689eb47aea/adcc6a6eae2f146d@v2`
  - 说明：原始文件正文未直接找到，恢复内容来自已验证的 `|||` 分隔发布结果捕获
- `knowledge/topic-library.md`
  - 来源：周报快照、`t5-writing-rules.md`、`CLAUDE.md`
  - 说明：基于稳定标题重建，不保证与原始正文一致

### D 级：仅作为旁证，不直接转写为项目文件

- `~/.claude/skills/t5t/SKILL.md`
- `~/.opencli/clis/360teams/t5t.js`
- `~/dev/code/T5T/项目进展总结(1).md`
- `~/work/02.目标绩效/00.OKR管理/2025/T5T.md`

## 已知缺口

1. 原始 `topic-library.md` 正文未找到。
2. 原始 `.project.yaml` 未找到，本次为显式重建版本。
3. 原始 `.context/` 与 `tasks/` 目录未找到，本次只恢复最小可用入口面。

## 后续修正规则

如发现比当前来源更原始、更直接的项目文件，应：

1. 优先保留新来源
2. 更新本文件中的来源链
3. 在相关文件头部或提交说明中标明替换原因
