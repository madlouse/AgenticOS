import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { symlinkSync, unlinkSync, mkdtempSync, realpathSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join as joinPosix } from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

// In compiled form, __dirname = mcp-server/build/__tests__
// MONOREPO_ROOT = __dirname/../../../ = worktree root
const MONOREPO_ROOT = join(__dirname, '..', '..', '..');
const BUILD_INDEX = join(MONOREPO_ROOT, 'mcp-server', 'build', 'index.js');
const PKG_JSON = join(MONOREPO_ROOT, 'mcp-server', 'package.json');

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}


async function sendMessage(proc: ReturnType<typeof spawn> & { stdin: { write: (data: string) => void }; stdout: { on: (event: string, cb: (data: Buffer) => void) => void } }, msg: Omit<JsonRpcMessage, 'jsonrpc'> & { jsonrpc?: string }, timeoutMs = 5000): Promise<JsonRpcMessage> {
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
        } catch {
          // skip
        }
      }
    };

    proc.stdout.on('data', handler);
  });
}

describe('MCP transport lifecycle integration tests', () => {
  let workDir: string;
  let symlinkPath: string;

  beforeAll(() => {
    workDir = mkdtempSync(joinPosix(tmpdir(), 'agenticos-mcp-test-'));
    symlinkPath = joinPosix(workDir, 'agenticos-mcp');
    // Use realpathSync to resolve symlinks in build path (simulates Homebrew install behavior)
    const targetPath = realpathSync(BUILD_INDEX);
    symlinkSync(targetPath, symlinkPath);
    // Ensure the symlink target is executable
    chmodSync(targetPath, 0o755);
  });

  afterAll(() => {
    try { unlinkSync(symlinkPath); } catch { /* ignore */ }
    try {
      const entries = require('fs').readdirSync(workDir);
      for (const entry of entries) {
        try { unlinkSync(joinPosix(workDir, entry)); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  });

  function spawnServer(args: string[] = []) {
    const proc = spawn(symlinkPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        AGENTICOS_HOME: MONOREPO_ROOT,
      },
    });
    return proc as ReturnType<typeof spawn> & { stdin: { write: (data: string) => void }; stdout: { on: (event: string, cb: (data: Buffer) => void) => void; off: (event: string, cb: (data: Buffer) => void) => void }; kill: () => boolean; killed: boolean; exitCode: number | null };
  }

  it('should respond to initialize via symlink path and stay alive', async () => {
    const proc = spawnServer();

    const initResponse = await sendMessage(proc, {
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });

    expect(initResponse.result).toBeDefined();
    expect(initResponse.result).toMatchObject({
      serverInfo: expect.objectContaining({ name: 'agenticos-mcp' }),
      protocolVersion: '2025-11-25',
      capabilities: expect.any(Object),
    });

    proc.kill();
    await sleep(200);
    expect(proc.killed).toBe(true);
  });

  it('should respond to tools/list after initialize', async () => {
    const proc = spawnServer();

    // Initialize first
    await sendMessage(proc, {
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });

    // Send initialized notification
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

    // Wait briefly for server to be ready
    await sleep(100);

    // Request tools
    const toolsResponse = await sendMessage(proc, { method: 'tools/list' });

    expect(toolsResponse.result).toBeDefined();
    expect(toolsResponse.result).toMatchObject({
      tools: expect.any(Array),
    });
    expect((toolsResponse.result as { tools: unknown[] }).tools.length).toBeGreaterThan(0);

    // Verify server is still alive (did not exit)
    await sleep(200);
    expect(proc.killed).toBe(false);

    proc.kill();
    await sleep(200);
  }, 15000);

  it('should NOT exit prematurely after connect returns', async () => {
    const proc = spawnServer();

    // Send initialize
    const initResponse = await sendMessage(proc, {
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });

    expect(initResponse.result).toBeDefined();

    // Wait 2 seconds — server should STILL be alive
    // If the bug exists, process would have already exited
    await sleep(2000);
    expect(proc.killed).toBe(false);
    expect(proc.exitCode).toBe(null);

    proc.kill();
    await sleep(200);
  }, 10000);

  it('should handle --version flag correctly', async () => {
    const proc = spawn('node', [BUILD_INDEX, '--version'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const output = await new Promise<string>((resolve) => {
      let data = '';
      proc.stdout!.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      proc.on('close', () => resolve(data));
    });

    const pkg = JSON.parse(readFileSync(PKG_JSON, 'utf-8'));
    expect(output.trim()).toBe(pkg.version);

    proc.kill();
  });
});