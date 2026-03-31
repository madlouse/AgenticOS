/**
 * Meeting Rooms CLI command for opencli 360teams
 *
 * Find and filter available meeting rooms from the 360Teams calendar.
 *
 * Usage:
 *   opencli 360teams rooms                                    # all rooms at default workplace
 *   opencli 360teams rooms --workplace 北京360大厦             # switch workplace
 *   opencli 360teams rooms --floor 46F                        # filter by floor
 *   opencli 360teams rooms --date 2026-03-24                  # check rooms on a date
 *   opencli 360teams rooms --start 14:00 --end 15:00          # filter by time window
 *   opencli 360teams rooms --search 东京                       # search by room name
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { withElectronPage } from './cdp.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Navigate to the 找会议室 (find meeting rooms) page.
 * Clicks 日程会议 sidenav → 找会议室 button.
 */
async function navigateToRooms(page) {
  // Click 日程会议 sidenav
  const navResult = await page.evaluate(
    "(() => {" +
    "const items = document.querySelectorAll('.sidenav-item');" +
    "for (const item of items) {" +
    "if (item.innerText && item.innerText.trim() === '日程会议') {" +
    "item.click(); return 'clicked'; }}" +
    "return 'not found'; })()"
  );
  await sleep(2000);

  // Now click 找会议室 (it appears as a menu item after 日程会议 expands)
  const roomsBtn = await page.evaluate(
    "(() => {" +
    "const all = document.querySelectorAll('.sidenav-item, .sidenav-submenu-item, div, span, button, a');" +
    "for (const el of all) {" +
    "  const text = el.innerText?.trim() || '';" +
    "  if (text === '找会议室') { el.click(); return 'clicked'; } }" +
    "return 'not found'; })()"
  );
  await sleep(3000);
  return roomsBtn;
}

/**
 * Set an Element UI <el-select> value by clicking the dropdown and selecting an option.
 * @param {object} page - CDP page
 * @param {string} selector - CSS selector for the .el-select container
 * @param {string} value - The option text to select
 */
async function setElSelect(page, selector, value) {
  // Click to open the dropdown
  await page.evaluate(`(() => {
    const sel = document.querySelector('${selector}');
    if (!sel) return 'select not found';
    const input = sel.querySelector('input');
    if (input) { input.click(); return 'clicked'; }
    return 'input not found';
  })()`);
  await sleep(800);

  // Find and click the matching option (exact match first, then partial match)
  const clickResult = await page.evaluate(`(() => {
    const target = ${JSON.stringify(value)};
    // el-select-dropdown__item elements appear in body-level popper
    const items = document.querySelectorAll('.el-select-dropdown__item');
    // Try exact match first
    for (const item of items) {
      const span = item.querySelector('span') || item;
      if ((span.innerText || '').trim() === target) {
        item.click();
        return 'selected';
      }
    }
    // Fallback: partial match (e.g. '深圳' matches '深圳绿景NEO大厦')
    for (const item of items) {
      const span = item.querySelector('span') || item;
      if ((span.innerText || '').trim().includes(target)) {
        item.click();
        return 'selected-partial';
      }
    }
    return 'option not found: ' + target;
  })()`);
  await sleep(1000);
  return clickResult;
}

/**
 * Set an Element UI date-picker value.
 * @param {object} page - CDP page
 * @param {string} placeholder - The input placeholder to find (e.g. '选择日期')
 * @param {string} value - Date string to set
 */
async function setDateInput(page, placeholder, value) {
  return await page.evaluate(`(() => {
    const inputs = document.querySelectorAll('input.el-input__inner');
    for (const input of inputs) {
      if (input.placeholder === ${JSON.stringify(placeholder)}) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        ).set;
        nativeSetter.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        return 'set';
      }
    }
    return 'input not found';
  })()`);
}

/**
 * Set a time-picker value by clicking the input and selecting from the dropdown.
 * @param {object} page - CDP page
 * @param {string} placeholder - Input placeholder (e.g. '起始时间')
 * @param {string} time - Time string like '14:00'
 */
async function setTimeInput(page, placeholder, time) {
  // Click the time input to open the picker
  await page.evaluate(`(() => {
    const inputs = document.querySelectorAll('input.el-input__inner');
    for (const input of inputs) {
      if (input.placeholder === ${JSON.stringify(placeholder)}) {
        input.click();
        return 'clicked';
      }
    }
    return 'input not found';
  })()`);
  await sleep(500);

  // Try to find and click the time option in the picker dropdown
  const result = await page.evaluate(`(() => {
    const target = ${JSON.stringify(time)};
    // Time picker items
    const items = document.querySelectorAll('.el-time-spinner__item, .el-picker-panel__content .time-select-item, .el-scrollbar__view li');
    for (const item of items) {
      if ((item.innerText || '').trim() === target) {
        item.click();
        return 'selected';
      }
    }
    // Fallback: set value directly on the input
    const inputs = document.querySelectorAll('input.el-input__inner');
    for (const input of inputs) {
      if (input.placeholder === ${JSON.stringify(placeholder)}) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        ).set;
        nativeSetter.call(input, target);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        return 'set-fallback';
      }
    }
    return 'not found';
  })()`);
  await sleep(800);

  // Close any open picker by clicking body
  await page.evaluate("document.body.click()");
  await sleep(300);

  return result;
}

/**
 * Type into the search input for meeting rooms.
 */
async function setSearchInput(page, keyword) {
  return await page.evaluate(`(() => {
    const inputs = document.querySelectorAll('input.el-input__inner');
    for (const input of inputs) {
      if (input.placeholder === '搜索会议室') {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        ).set;
        nativeSetter.call(input, ${JSON.stringify(keyword)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return 'set';
      }
    }
    return 'input not found';
  })()`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Room Parser ──────────────────────────────────────────────────────────────

/**
 * Extract meeting rooms from the 找会议室 page innerText.
 *
 * Expected line patterns per room:
 *   [x2]                                         ← UI artifact (skip)
 *   深圳-东京(深圳绿景NEO大厦-46F)                ← room name + location
 *    8                                            ← capacity
 *   智慧屏(投屏/入会) · 电话 · 白板               ← devices
 *
 * @param {string} text - Raw innerText
 * @returns {Array<{Name: string, Location: string, Capacity: string, Devices: string}>}
 */
export function parseRoomsFromText(text) {
  if (!text) return [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const rooms = [];

  // Room name pattern: "城市-名称(地址)" e.g. "深圳-东京(深圳绿景NEO大厦-46F)"
  const roomPattern = /^(.+?)\((.+)\)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(roomPattern);

    // Room name must contain a dash (city-name format) and a parenthesized location
    if (match && match[1].includes('-') && !line.startsWith('[') && !line.includes('投屏')) {
      const name = match[1];
      const location = match[2];

      let capacity = '';
      let devices = '';

      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const next = lines[j];
        // Capacity line: just a number
        if (/^\d{1,3}$/.test(next)) {
          capacity = next + '人';
          if (j + 1 < lines.length) {
            const devLine = lines[j + 1];
            if (devLine.match(/智慧屏|电话|白板|投影仪|电视/)) {
              devices = (devLine.match(/智慧屏|电话|白板|投影仪|电视/g) || []).join('/');
            }
          }
          break;
        }
        // Device line without capacity
        if (next.match(/智慧屏|电话|白板|投影仪|电视/)) {
          devices = (next.match(/智慧屏|电话|白板|投影仪|电视/g) || []).join('/');
          break;
        }
        // Another room or noise → stop
        if (next.match(roomPattern) || next.startsWith('[')) break;
      }

      rooms.push({ Name: name, Location: location, Capacity: capacity, Devices: devices });
    }
  }

  return rooms;
}

// ─── CLI Command ──────────────────────────────────────────────────────────────

cli({
  site: '360teams',
  name: 'rooms',
  description: 'Find available meeting rooms with filters (workplace, floor, date, time, search)',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'workplace', required: false, default: '', help: 'Workplace name (e.g. 深圳绿景NEO大厦, 北京360大厦)' },
    { name: 'floor', required: false, default: '', help: 'Floor filter (e.g. 14F → 14层, 46F → 46层)' },
    { name: 'date', required: false, default: '', help: 'Date (YYYY-MM-DD), defaults to today' },
    { name: 'start', required: false, default: '', help: 'Start time filter (HH:MM, e.g. 14:00)' },
    { name: 'end', required: false, default: '', help: 'End time filter (HH:MM, e.g. 15:00)' },
    { name: 'search', required: false, default: '', help: 'Search rooms by name keyword' },
  ],
  func: async (_page, kwargs) => {
    return await withElectronPage(async (page) => {
      // 1. Navigate to 找会议室 page
      await navigateToRooms(page);

      // 2. Apply filters

      // Workplace
      if (kwargs.workplace) {
        await setElSelect(page, '.el-select.workplace', kwargs.workplace);
        await sleep(1500); // wait for room list to refresh
      }

      // Floor (normalize "14F" → "14层", "3F" → "3层", etc.)
      if (kwargs.floor) {
        const floorMap = { 'F': '层', 'f': '层' };
        let floorValue = kwargs.floor;
        floorValue = floorValue.replace(/(\d+)(F|f)/, '$1层');
        await setElSelect(page, '.el-select.floor', floorValue);
        await sleep(1500);
      }

      // Date
      if (kwargs.date) {
        // Convert YYYY-MM-DD to the format used by the picker (YYYY年MM月DD日)
        const [y, m, d] = kwargs.date.split('-');
        const formatted = `${y}年${String(parseInt(m))}月${String(parseInt(d))}日`;
        // Click the date input, clear it, type the new date
        await page.evaluate(`(() => {
          const inputs = document.querySelectorAll('input.el-input__inner');
          for (const input of inputs) {
            if (input.placeholder === '选择日期') {
              input.focus();
              input.click();
              return 'focused';
            }
          }
          return 'not found';
        })()`);
        await sleep(500);
        await setDateInput(page, '选择日期', formatted);
        // Press Enter to confirm
        await page.evaluate(`(() => {
          const inputs = document.querySelectorAll('input.el-input__inner');
          for (const input of inputs) {
            if (input.placeholder === '选择日期') {
              input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
              input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
              return 'enter';
            }
          }
        })()`);
        await sleep(1500);
      }

      // Start time
      if (kwargs.start) {
        await setTimeInput(page, '起始时间', kwargs.start);
        await sleep(1000);
      }

      // End time
      if (kwargs.end) {
        await setTimeInput(page, '结束时间', kwargs.end);
        await sleep(1000);
      }

      // Search
      if (kwargs.search) {
        await setSearchInput(page, kwargs.search);
        await sleep(1500);
      }

      // 3. Scroll to load all rooms, then parse results
      await page.evaluate(`(() => {
        const container = document.querySelector('.room-list, .meeting-room-list, .el-scrollbar__wrap, [class*="room"]');
        if (container) { container.scrollTop = container.scrollHeight; }
        window.scrollTo(0, document.body.scrollHeight);
      })()`);
      await sleep(1000);
      const roomsText = await page.evaluate('document.body.innerText');
      const rooms = parseRoomsFromText(roomsText);

      // 4. Get full schedule per room from FindMeeting Vue component
      const availMap = await page.evaluate(`(() => {
        const allEls = document.querySelectorAll('*');
        let findMeeting = null;
        allEls.forEach(el => {
          if (el.__vue__ && el.__vue__.$options?.name === 'FindMeeting') {
            findMeeting = el.__vue__;
          }
        });
        if (!findMeeting) {
          allEls.forEach(el => {
            if (el.__vue__ && el.__vue__.$data?.meetingList) {
              findMeeting = el.__vue__;
            }
          });
        }
        if (!findMeeting) return { occupied: {}, available: {} };

        const list = findMeeting.$data.meetingList || [];
        const fmt = (t) => {
          if (!t) return '';
          if (/^\d{1,2}:\d{2}$/.test(t)) return t;
          if (/^\d{1,2}$/.test(t)) return t + ':00';
          return t;
        };

        // Determine day boundary from first booking's date (or default 8:00-18:00)
        let dayStart = '08:00';
        let dayEnd = '18:00';

        const occupied = {};
        const available = {};

        list.forEach(room => {
          const code = room.name.split(',')[0];
          const bookings = room.booked || [];

          // Build occupied string
          if (bookings.length > 0) {
            occupied[code] = bookings.map(b => {
              const t = (b.beginTime && b.endTime) ? fmt(b.beginTime) + '-' + fmt(b.endTime) : (b.bookingDate || '');
              const person = b.sponsorName || b.sponsor || '';
              return person + ' ' + t;
            }).join(' / ');
          } else {
            occupied[code] = '空闲';
          }

          // Compute available slots
          if (bookings.length === 0) {
            available[code] = dayStart + '-' + dayEnd;
          } else {
            // Parse all booked intervals (in minutes from midnight)
            const toMin = (t) => {
              if (!t) return null;
              const parts = t.split(':');
              return parseInt(parts[0]) * 60 + parseInt(parts[1] || '0');
            };
            const slots = bookings.map(b => {
              const s = toMin(b.beginTime);
              const e = toMin(b.endTime);
              return { s, e };
            }).filter(s => s.s !== null && s.e !== null).sort((a, b) => a.s - b.s);

            const availSlots = [];
            let cur = toMin(dayStart);
            for (const slot of slots) {
              if (slot.s > cur) availSlots.push({ s: cur, e: slot.s });
              cur = Math.max(cur, slot.e);
            }
            if (cur < toMin(dayEnd)) availSlots.push({ s: cur, e: toMin(dayEnd) });

            // Format available slots
            const fmtSlot = (s, e) => {
              const sh = String(Math.floor(s / 60)).padStart(2, '0');
              const sm = String(s % 60).padStart(2, '0');
              const eh = String(Math.floor(e / 60)).padStart(2, '0');
              const em = String(e % 60).padStart(2, '0');
              if (em === '00') return sh + ':' + sm + '-' + eh + ':' + em;
              return sh + ':' + sm + '-' + eh + ':' + em;
            };
            const fmtAfter = (s) => {
              const sh = String(Math.floor(s / 60)).padStart(2, '0');
              const sm = String(s % 60).padStart(2, '0');
              return sh + ':' + sm + '后';
            };

            if (availSlots.length === 0) {
              available[code] = '无';
            } else {
              const last = availSlots[availSlots.length - 1];
              const parts = availSlots.map(slot =>
                slot.e === last.e && last.e === toMin(dayEnd) && last.e - slot.s > 30
                  ? fmtSlot(slot.s, last.e).replace(/-\d{2}:\d{2}$/, '')
                  : fmtSlot(slot.s, slot.e)
              );
              available[code] = parts.join(' / ');
            }
          }
        });

        return { occupied, available };
      })()`);

      // 5. Merge into room rows
      for (const room of rooms) {
        const shortCode = (room.Name || '').match(/^([\w-]+)/)?.[1] || room.Name;
        room.Occupied = availMap.occupied?.[shortCode] || availMap.occupied?.[room.Name] || '-';
        room.Available = availMap.available?.[shortCode] || availMap.available?.[room.Name] || '-';
      }

      if (rooms.length === 0) {
        return [{ Name: '未找到会议室', Location: '-', Capacity: '-', Devices: '-', Occupied: '-', Available: '-' }];
      }

      return rooms;
    });
  },
});
