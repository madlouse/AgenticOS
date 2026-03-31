/**
 * Auto-launch 360Teams in CDP debug mode.
 *
 * Flow:
 *   1. Check if CDP port is already open → done.
 *   2. Find the 360Teams app bundle on disk.
 *   3. Kill any existing instance (might be running without debug flag).
 *   4. Launch with --remote-debugging-port.
 *   5. Poll until the port responds (max 30 s), then return.
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CDP_HOST = process.env.TEAMS_CDP_HOST || 'localhost';
const CDP_PORT = parseInt(process.env.TEAMS_CDP_PORT || '9234', 10);

/** Candidate install paths, checked in order. */
const CANDIDATE_PATHS = [
  '/Applications/360teams.app',
  join(homedir(), 'Applications', '360teams.app'),
];

/** Process names used by pkill/pgrep (case-insensitive). */
const PROC_NAMES = ['360teams'];

// ─── helpers ─────────────────────────────────────────────────────────────────

async function isPortOpen() {
  try {
    const resp = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json`);
    return resp.ok;
  } catch {
    return false;
  }
}

function findAppPath() {
  for (const p of CANDIDATE_PATHS) {
    if (existsSync(p)) return p;
  }
  // Dynamic search via Spotlight
  try {
    const result = execSync(
      "mdfind \"kMDItemDisplayName == '360teams' && kMDItemKind == 'Application'\" 2>/dev/null",
      { timeout: 3000 }
    ).toString().trim();
    if (result) return result.split('\n')[0];
  } catch { /* Spotlight unavailable */ }
  return null;
}

function isRunning() {
  return PROC_NAMES.some((name) => {
    try {
      execSync(`pgrep -i -x "${name}" >/dev/null 2>&1`);
      return true;
    } catch {
      return false;
    }
  });
}

function killExisting() {
  for (const name of PROC_NAMES) {
    try { execSync(`pkill -i -x "${name}" 2>/dev/null`); } catch { /* already dead */ }
  }
  // Wait up to 3 s for process to fully exit
  for (let i = 0; i < 10 && isRunning(); i++) {
    execSync('sleep 0.3');
  }
}

async function waitForPort(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Ensure 360Teams is running with CDP debug port open.
 * Kills and relaunches the app if needed.
 * Throws an actionable error if the port is still not reachable after 30 s.
 */
export async function ensureDebugMode() {
  if (await isPortOpen()) return; // Already up — fast path

  const appPath = findAppPath();
  if (!appPath) {
    throw new Error(
      '360Teams app not found. Please install 360Teams and try again.\n' +
      `Searched: ${CANDIDATE_PATHS.join(', ')}`
    );
  }

  // Kill any existing instance (may be running without debug flag)
  if (isRunning()) killExisting();

  // Launch with debug flag
  execSync(`open -a "${appPath}" --args --remote-debugging-port=${CDP_PORT}`, {
    timeout: 5000,
  });

  const ready = await waitForPort();
  if (!ready) {
    throw new Error(
      `360Teams launched but CDP port ${CDP_PORT} not ready after 30 s.\n` +
      `Try manually: open -a "${appPath}" --args --remote-debugging-port=${CDP_PORT}`
    );
  }
}
