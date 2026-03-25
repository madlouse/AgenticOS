# CLAUDE.md — T5T

## Recovered Snapshot Notice

> This project was restored on 2026-03-25 from verified local sources.
> Treat it as the canonical recovered snapshot for T5T unless a more original source is later found.

## MANDATORY: Recording Protocol

> This is an AgenticOS project. All session activity MUST be recorded.
> Recording is not optional — it is the core function of this system.

### During Session

After completing any meaningful unit of work (feature, fix, design decision, analysis), call `agenticos_record`:

```
agenticos_record({
  summary: "what happened",
  decisions: ["decision 1", ...],
  outcomes: ["outcome 1", ...],
  pending: ["next step 1", ...],
  current_task: { title: "task name", status: "in_progress" }
})
```

### Before Session Ends

When the user signals session end (says goodbye, thanks, done, or stops responding), you MUST:

1. Call `agenticos_record` with a complete session summary
2. Call `agenticos_save` to commit to Git

**If you skip this step, all context from this session is permanently lost.**

---

## Session Start Protocol

When you open this project in a new session, **immediately do the following**:

1. Read the "Current State" section below
2. Greet the user with a brief status report:

```
📍 项目：T5T
📌 上次进展：[current_task title + status]
🎯 当前待办：[top pending items]
💡 建议下一步：[recommended next action]

继续上次的工作，还是有新的方向？
```

3. Wait for the user's direction before proceeding

---

## Project DNA

**一句话定位**: T5T 项目进展跟踪与管理

**用户身份背景**:
- 角色：金融科技公司（服务银行）技术团队研发部负责人
- 同时负责 Deep Bank 项目中 "AI 信贷员" 技术开发

**业务线**:
1. 联合运营业务：服务于银行贷款业务
2. DeepBank：金融信贷超级智能体项目

**核心设计原则**:
- 每周定义下一周行动计划
- 按周建立文档，记录每周进展
- 统一模板：进度、变化、风险、关键进展/下一步

**技术栈**: 纯文档管理（Markdown）

---

## T5T 规则与原则

### T5 写作规范

参考 `knowledge/t5-writing-rules.md`，核心要点：

- 格式：`**主题**：动作1；动作2；动作3。`
- 标题：保持强一致性，优先沿用已确定命名，如 "DB 资源回收推进"、"常熟银行AI信贷员"、"新机构交付项目"、"全流程质量加固项目"、"效率提升"
- 内容本质：研发部门关键事项的阶段性推进，不假设一周闭环
- 语言风格：口语化但专业，基于事实不拔高，使用真实管理动作（跟进、明确、推进、评审、实施等）
- 禁止：华丽辞藻、AI腔、材料腔、擅自放大成果

### 模板结构

每个项目包含：
1. 上线时间：项目计划上线日期
2. 进度：各阶段百分比/状态
3. 变化：本周主要变化
4. 风险：已知风险项
5. 关键进展 / 下一步：具体行动项

### 文档组织

- `Week-2026-03-01/`：2026 年 3 月第 1 周的文档
- 每周一个文件夹，命名格式：`Week-年-月-当月第几周`
- `knowledge/t5-writing-rules.md`：T5 写作规范

### 公司 T5 规范框架

按公司要求，T5 周报包含三个维度：

**维度一：核心项目推进**
- 格式：项目名称 | 当前阶段 | 关键进展 | 下周计划 | 风险卡点
- 每项目一行

**维度二：重点关注事项**
- 不超过 3 条，每条不超过 20 字

**维度三：团队管理**
- 不少于 2 条
- 围绕团队梯队建设、人才培养、核心人员稳定性等

### 规范整合关系

| 公司T5规范 | 用户写作规范 | 关系 |
|-----------|-------------|------|
| 填写框架（维度一/二/三） | 写作风格指南 | 互补 |
| 告诉填什么 | 告诉怎么写 | 整合使用 |

### 填写频率

每周五下午 4 点前填写

---

## Current State

**Last Updated**: 2026-03-25

**当前周**: 第 13 周（2026-03-23 ~ 2026-03-29）

**Current Task**: 恢复 T5T 项目目录与已验证知识快照

**Active Items**:
- 已恢复：项目级 `CLAUDE.md`、核心知识文档、周报快照
- 已恢复：`knowledge/t5-writing-rules.md`
- 已恢复：`knowledge/t5-collect-rules.md`
- 已恢复：`knowledge/t5-review-rules.md`
- 已恢复：`knowledge/t5-evolution-log.md`
- 待确认：`topic-library.md` 为根据已验证标题恢复的近似版本
- 待确认：是否还存在更原始的 `okr-management` 或 T5T 项目目录源

**Next Action**: 使用者确认恢复结果是否满足继续使用条件，或补充更原始来源

---

## Navigation

| 目录/文件 | 用途 |
|-----------|------|
| `.project.yaml` | 项目元信息 |
| `.context/state.yaml` | 当前会话状态及工作记忆 |
| `knowledge/` | 持久化知识文档 |
| `Week-YYYY-MM-NN/` | 每周 T5T 产出快照 |
| `artifacts/` | 恢复相关产出物 |
