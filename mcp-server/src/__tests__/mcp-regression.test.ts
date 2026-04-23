/**
 * MCP Regression Test Suite — Issue #336
 *
 * Captures the MCP handshake response shape as a baseline snapshot.
 * On every run, verifies the current response against the baseline.
 * Fails if protocol version, tool count, or serverInfo changes unexpectedly.
 *
 * Run with UPDATE_BASELINE=1 to regenerate the baseline snapshot after
 * a deliberate change (e.g. new release with expected tool additions).
 */
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// In compiled form, __dirname = mcp-server/build/__tests__
const MONOREPO_ROOT = join(__dirname, '..', '..', '..');
const SNAPSHOT_PATH = join(__dirname, 'mcp-regression-baseline.json');

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface McpRegressionBaseline {
  /** ISO timestamp when baseline was captured */
  capturedAt: string;
  /** agenticos-mcp version this baseline corresponds to */
  version: string;
  serverInfo: {
    name: string;
    version: string;
  };
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  /** Names of all exposed tools at baseline time */
  toolNames: string[];
  toolCount: number;
}

async function sendMessage(
  proc: ReturnType<typeof spawn> & { stdin: { write: (data: string) => void }; stdout: { on: (event: string, cb: (data: Buffer) => void) => void } },
  msg: Omit<JsonRpcMessage, 'jsonrpc'> & { jsonrpc?: string },
  timeoutMs = 8000,
): Promise<JsonRpcMessage> {
  const id = Math.floor(Math.random() * 999999);
  const fullMsg = { jsonrpc: '2.0', id, ...msg };
  proc.stdin.write(JSON.stringify(fullMsg) + '\n');

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for response to ${msg.method}`)), timeoutMs);
    const handler = (data: Buffer) => {
      const lines = data.toString().split('\n').filter((l) => l.trim());
      for (const line of lines) {
        try {
          const msg = JSON.parse(line) as JsonRpcMessage;
          if (msg.id === id) {
            clearTimeout(timer);
            proc.stdout.off('data', handler);
            resolve(msg);
          }
        } catch { /* skip */ }
      }
    };
    proc.stdout.on('data', handler);
  });
}

function spawnServer() {
  const proc = spawn('agenticos-mcp', [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, AGENTICOS_HOME: MONOREPO_ROOT },
  });
  return proc as ReturnType<typeof spawn> & { stdin: { write: (data: string) => void }; stdout: { on: (event: string, cb: (data: Buffer) => void) => void; off: (event: string, cb: (data: Buffer) => void) => void }; kill: () => boolean; killed: boolean; exitCode: number | null };
}

describe('MCP regression — handshake baseline', () => {
  let baseline: McpRegressionBaseline;

  beforeAll(() => {
    if (process.env.UPDATE_BASELINE === '1') {
      // Will generate baseline; skip reading
      baseline = {} as McpRegressionBaseline;
      return;
    }
    if (!existsSync(SNAPSHOT_PATH)) {
      throw new Error(
        `Baseline snapshot not found at ${SNAPSHOT_PATH}. ` +
        'Run with UPDATE_BASELINE=1 to generate the initial baseline.',
      );
    }
    baseline = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8')) as McpRegressionBaseline;
  });

  it('captures or validates baseline handshake response', async () => {
    const proc = spawnServer();

    try {
      const initResponse = await sendMessage(proc, {
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'regression-test', version: '1.0.0' },
        },
      });

      expect(initResponse.result).toBeDefined();
      const result = initResponse.result as {
        serverInfo: { name: string; version: string };
        protocolVersion: string;
        capabilities: Record<string, unknown>;
      };

      const current: McpRegressionBaseline = {
        capturedAt: new Date().toISOString(),
        version: result.serverInfo.version,
        serverInfo: result.serverInfo,
        protocolVersion: result.protocolVersion,
        capabilities: result.capabilities,
        toolNames: [],
        toolCount: 0,
      };

      if (process.env.UPDATE_BASELINE === '1') {
        // Capture tools/list for complete baseline
        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
        await new Promise((r) => setTimeout(r, 100));
        const toolsResponse = await sendMessage(proc, { method: 'tools/list' });
        const toolsResult = toolsResponse.result as { tools: Array<{ name: string }> };
        current.toolNames = (toolsResult.tools ?? []).map((t) => t.name);
        current.toolCount = current.toolNames.length;

        writeFileSync(SNAPSHOT_PATH, JSON.stringify(current, null, 2) + '\n');
        console.log(`[regression] Baseline updated at ${SNAPSHOT_PATH}`);
        return;
      }

      // --- Regression assertions ---
      expect(result.serverInfo.name).toBe(baseline.serverInfo.name);
      expect(result.serverInfo.version).toBe(baseline.serverInfo.version);
      expect(result.protocolVersion).toBe(baseline.protocolVersion);

      // Tools list
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      await new Promise((r) => setTimeout(r, 100));
      const toolsResponse = await sendMessage(proc, { method: 'tools/list' });
      const toolsResult = toolsResponse.result as { tools: Array<{ name: string }> };
      const currentToolNames = (toolsResult.tools ?? []).map((t) => t.name);
      const currentToolCount = currentToolNames.length;

      expect(currentToolCount).toBe(baseline.toolCount);

      // Warn on tool additions (info-level, not failure) but fail on removals
      const added = currentToolNames.filter((n) => !baseline.toolNames.includes(n));
      const removed = baseline.toolNames.filter((n) => !currentToolNames.includes(n));
      if (removed.length > 0) {
        throw new Error(
          `Regression detected: ${removed.length} tool(s) removed from MCP server.\n` +
          `Removed: ${removed.join(', ')}\n` +
          `Run with UPDATE_BASELINE=1 to accept this as the new baseline.`,
        );
      }
      if (added.length > 0) {
        console.warn(`[regression] ${added.length} new tool(s) detected (expected in release): ${added.join(', ')}`);
      }

      // Capabilities should not lose any top-level keys
      const baselineKeys = Object.keys(baseline.capabilities ?? {});
      const currentKeys = Object.keys(result.capabilities ?? {});
      const lostKeys = baselineKeys.filter((k) => !currentKeys.includes(k));
      if (lostKeys.length > 0) {
        throw new Error(
          `Regression detected: capability key(s) removed: ${lostKeys.join(', ')}`,
        );
      }
    } finally {
      proc.kill();
    }
  });
});
