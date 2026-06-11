# 人机共同 Context 构建：全生命周期系统设计（#549）

> 状态：设计稿（设计先行，按 P0→P2 逐层实现）
> 来源：2026-06-11 对 hermes-agent-kit 多 session 并行开发的实地巡检 + AgenticOS 自身 #512–#520、#515、#517 一系列改造后的战略复盘。

---

## 1. 核心判断（一句话）

AgenticOS 现在是一个**「写入强、读取弱、治理半闭环」**的 context 系统。

写入链（capture → distill → guardrail）成熟；**读取链（召回）整段缺失**；**治理链（清理/提交/护盘）不自动收口**。
人机共享的是一个**只进不出、不自动收口的池子**。

### 实证（hermes-agent-kit，2026-06-11）

| 信号 | 数据 | 含义 |
|---|---|---|
| 写入链成熟 | 198 个 PR 已合并、65 篇 knowledge、ledger 92 条、每个 issue_bootstrap 都标 `isolated_worktree` | 生成/记录/守卫扎实可信 |
| 召回缺失 | 源码 `recall/retrieve/search` 零命中；冷启动只加载固定 5 文件 | 65 篇知识写完即沉底 |
| 治理不闭环 | ~40 worktree vs 18 open issue；20 个 worktree 的 `.context/state.yaml` 未提交；canonical main 144 脏文件 + 落后 origin 91 提交；存在 `dirty-backup-20260608`（复发证据） | 收口动作被系统性跳过 |

关键观察：**并行执行本身井然有序（规范承重），无序只长在"收口"和"召回"两段缝隙里。**

---

## 2. 设计哲学：自动化收口，守卫判断

> 回答「为什么不能用 Workflow 自动完成？」——**该自动化的恰恰是收口，不该用重引擎的是判断。**

hermes 的乱**全部出在确定性的、与当前任务无关的收口动作上**：合并后清 worktree、record 后提交 state、护住 main。这些动作 agent 最容易"忘"——不是能力问题，是**纪律驱动机制在收口边界的固有失败模式**：要求一个 agent 记得去做一件不直接服务于它当前任务的事。

因此设计的分界线是：

| 动作类型 | 特征 | 归属 | 例 |
|---|---|---|---|
| **收口（Closing）** | 确定性、事件锚定、与当前任务无关 | **自动化**（事件触发 hook / 轻 workflow） | 合并即清理、record 即提交、冷启动即召回注入、freshness 即暴露 |
| **判断（Judgment）** | 需要语义判断、上下文相关 | **保留 agent 纪律 + 守卫** | 蒸馏什么、记哪条决策、写什么知识、知识是否过期 |

**这条线就是克制的标尺**：不为"判断"造重 workflow 引擎（过度设计），但也绝不把"收口"继续压在 agent 纪律上（无设计 / 现状）。"Workflow"在本设计里 = **事件驱动的确定性收口**，而非通用编排引擎。

---

## 3. 统一模型：Project Memory 四层闭环

把现有四套碎片（`distillation-ledger` / `case` / `knowledge/` / `state.working_memory`）收敛成一个**可生成、可蒸馏、可召回、可治理**的对象——**Project Memory**。

```
            ┌──────────────────────────────────────────────────────┐
            │                   Project Memory                      │
            │                                                       │
  会话 ───▶ L1 Capture ──▶ L2 Evolution Log ──▶ L4 Governance ──┐   │
            (原始记录)      (统一进化日志)        (收口/治理)     │   │
                                  │                              │   │
                                  ▼                              │   │
  冷启动 ◀────────────── L3 Recall ◀───── knowledge/ ◀──────────┘   │
            (任务相关召回注入)              (单篇有生命周期)          │
            └──────────────────────────────────────────────────────┘
                生成 ✅强   蒸馏 ✅(刚补强)   召回 ❌缺失   治理 ⚠️半成
```

闭环要求：任何一次会话进入 → 工作 → 离开，系统都能回到一个**干净、可被下一次召回的状态**。当前断在 L3（召回不存在）和 L4（治理不自动收口）。

---

## 4. 逐层深设计

每层给出：职责 / 数据载体 / 现状 / Gap / 设计 / 自动化边界。

### L1 — Session Capture（生成层）｜现状已足够，仅微调

- **职责**：把一次原始会话固化为可追溯的原料。
- **数据载体**：sidecar 原始 capture（`.agent-workspace/.../captures/`）+ `distillation-ledger` 条目（`captured` 状态）。
- **现状**：成熟。`agenticos_record` 已支持 capture-only / full 两态；#515 刚补强了 canonical-main 蒸馏死锁（worktree record 排空 main 累积的 captures）。
- **Gap**：会话绑定只存进程内存，MCP 重连即失忆（已立 #516）。
- **设计**：仅做 #516（绑定持久化到 sidecar，重连恢复）。不引入新概念。
- **自动化边界**：record 本身是 agent 调用（判断"做了什么"是语义动作）；但 record 之后的 **state 提交** 属收口 → 自动化（见 L4）。

### L2 — Evolution Log（蒸馏层 / 项目进化日志）｜改造重点：收敛碎片

- **职责**：回答"**这个项目学到了什么、为什么这么决定**"——单一可追溯的进化时间线。
- **现状（碎片化）**：四套并存且互不引用——
  - `distillation-ledger`（session 级状态机：captured→distilled_to_state/knowledge/converted_to_task/superseded/ignored）
  - `case.ts`（corner-case / bad-case）
  - `knowledge/`（durable 文档）
  - `state.working_memory`（decisions / facts / pending）
- **Gap**：无法回答"#349 当时为什么这么定"——决策、案例、知识各存一处,无统一类型化时间线,无法按 issue/PR 回溯。
- **设计（统一 Entry 模型，最小新增面）**：把上述收敛为一条带类型的进化日志条目。**不新建存储，扩展现有 `distillation-ledger` 为承载体**（它已是 sidecar、已有状态机、#515 刚扩过字段），增加 `kind` 与 `refs`：

  ```yaml
  - id: evo-2026-06-11-0930-<hash>
    kind: decision | case | knowledge_ref | capture   # 类型化
    status: active | superseded | ignored_with_reason # 复用现有状态机
    summary: "M2 精度采样改用分层抽样而非随机"
    rationale: "随机抽样在低频类别上方差过大（#355 评测证据）"   # 为什么
    refs:                                              # 可回溯
      - { type: issue, uri: "#355" }
      - { type: pr, uri: "#xxx" }
      - { type: knowledge, uri: "knowledge/m2-precision-sampling.md" }
    created_at: ...
  ```
  `state.working_memory.decisions` 与 `case` 成为它的**视图/投影**(读时聚合),不再是独立真相源。
- **自动化边界**：写一条 evolution entry 是 agent 判断("这是否值得记")→ 保留 agent。但 entry 的 `status` 流转（如知识被取代 → `superseded`）在 L4 可半自动提示。

### L3 — Context Recall（召回层）｜全新，最高杠杆

- **职责**：给定当前任务，把**相关的**历史进化日志 + knowledge 召回进冷启动,而非加载固定全量。
- **现状**：不存在。冷启动 `issue_bootstrap` 只加载固定 5 文件（`.project.yaml` / quick-start / state / AGENTS / CLAUDE）。65 篇 knowledge 永远进不了视野。
- **Gap**：写多读少的根因。新 agent 进入 #394（hybrid-recall）时，看不到 #393（contextitem-episodes）、#390（memory-recall-topic）这些强相关的历史决策与知识。
- **设计（分级召回，克制）**：新增 `agenticos_recall({ query?, issue_id?, task? }) → top-N entries+docs`。**v1 不上向量库**（避免过度设计），用确定性信号:
  1. **issue 关联**：当前 issue 的 body/title 关键词 + label → 匹配 evolution entries 的 `refs.issue` 与 knowledge 文件名/标题。
  2. **标签/路径邻近**：同 capability 区(如 `memory-*` / `m2-*`)的知识优先。
  3. **新鲜度加权**：复用 `knowledge-evolution-health` 的时间戳；`superseded` 的降权/标注。
  - **接入冷启动**：`issue_bootstrap` 在固定 5 文件之外，追加"召回的 top-N 相关条目"作为 `additional_context`（该字段已存在！）。
  - **v2（P2）**：把召回信号升级为 GBrain 语义检索（接口预留，不在 P1 实现 → 克制）。
- **自动化边界**：**召回注入是确定性收口 → 自动化**(冷启动自动召回,无需 agent 记得调)。召回结果的取舍("这条历史是否真相关")可由 agent 二次过滤。

### L4 — Lifecycle Governance（治理层）｜补闭环：把收口自动化

- **职责**：让每次会话进入→离开后，系统回到干净、可被召回的状态。
- **现状（半成）**：能**检测**(knowledge-evolution-health freshness、worktree-topology、canonical-main-guard),但不能**自动收口**。
- **四个收口动作（全部从 agent 纪律迁移到事件驱动）**：

  | 收口 | 触发事件 | 动作 | 现状缺口 |
  |---|---|---|---|
  | **G1 worktree 清理** | PR merge / issue close | 提示或自动 `agenticos_worktree_cleanup` | 工具已有,缺事件闭环 → 40 worktree 滞留 |
  | **G2 state 提交卫生** | `agenticos_record`(full)写完 state | 随 `agenticos_save` 提交 state | 20 个未提交 state.yaml |
  | **G3 knowledge 单篇生命周期** | 写/改 knowledge | 每篇带 `owner / valid_until / supersedes / confidence`;health 从"看文件新鲜度"升级为"看单篇状态" | 65 篇 knowledge 无一篇有状态 |
  | **G4 canonical-main 复位/设防** | 进入 main checkout | 落后即提示 pull;真实开发落 main 即告警 | main 144 脏 + 落后 91,且复发 |

- **自动化边界（关键）**：G1/G2/G4 是确定性收口 → **自动化**(hook/轻 workflow)。G3 的"写什么知识/是否过期"是判断 → **agent + 守卫**(系统只提供字段与提示,不替 agent 决定作废)。

---

## 5. Gap 分析与目标达成度

按子目标拆,基于 hermes 实证估算:

| 子目标 | 达成度 | 依据 |
|---|---|---|
| 有序并行 | **~85%** | 规范承重,198 PR 有序落地,无分支踩踏 |
| 跨会话 context 保真 | **~55%** | 生成保真高、召回保真≈0 |
| 知识治理闭环 | **~40%** | 能检测、不能收口 |
| **整体** | **~60%** | 写入闭环近完整,召回整段缺失,治理半成 |

**系统性最大的两个洞**：
1. **召回（L3）整段缺失**——单点最高杠杆,把"写入"变"共享 context"的关键一环。
2. **治理（L4）无自动收口**——hermes 那些可见的乱的直接成因。

---

## 6. 分阶段实施计划（逐个 issue 安排）

> 原则:先止血(P0 治理收口,投入小见效快),再补最大的洞(P1 召回),再增强(P2)。

### P0 — 治理收口（止血）
- **G2** state 提交卫生:record(full) 后把 state 纳入 save 的提交面（或提示）。
- **G1** worktree 清理闭环:PR merge/issue close → 触发/提示 `agenticos_worktree_cleanup`。
- **G4** canonical-main 复位/设防:进入 main 落后即提示 pull;真实文件改动落 main 即告警。
- 关联已在途:#516(绑定持久化)、#517(freshness 接入 switch)、#515(已合,蒸馏死锁)。

### P1 — 召回最小闭环（补最大的洞）
- **L2** Evolution Log 统一模型:扩 `distillation-ledger` 加 `kind/rationale/refs`;decisions/case 变视图。
- **L3** `agenticos_recall` v1（确定性召回:issue 关联 + 路径邻近 + 新鲜度），接入 `issue_bootstrap` 的 `additional_context`。
- **G3** knowledge 单篇生命周期字段 + health 升级到单篇状态。

### P2 — 召回增强 + 人机协同
- **L3 v2** 接 GBrain 语义检索。
- 人机共读:Evolution Log 渲染成人可读的"项目进化时间线"(与机器召回同源)。

---

## 7. 穷尽场景验证

> 用全生命周期的真实场景压这套设计,逐一从**系统性**与**闭环原则**两维度论证。

**判定口径**：
- **系统性** = 该场景是否被统一模型一致覆盖(无孤儿、无特例旁路、各层职责不串味)。
- **闭环** = 该场景走完后,系统是否回到干净且可被下一次召回的状态(capture→distill→recall→govern 不断链)。

| # | 场景 | 系统性 | 闭环 | 覆盖层 / 缺口 |
|---|---|---|---|---|
| A | 新 agent 首次冷启动进项目 | ✅ 统一走 issue_bootstrap | ⚠️→✅(P1) | L3 召回注入后才真正闭环;当前只加载固定全量 |
| B | 同一 issue 跨会话续作 | ✅ | ✅(P0 后) | L1 capture + L2 续写;G2 保证 state 已提交可续 |
| C | 多 agent 并行不同 issue | ✅ worktree 隔离 | ✅ | 现状已闭环(实证 hermes 198 PR) |
| D | PR 合并 → issue 关闭 | ✅ | ❌→✅(P0 G1) | 当前不清 worktree → 滞留;G1 补闭环 |
| E | 会话在 canonical main 做 review/release | ✅ | ⚠️→✅ | #515 已通(worktree 排空 main captures);G4 补护盘 |
| F | 会话异常中断 / MCP 重连 | ✅ | ❌→✅(P0 #516) | 绑定持久化后重连可恢复,capture 已落 sidecar |
| G | 产生知识(写 knowledge/记 case/记 decision) | ⚠️→✅(P1 L2) | ⚠️ | 当前四套碎片;L2 统一后可追溯 |
| H | 知识过期 / 被取代 | ❌→✅(P1 G3) | ❌→✅ | 当前无单篇状态;G3 加 supersedes,召回时降权 |
| I | 新任务需要历史决策 | ❌→✅(P1 L3) | ❌→✅ | 召回是关键;当前断链 |
| J | 发布 release | ✅ | ✅ | 实证 hermes #431/449/453 有序;G1 清发布 worktree |
| K | worktree 滞留回收 | ❌→✅(P0 G1) | ❌→✅ | 治理收口 |
| L | 主分支漂移(落后/脏) | ❌→✅(P0 G4) | ❌→✅ | 治理护盘 |

### 7.1 系统性论证

- **覆盖完整**：12 个场景全部落在统一的 Project Memory 四层模型内,**没有需要旁路特例的场景**——这是系统性的核心证据。L2 把 G(知识生成)的四套碎片收敛后,连最分裂的"决策/案例/知识"也归一。
- **职责不串味**：判断(写什么/作废什么)恒在 L1/L2/G3 的 agent 侧;收口(清理/提交/召回注入/护盘)恒在 L3/L4 的自动化侧。场景 A/D/F/H/I 跨越的正是这条线,且都被切在正确一侧——说明分层是**正交**的,不是拍脑袋。
- **唯一残余张力**：场景 G/H 的"知识"既要 agent 判断又要系统治理。设计用"系统提供字段+提示,agent 决定内容"消解,不越界替 agent 作废。这是克制的体现,也是系统性的边界。

### 7.2 闭环原则论证

- **闭环定义可检验**：每个场景的闭环判据统一为"走完后系统回到干净且可召回态"。当前 ❌ 的场景(D/H/I/K/L)无一例外**断在同两段**:召回(L3)或治理收口(L4)。这反向证明:**只要补齐 L3+L4,12 个场景全部闭环**——闭环缺口收敛到两个根因,不是散落的零碎 bug。
- **无开环死角**：P0+P1 完成后,表中所有 ❌/⚠️ 均转 ✅。没有"设计上无法闭环"的场景——这是闭环原则成立的充分证据。
- **闭环是自洽的**:L1 产出喂 L2,L2 + knowledge 喂 L3,L3 喂下一次 L1 冷启动,L4 保证每段之间的状态干净。**四层首尾相接成环,而非四条并行的开管**。这正是当前(四条开管:写入/检测/各自为政)与目标(一个闭环)的本质差别。

### 7.3 反例压力测试(找设计会破的场景)

| 压力场景 | 设计是否破? | 处置 |
|---|---|---|
| 召回 top-N 把不相关历史塞进冷启动,污染上下文 | 部分风险 | L3 自动注入 + agent 二次过滤;v1 限定确定性信号(issue/路径)降低噪声;宁少勿滥(N 小) |
| Evolution Log 无限膨胀 | 风险 | 复用 ledger 既有 `superseded/ignored` 状态做软删除 + 召回降权;不做物理清理(克制) |
| 自动清理 worktree 误删未推送的本地工作 | 风险 | G1 只在"分支已 merge 到 origin/main 或对应 PR 已 closed"且工作树 clean 时清理;脏 worktree 永不自动清(保留 hermes `dirty-backup` 这类保护语义) |
| G4 自动 pull main 触发冲突 | 风险 | G4 只**提示**不自动 pull;真实开发落 main 只**告警**不阻断(canonical-main-guard 已挡 save 提交,working-tree 写入提示即可) |
| 语义召回(P2)依赖 GBrain 不可用 | 风险 | L3 v1 的确定性召回是 fallback,GBrain 是增强非依赖(克制:不把核心能力压在外部服务上) |

**结论**：4 个会破的压力场景全部有克制的处置(宁少勿滥 / 软删除 / 只在安全前提清理 / 只提示不强制 / 确定性 fallback)。**没有"设计层面无解"的反例**——系统性与闭环在压力下仍成立。

---

## 8. 非目标（克制声明）

明确**不做**,以防过度设计:
- 不建通用 workflow 编排引擎——只做事件驱动的确定性收口 hook。
- 不在 P1 上向量数据库——召回 v1 用确定性信号,GBrain 留 P2 且为增强非依赖。
- 不替 agent 自动作废知识——系统只提供生命周期字段与提示。
- 不新建第五套存储——Evolution Log 复用 distillation-ledger 承载。
- 不强制 pull / 不强删 worktree——治理收口默认"提示优先,仅在可证安全时自动"。

---

## 9. 下一步

按 §6 的 P0→P2 逐个开 issue 实现。P0 三项(G1/G2/G4)+ 在途(#515 已合 / #516 / #517)先落地止血,再进 P1 召回最小闭环。
