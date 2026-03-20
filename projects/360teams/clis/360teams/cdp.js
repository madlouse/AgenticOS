/**
 * CDP connection utility for 360Teams Electron renderer.
 *
 * Uses chrome-remote-interface (raw CDP) instead of playwright-core.connectOverCDP,
 * because Electron does not support Browser.setDownloadBehavior which Playwright
 * calls unconditionally during connectOverCDP initialization.
 */
import CDP from 'chrome-remote-interface';

const CDP_HOST = process.env.TEAMS_CDP_HOST || 'localhost';
const CDP_PORT = parseInt(process.env.TEAMS_CDP_PORT || '9234', 10);

/**
 * Evaluate a JS expression in the 360Teams renderer page.
 * Returns the deserialized result value.
 * @param {string} expression
 * @param {import('chrome-remote-interface').Client} client
 */
async function cdpEvaluate(expression, client) {
  const { Runtime } = client;
  await Runtime.enable();
  const { result, exceptionDetails } = await Runtime.evaluate({
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) {
    const msg = exceptionDetails.exception?.description || exceptionDetails.text || 'Unknown CDP error';
    throw new Error(msg);
  }
  return result.value;
}

/**
 * Connect to 360Teams Electron renderer, run fn(page), then disconnect.
 *
 * The `page` object exposes a single method:
 *   page.evaluate(expression: string) => Promise<any>
 *
 * @param {(page: { evaluate: (expr: string) => Promise<any> }) => Promise<any>} fn
 */
export async function withElectronPage(fn) {
  // List all CDP targets to find the main renderer window
  let targets;
  try {
    targets = await CDP.List({ host: CDP_HOST, port: CDP_PORT });
  } catch (err) {
    throw new Error(
      `Cannot reach 360Teams CDP at ${CDP_HOST}:${CDP_PORT}. ` +
      'Is 360Teams running with --remote-debugging-port=9234? ' +
      `(original error: ${err.message})`
    );
  }

  // Find the main page target (type 'page' or 'other', skip devtools/background)
  const target = targets.find(
    (t) => (t.type === 'page' || t.type === 'other') &&
            !t.url.startsWith('devtools://') &&
            !t.url.includes('background')
  );
  if (!target) {
    throw new Error(
      `No 360Teams renderer page found. Available targets: ${targets.map((t) => `${t.type}:${t.url}`).join(', ')}`
    );
  }

  const client = await CDP({ host: CDP_HOST, port: CDP_PORT, target: target.id });
  try {
    const page = {
      evaluate: (expression) => cdpEvaluate(expression, client),
    };
    return await fn(page);
  } finally {
    await client.close();
  }
}
