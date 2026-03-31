/**
 * Calendar and Meetings CLI command for opencli 360teams
 *
 * Calendar content is in the main Electron page at #/main/calendar.
 * We use withElectronPage() to click the sidenav button and parse innerText.
 *
 * Actions:
 * - today / list: view calendar events
 * - rooms: find available meeting rooms
 * - create: create a new calendar event
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { withElectronPage } from './cdp.js';

/**
 * Parse calendar day from raw page innerText.
 * The calendar shows a month grid with dates and meeting titles.
 *
 * Format (line-based):
 * - Date numbers: 1, 2, 3, ... 31
 * - Meeting titles on specific dates
 * - "会议" label after some titles (either on own line or tab-separated in 3rd column)
 *
 * Also handles tab-separated rows (e.g., from calendar grid innerText):
 * - "5日\t重点项目双周例会-0305\t会议"
 * - "6日\t金科重点项目双周会-3月6日\t"
 *
 * @param {string} text - Raw innerText from calendar page
 * @param {number} limit - Max events to return
 * @returns {Array<{Time: string, Title: string, Type: string}>}
 */
export function parseCalendarDayFromText(text, limit = 20) {
  if (!text) return [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const results = [];

  let currentDate = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Tab-separated row from calendar grid (e.g., "5日\t会议名\t会议")
    // Format: date\ttitle\ttype (where type may be "会议" or empty)
    if (line.includes('\t')) {
      const parts = line.split('\t').map(p => p.trim()).filter(p => p.length > 0);
      if (parts.length >= 2) {
        // First part is the date (e.g., "5" or "5日")
        const datePart = parts[0];
        if (/^\d{1,2}$/.test(datePart)) {
          currentDate = datePart + '日';
        } else if (/^\d{1,2}日$/.test(datePart)) {
          currentDate = datePart;
        }
        // Second part is the title
        const titlePart = parts[1];
        // Third part (if exists) is the type
        const typePart = parts.length >= 3 ? parts[2] : '';

        if (titlePart.length >= 2 && !isCalendarNoiseLine(titlePart)) {
          results.push({
            Time: currentDate,
            Title: titlePart,
            Type: typePart === '会议' ? '会议' : '',
          });
          if (results.length >= limit) break;
        }
      }
      continue;
    }

    // Date line: single number or date format (e.g., "5", "5日")
    if (/^\d{1,2}$/.test(line)) {
      currentDate = line + '日';
      continue;
    }
    if (/^\d{1,2}日$/.test(line)) {
      currentDate = line;
      continue;
    }

    // Meeting type line - associated with previous title
    if (line === '会议') {
      if (results.length > 0 && results[results.length - 1].Type === '') {
        results[results.length - 1].Type = '会议';
      }
      continue;
    }

    // Meeting title: skip sidenav items, view labels, and UI chrome
    if (isCalendarNoiseLine(line)) {
      continue;
    }

    // Skip date-related separators
    if (/^(周日|周一|周二|周三|周四|周五|周六)$/.test(line)) {
      continue;
    }

    // Skip month/year header
    if (/^\d{4}年\d+月\d+日/.test(line)) {
      continue;
    }

    // This looks like a meeting title
    if (line.length >= 2) {
      results.push({
        Time: currentDate,
        Title: line,
        Type: '',
      });

      if (results.length >= limit) break;
    }
  }

  return results;
}

/**
 * Check if a line is calendar UI noise (not a meeting title).
 * @param {string} line
 * @returns {boolean}
 */
export function isCalendarNoiseLine(line) {
  const noisePatterns = [
    /^消息$/,
    /^待办$/,
    /^T5T$/,
    /^工作台$/,
    /^云文档$/,
    /^日程会议$/,
    /^我的团队$/,
    /^AI工作台$/,
    /^更多$/,
    /^创建日程$/,
    /^找会议室$/,
    /^会议室投屏$/,
    /^发起视频会议$/,
    /^预约视频会议$/,
    /^加入视频会议$/,
    /^月$/,
    /^周$/,
    /^日$/,
    /^今天$/,
    /^筛选$/,
    /^\d+$/, // Date numbers
  ];

  return noisePatterns.some(p => p.test(line));
}

// ─── Room Parsing Helpers ─────────────────────────────────────────────────────

/**
 * Extract meeting rooms from calendar page innerText.
 * The calendar page shows a room panel with room cards.
 *
 * Format per room:
 *   深圳-东京(深圳绿景NEO大厦-46F)
 *   8
 *   智慧屏(投屏/入会) · 电话 · 白板
 *
 * @param {string} text - Raw innerText from calendar page
 * @returns {Array<{Name: string, Location: string, Capacity: string, Devices: string}>}
 */
export function parseRoomsFromText(text) {
  if (!text) return [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const rooms = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Room name line: "深圳-xxx(...)" or "深圳-xxx-xxx(...)"
    if (line.match(/^深圳-.+\(.+\)$/)) {
      // Extract name (everything before first '(')
      const nameEnd = line.indexOf('(');
      const name = line.substring(0, nameEnd);
      const location = line.substring(nameEnd + 1, line.length - 1);

      // Next line(s) may contain capacity and devices
      let capacity = '';
      let devices = '';

      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const next = lines[j];
        // Capacity line: just a number like "8" or "16" or "50"
        if (next.match(/^\d{1,3}$/)) {
          capacity = next + '人';
          // Devices are on the next line
          if (j + 1 < lines.length) {
            const devLine = lines[j + 1];
            const devs = devLine.match(/智慧屏|电话|白板|投影仪|电视/g);
            if (devs) {
              devices = devs.join('/');
              j++; // skip device line
            }
          }
          break;
        }
        // If it's not a number, check if it has devices on same line
        if (next.match(/智慧屏|电话|白板|投影仪|电视/)) {
          const devs = next.match(/智慧屏|电话|白板|投影仪|电视/g);
          if (devs) devices = devs.join('/');
          break;
        }
        // If it's another room name or noise, stop
        if (next.match(/^深圳-/) || isCalendarNoiseLine(next)) break;
      }

      rooms.push({ Name: name, Location: location, Capacity: capacity, Devices: devices });
    }
  }

  return rooms;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Poll until an evaluate expression returns a truthy value.
 * @param {object} page - CDP page object
 * @param {string} expression - JS expression string that returns a value or null
 * @param {number} timeoutMs
 */
async function waitFor(page, expression, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await page.evaluate(expression);
    if (result) return result;
    await sleep(300);
  }
  return null;
}

/**
 * Get center coords of a DOM element via getBoundingClientRect, then dispatchMouseEvent.
 * @param {object} page - CDP page object
 * @param {string} expression - JS expression that returns {x, y} or null
 */
async function clickByBounds(page, expression) {
  const coords = await page.evaluate(expression);
  if (!coords) return false;
  await page.dispatchMouseEvent(coords.x, coords.y);
  return true;
}

// ─── CLI Command ─────────────────────────────────────────────────────────────

cli({
  site: '360teams',
  name: 'calendar',
  description: 'Calendar and meetings: list events, find rooms, create events',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'action', required: false, default: 'today', help: 'Action: today, list, rooms, create' },
    { name: 'date', required: false, default: '', help: 'Date for rooms/create (YYYY-MM-DD)' },
    { name: 'start', required: false, default: '', help: 'Start time for create (HH:MM)' },
    { name: 'end', required: false, default: '', help: 'End time for create (HH:MM)' },
    { name: 'title', required: false, default: '', help: 'Title for create' },
    { name: 'room', required: false, default: '', help: 'Room name for create (not yet implemented)' },
    { name: 'attendees', required: false, default: '', help: 'Comma-separated attendee names for create (e.g. "倪思勇,张三")' },
    { name: 'submit', required: false, default: 'false', help: 'Auto-submit the form after filling (true/false)' },
    { name: 'limit', required: false, default: '20', help: 'Max events to show' },
  ],
  func: async (_page, kwargs) => {
    const action = kwargs.action || 'today';

    return await withElectronPage(async (page) => {
      // Click 日程会议 sidenav button
      await page.evaluate(
        "(() => {" +
        "const items = document.querySelectorAll('.sidenav-item');" +
        "for (const item of items) {" +
        "if (item.innerText && item.innerText.trim() === '日程会议') {" +
        "item.click(); return 'clicked'; }}" +
        "return 'not found'; })()"
      );

      await new Promise((r) => setTimeout(r, 2000));

      // ── rooms action (deprecated → use `opencli 360teams rooms`) ────────
      if (action === 'rooms') {
        return [{ Status: 'Moved', Message: 'Use `opencli 360teams rooms` for full room search with filters (--workplace, --floor, --date, --start, --end, --search)' }];
      }

      // ── create action ───────────────────────────────────────────────────
      if (action === 'create') {
        const { title, date, start, end, room } = kwargs;
        const attendees = (kwargs.attendees || '').split(',').map(s => s.trim()).filter(Boolean);
        const autoSubmit = kwargs.submit === 'true' || kwargs.submit === true;

        if (!title || !date) {
          return [{ Status: 'Error', Message: 'Missing required: --title and --date (YYYY-MM-DD)' }];
        }

        // pendingActions: last-resort fallback for items that could not be completed automatically.
        const pendingActions = [];

        // Click 创建日程 button
        await sleep(500);
        const btnClicked = await page.evaluate(
          "(() => {" +
          "const btns = document.querySelectorAll('button, div, span');" +
          "for (const el of btns) {" +
          "  if (el.innerText && el.innerText.trim() === '创建日程') {" +
          "    el.click(); return 'clicked'; } }" +
          "return 'not found'; })()"
        );

        if (btnClicked !== 'clicked') {
          return [{ Status: 'Error', Message: '创建日程 button not found' }];
        }

        await sleep(2000);

        // Fill form using Vue 2-compatible input events
        const fillResult = await page.evaluate(
          `((t, d, s, e, r) => {
            try {
              const drawer = document.querySelector('.el-drawer__body');
              if (!drawer) return { error: 'drawer not found' };

              const setInputValue = (input, val) => {
                if (!input) return false;
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeInputValueSetter.call(input, val);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              };

              const setTextareaValue = (ta, val) => {
                if (!ta) return false;
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
                nativeSetter.call(ta, val);
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                ta.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              };

              const titleInput = drawer.querySelector('input[placeholder*="标题"]');
              if (!titleInput) return { error: 'title input not found' };
              setInputValue(titleInput, t);

              const dateInput = Array.from(drawer.querySelectorAll('input')).find(
                inp => (inp.getAttribute('placeholder') || '').includes('选择日期')
              );
              if (dateInput) setInputValue(dateInput, d);

              const setTimeValue = (input, val) => {
                if (!input) return false;
                input.focus();
                input.click();
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeInputValueSetter.call(input, val);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));
                input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', keyCode: 13 }));
                input.blur();
                input.dispatchEvent(new Event('blur', { bubbles: true }));
                return true;
              };

              if (s) {
                const startInput = Array.from(drawer.querySelectorAll('input')).find(
                  inp => (inp.getAttribute('placeholder') || '').includes('开始时间')
                );
                if (startInput) setTimeValue(startInput, s);
              }

              if (e) {
                const endInput = Array.from(drawer.querySelectorAll('input')).find(
                  inp => (inp.getAttribute('placeholder') || '').includes('结束时间')
                );
                if (endInput) setTimeValue(endInput, e);
              }

              if (r) {
                // Try location/room input first, then fall back to description textarea
                const locationInput = Array.from(drawer.querySelectorAll('input')).find(
                  inp => {
                    const ph = inp.getAttribute('placeholder') || '';
                    return ph.includes('地点') || ph.includes('位置') || ph.includes('会议室');
                  }
                );
                if (locationInput) {
                  setInputValue(locationInput, r);
                } else {
                  const descTA = Array.from(drawer.querySelectorAll('textarea')).find(
                    ta => {
                      const ph = ta.getAttribute('placeholder') || '';
                      return ph.includes('描述') || ph.includes('备注') || ph.includes('说明');
                    }
                  ) || drawer.querySelector('textarea');
                  if (descTA) setTextareaValue(descTA, r);
                }
              }

              return { success: true };
            } catch(err) {
              return { error: err.message };
            }
          })(${JSON.stringify(title)}, ${JSON.stringify(date)}, ${JSON.stringify(start || '')}, ${JSON.stringify(end || '')}, ${JSON.stringify(room || '')})`
        );

        if (fillResult.error) {
          return [{ Status: 'Error', Message: 'Form fill failed: ' + fillResult.error }];
        }

        await sleep(1000);

        // ── Add attendees ───────────────────────────────────────────────────
        const attendeeResults = [];
        for (const name of attendees) {
          // Close any stale selectPerson dialog before starting
          await page.evaluate(
            `(() => {
              const dlg = document.querySelector('.selectPerson-wrapper');
              if (dlg) {
                const closeBtn = dlg.querySelector('.select-header .el-icon-close, .select-header i');
                if (closeBtn) { closeBtn.click(); return; }
                for (const b of dlg.querySelectorAll('button')) {
                  if ((b.innerText || '').trim() === '取消') { b.click(); return; }
                }
              }
            })()`
          );
          await sleep(300);

          // Click 添加参与人 button
          const addBtnCoords = await page.evaluate(
            `(() => {
              const drawer = document.querySelector('.el-drawer__body');
              if (!drawer) return null;
              const addBtn = drawer.querySelector('button.add-user-button');
              if (addBtn) {
                const r = addBtn.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
              }
              return null;
            })()`
          );

          if (!addBtnCoords) {
            attendeeResults.push({ name, status: '添加参与人按钮未找到' });
            continue;
          }

          await page.dispatchMouseEvent(addBtnCoords.x, addBtnCoords.y);

          // Wait for selectPerson dialog to open
          const dialogFound = await waitFor(
            page,
            `(() => { const d = document.querySelector('.selectPerson-wrapper'); return d ? 'found' : null; })()`
          );

          if (!dialogFound) {
            attendeeResults.push({ name, status: '选人对话框未出现' });
            continue;
          }

          await sleep(300);

          // Clear and focus the search input, then fill name
          await page.evaluate(
            `((name) => {
              const dlg = document.querySelector('.selectPerson-wrapper');
              if (!dlg) return;
              for (const inp of dlg.querySelectorAll('input')) {
                if ((inp.getAttribute('placeholder') || '').includes('搜索')) {
                  inp.focus();
                  // Clear existing value first
                  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                  setter.call(inp, '');
                  inp.dispatchEvent(new Event('input', { bubbles: true }));
                  // Set new value
                  setter.call(inp, name);
                  inp.dispatchEvent(new Event('input', { bubbles: true }));
                  inp.dispatchEvent(new Event('change', { bubbles: true }));
                  return;
                }
              }
            })(${JSON.stringify(name)})`
          );

          // Poll until search results (checkbox-wrapper items) appear — up to 6s
          // Note: use .checkbox-wrapper count to detect results, as input[type=checkbox]
          // may be present even before search if the dialog shows recent contacts.
          // We wait for the search-result container specifically.
          await waitFor(
            page,
            `(() => {
              const dlg = document.querySelector('.selectPerson-wrapper');
              if (!dlg) return null;
              // The search results appear inside .search-result
              const sr = dlg.querySelector('.search-result');
              if (sr && sr.querySelectorAll('.checkbox-wrapper').length > 0) return 'found';
              return null;
            })()`,
            6000
          );

          // Click the VISIBLE checkbox inner (el-checkbox__inner) for matching person.
          // We must use .el-checkbox__inner instead of input[type=checkbox] because
          // Element UI hides the native input with CSS (width: 0 / opacity: 0).
          const cbCoords = await page.evaluate(
            `((name) => {
              const dlg = document.querySelector('.selectPerson-wrapper');
              if (!dlg) return null;
              // Prefer results inside .search-result container (not the pre-selected area)
              const searchArea = dlg.querySelector('.search-result') || dlg;
              for (const wrapper of searchArea.querySelectorAll('.checkbox-wrapper')) {
                const txt = (wrapper.innerText || '').trim();
                // Match name, exclude group entries (contain 、)
                if (txt.indexOf(name) >= 0 && txt.indexOf('、') < 0) {
                  // Click the visible pseudo-checkbox, not the hidden native input
                  const inner = wrapper.querySelector('.el-checkbox__inner');
                  if (inner) {
                    const r = inner.getBoundingClientRect();
                    if (r.width > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
                  }
                  // Fallback: click the label
                  const label = wrapper.querySelector('label.el-checkbox');
                  if (label) {
                    const r = label.getBoundingClientRect();
                    if (r.width > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
                  }
                }
              }
              return null;
            })(${JSON.stringify(name)})`
          );

          if (!cbCoords) {
            // Search returned no matching individual — record for manual follow-up.
            attendeeResults.push({ name, status: '搜索无结果（可能为网络原因）' });
            pendingActions.push(`参与人「${name}」：搜索无结果（可能为网络原因），请创建日程后通过「修改日程」手动添加`);
            // Try to close dialog
            await clickByBounds(page,
              `(() => { const dlg = document.querySelector('.selectPerson-wrapper'); if (!dlg) return null;
                for (const b of dlg.querySelectorAll('button')) {
                  if ((b.innerText || '').trim() === '取消') { const r = b.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; }
                } return null; })()`
            );
            await sleep(500);
            continue;
          }

          await page.dispatchMouseEvent(cbCoords.x, cbCoords.y);
          await sleep(500);

          // Click 确定 in dialog
          const confirmed = await clickByBounds(page,
            `(() => { const dlg = document.querySelector('.selectPerson-wrapper'); if (!dlg) return null;
              for (const b of dlg.querySelectorAll('button')) {
                if ((b.innerText || '').trim() === '确定') { const r = b.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; }
              } return null; })()`
          );

          // Wait for dialog to close
          await waitFor(page, `(() => { return !document.querySelector('.selectPerson-wrapper') ? 'closed' : null; })()`, 3000);

          attendeeResults.push({ name, status: confirmed ? '已添加' : '确定按钮未找到' });
          await sleep(500);
        }

        // ── Auto-submit ─────────────────────────────────────────────────────
        if (autoSubmit) {
          await sleep(500);
          const submitted = await clickByBounds(page,
            `(() => { const drawer = document.querySelector('.el-drawer__body'); if (!drawer) return null;
              for (const b of drawer.querySelectorAll('button')) {
                const t = (b.innerText || '').trim();
                if (t === '确定' || t === '保存' || t === '提交') { const r = b.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; }
              } return null; })()`
          );
          await sleep(1000);
          const hasFollowUp = pendingActions.length > 0;
          return [{
            Status: !submitted ? 'Warning' : hasFollowUp ? '部分完成' : 'Created',
            Title: title,
            Date: date,
            Start: start || '未设置',
            End: end || '未设置',
            Attendees: attendeeResults.map(a => `${a.name}(${a.status})`).join(', ') || '无',
            FollowUp: hasFollowUp ? pendingActions.join(' | ') : '无',
            Note: !submitted ? '表单已填写但未找到提交按钮，请手动确认' : hasFollowUp ? '日程已提交，但部分参与人未能自动添加，请手动跟进' : '日程已提交',
          }];
        }

        return [{
          Status: '就绪',
          Title: title,
          Date: date,
          Start: start || '未设置',
          End: end || '未设置',
          Attendees: attendeeResults.map(a => `${a.name}(${a.status})`).join(', ') || '无',
          FollowUp: pendingActions.length > 0 ? pendingActions.join(' | ') : '无',
          Note: '表单已填写，请在界面确认并点击提交',
        }];
      }

      // ── default: today / list ─────────────────────────────────────────
      const limit = parseInt(kwargs.limit, 10) || 20;
      const rawText = await page.evaluate('document.body.innerText');
      const events = parseCalendarDayFromText(rawText, limit);

      if (events.length === 0) {
        return [{ Time: '无日程', Title: 'No events found', Type: '' }];
      }

      return events;
    });
  },
});
