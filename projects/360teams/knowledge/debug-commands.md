# Debug Commands — CDP Exploration Scripts

## Quick Diagnostic

```javascript
// Save as /tmp/test_diag.js
const CDP = require('chrome-remote-interface');
const { findMiniappTarget } = require('~/.opencli/clis/360teams/miniapp-cdp.js');
const { ensureDebugMode } = require('~/.opencli/clis/360teams/launcher.js');

(async () => {
  await ensureDebugMode();
  const target = await findMiniappTarget('approval.sk.360shuke.com');
  if (!target) { console.log('No target'); process.exit(1); }
  const client = await CDP({ host: 'localhost', port: 9234, target: target.id });
  const { Runtime } = client;
  await Runtime.enable();

  // Navigate to 待办
  await Runtime.evaluate({
    expression: "(function() { window.location.href = 'https://approval.sk.360shuke.com/hub?status=toDealt'; })()",
    awaitPromise: true, returnByValue: true
  });
  await new Promise(r => setTimeout(r, 5000));

  // Diagnostic
  const r = await Runtime.evaluate({
    expression: "(function() { " +
      "var ws = document.querySelectorAll('.hub-wrap'); " +
      "for (var i = 0; i < ws.length; i++) { " +
        "var vm = ws[i].__vue__; if (!vm) continue; " +
        "var d = vm['$data']; if (!d) continue; " +
        "return 'tempData:' + (d['tempData'] ? d['tempData'].length : 0) + " +
        "' pageTotal:' + d['pageTotal'] + ' url:' + window.location.href; " +
      "} " +
      "return 'no-hub-wrap'; " +
    "})()",
    awaitPromise: true, returnByValue: true
  });
  console.log('Diag:', r.result.value);
  await client.close();
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
```

Run: `node /tmp/test_diag.js`

## Full Vue Explorer

Finds all Vue components with list-like data:

```javascript
// Save as /tmp/test_nav6.js
const CDP = require('chrome-remote-interface');
const { findMiniappTarget } = require('~/.opencli/clis/360teams/miniapp-cdp.js');
const { ensureDebugMode } = require('~/.opencli/clis/360teams/launcher.js');

(async () => {
  await ensureDebugMode();
  const target = await findMiniappTarget('approval.sk.360shuke.com');
  const client = await CDP({ host: 'localhost', port: 9234, target: target.id });
  const { Runtime } = client;
  await Runtime.enable();

  await Runtime.evaluate({
    expression: "(function() { window.location.href = 'https://approval.sk.360shuke.com/hub?status=toDealt'; })()",
    awaitPromise: true, returnByValue: true
  });
  await new Promise(r => setTimeout(r, 5000));

  const r = await Runtime.evaluate({
    expression: "(function() { " +
      "var out = []; " +
      "var all = document.querySelectorAll('*'); " +
      "for (var i = 0; i < all.length; i++) { " +
        "var el = all[i]; if (!el.__vue__) continue; " +
        "var vm = el.__vue__; var d = vm['$data']; if (!d) continue; " +
        "var keys = Object.keys(d).join(','); " +
        "if (d['tempData'] && d['tempData'].length) keys += ' tempData:' + d['tempData'].length; " +
        "if (d['dataList'] && d['dataList'].length) keys += ' dataList:' + d['dataList'].length; " +
        "if (d['todoList'] && d['todoList'].length) keys += ' todoList:' + d['todoList'].length; " +
        "if (d['list'] && d['list'].length) keys += ' list:' + d['list'].length; " +
        "var cn = typeof el.className === 'string' ? el.className.slice(0, 40) : ''; " +
        "out.push(cn + ' | ' + keys); " +
      "} " +
      "return out.join('\\n'); " +
    "})()",
    awaitPromise: true, returnByValue: true
  });
  console.log('All Vue on page:\n', r.result.value);
  await client.close();
})().catch(e => { console.error(e.message); process.exit(1); });
```

## hub-wrap Deep Dive

Check if hub-wrap has proper tempData:

```javascript
"(function() { " +
  "var wraps = document.querySelectorAll('.hub-wrap'); " +
  "for (var i = 0; i < wraps.length; i++) { " +
    "var el = wraps[i]; if (!el.__vue__) continue; " +
    "var vm = el.__vue__; var d = vm['$data']; if (!d) continue; " +
    "var td = d['tempData']; " +
    "if (!td || !td.length) return 'tempData empty. pageTotal=' + d['pageTotal']; " +
    "var first = td[0]; " +
    "var subj = first.taskSubject || first.title; " +
    "if (!subj) return 'tempData:' + td.length + ' but no subject. Keys:' + Object.keys(first).join(','); " +
    "return 'OK: tempData:' + td.length; " +
  "} " +
  "return 'no-hub-wrap'; " +
"})()"
```

## Find iframe URL

```javascript
"(function() { " +
  "var iframes = document.querySelectorAll('iframe'); " +
  "for (var i = 0; i < iframes.length; i++) { " +
    "var f = iframes[i]; var src = f.src || ''; " +
    "if (src.indexOf('approval') !== -1 || src.indexOf('taskId') !== -1) return 'iframe:' + src.slice(0, 120); " +
  "} " +
  "var f2 = document.querySelector('iframe[name=\"detail\"]'); " +
  "if (f2) return 'detail iframe:' + (f2.src || '').slice(0, 80); " +
  "return 'no-iframe'; " +
"})()"
```

## CDP Error Patterns

### "BINDINGS: mandatory field missing at position 36"

Cause: Passing a function object (not string) to `page.evaluate()`. Fix: inline the function as a string.

### "Invalid or unexpected token" inside evaluate

Cause: Arrow functions (`=>`) or template literals inside evaluated string. Fix: use `var` and regular `function`, string concatenation only.

## Launch 360Teams in Debug Mode

```javascript
const { ensureDebugMode } = require('~/.opencli/clis/360teams/launcher.js');
await ensureDebugMode(); // Launches Chrome with debugging port 9234
```

## Check if 360Teams is in Debug Mode

```javascript
const { isDebugMode } = require('~/.opencli/clis/360teams/launcher.js');
const ready = await isDebugMode(); // Returns true if Chrome is listening on 9234
```
