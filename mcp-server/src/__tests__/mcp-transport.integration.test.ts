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
const BIN_WRAPPER = join(MONOREPO_ROOT, 'mcp-server', 'bin', 'agenticos-mcp');
const PKG_JSON = join(MONOREPO_ROOT, 'mcp-server', 'package.json');
const MCP_RESPONSE_TIMEOUT_MS = 30_000;
let MCP_BINARY: string;
try {
  MCP_BINARY = realpathSync(BIN_WRAPPER);
} catch {
  // build/ not present — use installed binary (avoids ELOOP from self-referential symlink)
  MCP_BINARY = 'agenticos-mcp';
}

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}


async function sendMessage(proc: ReturnType<typeof spawn> & { stdin: { write: (data: string) => void }; stdout: { on: (event: string, cb: (data: Buffer) => void) => void } }, msg: Omit<JsonRpcMessage, 'jsonrpc'> & { jsonrpc?: string }, timeoutMs = MCP_RESPONSE_TIMEOUT_MS): Promise<JsonRpcMessage> {
  const id = Math.floor(Math.random() * 999999);
  const fullMsg = { jsonrpc: '2.0', id, ...msg };

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
    proc.stdin.write(JSON.stringify(fullMsg) + '\n');
  });
}

describe('MCP transport lifecycle integration tests', () => {
  let workDir: string;
  let symlinkPath: string | null = null;

  beforeAll(() => {
    workDir = mkdtempSync(joinPosix(tmpdir(), 'agenticos-mcp-test-'));
    if (MCP_BINARY !== 'agenticos-mcp') {
      symlinkPath = joinPosix(workDir, 'agenticos-mcp');
      symlinkSync(MCP_BINARY, symlinkPath);
      try { chmodSync(MCP_BINARY, 0o755); } catch { /* ignore */ }
    }
    // When MCP_BINARY === 'agenticos-mcp', symlinkPath stays null — binary is used directly
  }, 45000);

  afterAll(() => {
    if (symlinkPath) { try { unlinkSync(symlinkPath); } catch { /* ignore */ } }
    try {
      const entries = require('fs').readdirSync(workDir);
      for (const entry of entries) {
        try { unlinkSync(joinPosix(workDir, entry)); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  });

  function spawnServer(args: string[] = []) {
    // Use a symlink to the published bin wrapper (simulates Homebrew/npm install)
    // or fall back to an installed binary directly.
    const binary = symlinkPath ?? MCP_BINARY;
    const proc = spawn(binary, args, {
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
  }, 45000);

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
  }, 45000);

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
  }, 45000);

  it('should handle --version flag correctly', async () => {
    const binary = symlinkPath ?? MCP_BINARY;
    const args = ['--version'];
    const proc = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    const output = await new Promise<string>((resolve) => {
      let data = '';
      proc.stdout!.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      proc.on('close', () => resolve(data));
    });

    // When using the installed binary (worktree/CI without package files),
    // verify the output is a valid semver string. When using the package
    // wrapper, also verify it matches package.json.
    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    if (MCP_BINARY !== 'agenticos-mcp') {
      const pkg = JSON.parse(readFileSync(PKG_JSON, 'utf-8'));
      expect(output.trim()).toBe(pkg.version);
    }

    proc.kill();
  }, 45000);
});
