/**
 * Shared multi-target CDP utilities for 360Teams miniapp webviews.
 *
 * Extracted from t5t.js to support multiple miniapps (T5T, docs, calendar).
 * Each miniapp runs in a separate webview — we discover targets by URL pattern,
 * and can open new miniapps by clicking sidenav buttons on the main chat page.
 */
import CDP from 'chrome-remote-interface';
import { ensureDebugMode } from './launcher.js';

const CDP_HOST = process.env.TEAMS_CDP_HOST || 'localhost';
const CDP_PORT = parseInt(process.env.TEAMS_CDP_PORT || '9234', 10);
const MAIN_CHAT_URL_PATTERN = 'localhost:33013';

/**
 * Connect to a specific CDP target by ID.
 * Returns { page: { evaluate(expr) }, _client }.
 * Caller MUST close _client in a finally block.
 */
export async function connectToTarget(targetId) {
  const client = await CDP({ host: CDP_HOST, port: CDP_PORT, target: targetId });
  const { Runtime } = client;
  await Runtime.enable();

  return {
    page: {
      evaluate: (expr) => Runtime.evaluate({
        expression: expr,
        awaitPromise: true,
        returnByValue: true,
      }).then(({ result, exceptionDetails }) => {
        if (exceptionDetails) {
          const msg = exceptionDetails.exception?.description || exceptionDetails.text || 'Unknown CDP error';
          throw new Error(msg);
        }
        return result.value;
      }),
    },
    _client: client,
  };
}

/**
 * Find an existing miniapp target matching urlPattern.
 * Prefers type=webview over type=page.
 * @param {string} urlPattern - substring to match in target URL
 * @returns {object|null} CDP target descriptor
 */
export async function findMiniappTarget(urlPattern) {
  const targets = await CDP.List({ host: CDP_HOST, port: CDP_PORT });
  const webviewTarget = targets.find(
    (t) => t.type === 'webview' && t.url && t.url.includes(urlPattern)
  );
  if (webviewTarget) return webviewTarget;
  return targets.find(
    (t) => t.type === 'page' && t.url && t.url.includes(urlPattern)
  ) || null;
}

/**
 * Find the main 360Teams chat page target.
 * @returns {object|null}
 */
export async function findMainChatTarget() {
  const targets = await CDP.List({ host: CDP_HOST, port: CDP_PORT });
  return targets.find(
    (t) => t.type === 'page' && t.url && t.url.includes(MAIN_CHAT_URL_PATTERN)
  ) || null;
}

/**
 * Connect to an existing miniapp target and run fn(page).
 * Throws if the miniapp is not currently open.
 * @param {string} urlPattern - URL substring for target discovery
 * @param {string} friendlyName - for error messages (e.g. "T5T", "云文档")
 * @param {Function} fn - async (page) => result
 */
export async function withMiniappTarget(urlPattern, friendlyName, fn) {
  await ensureDebugMode();
  const target = await findMiniappTarget(urlPattern);
  if (!target) {
    throw new Error(`${friendlyName} is not open. Please open ${friendlyName} first.`);
  }
  const { page, _client } = await connectToTarget(target.id);
  try {
    return await fn(page);
  } finally {
    await _client.close();
  }
}

/**
 * Full open-and-connect flow for a miniapp:
 * 1. Check if miniapp already open → connect directly
 * 2. If not, click sidenavText on main chat page
 * 3. Poll for new webview matching urlPattern (timeout)
 * 4. Connect to new webview → fn(page)
 *
 * @param {object} opts
 * @param {string} opts.urlPattern - URL substring for the miniapp
 * @param {string} opts.sidenavText - text content of sidenav button to click
 * @param {string} opts.friendlyName - for error messages
 * @param {number} [opts.timeout=10000] - ms to wait for miniapp to appear
 * @param {Function} fn - async (page) => result
 */
export async function openMiniappAndConnect(opts, fn) {
  await ensureDebugMode();

  // Check if miniapp is already open
  const existing = await findMiniappTarget(opts.urlPattern);
  if (existing) {
    const { page, _client } = await connectToTarget(existing.id);
    try {
      return await fn(page);
    } finally {
      await _client.close();
    }
  }

  // Miniapp not open — click button on main chat to open it
  const mainChat = await findMainChatTarget();
  if (!mainChat) {
    throw new Error('360Teams main chat not found. Please open 360Teams.');
  }

  const { page: mainPage, _client: mainClient } = await connectToTarget(mainChat.id);
  try {
    const sidenavText = opts.sidenavText;
    // Click sidenav button — try .sidenav-item first, then any div
    const clickResult = await mainPage.evaluate(
      "(() => {" +
      "const text = " + JSON.stringify(sidenavText) + ";" +
      "const items = document.querySelectorAll('.sidenav-item');" +
      "for (const item of items) {" +
      "if (item.innerText && item.innerText.trim() === text) {" +
      "item.click(); return 'clicked sidenav-item'; }}" +
      "const divs = document.querySelectorAll('div');" +
      "for (const div of divs) {" +
      "if (div.innerText && div.innerText.trim() === text) {" +
      "div.click(); return 'clicked div'; }}" +
      "return 'not found'; })()"
    );

    if (clickResult === 'not found') {
      throw new Error(`Could not find "${opts.sidenavText}" button. Is 360Teams on the correct screen?`);
    }

    // Wait for miniapp target to appear
    const timeout = opts.timeout || 10000;
    const deadline = Date.now() + timeout;
    let miniappTarget = null;
    while (Date.now() < deadline) {
      miniappTarget = await findMiniappTarget(opts.urlPattern);
      if (miniappTarget) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!miniappTarget) {
      throw new Error(`${opts.friendlyName} did not open after clicking. Please try again.`);
    }

    const { page: miniappPage, _client: miniappClient } = await connectToTarget(miniappTarget.id);
    try {
      return await fn(miniappPage);
    } finally {
      await miniappClient.close();
    }
  } finally {
    await mainClient.close();
  }
}

// ─── Iframe Access Utilities ─────────────────────────────────────────────────

/**
 * Recursively search a frame tree for a child frame matching urlPattern.
 * @param {object} frameTree - from Page.getFrameTree()
 * @param {string} urlPattern - substring to match in frame URL
 * @returns {object|null} child frame descriptor
 */
function findIframeInTree(frameTree, urlPattern) {
  if (frameTree.childFrames) {
    for (const child of frameTree.childFrames) {
      if (child.frame.url && child.frame.url.includes(urlPattern)) {
        return child;
      }
      const found = findIframeInTree(child, urlPattern);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Connect to a CDP target and set up cross-origin iframe access.
 * Uses Page.createIsolatedWorld to bypass cross-origin restrictions.
 *
 * Returns { page, iframePage, _client } where:
 * - page.evaluate() runs in the main frame
 * - iframePage.evaluate() runs inside the cross-origin iframe
 *
 * Caller MUST close _client in a finally block.
 *
 * @param {string} targetId - CDP target ID
 * @param {string} iframeUrlPattern - substring to match in iframe URL
 * @returns {{ page, iframePage, _client }}
 */
export async function connectToTargetWithIframe(targetId, iframeUrlPattern) {
  const client = await CDP({ host: CDP_HOST, port: CDP_PORT, target: targetId });
  const { Page, Runtime } = client;
  await Page.enable();
  await Runtime.enable();

  /* Poll for iframe to appear in frame tree (may still be loading) */
  let iframeFrame = null;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { frameTree } = await Page.getFrameTree();
    iframeFrame = findIframeInTree(frameTree, iframeUrlPattern);
    if (iframeFrame) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!iframeFrame) {
    await client.close();
    throw new Error(`No iframe matching "${iframeUrlPattern}" found in frame tree`);
  }

  const { executionContextId } = await Page.createIsolatedWorld({
    frameId: iframeFrame.frame.id,
    worldName: 'iframe-reader',
    grantUniveralAccess: true,
  });

  const makeEvaluator = (contextId) => (expr) =>
    Runtime.evaluate({
      expression: expr,
      contextId,
      awaitPromise: true,
      returnByValue: true,
    }).then(({ result, exceptionDetails }) => {
      if (exceptionDetails) {
        const msg = exceptionDetails.exception?.description || exceptionDetails.text || 'Unknown CDP error';
        throw new Error(msg);
      }
      return result.value;
    });

  return {
    page: { evaluate: makeEvaluator(undefined) },
    iframePage: { evaluate: makeEvaluator(executionContextId) },
    _client: client,
    _Page: Page,
    _Runtime: Runtime,
  };
}

/**
 * Re-create an isolated world for an iframe after navigation.
 * Call this after sidebar clicks that change the iframe URL.
 *
 * @param {object} Page - CDP Page domain
 * @param {object} Runtime - CDP Runtime domain
 * @param {string} iframeUrlPattern - substring to match in iframe URL
 * @returns {{ evaluate: Function }} new iframePage object
 */
export async function refreshIframeContext(Page, Runtime, iframeUrlPattern) {
  const deadline = Date.now() + 5000;
  let iframeFrame = null;
  while (Date.now() < deadline) {
    const { frameTree } = await Page.getFrameTree();
    iframeFrame = findIframeInTree(frameTree, iframeUrlPattern);
    if (iframeFrame) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!iframeFrame) {
    throw new Error(`No iframe matching "${iframeUrlPattern}" found after navigation`);
  }

  const { executionContextId } = await Page.createIsolatedWorld({
    frameId: iframeFrame.frame.id,
    worldName: 'iframe-reader-' + Date.now(),
    grantUniveralAccess: true,
  });

  return {
    evaluate: (expr) =>
      Runtime.evaluate({
        expression: expr,
        contextId: executionContextId,
        awaitPromise: true,
        returnByValue: true,
      }).then(({ result, exceptionDetails }) => {
        if (exceptionDetails) {
          const msg = exceptionDetails.exception?.description || exceptionDetails.text || 'Unknown CDP error';
          throw new Error(msg);
        }
        return result.value;
      }),
  };
}

/**
 * Full open-and-connect flow for a miniapp with cross-origin iframe access.
 * Same flow as openMiniappAndConnect but provides both page and iframePage.
 *
 * @param {object} opts
 * @param {string} opts.urlPattern - URL substring for the miniapp webview
 * @param {string} opts.sidenavText - text content of sidenav button to click
 * @param {string} opts.friendlyName - for error messages
 * @param {string} opts.iframeUrlPattern - substring to match in iframe URL
 * @param {number} [opts.timeout=10000] - ms to wait for miniapp to appear
 * @param {Function} fn - async (page, iframePage, { _Page, _Runtime }) => result
 */
export async function openMiniappIframeAndConnect(opts, fn) {
  await ensureDebugMode();

  /* Check if miniapp is already open */
  const existing = await findMiniappTarget(opts.urlPattern);
  if (existing) {
    const { page, iframePage, _client, _Page, _Runtime } =
      await connectToTargetWithIframe(existing.id, opts.iframeUrlPattern);
    try {
      return await fn(page, iframePage, { _Page, _Runtime });
    } finally {
      await _client.close();
    }
  }

  /* Miniapp not open — click button on main chat to open it */
  const mainChat = await findMainChatTarget();
  if (!mainChat) {
    throw new Error('360Teams main chat not found. Please open 360Teams.');
  }

  const { page: mainPage, _client: mainClient } = await connectToTarget(mainChat.id);
  try {
    const sidenavText = opts.sidenavText;
    const clickResult = await mainPage.evaluate(
      "(() => {" +
      "const text = " + JSON.stringify(sidenavText) + ";" +
      "const items = document.querySelectorAll('.sidenav-item');" +
      "for (const item of items) {" +
      "if (item.innerText && item.innerText.trim() === text) {" +
      "item.click(); return 'clicked sidenav-item'; }}" +
      "const divs = document.querySelectorAll('div');" +
      "for (const div of divs) {" +
      "if (div.innerText && div.innerText.trim() === text) {" +
      "div.click(); return 'clicked div'; }}" +
      "return 'not found'; })()"
    );

    if (clickResult === 'not found') {
      throw new Error(`Could not find "${opts.sidenavText}" button. Is 360Teams on the correct screen?`);
    }

    /* Wait for miniapp target to appear */
    const timeout = opts.timeout || 10000;
    const deadline = Date.now() + timeout;
    let miniappTarget = null;
    while (Date.now() < deadline) {
      miniappTarget = await findMiniappTarget(opts.urlPattern);
      if (miniappTarget) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!miniappTarget) {
      throw new Error(`${opts.friendlyName} did not open after clicking. Please try again.`);
    }

    const { page: miniappPage, iframePage, _client: miniappClient, _Page, _Runtime } =
      await connectToTargetWithIframe(miniappTarget.id, opts.iframeUrlPattern);
    try {
      return await fn(miniappPage, iframePage, { _Page, _Runtime });
    } finally {
      await miniappClient.close();
    }
  } finally {
    await mainClient.close();
  }
}
