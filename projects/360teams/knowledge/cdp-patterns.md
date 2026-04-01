# CDP Patterns — 360Teams Chrome DevTools Protocol

> 适用版本：Electron 内嵌 webview（Chrome DevTools Protocol 可通过 localhost:9234 访问）
> 相关 CLI：`clis/360teams/` 目录下的各模块

## 连接方式

```javascript
import { withElectronPage } from './cdp.js';

// 推荐模式（cdp.js 已封装）
const result = await withElectronPage(async (page) => {
  // page 等同于 CDP Runtime.evaluate 上下文
});
```

`cdp.js` 中的 `withElectronPage(fn)` 会自动完成 CDP 连接、target 定位、Page/Runtime 启用。

## 关键约束：webview V8 仅接受字符串形式的代码

**Electron webview 的 V8 上下文比 Node.js V8 更严格。`page.evaluate()` 传入的函数如果包含以下语法将报错：**

| 禁止写法 | 正确写法 |
|---------|---------|
| `const` / `let` | `var` |
| 箭头函数 `=>` | 常规 `function` 声明 |
| 模板字符串 <code>` `</code> | 字符串拼接 |
| 解构赋值 `{ foo }` | 逐字段访问 |

典型报错：
```
Invalid parameters (Failed to deserialize params.expression - BINDINGS: mandatory field missing at position 36)
```

### 正确写法示例

```javascript
// ✅ 正确：IIFE 字符串，var + function + 字符串拼接
var result = await page.evaluate(
  "(function() { " +
    "var items = document.querySelectorAll('.item'); " +
    "if (items[" + (index - 1) + "]) items[" + (index - 1) + "].click(); " +
    "return items.length; " +
  "})()"
);

// ✅ 正确：含字符串参数时转义
var name = personName.replace(/'/g, "\\'");
var el = await page.evaluate(
  "(function() { " +
    "var els = document.querySelectorAll('[data-name]'); " +
    "for (var i = 0; i < els.length; i++) { " +
      "if (els[i].getAttribute('data-name') === '" + name + "') return els[i]; " +
    "} " +
    "return null; " +
  "})()"
);

// ❌ 错误：箭头函数、模板字符串、const/let
await page.evaluate((x) => x.foo);       // 报错
await page.evaluate(`return ${value}`);  // 报错
const result = await page.evaluate("..."); // 报错
```

## 特殊属性访问

Vue 组件属性（`$data`、`__vue__`）以及含特殊字符的属性必须用括号表示法：

```javascript
// Inside evaluate string:
"var d = vm['$data'];"
"var vm = el.__vue__;"
"var td = d['tempData'];"
```

## 访问 Vue 组件内部数据

```javascript
await page.evaluate(
  "(function() { " +
    "var all = document.querySelectorAll('*'); " +
    "var results = []; " +
    "for (var i = 0; i < all.length; i++) { " +
      "var el = all[i]; " +
      "if (!el.__vue__) continue; " +
      "var vm = el.__vue__; " +
      "var d = vm['$data']; " +
      "if (!d) continue; " +
      "var td = d['tempData'] || d['todoList'] || d['list']; " +
      "if (td && td.length > 0) results.push({ type: 'tempData', count: td.length }); " +
    "} " +
    "return results; " +
  "})()"
);
```

## 等待条件

```javascript
// 轮询直到条件满足或超时
async function waitFor(page, expression, timeoutMs) {
  var deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    var result = await page.evaluate(expression);
    if (result) return result;
    await new Promise(function(r) { setTimeout(r, 300); });
  }
  return null;
}

// 使用示例
var panel = await waitFor(page,
  "(function() { " +
    "var el = document.querySelector('.detail-panel'); " +
    "return el ? 'visible' : null; " +
  "})()",
  5000
);
```

## 按索引点击元素

```javascript
await page.evaluate(
  "(function() { " +
    "var items = document.querySelectorAll('.todo-item'); " +
    "var target = items[" + (id - 1) + "]; " +
    "if (target) target.click(); " +
    "return target ? 'ok' : 'not-found'; " +
  "})()"
);
```

## 调试技巧

```javascript
// 监听所有 CDP 事件
client.on('event', console.log);

// 打印 Runtime.evaluate 的原始返回值
var { result, exceptionDetails } = await Runtime.evaluate({
  expression: "document.title",
  returnByValue: true,
});
console.log(result.value, exceptionDetails);
```

## CDP 连接代码示例（raw）

```javascript
import CDP from 'chrome-remote-interface';
import { ensureDebugMode } from './launcher.js';

const HOST = process.env.TEAMS_CDP_HOST || 'localhost';
const PORT = parseInt(process.env.TEAMS_CDP_PORT || '9234', 10);

async function cdpEvaluate(expression, client) {
  const { Runtime } = client;
  await Runtime.enable();
  const { result, exceptionDetails } = await Runtime.evaluate({
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  }
  return result.value;
}
```
