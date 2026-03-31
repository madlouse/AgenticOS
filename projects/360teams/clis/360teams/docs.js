/**
 * Cloud Documents CLI commands for opencli 360teams
 *
 * Capabilities:
 * - docs (default): list documents shared with me
 * - docs --action recent: recently opened documents
 * - docs --action shared: documents shared with me
 * - docs --action favorites: my favorite documents
 * - docs --action search --query <kw>: search documents
 * - docs --action read --name <name>: read document content
 * - docs --action status: webview health check
 *
 * Architecture:
 * - Docs runs as a webview miniapp at sk.360teams.com/doc
 * - The page embeds doc.360teams.com in a cross-origin iframe
 * - CDP Page.createIsolatedWorld bypasses cross-origin restrictions
 * - Frame tree: ft.frameTree.frame = parent, ft.frameTree.childFrames = iframe
 * - After sidebar navigation the iframe URL changes; re-create isolated world
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { openMiniappIframeAndConnect, refreshIframeContext } from './miniapp-cdp.js';
import { extractDocsList, isDocsNoiseLine } from './helpers.js';

const DOCS_OPTS = {
  urlPattern: 'sk.360teams.com',
  sidenavText: '云文档',
  friendlyName: '云文档',
  iframeUrlPattern: 'doc.360teams.com',
};

/** Sidebar label (English) for each view action */
const VIEW_LABELS = {
  recent: 'Recently opened',
  shared: 'Shared with me',
  favorites: 'Favorite',
};

const VIEW_PATHS = {
  recent: '/recent',
  shared: '/share',
  favorites: '/favorites',
};

// ─── CLI Command ─────────────────────────────────────────────────────────────

cli({
  site: '360teams',
  name: 'docs',
  description: 'Cloud documents: recent, shared, favorites, search, read',
  domain: 'localhost',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    {
      name: 'action',
      required: false,
      default: 'shared',
      help: 'Action: shared, recent, favorites, search, read, status',
    },
    { name: 'query', required: false, default: '', help: 'Search keyword (for action=search)' },
    { name: 'name', required: false, default: '', help: 'Document name (for action=read)' },
    { name: 'limit', required: false, default: '20', help: 'Max results to show' },
  ],
  columns: ['Name', 'Creator', 'Time'],
  func: async (_page, kwargs) => {
    const action = kwargs.action || 'shared';
    const limit = parseInt(kwargs.limit, 10) || 20;

    /* status action: lightweight health check */
    if (action === 'status') {
      return await docsStatusCheck();
    }

    /* search action */
    if (action === 'search') {
      if (!kwargs.query) throw new Error('--query is required for search action');
      return await openMiniappIframeAndConnect(DOCS_OPTS, async (page, iframePage) => {
        await waitForDocsLoad(iframePage);
        const docs = await searchDocs(iframePage, kwargs.query, limit);
        if (docs.length === 0) return [{ Name: 'No results', Creator: '', Time: '' }];
        return docs;
      });
    }

    /* read action */
    if (action === 'read') {
      if (!kwargs.name) throw new Error('--name is required for read action');
      return await openMiniappIframeAndConnect(DOCS_OPTS, async (page, iframePage, { _Page, _Runtime }) => {
        await waitForDocsLoad(iframePage);
        /* Ensure we are in the shared list view before searching for the doc */
        const currentUrl = await iframePage.evaluate('window.location.href').catch(() => '');
        if (!currentUrl.includes(VIEW_PATHS.shared)) {
          /* Navigate iframe via parent frame's iframe.src (allowed cross-origin) */
          await page.evaluate(`(() => {
            const iframe = document.querySelector('iframe');
            if (iframe) iframe.src = 'https://doc.360teams.com/share';
          })()`);
          iframePage = await refreshIframeContext(_Page, _Runtime, DOCS_OPTS.iframeUrlPattern);
          await new Promise((r) => setTimeout(r, 2000));
        }
        const content = await readDocContent(iframePage, _Page, _Runtime, kwargs.name, limit);
        if (!content || content.length === 0) {
          return [{ Name: 'Document not found: ' + kwargs.name, Creator: '', Time: '' }];
        }
        return content;
      });
    }

    /* list actions: recent, shared, favorites */
    if (!VIEW_LABELS[action]) {
      const valid = Object.keys(VIEW_LABELS).join(', ') + ', search, read, status';
      throw new Error(`Unknown action "${action}". Use: ${valid}`);
    }

    return await openMiniappIframeAndConnect(DOCS_OPTS, async (page, iframePage, { _Page, _Runtime }) => {
      await waitForDocsLoad(iframePage);

      /* Check current iframe URL; navigate if not on target view */
      const currentUrl = await iframePage.evaluate('window.location.href');
      const targetPath = VIEW_PATHS[action];
      if (!currentUrl.includes(targetPath)) {
        await navigateToView(iframePage, action);
        /* After navigation the iframe URL changes; re-create isolated world */
        const newIframePage = await refreshIframeContext(_Page, _Runtime, DOCS_OPTS.iframeUrlPattern);
        await new Promise((r) => setTimeout(r, 1500));
        iframePage.evaluate = newIframePage.evaluate;
      }

      /* Extract document list */
      const rawText = await iframePage.evaluate(
        'document.querySelector("main") ? document.querySelector("main").innerText : document.body.innerText'
      );
      const docs = parseDocsListFromText(rawText, limit, action);

      if (docs.length === 0) {
        return [{ Name: `No documents (${action})`, Creator: '', Time: '' }];
      }
      return docs;
    });
  },
});

// ─── CDP Helpers ─────────────────────────────────────────────────────────────

async function waitForDocsLoad(iframePage, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const hasContent = await iframePage.evaluate(
        "(() => { return document.body && document.body.innerText.length > 50; })()"
      );
      if (hasContent) return;
    } catch (_) {
      // Context may be invalidated during Shimo's internal SPA navigation — retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function navigateToView(iframePage, viewName) {
  const label = VIEW_LABELS[viewName];
  if (!label) return;

  const result = await iframePage.evaluate(
    "(() => {" +
    "const spans = document.querySelectorAll(\"span\");" +
    "for (const s of spans) {" +
    "if (s.textContent.trim() === " + JSON.stringify(label) + ") {" +
    "s.click(); return \"OK\"; }}" +
    "return \"not found\"; })()"
  );

  if (result === 'not found') {
    throw new Error(`Sidebar item "${label}" not found`);
  }
}

// ─── Search ──────────────────────────────────────────────────────────────────

async function searchDocs(iframePage, query, limit) {
  const result = await iframePage.evaluate(
    `(() => {
      const input = document.querySelector('input[placeholder*="Search"], input[placeholder*="搜索"]');
      if (!input) return { error: 'search input not found' };
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return { success: true };
    })()`
  );

  if (result && result.error) throw new Error(result.error);

  await new Promise((r) => setTimeout(r, 2000));

  const rawText = await iframePage.evaluate(
    'document.querySelector("main") ? document.querySelector("main").innerText : document.body.innerText'
  );

  const isShared = rawText.includes('Share Information');
  const isFavorites = !isShared && rawText.includes('Modified time');
  const detectedAction = isShared ? 'shared' : isFavorites ? 'favorites' : 'recent';

  return parseDocsListFromText(rawText, limit, detectedAction);
}

// ─── Read Doc Content ────────────────────────────────────────────────────────

/**
 * Read document content via Shimo API (no page navigation needed).
 *
 * Strategy:
 * 1. Find the doc's href in the shared list → extract docId and docType
 * 2. Call /api/files/{docId}/content from the authenticated iframe context
 * 3. Parse by type:
 *    - sheets → regex-extract $9cellValue: tokens (canvas-rendered, DOM unreadable)
 *    - docs/docx → parse OT JSON array [op, text, style][], concatenate text segments
 */
async function readDocContent(iframePage, _Page, _Runtime, docName, limit) {
  const sectionLimit = parseInt(limit, 10) || 20;

  /* Step 1: Find href for docName in the current list view */
  const linkResult = await iframePage.evaluate(
    `(() => {
      const main = document.querySelector("main");
      if (!main) return { error: "main element not found" };
      const allEls = main.querySelectorAll("a[href]");
      for (const el of allEls) {
        const text = el.innerText || "";
        if (text.trim().includes(${JSON.stringify(docName)})) {
          return { href: el.href };
        }
      }
      return { error: "document not found in list: " + ${JSON.stringify(docName)} };
    })()`
  );

  if (linkResult && linkResult.error) {
    throw new Error(linkResult.error);
  }

  /* Step 2: Extract docId and docType from href */
  const href = linkResult.href; // e.g. https://doc.360teams.com/sheets/B1Aw16o1EQTmvXqm
  const urlParts = href.replace(/\/$/, '').split('/');
  const docId = urlParts[urlParts.length - 1];
  const docType = urlParts[urlParts.length - 2]; // 'sheets', 'docs', 'docx'

  /* Step 3: Fetch content via API — no navigation, uses existing auth cookies */
  const apiResult = await iframePage.evaluate(
    `(async () => {
      const r = await fetch('/api/files/' + ${JSON.stringify(docId)} + '/content', { credentials: 'include' });
      if (!r.ok) return { error: 'API status ' + r.status };
      return { text: await r.text() };
    })()`
  );

  if (apiResult && apiResult.error) {
    return [{ Name: docName, Creator: '[' + apiResult.error + ']', Time: '' }];
  }

  const rawText = apiResult.text || '';
  if (!rawText || rawText.length < 10) return null;

  /* Step 4: Parse based on document type */
  if (docType === 'sheets') {
    return parseSheetsContent(rawText, sectionLimit);
  } else {
    return parseDocsContent(rawText, sectionLimit);
  }
}

/**
 * Parse Shimo Sheets /content response.
 * Format: compressed binary-ish string with $9cellValue: tokens.
 * Returns a flat list of non-empty cell values.
 */
function parseSheetsContent(raw, limit) {
  const matches = [...raw.matchAll(/\$9cellValue:([^"\\,\]]+)/g)];
  const values = matches
    .map((m) => m[1].trim())
    .filter((v) => v && v !== '\\n' && v !== '\n' && v.length > 0);

  if (values.length === 0) {
    return [{ Name: '[Sheets — no readable cell values found]', Creator: '', Time: '' }];
  }

  const unique = [...new Set(values)];
  return unique.slice(0, limit).map((v) => ({ Name: v, Creator: '', Time: '' }));
}

/**
 * Parse Shimo Docs/Docx /content response.
 * Format: JSON array of OT ops: [op_type, text_content, style_string]
 * op_type 20 = insert text. Concatenate text_content into paragraphs.
 */
function parseDocsContent(raw, limit) {
  let ops;
  try {
    ops = JSON.parse(raw);
  } catch {
    /* Not JSON — fall back to raw text lines */
    return raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 2)
      .slice(0, limit)
      .map((l) => ({ Name: l.substring(0, 100), Creator: '', Time: '' }));
  }

  if (!Array.isArray(ops)) return null;

  /* Concatenate text segments into paragraphs (split on \n ops) */
  const paragraphs = [];
  let current = '';
  for (const op of ops) {
    if (!Array.isArray(op) || op[0] !== 20) continue;
    const text = op[1];
    if (typeof text !== 'string') continue;
    if (text === '\n') {
      if (current.trim().length > 0) paragraphs.push(current.trim());
      current = '';
    } else {
      current += text;
    }
  }
  if (current.trim().length > 0) paragraphs.push(current.trim());

  return paragraphs
    .filter((p) => p.length > 0)
    .slice(0, limit)
    .map((p) => ({ Name: p.substring(0, 100), Creator: p.length > 100 ? p.substring(100) : '', Time: '' }));
}

// ─── Status Check ────────────────────────────────────────────────────────────

async function docsStatusCheck() {
  return await openMiniappIframeAndConnect(DOCS_OPTS, async (page, iframePage) => {
    await new Promise((r) => setTimeout(r, 1000));
    const iframeInfo = await page.evaluate(
      "(() => {" +
      "const iframe = document.querySelector('iframe');" +
      "return iframe ? { hasIframe: true, src: iframe.src } : { hasIframe: false };" +
      "})()"
    );

    const url = iframeInfo.hasIframe ? iframeInfo.src.substring(0, 80) : 'no iframe';
    return [
      {
        Status: iframeInfo.hasIframe ? 'Webview Active' : 'No Iframe',
        URL: url,
        Notes: 'Docs iframe accessible via CDP',
      },
    ];
  });
}

// ─── Text Parser ─────────────────────────────────────────────────────────────

/**
 * Parse document list from raw innerText of the docs iframe.
 *
 * View formats (all from <main> innerText):
 * - shared:    Name, Creator, Share Information → (name, creator, time, sharer, "Share") × N
 * - recent:    Name, Creator, Open time       → (name, creator, time) × N
 * - favorites: Name, Creator, Modified time   → (name, creator, time) × N
 *
 * @param {string} text - raw innerText from <main> element
 * @param {number} limit - max rows to return
 * @param {string} action - 'recent', 'shared', or 'favorites'
 * @returns {Array<{Name: string, Creator: string, Time: string}>}
 */
export function parseDocsListFromText(text, limit = 20, action = 'shared') {
  if (!text) return [];

  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const results = [];

  /* Determine view type from headers */
  let viewType = action;
  if (action === 'shared') {
    viewType = text.includes('Share Information') ? 'shared' : text.includes('Modified time') ? 'favorites' : 'recent';
  }

  let i = 0;

  /* Skip view header */
  if (lines[0] === 'Recently opened' || lines[0] === 'Shared with me' || lines[0] === 'Favorite') {
    i++;
  }

  /* Skip column header lines */
  while (i < lines.length && isColumnHeader(lines[i])) {
    i++;
  }

  /* Parse rows */
  while (i < lines.length && results.length < limit) {
    const name = lines[i];

    /* Guard: must be a real doc name, not noise or date */
    if (!name || name.length < 2 || isDocsNoiseLine(name) || isColumnHeader(name)) {
      i++;
      continue;
    }

    i++;
    if (i >= lines.length) break;

    const creator = lines[i];

    /* Guard: creator must not be empty, a header, or equal to the doc name */
    if (!creator || isColumnHeader(creator) || creator === name) {
      continue;
    }
    i++;
    if (i >= lines.length) break;

    const time = lines[i];

    /* Guard: time must look like a date/time */
    if (!isTimeLine(time)) {
      continue;
    }
    i++;

    /* For shared view: skip the "Share" label and sharer name that follow */
    if (viewType === 'shared') {
      if (i < lines.length && lines[i] === 'Share') {
        i++; /* skip "Share" label */
      }
      if (i < lines.length && lines[i] && !isColumnHeader(lines[i]) && !isDocsNoiseLine(lines[i])) {
        i++; /* skip sharer name */
      }
    }

    results.push({ Name: name, Creator: creator, Time: time });
  }

  return results;
}

function isColumnHeader(line) {
  const headers = ['Name', 'Creator', 'Open time', 'Modified time', 'Share Information'];
  return headers.includes(line);
}

function isTimeLine(line) {
  if (!line || line.length < 5) return false;
  /* MM / DD HH:MM (recent/shared views) */
  if (/^\d{1,2} \/ \d{1,2} \d{2}:\d{2}$/.test(line)) return true;
  /* MM / DD (date only, no time) */
  if (/^\d{1,2} \/ \d{1,2}$/.test(line)) return true;
  /* DD Mon YYYY (old dates in favorites) */
  if (/^\d{1,2} [A-Za-z]{3} \d{4}$/.test(line)) return true;
  return false;
}
