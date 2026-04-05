# 待办类型 — OA 审批流 vs ITSM 工单

## 概述

360Teams 审批模块处理两类待办:

| 类型 | 来源 | 操作 |
|------|------|------|
| OA 审批流 | 审批系统 | 批准 / 退回 / 转发 |
| ITSM 工单 | 工单系统 | 同意 / 驳回 / 指派 |

## 类型识别方法

### 方法 1: 点击后检测按钮组

进入详情页后，检查可用的按钮:

```javascript
var btns = document.querySelectorAll('button');
var text = Array.from(btns).map(b => b.textContent.trim()).join(',');
// "批准,退回,转发" → OA
// "同意,驳回,指派" → ITSM
```

### 方法 2: 检测 source 字段

tempData 中的 `source` 字段:

```javascript
var item = tempData[idx - 1];
// source === 1 → OA
// source === 2 → ITSM (推测)
```

### 方法 3: 检测 taskSubject vs title

```javascript
var item = tempData[idx - 1];
if (item.taskSubject) { /* 通常是 OA */ }
if (item.title && !item.taskSubject) { /* 可能是工单 */ }
```

## 数据结构对比

### OA 审批流 (推测结构)

```javascript
{
  taskSubject: "团建报销 - 张三",    // 审批标题
  status: 1,                          // 1=待审批, 2=已批准, 3=已退回
  source: 1,                          // OA来源标记
  arrivalTime: "2026-03-31 10:00:00", // 到达时间
  initiator: "张三",                   // 发起人
  flowType: "报销审批"                // 审批类型
}
```

### ITSM 工单 (推测结构)

```javascript
{
  title: "服务器磁盘空间不足",         // 工单标题
  status: "open",                      // open/closed/assigned
  source: 2,                           // ITSM来源标记
  priority: "high",                    // 优先级
  assignee: "李四",                    // 当前指派人
  createdAt: "2026-03-30 09:00:00"
}
```

## 按钮组详情

### OA 审批流按钮

| 按钮 | 说明 | 备注 |
|------|------|------|
| 批准 | 同意当前审批节点 | 需要填写意见(可选) |
| 退回 | 退回给上一个节点 | 通常需要填写退回原因 |
| 转发 | 转发给其他人 | 需要搜索选择人员 |

### ITSM 工单按钮

| 按钮 | 说明 | 备注 |
|------|------|------|
| 同意 | 同意当前处理方案 | 可添加备注 |
| 驳回 | 驳回给处理人 | 需要填写驳回原因 |
| 指派 | 指派给其他人 | 需要搜索选择人员 |

## 确认弹窗

执行操作后可能出现系统确认 dialog:

```javascript
// 检测确认弹窗
var dialog = await page.evaluate(
  "(function() { " +
    "var modal = document.querySelector('.ant-modal, .el-dialog, [role=\"dialog\"]'); " +
    "if (!modal) return null; " +
    "return modal.textContent.slice(0, 100); " +
  "})()"
);
```

## 意见填写

部分操作需要填写意见:

```javascript
var commentExpr = "(function() { " +
  "var textarea = document.querySelector('textarea[name=\"comment\"], .comment-input, textarea'); " +
  "if (textarea) { textarea.value = '" + commentText + "'; textarea.dispatchEvent(new Event('input')); return 'filled'; } " +
  "return 'no-comment-input'; " +
"})()";
```

## 超时检测

待办项可能因等待时间过长而超时(橙色/红色标识):

```javascript
var overdue = item.overdue || false;
var waitTime = item.waitTime || ""; // e.g., "5h39m"
```

超时待办在 list 输出中用 ⚠️ 前缀标识。
