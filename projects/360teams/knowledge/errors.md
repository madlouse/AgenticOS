# 错误处理手册

## CDP 错误

### "BINDINGS: mandatory field missing at position 36"

**原因**: 向 `page.evaluate()` 传入了函数对象而非字符串。

**错误代码**:
```javascript
page.evaluate(function(x) { return x.foo; }, arg);  // 错误!
```

**修复**: 将函数内联为字符串:
```javascript
page.evaluate(
  "(function() { " +
    "var x = " + JSON.stringify(arg) + "; " +
    "return x.foo; " +
  "})()"
);
```

### "Invalid or unexpected token" (inside evaluated string)

**原因**: 在 evaluated string 中使用了 webview 不支持的语法。

**不支持的语法**:
- 箭头函数: `(x) => x.foo`
- 模板 literals: `` `hello ${name}` ``
- `const` / `let` (部分情况)

**修复**: 只使用 `var` 和 `function`, 用字符串拼接代替模板 literals:
```javascript
// 错误
"(function() { const x = foo; return `result: ${x}`; })()"

// 正确
"(function() { var x = foo; return 'result: ' + x; })()"
```

### "Evaluation failed" — element not found

**原因**: 尝试操作的元素不存在于当前页面状态。

**排查步骤**:
1. 确认页面已完全加载 (`sleep` 足够长)
2. 确认 URL 是正确的
3. 使用 `test_nav6.js` 探索当前页面的 Vue 组件

## 导航错误

### 页面跳转到申请页而非待办页

**原因**: webview 启动后在 "申请" (initiate) tab，而非 "待办" tab。

**症状**: `getTodoList` 返回 null，或 `tempData` 为空。

**修复**: 在执行任何操作前先强制导航:
```javascript
await page.evaluate(
  "(function() { window.location.href = 'https://approval.sk.360shuke.com/hub?status=toDealt'; })()"
);
await sleep(5000);
```

### 导航后 Vue 组件未加载

**原因**: 页面跳转后 Vue 需要时间渲染。

**修复**: 使用 `waitForList` 函数等待:
```javascript
var listReady = await waitForList(page, 10000);
if (!listReady) throw new Error("待办列表加载超时");
```

## 数据错误

### getTodoList 返回 null 但页面显示有数据

**原因**: `getTodoList` 找到了错误的组件(如 `.initiate-wrap` 的 `dataList`)。

**修复**: `getTodoList` 已优先检查 `.hub-wrap` 的 `tempData`，并跳过 `initiate-wrap`。如仍返回 null, 可能是:

1. 页面未完全加载 — 增加 sleep 时间
2. Vue 组件的 class 名不同 — 使用 `test_nav6.js` 重新探索

### dataList 误当 tempData

**原因**: `.initiate-wrap` 包含 `dataList` (申请分类模板，9项)，不是待办数据。

**区分方法**:
- `dataList[0]` 通常有 `categoryName` / `iconUrl` 等字段
- `tempData[0]` 有 `taskSubject` / `title` / `status` 等审批相关字段

## 操作错误

### 点击待办项后 iframe 为空

**原因**: 点击后详情页 iframe 需要额外加载时间。

**修复**: `clickTodoItem` 中已内置 12 秒等待。如仍为空, 可手动增加:
```javascript
await sleep(3000);
var iframeInfo = await page.evaluate("...");
```

### 操作后确认弹窗未出现

**原因**: 某些操作不弹出确认，直接执行。

**修复**: 在 `performAction` 中先检测是否有确认弹窗，如有则 click 确认按钮。

### 意见填写失败

**原因**: 页面结构变化导致找不到 textarea。

**修复**: 使用多种 selector 尝试:
```javascript
var selectors = [
  'textarea[name="comment"]',
  'textarea[placeholder*="意见"]',
  '.comment-input textarea',
  'textarea'
];
```

## 超时错误

### waitForList 超时 (default 8s)

**排查**: 使用 `test_diag.js` 确认:
1. URL 是否为 `hub?status=toDealt`
2. `tempData` 是否有数据
3. Vue 组件是否挂载

### CDP 连接超时

**原因**: 360Teams 未开启 debug 模式，或端口 9234 被占用。

**修复**:
```javascript
const { ensureDebugMode } = require('~/.opencli/clis/360teams/launcher.js');
await ensureDebugMode(); // 自动启动/唤醒 Chrome debug mode
```

## 已知限制

1. **暂无可用待办**: 当前账号下待办列表为空时，所有操作返回"暂无待办"
2. **两种类型共存**: OA 和工单的按钮组不同，需分别处理
3. **iframe 跨域**: 详情页 iframe 可能无法直接从外部读取内容
4. **超时标识**: 仅客户端可计算等待时间，服务端不返回超时字段
