/**
 * 360Teams Todo CLI
 *
 * Handles approval-style todos from the 审批 section of 日程会议.
 * Supports two todo categories:
 *   - OA   : has "批准" / "退回" buttons
 *   - 工单 : has "同意" / "驳回" buttons
 *
 * Commands:
 *   opencli 360teams todo list    [--limit N]
 *   opencli 360teams todo view    --id N
 *   opencli 360teams todo approve --id N [--comment TEXT]
 *   opencli 360teams todo reject  --id N [--comment TEXT]
 *   opencli 360teams todo forward --id N  --to PERSON [--comment TEXT]
 *   opencli 360teams todo assign  --id N  --to PERSON [--comment TEXT]
 *
 * NOTE: All page.evaluate() strings use var + function (no const/let/arrow functions)
 * because the 360Teams Electron webview V8 context rejects modern syntax.
 * See knowledge/cdp-patterns.md for details.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { withElectronPage } from './cdp.js';

// ─── Utilities ────────────────────────────────────────────────────────────────

export function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

/**
 * Poll `expression` on `page` until it returns a truthy value or timeout.
 */
async function waitFor(page, expression, timeoutMs) {
  if (timeoutMs === undefined) timeoutMs = 6000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await page.evaluate(expression);
    if (result) return result;
    await sleep(300);
  }
  return null;
}

/**
 * Wait for the detail panel to become visible after clicking a todo item.
 * Returns 'visible' when found, null on timeout.
 */
async function waitForDetailPanel(page) {
  return await waitFor(page,
    "(function() {" +
    "return document.querySelector('.approval-detail, .todo-detail, .el-drawer__body, [class*=\"detail\"]') ? 'visible' : null;" +
    "})()",
    5000
  );
}

/**
 * Evaluate `expression` which must return {x, y} | null, then dispatch a
 * real mouse click at those viewport coordinates.
 */
async function clickByBounds(page, expression) {
  const coords = await page.evaluate(expression);
  if (!coords) return false;
  await page.dispatchMouseEvent(coords.x, coords.y);
  return true;
}

// ─── Navigation ───────────────────────────────────────────────────────────────

/**
 * Navigate to the 待办 tab inside 日程会议 → 审批.
 *
 * Steps:
 *  1. Click 日程会议 sidenav item
 *  2. Wait for sub-menu expansion, then click 审批
 *  3. Click 待办 tab
 *  4. Wait for the list to load
 */
async function navigateToTodo(page) {
  // 1. Click 日程会议
  await page.evaluate(
    "(function() {" +
    "var items = document.querySelectorAll('.sidenav-item');" +
    "for (var i = 0; i < items.length; i++) {" +
    "  if (items[i].innerText && items[i].innerText.trim() === '日程会议') {" +
    "    items[i].click(); return 'clicked'; }" +
    "}" +
    "return 'not found'; })()"
  );
  await sleep(2000);

  // 2. Click 审批 sub-menu item
  const approvalResult = await page.evaluate(
    "(function() {" +
    "var all = document.querySelectorAll('.sidenav-item, .sidenav-submenu-item, div, span, button, a, li');" +
    "for (var i = 0; i < all.length; i++) {" +
    "  var text = (all[i].innerText || '').trim();" +
    "  if (text === '审批') { all[i].click(); return 'clicked'; }" +
    "}" +
    "return 'not found'; })()"
  );
  await sleep(2500);

  // 3. Click 待办 tab
  const todoTabResult = await page.evaluate(
    "(function() {" +
    "var all = document.querySelectorAll('.tab-item, .el-tabs__item, [role=\"tab\"], div, span');" +
    "for (var i = 0; i < all.length; i++) {" +
    "  var text = (all[i].innerText || '').trim();" +
    "  if (text === '待办') { all[i].click(); return 'clicked'; }" +
    "}" +
    "return 'not found'; })()"
  );
  await sleep(2000);

  return { approvalResult, todoTabResult };
}

// ─── List Parser ──────────────────────────────────────────────────────────────

/**
 * Extract todo items from the left-side list panel.
 *
 * We attempt three strategies:
 *  A) Vue component data extraction (accurate, structured)
 *  B) DOM-based extraction (fallback)
 *  C) innerText rough parsing (last resort)
 *
 * Each item shape:
 *  {
 *    index:    number,   // 1-based
 *    title:    string,
 *    status:   string,
 *    from:     string,
 *    arrived:  string,
 *    waiting:  string,
 *    overtime: boolean,
 *  }
 */
async function parseTodoList(page) {
  // Strategy A: try to pull structured data from Vue component
  const vueData = await page.evaluate(
    "(function() {" +
    "try {" +
    "  var allEls = document.querySelectorAll('*');" +
    "  var comp = null;" +
    "  for (var i = 0; i < allEls.length; i++) {" +
    "    var v = allEls[i].__vue__;" +
    "    if (!v) continue;" +
    "    var d = v.$data || {};" +
    "    if (Array.isArray(d.todoList) && d.todoList.length > 0) { comp = v; break; }" +
    "    if (Array.isArray(d.pendingList) && d.pendingList.length > 0) { comp = v; break; }" +
    "    if (Array.isArray(d.approvalList) && d.approvalList.length > 0) { comp = v; break; }" +
    "    if (Array.isArray(d.list) && d.list.length > 0 && d.list[0] && d.list[0].title) { comp = v; break; }" +
    "  }" +
    "  if (!comp) return null;" +
    "  var raw = comp.$data.todoList || comp.$data.pendingList || comp.$data.approvalList || comp.$data.list;" +
    "  return raw.map(function(item, idx) {" +
    "    return {" +
    "      index: idx + 1," +
    "      title: item.title || item.name || item.flowName || item.processName || ''," +
    "      status: item.status || item.statusName || item.state || ''," +
    "      from: item.createUserName || item.sponsorName || item.initiator || item.from || ''," +
    "      arrived: item.arriveTime || item.createTime || item.startTime || ''," +
    "      waiting: item.waitTime || item.duration || ''," +
    "      overtime: !!(item.overtime || item.isOvertime || item.timeout)" +
    "    };" +
    "  });" +
    "} catch(e) { return null; }" +
    "})()"
  );

  if (vueData && vueData.length > 0) {
    return vueData;
  }

  // Strategy B: DOM-based extraction — read each list item element
  const domData = await page.evaluate(
    "(function() {" +
    "try {" +
    "  var containers = [" +
    "    '.approval-list .list-item'," +
    "    '.todo-list .list-item'," +
    "    '.pending-list .list-item'," +
    "    '.approval-item'," +
    "    '.todo-item'," +
    "    '[class*=\"todo\"] [class*=\"item\"]'," +
    "    '[class*=\"approval\"] [class*=\"item\"]'," +
    "    '[class*=\"pending\"] [class*=\"item\"]'" +
    "  ];" +
    "  var items = [];" +
    "  for (var ci = 0; ci < containers.length; ci++) {" +
    "    items = Array.from(document.querySelectorAll(containers[ci]));" +
    "    if (items.length > 0) break;" +
    "  }" +
    "  if (items.length === 0) return null;" +
    "  return items.map(function(el, idx) {" +
    "    var text = (el.innerText || '').trim();" +
    "    var lines = text.split('\\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });" +
    "    var hasOvertime = !!(el.querySelector('[class*=\"overtime\"], [class*=\"timeout\"], [class*=\"warn\"], [class*=\"danger\"]') ||" +
    "      el.querySelector('[style*=\"color: red\"], [style*=\"color: orange\"]'));" +
    "    var statusLine = '';" +
    "    for (var li = 0; li < lines.length; li++) {" +
    "      if (lines[li].indexOf('审批中') >= 0 || lines[li].indexOf('待处理') >= 0 || lines[li].indexOf('审核中') >= 0) {" +
    "        statusLine = lines[li]; break;" +
    "      }" +
    "    }" +
    "    var fromLine = lines.length > 1 ? lines[1] : '';" +
    "    return {" +
    "      index: idx + 1," +
    "      title: lines[0] || ''," +
    "      status: statusLine," +
    "      from: fromLine," +
    "      arrived: ''," +
    "      waiting: ''," +
    "      overtime: hasOvertime" +
    "    };" +
    "  });" +
    "} catch(e) { return null; }" +
    "})()"
  );

  if (domData && domData.length > 0) {
    return domData;
  }

  // Strategy C: innerText-based rough parsing — last resort
  const rawText = await page.evaluate('document.body.innerText');
  return parseTodoFromText(rawText);
}

/**
 * Very rough innerText-based todo list extractor (Strategy C fallback).
 */
export function parseTodoFromText(text) {
  if (!text) return [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const results = [];

  // Heuristic: title lines appear before status lines like "审批中"
  const statusKeywords = ['审批中', '待处理', '审核中', '待审批'];
  const noisePatterns = [
    /^消息$/, /^待办$/, /^T5T$/, /^工作台$/, /^云文档$/, /^日程会议$/,
    /^我的团队$/, /^AI工作台$/, /^更多$/, /^审批$/, /^已办$/, /^发起$/,
    /^周日|周一|周二|周三|周四|周五|周六$/,
    /^\d{4}年/, /^\d{1,2}:\d{2}$/,
  ];
  const isNoise = (l) => noisePatterns.some(p => p.test(l));

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const nextLine = lines[i + 1] || '';
    if (!isNoise(line) && statusKeywords.some(k => nextLine.includes(k))) {
      const item = {
        index: results.length + 1,
        title: line,
        status: nextLine,
        from: lines[i + 2] || '',
        arrived: lines[i + 3] || '',
        waiting: lines[i + 4] || '',
        overtime: false,
      };
      results.push(item);
      i += 5;
    } else {
      i++;
    }
  }

  return results;
}

// ─── Detail Extractor ─────────────────────────────────────────────────────────

/**
 * After clicking a todo item, extract detail information and detect the todo type.
 * Returns { type: 'OA' | '工单' | 'unknown', buttons: string[], lines: string[] }
 */
async function extractTodoDetail(page) {
  return await page.evaluate(
    "(function() {" +
    "try {" +
    "  var panelSelectors = [" +
    "    '.approval-detail', '.todo-detail', '.el-drawer__body'," +
    "    '.detail-panel', '[class*=\"detail\"]', '.main-content'" +
    "  ];" +
    "  var panel = null;" +
    "  for (var si = 0; si < panelSelectors.length; si++) {" +
    "    panel = document.querySelector(panelSelectors[si]);" +
    "    if (panel) break;" +
    "  }" +
    "  if (!panel) panel = document.body;" +
    "  var rawBtns = Array.from(panel.querySelectorAll('button, .btn, [class*=\"btn\"]'));" +
    "  var buttons = [];" +
    "  for (var bi = 0; bi < rawBtns.length; bi++) {" +
    "    var bt = (rawBtns[bi].innerText || '').trim();" +
    "    if (bt.length > 0 && bt !== '×' && bt !== '✕' && bt !== '关闭') buttons.push(bt);" +
    "  }" +
    "  var type = 'unknown';" +
    "  var hasApprove = buttons.indexOf('批准') >= 0;" +
    "  var hasReject = buttons.indexOf('退回') >= 0;" +
    "  var hasAgree = buttons.indexOf('同意') >= 0;" +
    "  var hasDismiss = buttons.indexOf('驳回') >= 0;" +
    "  if (hasApprove || hasReject) type = 'OA';" +
    "  else if (hasAgree || hasDismiss) type = '工单';" +
    "  var text = (panel.innerText || '').trim();" +
    "  var lines = text.split('\\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });" +
    "  return { type: type, buttons: buttons, lines: lines.slice(0, 30) };" +
    "} catch(e) { return { type: 'unknown', buttons: [], lines: [], error: e.message }; }" +
    "})()"
  );
}

// ─── Item Selector ────────────────────────────────────────────────────────────

const TODO_ITEM_SELECTORS =
  "'.approval-list .list-item'," +
  "'.todo-list .list-item'," +
  "'.pending-list .list-item'," +
  "'.approval-item'," +
  "'.todo-item'," +
  "'[class*=\"todo\"] [class*=\"item\"]'," +
  "'[class*=\"approval\"] [class*=\"item\"]'," +
  "'[class*=\"pending\"] [class*=\"item\"]'";

/**
 * Click the Nth todo item in the left panel (1-based index).
 * Returns true if clicked successfully.
 */
async function clickTodoItem(page, index) {
  const clicked = await page.evaluate(
    "(function(idx) {" +
    "var containers = [" + TODO_ITEM_SELECTORS + "];" +
    "var items = [];" +
    "for (var ci = 0; ci < containers.length; ci++) {" +
    "  items = Array.from(document.querySelectorAll(containers[ci]));" +
    "  if (items.length > 0) break;" +
    "}" +
    "if (items.length === 0 || idx < 1 || idx > items.length) return false;" +
    "var target = items[idx - 1];" +
    "var rect = target.getBoundingClientRect();" +
    "if (rect.width > 0 && rect.height > 0) { target.click(); return true; }" +
    "return false;" +
    "})(" + index + ")"
  );

  if (!clicked) {
    return await clickByBounds(page,
      "(function(idx) {" +
      "var containers = [" + TODO_ITEM_SELECTORS + "];" +
      "var items = [];" +
      "for (var ci = 0; ci < containers.length; ci++) {" +
      "  items = Array.from(document.querySelectorAll(containers[ci]));" +
      "  if (items.length > 0) break;" +
      "}" +
      "if (!items.length || idx < 1 || idx > items.length) return null;" +
      "var rect = items[idx - 1].getBoundingClientRect();" +
      "return rect.width > 0 ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;" +
      "})(" + index + ")"
    );
  }

  return clicked;
}

// ─── Comment Filler ───────────────────────────────────────────────────────────

/**
 * Fill the comment/opinion textarea in the detail panel.
 */
async function fillComment(page, comment) {
  if (!comment) return 'skipped';
  return await page.evaluate(
    "(function(comment) {" +
    "var sels = [" +
    "  '.approval-detail textarea', '.todo-detail textarea'," +
    "  '.el-drawer__body textarea', '[class*=\"detail\"] textarea'," +
    "  'textarea[placeholder*=\"意见\"]', 'textarea[placeholder*=\"备注\"]'," +
    "  'textarea[placeholder*=\"原因\"]', 'textarea[placeholder*=\"说明\"]'," +
    "  'textarea'" +
    "];" +
    "for (var si = 0; si < sels.length; si++) {" +
    "  var ta = document.querySelector(sels[si]);" +
    "  if (ta) {" +
    "    var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;" +
    "    setter.call(ta, comment);" +
    "    ta.dispatchEvent(new Event('input', { bubbles: true }));" +
    "    ta.dispatchEvent(new Event('change', { bubbles: true }));" +
    "    return 'filled';" +
    "  }" +
    "}" +
    "return 'not found';" +
    "})(" + JSON.stringify(comment) + ")"
  );
}

// ─── Action Button Clicker ────────────────────────────────────────────────────

const DETAIL_PANEL_SEL =
  "'.approval-detail, .todo-detail, .el-drawer__body, [class*=\"detail\"]'";

/**
 * Click an action button by its exact text label.
 * Tries direct click first, then mouse event as fallback.
 */
async function clickActionButton(page, labelText) {
  const directClicked = await page.evaluate(
    "(function(label) {" +
    "var panelSels = ['.approval-detail','.todo-detail','.el-drawer__body','[class*=\"detail\"]','body'];" +
    "var panel = null;" +
    "for (var si = 0; si < panelSels.length; si++) {" +
    "  panel = document.querySelector(panelSels[si]);" +
    "  if (panel) break;" +
    "}" +
    "if (!panel) panel = document.body;" +
    "var buttons = panel.querySelectorAll('button, .btn, [class*=\"btn-\"]');" +
    "for (var bi = 0; bi < buttons.length; bi++) {" +
    "  if ((buttons[bi].innerText || '').trim() === label) { buttons[bi].click(); return 'clicked'; }" +
    "}" +
    "return 'not found';" +
    "})(" + JSON.stringify(labelText) + ")"
  );

  if (directClicked === 'clicked') return true;

  return await clickByBounds(page,
    "(function(label) {" +
    "var panel = document.querySelector(" + DETAIL_PANEL_SEL + ") || document.body;" +
    "var buttons = panel.querySelectorAll('button, .btn, [class*=\"btn-\"]');" +
    "for (var bi = 0; bi < buttons.length; bi++) {" +
    "  if ((buttons[bi].innerText || '').trim() === label) {" +
    "    var r = buttons[bi].getBoundingClientRect();" +
    "    if (r.width > 0 && r.height > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };" +
    "  }" +
    "}" +
    "return null;" +
    "})(" + JSON.stringify(labelText) + ")"
  );
}

// ─── Confirm Dialog Handler ───────────────────────────────────────────────────

/**
 * Handle any confirmation dialog that appears after an action.
 */
async function handleConfirmDialog(page) {
  await sleep(800);
  const confirmed = await page.evaluate(
    "(function() {" +
    "var dlgSels = ['.el-message-box','.el-dialog','[role=\"dialog\"]','.el-popconfirm__main'];" +
    "var dialogs = [];" +
    "for (var di = 0; di < dlgSels.length; di++) {" +
    "  var dlg = document.querySelector(dlgSels[di]);" +
    "  if (dlg) dialogs.push(dlg);" +
    "}" +
    "var confirmLabels = ['确定','确认','同意','OK','是'];" +
    "for (var i = 0; i < dialogs.length; i++) {" +
    "  var btns = dialogs[i].querySelectorAll('button');" +
    "  for (var bi = 0; bi < btns.length; bi++) {" +
    "    var text = (btns[bi].innerText || '').trim();" +
    "    if (confirmLabels.indexOf(text) >= 0) { btns[bi].click(); return 'confirmed: ' + text; }" +
    "  }" +
    "}" +
    "var skipLabels = ['取消','Cancel','否'];" +
    "var confirmBtns = document.querySelectorAll('.el-popconfirm__action button, .el-message-box__btns button');" +
    "for (var ci = 0; ci < confirmBtns.length; ci++) {" +
    "  var ct = (confirmBtns[ci].innerText || '').trim();" +
    "  if (skipLabels.indexOf(ct) < 0 && ct.length > 0) { confirmBtns[ci].click(); return 'confirmed: ' + ct; }" +
    "}" +
    "return 'no dialog';" +
    "})()"
  );
  return confirmed;
}

// ─── Person Picker ────────────────────────────────────────────────────────────

/**
 * Fill target person in a forward/assign dialog.
 */
async function selectPerson(page, personName) {
  await sleep(500);

  const inputFound = await page.evaluate(
    "(function(name) {" +
    "var q1 = Array.from(document.querySelectorAll('.selectPerson-wrapper input[placeholder*=\"搜索\"]'));" +
    "var q2 = Array.from(document.querySelectorAll('[class*=\"forward\"] input, [class*=\"assign\"] input, [class*=\"transfer\"] input'));" +
    "var q3 = Array.from(document.querySelectorAll('.el-dialog input[placeholder*=\"搜索\"], .el-dialog input'));" +
    "var inputs = q1.concat(q2).concat(q3);" +
    "for (var ii = 0; ii < inputs.length; ii++) {" +
    "  var inp = inputs[ii];" +
    "  var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;" +
    "  setter.call(inp, '');" +
    "  inp.dispatchEvent(new Event('input', { bubbles: true }));" +
    "  setter.call(inp, name);" +
    "  inp.dispatchEvent(new Event('input', { bubbles: true }));" +
    "  inp.dispatchEvent(new Event('change', { bubbles: true }));" +
    "  return 'filled';" +
    "}" +
    "return 'not found';" +
    "})(" + JSON.stringify(personName) + ")"
  );

  if (inputFound === 'not found') return { success: false, reason: '搜索框未找到' };

  await waitFor(page,
    "(function() {" +
    "var items = document.querySelectorAll(" +
    "  '.selectPerson-wrapper .checkbox-wrapper, .search-result .checkbox-wrapper, .el-dialog .checkbox-wrapper'" +
    ");" +
    "return items.length > 0 ? 'found' : null;" +
    "})()",
    5000
  );

  const cbCoords = await page.evaluate(
    "(function(name) {" +
    "var areaSels = ['.selectPerson-wrapper .search-result','.selectPerson-wrapper','.el-dialog'];" +
    "var areas = [];" +
    "for (var ai = 0; ai < areaSels.length; ai++) {" +
    "  var a = document.querySelector(areaSels[ai]);" +
    "  if (a) areas.push(a);" +
    "}" +
    "function getCoords(el) {" +
    "  var inner = el.querySelector('.el-checkbox__inner') || el.querySelector('label.el-checkbox');" +
    "  if (!inner) return null;" +
    "  var r = inner.getBoundingClientRect();" +
    "  return r.width > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;" +
    "}" +
    "var substringMatches = [];" +
    "for (var i = 0; i < areas.length; i++) {" +
    "  var wrappers = areas[i].querySelectorAll('.checkbox-wrapper');" +
    "  for (var wi = 0; wi < wrappers.length; wi++) {" +
    "    var txt = (wrappers[wi].innerText || '').trim();" +
    "    if (txt.indexOf('、') >= 0) continue;" +
    "    if (txt === name) { var c = getCoords(wrappers[wi]); if (c) return c; }" +
    "    if (txt.indexOf(name) >= 0) substringMatches.push(wrappers[wi]);" +
    "  }" +
    "}" +
    "if (substringMatches.length === 1) { var sc = getCoords(substringMatches[0]); if (sc) return sc; }" +
    "if (substringMatches.length > 1) return { ambiguous: true, count: substringMatches.length };" +
    "return null;" +
    "})(" + JSON.stringify(personName) + ")"
  );

  if (!cbCoords) return { success: false, reason: `未找到人员「${personName}」` };
  if (cbCoords.ambiguous) return { success: false, reason: `「${personName}」匹配到 ${cbCoords.count} 位人员，请使用更完整的姓名` };

  await page.dispatchMouseEvent(cbCoords.x, cbCoords.y);
  await sleep(500);

  const confirmed = await clickByBounds(page,
    "(function() {" +
    "var dlgSels = ['.selectPerson-wrapper','.el-dialog'];" +
    "for (var di = 0; di < dlgSels.length; di++) {" +
    "  var dlg = document.querySelector(dlgSels[di]);" +
    "  if (!dlg) continue;" +
    "  var btns = dlg.querySelectorAll('button');" +
    "  for (var bi = 0; bi < btns.length; bi++) {" +
    "    if ((btns[bi].innerText || '').trim() === '确定') {" +
    "      var r = btns[bi].getBoundingClientRect();" +
    "      if (r.width > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };" +
    "    }" +
    "  }" +
    "}" +
    "return null;" +
    "})()"
  );

  await waitFor(page,
    "(function() { return !document.querySelector('.selectPerson-wrapper') ? 'closed' : null; })()",
    3000
  );

  return { success: confirmed, reason: confirmed ? '已选择' : '确定按钮未找到' };
}

// ─── Perform Action ───────────────────────────────────────────────────────────

/**
 * Execute an approval action on the currently open todo detail panel.
 *
 * @param {object} page
 * @param {'approve'|'reject'|'forward'|'assign'} action
 * @param {string} comment - optional comment text
 * @param {string} to - target person (forward/assign only)
 * @returns {object} result
 */
async function performAction(page, action, comment, to) {
  const detail = await extractTodoDetail(page);
  const type = detail.type;
  const itemTitle = detail.lines && detail.lines.length > 0 ? detail.lines[0] : '-';

  if (type === 'unknown') {
    return {
      success: false,
      itemTitle,
      reason: `无法识别待办类型 (按钮列表: ${detail.buttons.join(', ') || '空'})。请运行 todo view --id N 确认详情面板已加载。`,
    };
  }

  if (comment) {
    await fillComment(page, comment);
  }

  let buttonLabel;
  switch (action) {
    case 'approve':
      buttonLabel = type === '工单' ? '同意' : '批准';
      break;
    case 'reject':
      buttonLabel = type === '工单' ? '驳回' : '退回';
      break;
    case 'forward':
      buttonLabel = '转发';
      break;
    case 'assign':
      buttonLabel = '指派';
      break;
    default:
      return { success: false, reason: `未知操作: ${action}` };
  }

  const clicked = await clickActionButton(page, buttonLabel);
  if (!clicked) {
    const altLabels = {
      approve: ['同意', '批准', '通过', '审批通过'],
      reject: ['驳回', '退回', '拒绝', '不同意'],
      forward: ['转发', '流转'],
      assign: ['指派', '转派', '分配'],
    };
    let found = false;
    for (const alt of (altLabels[action] || [])) {
      if (alt !== buttonLabel) {
        const altClicked = await clickActionButton(page, alt);
        if (altClicked) { found = true; buttonLabel = alt; break; }
      }
    }
    if (!found) {
      return { success: false, reason: `未找到按钮「${buttonLabel}」，可用按钮：${detail.buttons.join(', ')}` };
    }
  }

  await sleep(800);

  if ((action === 'forward' || action === 'assign') && to) {
    const personResult = await selectPerson(page, to);
    if (!personResult.success) {
      return { success: false, reason: `操作按钮已点击，但人员选择失败: ${personResult.reason}` };
    }
    await sleep(500);
  }

  const confirmResult = await handleConfirmDialog(page);

  await sleep(1000);

  return {
    success: true,
    action,
    button: buttonLabel,
    type,
    itemTitle,
    comment: comment || '',
    to: to || '',
    confirmResult,
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function truncate(str, maxLen) {
  if (maxLen === undefined) maxLen = 16;
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

export function formatWaiting(waiting, overtime) {
  if (!waiting) return '';
  return overtime ? `⚠️ ${waiting}` : waiting;
}

// ─── CLI Registrations ────────────────────────────────────────────────────────

// ── todo list ────────────────────────────────────────────────────────────────

cli({
  site: '360teams',
  name: 'todo list',
  description: 'List pending approval todos (OA and work orders)',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'limit', required: false, default: '20', help: 'Max items to show' },
  ],
  func: async (_page, kwargs) => {
    return await withElectronPage(async (page) => {
      await navigateToTodo(page);

      const items = await parseTodoList(page);
      const limit = parseInt(kwargs.limit, 10) || 20;

      if (!items || items.length === 0) {
        return [{ No: '-', Title: '暂无待办', Status: '-', From: '-', Arrived: '-', Waiting: '-' }];
      }

      const rows = items
        .slice(0, limit)
        .map(item => ({
          No: item.index,
          Title: truncate(item.title, 18),
          Status: item.status || '审批中',
          From: truncate(item.from, 8),
          Arrived: item.arrived ? item.arrived.replace(/^\d{4}-/, '') : '',
          Waiting: formatWaiting(item.waiting, item.overtime),
        }));

      return rows.length > 0
        ? rows
        : [{ No: '-', Title: '无匹配待办', Status: '-', From: '-', Arrived: '-', Waiting: '-' }];
    });
  },
});

// ── todo view ─────────────────────────────────────────────────────────────────

cli({
  site: '360teams',
  name: 'todo view',
  description: 'View todo item detail by list number',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'id', required: true, help: 'Todo item number from list (1-based)' },
  ],
  func: async (_page, kwargs) => {
    const id = parseInt(kwargs.id, 10);
    if (!id || id < 1) {
      return [{ Status: 'Error', Message: '--id must be a positive integer' }];
    }

    return await withElectronPage(async (page) => {
      await navigateToTodo(page);

      const clicked = await clickTodoItem(page, id);
      if (!clicked) {
        return [{ Status: 'Error', Message: `待办第 ${id} 项未找到，请先运行 todo list 确认序号` }];
      }

      const panelVisible = await waitForDetailPanel(page);
      if (!panelVisible) {
        return [{ Status: 'Error', Message: `待办第 ${id} 项详情面板未出现，请重试` }];
      }

      const detail = await extractTodoDetail(page);
      return [{
        Status: 'OK',
        Type: detail.type,
        Buttons: detail.buttons.join(' / '),
        Preview: detail.lines.slice(0, 15).join('\n'),
      }];
    });
  },
});

// ── todo approve ──────────────────────────────────────────────────────────────

cli({
  site: '360teams',
  name: 'todo approve',
  description: 'Approve (批准/同意) a todo item',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'id', required: true, help: 'Todo item number from list' },
    { name: 'comment', required: false, default: '', help: 'Approval comment' },
  ],
  func: async (_page, kwargs) => {
    const id = parseInt(kwargs.id, 10);
    if (!id || id < 1) return [{ Status: 'Error', Message: '--id must be a positive integer' }];

    return await withElectronPage(async (page) => {
      await navigateToTodo(page);

      const clicked = await clickTodoItem(page, id);
      if (!clicked) return [{ Status: 'Error', Message: `待办第 ${id} 项未找到` }];

      const panelVisible = await waitForDetailPanel(page);
      if (!panelVisible) return [{ Status: 'Error', Message: `待办第 ${id} 项详情面板未出现，请重试` }];

      const result = await performAction(page, 'approve', kwargs.comment, '');
      return [{
        Status: result.success ? 'OK' : 'Error',
        Action: '批准/同意',
        TodoId: id,
        Item: result.itemTitle || '-',
        Type: result.type || '-',
        Comment: result.comment || '-',
        Message: result.success ? `已点击「${result.button}」` : result.reason,
        Confirm: result.confirmResult || '-',
      }];
    });
  },
});

// ── todo reject ───────────────────────────────────────────────────────────────

cli({
  site: '360teams',
  name: 'todo reject',
  description: 'Reject (退回/驳回) a todo item',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'id', required: true, help: 'Todo item number from list' },
    { name: 'comment', required: false, default: '', help: 'Rejection reason' },
  ],
  func: async (_page, kwargs) => {
    const id = parseInt(kwargs.id, 10);
    if (!id || id < 1) return [{ Status: 'Error', Message: '--id must be a positive integer' }];

    return await withElectronPage(async (page) => {
      await navigateToTodo(page);

      const clicked = await clickTodoItem(page, id);
      if (!clicked) return [{ Status: 'Error', Message: `待办第 ${id} 项未找到` }];

      const panelVisible = await waitForDetailPanel(page);
      if (!panelVisible) return [{ Status: 'Error', Message: `待办第 ${id} 项详情面板未出现，请重试` }];

      const result = await performAction(page, 'reject', kwargs.comment, '');
      return [{
        Status: result.success ? 'OK' : 'Error',
        Action: '退回/驳回',
        TodoId: id,
        Item: result.itemTitle || '-',
        Type: result.type || '-',
        Comment: result.comment || '-',
        Message: result.success ? `已点击「${result.button}」` : result.reason,
        Confirm: result.confirmResult || '-',
      }];
    });
  },
});

// ── todo forward ──────────────────────────────────────────────────────────────

cli({
  site: '360teams',
  name: 'todo forward',
  description: 'Forward an OA todo item to another person',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'id', required: true, help: 'Todo item number from list' },
    { name: 'to', required: true, help: 'Target person name for forwarding' },
    { name: 'comment', required: false, default: '', help: 'Comment / reason' },
  ],
  func: async (_page, kwargs) => {
    const id = parseInt(kwargs.id, 10);
    if (!id || id < 1) return [{ Status: 'Error', Message: '--id must be a positive integer' }];
    if (!kwargs.to) return [{ Status: 'Error', Message: '--to is required for forward' }];

    return await withElectronPage(async (page) => {
      await navigateToTodo(page);

      const clicked = await clickTodoItem(page, id);
      if (!clicked) return [{ Status: 'Error', Message: `待办第 ${id} 项未找到` }];

      const panelVisible = await waitForDetailPanel(page);
      if (!panelVisible) return [{ Status: 'Error', Message: `待办第 ${id} 项详情面板未出现，请重试` }];

      const result = await performAction(page, 'forward', kwargs.comment, kwargs.to);
      return [{
        Status: result.success ? 'OK' : 'Error',
        Action: '转发',
        TodoId: id,
        Item: result.itemTitle || '-',
        Type: result.type || '-',
        To: kwargs.to,
        Comment: result.comment || '-',
        Message: result.success ? `已转发给「${kwargs.to}」` : result.reason,
        Confirm: result.confirmResult || '-',
      }];
    });
  },
});

// ── todo assign ───────────────────────────────────────────────────────────────

cli({
  site: '360teams',
  name: 'todo assign',
  description: 'Assign a ticket todo item to another person',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'id', required: true, help: 'Todo item number from list' },
    { name: 'to', required: true, help: 'Target person name for assignment' },
    { name: 'comment', required: false, default: '', help: 'Comment / reason' },
  ],
  func: async (_page, kwargs) => {
    const id = parseInt(kwargs.id, 10);
    if (!id || id < 1) return [{ Status: 'Error', Message: '--id must be a positive integer' }];
    if (!kwargs.to) return [{ Status: 'Error', Message: '--to is required for assign' }];

    return await withElectronPage(async (page) => {
      await navigateToTodo(page);

      const clicked = await clickTodoItem(page, id);
      if (!clicked) return [{ Status: 'Error', Message: `待办第 ${id} 项未找到` }];

      const panelVisible = await waitForDetailPanel(page);
      if (!panelVisible) return [{ Status: 'Error', Message: `待办第 ${id} 项详情面板未出现，请重试` }];

      const result = await performAction(page, 'assign', kwargs.comment, kwargs.to);
      return [{
        Status: result.success ? 'OK' : 'Error',
        Action: '指派',
        TodoId: id,
        Item: result.itemTitle || '-',
        Type: result.type || '-',
        To: kwargs.to,
        Comment: result.comment || '-',
        Message: result.success ? `已指派给「${kwargs.to}」` : result.reason,
        Confirm: result.confirmResult || '-',
      }];
    });
  },
});
