# CDP Patterns — 360Teams Chrome DevTools Protocol

## Overview

360Teams runs as an Electron app with Chrome DevTools Protocol (CDP) accessible on port 9234. The webview inside Electron is webview-compatible, not a standard browser — this has important implications for evaluated JavaScript.

## Connecting

```javascript
const CDP = require('chrome-remote-interface');
const client = await CDP({ host: 'localhost', port: 9234, target: targetId });
const { Runtime, Page } = client;
await Runtime.enable();
await Page.enable();
```

Use `miniapp-cdp.js`'s `findMiniappTarget(domain)` to locate the correct CDP target, then wrap with `withApprovalPage(fn)` or `withTodoPage(fn)`.

## Critical: String-Only Evaluated Code

**Webview V8 has stricter parsing than Node.js V8.** Only use:
- `var` (no `const`, no `let`)
- Regular `function` declarations (no arrow functions `=>`)
- String concatenation (no template literals `` ` ` ``)
- String literals for property access

### Why

When you write:
```javascript
page.evaluate((x) => x.foo, arg)  // WRONG — function object
```

CDP serializes the function to JSON, and the webview's V8 rejects the arrow function syntax with:
```
Invalid parameters (Failed to deserialize params.expression - BINDINGS: mandatory field missing at position 36)
```

### Correct Pattern

```javascript
// Wrap everything in an IIFE string
var result = await page.evaluate(
  "(function() { " +
    "var x = " + someValue + "; " +
    "return x.foo; " +
  "})()"
);

// For strings, escape and use JSON.stringify
var name = "O'Brien";
var result = await page.evaluate(
  "(function() { " +
    "return findByName('" + name.replace(/'/g, "\\'") + "'); " +
  "})()"
);
```

## bracket Notation for Special Properties

Dollar-prefixed and other special properties must use bracket notation inside evaluated strings:

```javascript
// Inside page.evaluate() string:
"var d = vm['$data'];"
"var vm = el.__vue__;"
"var td = d['tempData'];"
```

## Accessing Vue Component Data

```javascript
// Find all elements with Vue
var all = document.querySelectorAll('*');
for (var i = 0; i < all.length; i++) {
  var el = all[i];
  if (!el.__vue__) continue;
  var vm = el.__vue__;
  var d = vm['$data'];
  if (!d) continue;
  // ...
}
```

## Key CDP Functions

### Runtime.evaluate

```javascript
await Runtime.evaluate({
  expression: "<string>",
  awaitPromise: true,
  returnByValue: true,
})
// Returns { result: { value: <returnValue> }, exceptionDetails: null }
```

### Page.navigate

```javascript
await Page.navigate({ url: "https://..." });
// Or via JS:
await page.evaluate("(function() { window.location.href = '...'; })()");
```

## Common Patterns

### Sleep/Hibernate

```javascript
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await sleep(3000); // Wait for navigation
```

### Wait for Condition

```javascript
async function waitFor(fn, timeout = 8000) {
  var deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    var result = await fn();
    if (result) return result;
    await sleep(500);
  }
  return null;
}
```

### Click Element by Index

```javascript
await page.evaluate(
  "(function() { " +
    "var items = document.querySelectorAll('.item'); " +
    "if (items[" + (index - 1) + "]) items[" + (index - 1) + "].click(); " +
  "})()"
);
```

## Debugging CDP

```javascript
// Add before evaluate to see all CDP messages
client.on('event', console.log);
```
