/**
 * 360Teams Todo CLI
 *
 * Handles approval-style todos from the 审批 section of 日程会议.
 * Supports two todo categories:
 *   - OA   : has "批准" / "退回" buttons
 *   - 工单 : has "同意" / "驳回" buttons
 *
 * Commands:
 *   opencli 360teams todo list    [--type oa|ticket] [--limit N]
 *   opencli 360teams todo view    --id N
 *   opencli 360teams todo approve --id N [--comment TEXT]
 *   opencli 360teams todo reject  --id N [--comment TEXT]
 *   opencli 360teams todo forward --id N  --to PERSON [--comment TEXT]
 *   opencli 360teams todo assign  --id N  --to PERSON [--comment TEXT]
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { withElectronPage } from './cdp.js';

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll `expression` on `page` until it returns a truthy value or timeout.
 */
async function waitFor(page, expression, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await page.evaluate(expression);
    if (result) return result;
    await sleep(300);
  }
  return null;
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
    "(() => {" +
    "const items = document.querySelectorAll('.sidenav-item');" +
    "for (const item of items) {" +
    "  if (item.innerText && item.innerText.trim() === '日程会议') {" +
    "    item.click(); return 'clicked'; }" +
    "}" +
    "return 'not found'; })()"
  );
  await sleep(2000);

  // 2. Click 审批 sub-menu item
  const approvalResult = await page.evaluate(
    "(() => {" +
    "const all = document.querySelectorAll('.sidenav-item, .sidenav-submenu-item, div, span, button, a, li');" +
    "for (const el of all) {" +
    "  const text = (el.innerText || '').trim();" +
    "  if (text === '审批') { el.click(); return 'clicked'; }" +
    "}" +
    "return 'not found'; })()"
  );
  await sleep(2500);

  // 3. Click 待办 tab
  const todoTabResult = await page.evaluate(
    "(() => {" +
    "const all = document.querySelectorAll('.tab-item, .el-tabs__item, [role=\"tab\"], div, span');" +
    "for (const el of all) {" +
    "  const text = (el.innerText || '').trim();" +
    "  if (text === '待办') { el.click(); return 'clicked'; }" +
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
 * We attempt two strategies:
 *  A) Vue component data extraction (accurate, structured)
 *  B) innerText-based line parsing (fallback)
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
  const vueData = await page.evaluate(`(() => {
    try {
      // Walk all elements to find one that has a todoList / pendingList in its Vue data
      const allEls = document.querySelectorAll('*');
      let comp = null;
      for (const el of allEls) {
        const v = el.__vue__;
        if (!v) continue;
        const d = v.$data || {};
        if (Array.isArray(d.todoList) && d.todoList.length > 0) { comp = v; break; }
        if (Array.isArray(d.pendingList) && d.pendingList.length > 0) { comp = v; break; }
        if (Array.isArray(d.approvalList) && d.approvalList.length > 0) { comp = v; break; }
        if (Array.isArray(d.list) && d.list.length > 0 && d.list[0] && d.list[0].title) { comp = v; break; }
      }
      if (!comp) return null;

      const raw = comp.$data.todoList || comp.$data.pendingList || comp.$data.approvalList || comp.$data.list;
      return raw.map((item, idx) => ({
        index: idx + 1,
        title: item.title || item.name || item.flowName || item.processName || '',
        status: item.status || item.statusName || item.state || '',
        from: item.createUserName || item.sponsorName || item.initiator || item.from || '',
        arrived: item.arriveTime || item.createTime || item.startTime || '',
        waiting: item.waitTime || item.duration || '',
        overtime: !!(item.overtime || item.isOvertime || item.timeout),
      }));
    } catch (e) {
      return null;
    }
  })()`);

  if (vueData && vueData.length > 0) {
    return vueData;
  }

  // Strategy B: DOM-based extraction — read each list item element
  const domData = await page.evaluate(`(() => {
    try {
      // Common selectors for todo list items
      const containers = [
        '.approval-list .list-item',
        '.todo-list .list-item',
        '.pending-list .list-item',
        '.approval-item',
        '.todo-item',
        '[class*="todo"] [class*="item"]',
        '[class*="approval"] [class*="item"]',
        '[class*="pending"] [class*="item"]',
      ];

      let items = [];
      for (const sel of containers) {
        items = Array.from(document.querySelectorAll(sel));
        if (items.length > 0) break;
      }

      if (items.length === 0) return null;

      return items.map((el, idx) => {
        const text = (el.innerText || '').trim();
        const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);

        // Check if any child has an overtime/warning class
        const hasOvertime = !!(
          el.querySelector('[class*="overtime"], [class*="timeout"], [class*="warn"], [class*="danger"]') ||
          el.querySelector('[style*="color: red"], [style*="color: orange"]')
        );

        // First line is usually the title; subsequent lines carry metadata
        return {
          index: idx + 1,
          title: lines[0] || '',
          status: lines.find(l => l.includes('审批中') || l.includes('待处理') || l.includes('审核中')) || '',
          from: lines.find(l => l.length > 0 && l !== lines[0]) || '',
          arrived: '',
          waiting: '',
          overtime: hasOvertime,
        };
      });
    } catch (e) {
      return null;
    }
  })()`);

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
function parseTodoFromText(text) {
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
    // If next line is a status keyword, current line is a title
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
 * Returns { type: 'OA' | '工单' | 'unknown', buttons: string[], detail: object }
 */
async function extractTodoDetail(page) {
  return await page.evaluate(`(() => {
    try {
      // Find detail panel — try common panel/drawer selectors
      const panelSelectors = [
        '.approval-detail',
        '.todo-detail',
        '.el-drawer__body',
        '.detail-panel',
        '[class*="detail"]',
        '.main-content',
      ];

      let panel = null;
      for (const sel of panelSelectors) {
        panel = document.querySelector(sel);
        if (panel) break;
      }
      if (!panel) panel = document.body;

      // Collect all visible button texts
      const buttons = Array.from(panel.querySelectorAll('button, .btn, [class*="btn"]'))
        .map(b => (b.innerText || '').trim())
        .filter(t => t.length > 0 && !['×', '✕', '关闭'].includes(t));

      // Determine type from available action buttons
      let type = 'unknown';
      const hasApprove = buttons.some(b => b === '批准');
      const hasReject = buttons.some(b => b === '退回');
      const hasAgree = buttons.some(b => b === '同意');
      const hasDismiss = buttons.some(b => b === '驳回');

      if (hasApprove || hasReject) type = 'OA';
      else if (hasAgree || hasDismiss) type = '工单';

      // Extract key text fields
      const text = (panel.innerText || '').trim();
      const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);

      return { type, buttons, lines: lines.slice(0, 30) };
    } catch (e) {
      return { type: 'unknown', buttons: [], lines: [], error: e.message };
    }
  })()`);
}

// ─── Item Selector ────────────────────────────────────────────────────────────

/**
 * Click the Nth todo item in the left panel (1-based index).
 * Returns true if clicked successfully.
 */
async function clickTodoItem(page, index) {
  const clicked = await page.evaluate(`((idx) => {
    const containers = [
      '.approval-list .list-item',
      '.todo-list .list-item',
      '.pending-list .list-item',
      '.approval-item',
      '.todo-item',
      '[class*="todo"] [class*="item"]',
      '[class*="approval"] [class*="item"]',
      '[class*="pending"] [class*="item"]',
    ];

    let items = [];
    for (const sel of containers) {
      items = Array.from(document.querySelectorAll(sel));
      if (items.length > 0) break;
    }

    if (items.length === 0 || idx < 1 || idx > items.length) return false;

    const target = items[idx - 1];
    const rect = target.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      // Try direct click first (may not trigger Vue events)
      target.click();
      return true;
    }
    return false;
  })(${index})`);

  if (!clicked) {
    // Fallback: use mouse event via getBoundingClientRect coordinates
    return await clickByBounds(page, `((idx) => {
      const containers = [
        '.approval-list .list-item',
        '.todo-list .list-item',
        '.pending-list .list-item',
        '.approval-item',
        '.todo-item',
        '[class*="todo"] [class*="item"]',
        '[class*="approval"] [class*="item"]',
        '[class*="pending"] [class*="item"]',
      ];
      let items = [];
      for (const sel of containers) {
        items = Array.from(document.querySelectorAll(sel));
        if (items.length > 0) break;
      }
      if (!items.length || idx < 1 || idx > items.length) return null;
      const rect = items[idx - 1].getBoundingClientRect();
      return rect.width > 0 ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
    })(${index})`);
  }

  return clicked;
}

// ─── Comment Filler ───────────────────────────────────────────────────────────

/**
 * Fill the comment/opinion textarea in the detail panel.
 */
async function fillComment(page, comment) {
  if (!comment) return 'skipped';
  return await page.evaluate(`((comment) => {
    const panelSelectors = [
      '.approval-detail textarea',
      '.todo-detail textarea',
      '.el-drawer__body textarea',
      '[class*="detail"] textarea',
      'textarea[placeholder*="意见"]',
      'textarea[placeholder*="备注"]',
      'textarea[placeholder*="原因"]',
      'textarea[placeholder*="说明"]',
      'textarea',
    ];

    for (const sel of panelSelectors) {
      const ta = document.querySelector(sel);
      if (ta) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, comment);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        return 'filled';
      }
    }
    return 'not found';
  })(${JSON.stringify(comment)})`);
}

// ─── Action Button Clicker ────────────────────────────────────────────────────

/**
 * Click an action button by its exact text label.
 * Tries direct click first, then mouse event as fallback.
 */
async function clickActionButton(page, labelText) {
  // Try direct click
  const directClicked = await page.evaluate(`((label) => {
    const panelSelectors = [
      '.approval-detail',
      '.todo-detail',
      '.el-drawer__body',
      '[class*="detail"]',
      'body',
    ];
    let panel = null;
    for (const sel of panelSelectors) {
      panel = document.querySelector(sel);
      if (panel) break;
    }
    if (!panel) panel = document.body;

    const buttons = panel.querySelectorAll('button, .btn, [class*="btn-"]');
    for (const btn of buttons) {
      if ((btn.innerText || '').trim() === label) {
        btn.click();
        return 'clicked';
      }
    }
    return 'not found';
  })(${JSON.stringify(labelText)})`);

  if (directClicked === 'clicked') return true;

  // Fallback: mouse event
  return await clickByBounds(page, `((label) => {
    const panel = document.querySelector('.approval-detail, .todo-detail, .el-drawer__body, [class*="detail"]') || document.body;
    const buttons = panel.querySelectorAll('button, .btn, [class*="btn-"]');
    for (const btn of buttons) {
      if ((btn.innerText || '').trim() === label) {
        const r = btn.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
    return null;
  })(${JSON.stringify(labelText)})`);
}

// ─── Confirm Dialog Handler ───────────────────────────────────────────────────

/**
 * Handle any confirmation dialog that appears after an action.
 * Looks for common confirm/OK buttons in dialogs.
 */
async function handleConfirmDialog(page) {
  await sleep(800);
  const confirmed = await page.evaluate(`(() => {
    // Common dialog containers
    const dialogs = [
      document.querySelector('.el-message-box'),
      document.querySelector('.el-dialog'),
      document.querySelector('[role="dialog"]'),
      document.querySelector('.el-popconfirm__main'),
    ].filter(Boolean);

    for (const dlg of dialogs) {
      const buttons = dlg.querySelectorAll('button');
      for (const btn of buttons) {
        const text = (btn.innerText || '').trim();
        if (['确定', '确认', '同意', 'OK', '是'].includes(text)) {
          btn.click();
          return 'confirmed: ' + text;
        }
      }
    }

    // Also try popconfirm confirm button outside dialog containers
    const confirmBtns = document.querySelectorAll('.el-popconfirm__action button, .el-message-box__btns button');
    for (const btn of confirmBtns) {
      const text = (btn.innerText || '').trim();
      if (!['取消', 'Cancel', '否'].includes(text) && text.length > 0) {
        btn.click();
        return 'confirmed: ' + text;
      }
    }

    return 'no dialog';
  })()`);
  return confirmed;
}

// ─── Person Picker ────────────────────────────────────────────────────────────

/**
 * Fill target person in a forward/assign dialog.
 * Similar to calendar.js attendee-picker pattern.
 */
async function selectPerson(page, personName) {
  await sleep(500);

  // Look for person search input
  const inputFound = await page.evaluate(`((name) => {
    const inputs = [
      ...document.querySelectorAll('.selectPerson-wrapper input[placeholder*="搜索"]'),
      ...document.querySelectorAll('[class*="forward"] input, [class*="assign"] input, [class*="transfer"] input'),
      ...document.querySelectorAll('.el-dialog input[placeholder*="搜索"], .el-dialog input'),
    ];
    for (const inp of inputs) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, '');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(inp, name);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return 'filled';
    }
    return 'not found';
  })(${JSON.stringify(personName)})`);

  if (inputFound === 'not found') return { success: false, reason: '搜索框未找到' };

  // Wait for results
  await waitFor(page, `(() => {
    const items = document.querySelectorAll(
      '.selectPerson-wrapper .checkbox-wrapper, .search-result .checkbox-wrapper, .el-dialog .checkbox-wrapper'
    );
    return items.length > 0 ? 'found' : null;
  })()`, 5000);

  // Click matching result
  const cbCoords = await page.evaluate(`((name) => {
    const searchAreas = [
      document.querySelector('.selectPerson-wrapper .search-result'),
      document.querySelector('.selectPerson-wrapper'),
      document.querySelector('.el-dialog'),
    ].filter(Boolean);

    for (const area of searchAreas) {
      for (const wrapper of area.querySelectorAll('.checkbox-wrapper')) {
        const txt = (wrapper.innerText || '').trim();
        if (txt.indexOf(name) >= 0 && !txt.includes('、')) {
          const inner = wrapper.querySelector('.el-checkbox__inner') || wrapper.querySelector('label.el-checkbox');
          if (inner) {
            const r = inner.getBoundingClientRect();
            if (r.width > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
        }
      }
    }
    return null;
  })(${JSON.stringify(personName)})`);

  if (!cbCoords) return { success: false, reason: `未找到人员「${personName}」` };

  await page.dispatchMouseEvent(cbCoords.x, cbCoords.y);
  await sleep(500);

  // Click 确定 in dialog
  const confirmed = await clickByBounds(page, `(() => {
    const dialogs = [
      document.querySelector('.selectPerson-wrapper'),
      document.querySelector('.el-dialog'),
    ].filter(Boolean);
    for (const dlg of dialogs) {
      for (const btn of dlg.querySelectorAll('button')) {
        if ((btn.innerText || '').trim() === '确定') {
          const r = btn.getBoundingClientRect();
          return r.width > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
        }
      }
    }
    return null;
  })()`);

  await waitFor(page, `(() => {
    return !document.querySelector('.selectPerson-wrapper') ? 'closed' : null;
  })()`, 3000);

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
  // Detect todo type to pick correct button labels
  const detail = await extractTodoDetail(page);
  const type = detail.type;

  // Fill comment first (before clicking action button)
  if (comment) {
    const commentResult = await fillComment(page, comment);
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

  // Click the action button
  const clicked = await clickActionButton(page, buttonLabel);
  if (!clicked) {
    // Try alternate labels when exact label not found
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

  // For forward/assign: select target person
  if ((action === 'forward' || action === 'assign') && to) {
    const personResult = await selectPerson(page, to);
    if (!personResult.success) {
      return { success: false, reason: `操作按钮已点击，但人员选择失败: ${personResult.reason}` };
    }
    await sleep(500);
  }

  // Handle any confirmation dialog
  const confirmResult = await handleConfirmDialog(page);

  await sleep(1000);

  return {
    success: true,
    action,
    button: buttonLabel,
    type,
    comment: comment || '',
    to: to || '',
    confirmResult,
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/**
 * Truncate a string with ellipsis if it exceeds maxLen.
 */
function truncate(str, maxLen = 16) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

/**
 * Format a waiting duration string. Adds a warning prefix if overtime.
 */
function formatWaiting(waiting, overtime) {
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
    { name: 'type', required: false, default: '', help: 'Filter by type: oa | ticket' },
    { name: 'limit', required: false, default: '20', help: 'Max items to show' },
  ],
  func: async (_page, kwargs) => {
    return await withElectronPage(async (page) => {
      await navigateToTodo(page);

      const items = await parseTodoList(page);
      const limit = parseInt(kwargs.limit, 10) || 20;
      const typeFilter = (kwargs.type || '').toLowerCase();

      if (!items || items.length === 0) {
        return [{ No: '-', Title: '暂无待办', Status: '-', From: '-', Arrived: '-', Waiting: '-', Type: '-' }];
      }

      const rows = items
        .slice(0, limit)
        .filter(item => {
          if (!typeFilter) return true;
          if (typeFilter === 'oa') return item.type === 'OA';
          if (typeFilter === 'ticket' || typeFilter === '工单') return item.type === '工单';
          return true;
        })
        .map(item => ({
          No: item.index,
          Title: truncate(item.title, 18),
          Status: item.status || '审批中',
          From: truncate(item.from, 8),
          Arrived: item.arrived ? item.arrived.replace(/^\d{4}-/, '') : '',
          Waiting: formatWaiting(item.waiting, item.overtime),
          Type: item.type || '-',
        }));

      return rows.length > 0
        ? rows
        : [{ No: '-', Title: '无匹配待办', Status: '-', From: '-', Arrived: '-', Waiting: '-', Type: '-' }];
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

      // Click item
      const clicked = await clickTodoItem(page, id);
      if (!clicked) {
        return [{ Status: 'Error', Message: `待办第 ${id} 项未找到，请先运行 todo list 确认序号` }];
      }

      await sleep(2000);

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

      await sleep(2000);

      const result = await performAction(page, 'approve', kwargs.comment, '');
      return [{
        Status: result.success ? 'OK' : 'Error',
        Action: '批准/同意',
        TodoId: id,
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

      await sleep(2000);

      const result = await performAction(page, 'reject', kwargs.comment, '');
      return [{
        Status: result.success ? 'OK' : 'Error',
        Action: '退回/驳回',
        TodoId: id,
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

      await sleep(2000);

      const result = await performAction(page, 'forward', kwargs.comment, kwargs.to);
      return [{
        Status: result.success ? 'OK' : 'Error',
        Action: '转发',
        TodoId: id,
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

      await sleep(2000);

      const result = await performAction(page, 'assign', kwargs.comment, kwargs.to);
      return [{
        Status: result.success ? 'OK' : 'Error',
        Action: '指派',
        TodoId: id,
        Type: result.type || '-',
        To: kwargs.to,
        Comment: result.comment || '-',
        Message: result.success ? `已指派给「${kwargs.to}」` : result.reason,
        Confirm: result.confirmResult || '-',
      }];
    });
  },
});
