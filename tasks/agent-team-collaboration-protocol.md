# Agent Team 评审规范

> 本规范定义了 Agent Team 进行方案评审时的标准流程。

## 核心原则

**通过文件传递上下文，避免对话丢失关键信息。**

## 评审流程

```
Step 1: Manager 生成任务上下文文件
        ↓
Step 2: Manager 传递文件路径给多个 sub-agent
        ↓
Step 3: sub-agent 独立读取文件，形成 MD 评审报告
        ↓
Step 4: sub-agent 返回 MD 文件路径给 Manager
        ↓
Step 5: Manager 读取所有 MD，汇总论证，形成综合方案
```

## 详细步骤

### Step 1: 生成任务上下文文件

Manager 收集以下内容并写入文件：

- 问题描述
- 当前状态
- 设计意图/约束
- 相关代码引用
- 参考资料链接

文件命名规范：`review-context-{timestamp}.md`
文件位置：`项目/.agent-workspace/reviews/`

### Step 2: 传递文件路径给 sub-agent

Manager 启动多个 sub-agent，每个接收：
- 任务描述
- 上下文文件路径

示例：
```
agent-organizer: 分析问题的分类和边界
architect-reviewer: 提供架构层面的建议
product-manager: 分析产品需求和优先级
devops-engineer: 分析运维和自动化方案
```

### Step 3: sub-agent 读取文件并形成评审报告

sub-agent 必须：
1. 读取完整的上下文文件
2. 基于文件内容进行分析
3. 生成结构化的 MD 评审报告
4. 将报告写入指定路径

报告命名规范：`review-{agent-type}-{timestamp}.md`

### Step 4: 返回 MD 文件路径

sub-agent 返回：
- 报告文件路径
- 报告摘要（一句话）

### Step 5: Manager 汇总论证

Manager 读取所有报告：
1. 识别共识和分歧
2. 分析各方案的优劣
3. 形成综合方案
4. 记录决策理由

## 文件结构

```
.agent-workspace/
  └── reviews/
        ├── review-context-{timestamp}.md    # 任务上下文
        ├── review-agent-organizer-{timestamp}.md
        ├── review-architect-reviewer-{timestamp}.md
        ├── review-product-manager-{timestamp}.md
        └── review-devops-engineer-{timestamp}.md
```

## 质量要求

1. **完整性**：上下文文件必须包含所有必要信息
2. **独立性**：每个 sub-agent 基于相同文件独立分析
3. **可追溯**：所有分析结果都有文件记录
4. **一致性**：报告格式统一，便于汇总

## 适用场景

- 功能设计方案评审
- 架构调整方案评审
- 问题根因分析
- 技术选型评估

## 不适用场景

- 简单问题（几句话能说清楚的不需要多 agent）
- 时间敏感（需要快速决策的场景）
- 单人评审（直接评审即可）