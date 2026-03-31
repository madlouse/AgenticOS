/**
 * T5T CLI commands for opencli 360teams
 *
 * Capabilities:
 * - t5t history: Get historical T5T records
 * - t5t write: Open T5T editor for current period
 * - t5t status: Show T5T submission status
 *
 * Architecture:
 * - T5T runs as a webview miniapp at url containing 't5t'
 * - We NEVER use Page.navigate — that would replace the main chat page
 * - We click the T5T button in the left sidenav to open T5T
 * - T5T content is parsed from raw innerText
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { openMiniappAndConnect, withMiniappTarget } from './miniapp-cdp.js';
import { extractT5TRecords, extractT5TStatus } from './helpers.js';

const T5T_OPTS = {
  urlPattern: 't5t',
  sidenavText: 'T5T',
  friendlyName: 'T5T',
};

function openT5TAndConnect(fn) {
  return openMiniappAndConnect(T5T_OPTS, fn);
}

// ─── CLI Command ─────────────────────────────────────────────────────────────

cli({
  site: '360teams',
  name: 't5t',
  description: 'T5T operations: status, history, write',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    { name: 'action', required: false, default: 'status', help: 'Action: status, history, write' },
    { name: 'limit', required: false, default: '10', help: 'Number of history records to show' },
    { name: 'content', required: false, default: '', help: 'T5T content (5 items separated by |||) for auto-fill' },
  ],
  columns: ['Week', 'Status', 'SubmitTime', 'Content'],
  func: async (_page, kwargs) => {
    const action = kwargs.action || 'status';
    const limit = parseInt(kwargs.limit, 10) || 10;

    if (action === 'write') {
      return await openT5TAndConnect(async (page) => {
        // Wait for T5T to load
        await new Promise((r) => setTimeout(r, 2000));

        // If content provided, auto-fill and submit
        if (kwargs.content) {
          const contents = kwargs.content.split('|||');
          if (contents.length !== 5) {
            throw new Error('Content must contain exactly 5 items separated by |||');
          }

          // Determine mode: "写T5T" (not submitted) or "修改" (already submitted)
          const openResult = await page.evaluate(
            "(() => {" +
            "var writeBtn = document.querySelector('.btn_box:not(.btn_box--disabled)');" +
            "var hasWriteEnabled = !!(writeBtn && writeBtn.innerText.includes('写T5T'));" +
            "var writeBtnDisabled = document.querySelector('.btn_box--disabled');" +
            "var hasWriteDisabled = !!(writeBtnDisabled && writeBtnDisabled.innerText.includes('写T5T'));" +
            "var submitBtns = document.querySelectorAll('button');" +
            "var hasModify = false;" +
            "for (var i = 0; i < submitBtns.length; i++) {" +
            "if (submitBtns[i].innerText && submitBtns[i].innerText.trim() === '修改') {" +
            "hasModify = true; break; }" +
            "}" +
            "return { hasWriteEnabled: hasWriteEnabled, hasWriteDisabled: hasWriteDisabled, hasModify: hasModify };" +
            "})()"
          );

          let buttonClicked = '';
          if (openResult.hasWriteEnabled) {
            // Not submitted yet - use 写T5T button
            await page.evaluate(
              "(() => {" +
              "const writeBtn = document.querySelector('.btn_box:not(.btn_box--disabled)');" +
              "if (writeBtn) { writeBtn.click(); return 'write clicked'; }" +
              "return 'not found'; })()"
            );
            buttonClicked = '写T5T';
          } else if (openResult.hasModify) {
            // Already submitted - use 修改 button
            await page.evaluate(
              "(() => {" +
              "const buttons = document.querySelectorAll('button');" +
              "for (const btn of buttons) {" +
              "if (btn.innerText && btn.innerText.trim() === '修改') {" +
              "btn.click(); return 'modify clicked'; }" +
              "}" +
              "return 'not found'; })()"
            );
            buttonClicked = '修改';
          } else {
            throw new Error('Cannot find 写T5T or 修改 button');
          }

          // Wait for editor to open
          await new Promise((r) => setTimeout(r, 3000));

          // Set content via direct DOM manipulation (T5T Vue app updated, old __vue__ accessor no longer works)
          const fillResult = await page.evaluate(
            `new Promise((resolve) => {
              try {
                const textareas = document.querySelectorAll('textarea.el-textarea__inner');
                if (textareas.length < 5) {
                  resolve({ error: 'Expected 5 textareas, found ' + textareas.length });
                  return;
                }

                // Strip Markdown formatting: remove **bold**, code ticks, # headings
                const stripMd = (t) => t.replace(/\\*{2}([^*]+)\\*{2}/g, '$1').replace(/\\x60([^\\x60]+)\\x60/g, '$1').replace(/^#+\\s*/gm, '').trim();
                const cleanContents = ${JSON.stringify(contents)}.map(c => stripMd(c));

                // Fill each textarea
                for (let i = 0; i < 5; i++) {
                  const ta = textareas[i];
                  if (!ta) {
                    resolve({ error: 'Textarea ' + i + ' not found' });
                    return;
                  }
                  ta.value = cleanContents[i] || '';
                  ta.dispatchEvent(new Event('input', { bubbles: true }));
                  ta.dispatchEvent(new Event('change', { bubbles: true }));
                }

                resolve({ success: true, filled: 5 });
              } catch(e) {
                resolve({ error: e.message });
              }
            })`
          );

          if (fillResult.error) {
            throw new Error(`Auto-fill failed: ${fillResult.error}`);
          }

          // Small delay then click submit
          await new Promise((r) => setTimeout(r, 500));

          // Click the 提交 button
          await page.evaluate(
            "(() => {" +
            "const buttons = document.querySelectorAll('button');" +
            "for (const btn of buttons) {" +
            "if (btn.innerText && btn.innerText.trim() === '提交') {" +
            "btn.click(); return 'submit clicked'; }}" +
            "return 'not found'; })()"
          );

          // Wait for submission to complete
          await new Promise((r) => setTimeout(r, 2000));

          return [{
            Week: buttonClicked === '写T5T' ? 'Submitted (New)' : 'Updated',
            Status: 'Submitted',
            SubmitTime: new Date().toLocaleString('zh-CN'),
            Content: `5 items ${buttonClicked === '写T5T' ? 'submitted' : 'updated'} successfully`
          }];
        }

        // No content - just open editor
        // Determine mode and click appropriate button
        const openModeResult = await page.evaluate(
          "(() => {" +
          "const writeBtn = document.querySelector('.btn_box:not(.btn_box--disabled)');" +
          "const hasWriteEnabled = writeBtn && writeBtn.innerText.includes('写T5T');" +
          "const submitBtns = document.querySelectorAll('button');" +
          "let hasModify = false;" +
          "for (const btn of submitBtns) {" +
          "if (btn.innerText && btn.innerText.trim() === '修改') {" +
          "hasModify = true; break; }}" +
          "return { hasWriteEnabled, hasModify }; })()"
        );

        if (openModeResult.hasWriteEnabled) {
          await page.evaluate(
            "(() => {" +
            "const writeBtn = document.querySelector('.btn_box:not(.btn_box--disabled)');" +
            "if (writeBtn) { writeBtn.click(); return 'write clicked'; }" +
            "return 'not found'; })()"
          );
        } else if (openModeResult.hasModify) {
          await page.evaluate(
            "(() => {" +
            "const buttons = document.querySelectorAll('button');" +
            "for (const btn of buttons) {" +
            "if (btn.innerText && btn.innerText.trim() === '修改') {" +
            "btn.click(); return 'modify clicked'; }}" +
            "return 'not found'; })()"
          );
        }

        await new Promise((r) => setTimeout(r, 2000));

        const editorCheck = await page.evaluate(
          "({" +
          "hasModal: !!document.querySelector('.el-dialog, [class*=\"modal\"]')," +
          "hasTextarea: !!document.querySelector('textarea')" +
          "})"
        );
        return [{
          Week: openModeResult.hasWriteEnabled ? '写T5T mode' : '修改 mode',
          Status: editorCheck.hasTextarea ? 'textarea ready' : 'modal may be open',
          SubmitTime: '',
          Content: 'T5T editor opened - ' + (openModeResult.hasWriteEnabled ? 'ready to submit' : 'ready to update')
        }];
      });
    }

    if (action === 'history') {
      return await openT5TAndConnect(async (page) => {
        // Wait for initial load
        await new Promise((r) => setTimeout(r, 2000));

        // Click "我的T5T" tab to switch to history view
        await page.evaluate(
          "(() => {" +
          "const spans = document.querySelectorAll('span.title-label-wrap');" +
          "for (const span of spans) {" +
          "if (span.innerText && span.innerText.trim() === '我的T5T') {" +
          "span.click(); return 'clicked'; }}" +
          "return 'not found'; })()"
        );

        // Wait for history content to load
        await new Promise((r) => setTimeout(r, 3000));

        // Get raw text
        const rawText = await page.evaluate(
          "(() => {" +
          "const el = document.querySelector('.weekly-outer');" +
          "return el ? el.innerText : document.body.innerText;" +
          "})()"
        );

        // Parse and extract
        const records = parseT5THistoryFromText(rawText, limit);
        if (records.length === 0) {
          return [{ Week: 'No records', Status: '', SubmitTime: '', Content: 'No T5T history found' }];
        }
        // Map to column names
        return records.map(r => ({
          Week: r.title,
          Status: '已提交',
          SubmitTime: r.time,
          Content: r.content,
        }));
      });
    }

    // Default: status
    return await openT5TAndConnect(async (page) => {
      await new Promise((r) => setTimeout(r, 2000));
      const rawText = await page.evaluate('document.body.innerText');
      return extractT5TStatusFromText(rawText);
    });
  },
});

// ─── Text Parsing Helpers ─────────────────────────────────────────────────────

/**
 * Parse T5T history from raw page text
 */
export function parseT5THistoryFromText(text, limit = 10) {
  const results = [];

  // Split text into blocks by week header
  // Each week block starts with "YYYY年M月第N周"
  const weekPattern = /(\d{4}年\d+月第\d+周)/;
  const lines = text.split('\n');

  let currentWeek = null;
  let currentBlock = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this line is a week header
    const weekMatch = trimmed.match(weekPattern);
    if (weekMatch) {
      // Save previous week if exists
      if (currentWeek && currentBlock.length > 0) {
        const parsed = parseWeekBlock(currentWeek, currentBlock);
        if (parsed) results.push(parsed);
      }
      // Start new week
      currentWeek = weekMatch[1];
      currentBlock = [trimmed];
    } else {
      currentBlock.push(trimmed);
    }
  }

  // Don't forget last week
  if (currentWeek && currentBlock.length > 0) {
    const parsed = parseWeekBlock(currentWeek, currentBlock);
    if (parsed) results.push(parsed);
  }

  return results.slice(0, limit);
}

/**
 * Parse a single week block into title, time, and content
 */
function parseWeekBlock(weekTitle, lines) {
  let time = '';
  const contentLines = [];
  let pendingItem = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (i === 0 && trimmed === weekTitle) continue;

    if (trimmed.match(/\d{4}[-/年]\d+[-/月]\d+/) || trimmed.match(/\d{2}:\d{2}/)) {
      time = trimmed.replace(/[()（）【】[\]]/g, '');
      pendingItem = null;
      continue;
    }

    const numMatch = trimmed.match(/^([1-5１-５])$/);
    if (numMatch) {
      if (pendingItem && pendingItem.content) contentLines.push(pendingItem.content);
      pendingItem = { num: numMatch[1], content: '' };
      continue;
    }

    if (trimmed.match(/^[1-5１-５][.、:：]/)) {
      if (pendingItem && pendingItem.content) contentLines.push(pendingItem.content);
      pendingItem = null;
      const content = trimmed.replace(/^[1１][.、:：]\s*/, '');
      if (content) contentLines.push(content);
      continue;
    }

    if (pendingItem) {
      if (isNoiseLine(trimmed) || trimmed.length <= 3) {
        if (pendingItem.content) contentLines.push(pendingItem.content);
        pendingItem = null;
        continue;
      }
      pendingItem.content = pendingItem.content
        ? pendingItem.content + '；' + trimmed
        : trimmed;
      continue;
    }

    if (!isNoiseLine(trimmed) && trimmed.length > 3) {
      contentLines.push(trimmed);
    }
  }

  if (pendingItem && pendingItem.content) contentLines.push(pendingItem.content);
  return {
    title: weekTitle,
    time: time,
    content: contentLines.slice(0, 5).join('；')
  };
}

/**
 * Check if a line is noise (UI chrome, not actual content)
 */
function isNoiseLine(line) {
  const noisePatterns = [
    /^T5T$/,
    /^筛选$/,
    /^写T5T$/,
    /^写作指引$/,
    /^我的T5T$/,
    /^黄建庭$/,
    /^我的直接上级$/,
    /^向我汇报的/,
    /^我关注的/,
    /^向我汇报的/,
    /^我团队的/,
    /^抄送我的/,
    /^关注我的/,
    /^已提交$/,
    /^未提交$/,
    /^修改$/,
    /^评论$/,
    /^\d+人已提交/,
    /^您还未填写/,
    /^立即填写/,
    /^暂无个性签名/,
    /^工号：/,
    /^邮箱：/,
    /^职场：/,
    /^部门：/,
    /^[张王倪雷高俊立嘉宋李周黄]$/,  // Single character names
    /^.+[彭荣霖旭强升]$/,  // More name endings
  ];

  return noisePatterns.some(p => p.test(line));
}

/**
 * Extract T5T status from raw page text
 */
export function extractT5TStatusFromText(text) {
  let currentStatus = '';
  if (text.includes('您还未填写')) {
    currentStatus = '未填写';
  } else if (text.includes('立即填写')) {
    currentStatus = '待填写';
  } else if (text.includes('已填写')) {
    currentStatus = '已填写';
  } else {
    currentStatus = '未知';
  }

  const unsubmitMatches = text.match(/未提交/g);
  const submitMatches = text.match(/已提交/g);
  const unsubmitCount = unsubmitMatches ? unsubmitMatches.length : 0;
  const submitCount = submitMatches ? submitMatches.length : 0;

  let currentWeek = '';
  const weekMatch = text.match(/(\d{4}年\d+月第\d+周)/);
  if (weekMatch) {
    currentWeek = weekMatch[1];
  }

  return [{
    Week: currentWeek || '当前周期',
    Status: currentStatus,
    SubmitTime: '',
    Content: `团队: ${submitCount}人已提交, ${unsubmitCount}人未提交`
  }];
}
