# T5T Skill

> 自动化完成 T5T（Top 5 Things）的提取、写作和发布流程
>
> **设计原则**：三大步独立执行，支持断点继续；规则外置，框架稳定；通过反思持续进化。

## 触发方式

当用户说以下内容时，调用此 Skill：
- "生成 T5T"
- "写 T5T"
- "帮我写 T5T"
- "/t5t"

**详细执行流程参见项目目录的 `CLAUDE.md`**

---

## 三大步总览

| 步骤 | 名称 | 状态文件 | 产出 |
|------|------|----------|------|
| Step 1 | 收集与论证材料 | `step1-done` | 事实材料汇总 |
| Step 2 | 编写与评审优化 | `step2-done` | T5T 终稿 |
| Step 3 | 发布、确认与反思 | `step3-done` | 已发布 + 反思 |

---

## 核心规范引用

| 规范类型 | 路径 |
|----------|------|
| 角色与目标 | `knowledge/role-and-okr.md` |
| 收集与论证规则 | `knowledge/t5-collect-rules.md` |
| 写作规范（含深度推理） | `knowledge/t5-writing-rules.md` |
| 常用标题库 | `knowledge/topic-library.md` |
| 评审清单（双层13项打分） | `knowledge/t5-review-rules.md` |
| 进化日志 | `knowledge/t5-evolution-log.md` |

---

## Subagent 定义

| Subagent | 职责 | 检查项 |
|----------|------|--------|
| `t5t-format-reviewer` | 格式与结构评审 | 1-6 |
| `t5t-semantic-reviewer` | 语义与质量评审 | 7-12 |
| `t5t-elevation-reviewer` | 深度推理升华评审 | 13 |

Subagent 定义文件位于：`subagents/`

---

## 重要提醒

1. **分步执行**：信息抽取 → 维度归类 → 连续性补充 → 语义精简，禁止跳过
2. **用户确认节点**：Step 1 和 Step 2 结尾必须用户确认后才能继续
3. **基于事实**：所有内容必须基于 Step 1 的原始素材，严禁编造
4. **规则外置**：具体执行规则在 `knowledge/` 目录下，框架稳定
5. **进化反思**：每次完成后反思，改进规范文档
6. **语义精简 ≠ 字数精简**：80字是上限，在表达清楚、保留原意前提下精简
