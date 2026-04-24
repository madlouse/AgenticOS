/**
 * MCP session fixture factory for integration tests.
 *
 * Provides a typed McpSession object and helpers that wrap the JSON-RPC
 * spawn-and-communicate pattern established in mcp-transport.integration.test.ts.
 *
 * Usage:
 *   import { spawnMcpServer } from './fixtures/mcp-session.js';
 *   import { describe, it, expect, afterAll } from 'vitest';
 *
 *   describe('my integration test', () => {
 *     let session: McpSession;
 *     beforeEach(() => { session = spawnMcpServer(); });
 *     afterEach(() => { session.kill(); });
 *
 *     it('initializes', async () => {
 *       await session.sendInitialize();
 *       const tools = await session.sendToolsList();
 *       expect(tools.length).toBeGreaterThan(0);
 *     });
 *   });
 */
/// <reference types="vitest/globals" />
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { symlinkSync, unlinkSync, mkdtempSync, realpathSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join as joinPosix } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// MONOREPO_ROOT = worktree root (parent of mcp-server/)
const MONOREPO_ROOT = join(__dirname, '..', '..', '..');
const BUILD_INDEX = join(MONOREPO_ROOT, 'mcp-server', 'build', 'index.js');
const PKG_JSON = join(MONOREPO_ROOT, 'mcp-server', 'package.json');

/**
 * MCP protocol version this server implements.
 */
export const MCP_PROTOCOL_VERSION = '2025-11-25';

// ---------------------------------------------------------------------------
// Binary resolution
// ---------------------------------------------------------------------------

let _MCP_BINARY: string;
try {
  // Follow symlinks so the binary path is resolved
  _MCP_BINARY = realpathSync(BUILD_INDEX);
} catch {
  // build/ not present — use the installed binary on PATH
  _MCP_BINARY = 'agenticos-mcp';
}

// ---------------------------------------------------------------------------
// JSON-RPC types
// ---------------------------------------------------------------------------

/** JSON-RPC 2.0 request/notification shape (without the mandatory jsonrpc + id fields). */
export type JsonRpcPayload = {
  jsonrpc?: '2.0';
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
};

/** JSON-RPC 2.0 response shape. */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Raw spawned process with the stdin/stdout types narrowed to what the
 * JSON-RPC helpers need.
 */
export type McpProcess = ReturnType<typeof spawn> & {
  stdin: { write: (data: string) => void };
  stdout: { on: (event: 'data', cb: (data: Buffer) => void) => void; off: (event: 'data', cb: (data: Buffer) => void) => void };
  kill: () => boolean;
  killed: boolean;
  exitCode: number | null;
};

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

/**
 * Sends a JSON-RPC message and resolves with the matching response.
 *
 * Only responses whose `id` matches the request's `id` are returned.
 * All other lines emitted by the server are silently ignored (handles
 * interleaved notifications).
 */
async function sendMessage(
  proc: McpProcess,
  msg: JsonRpcPayload,
  timeoutMs = 5000,
): Promise<JsonRpcResponse> {
  const id = Math.floor(Math.random() * 999_999);
  const fullMsg: JsonRpcPayload = { jsonrpc: '2.0', id, ...msg };
  proc.stdin.write(JSON.stringify(fullMsg) + '\n');

  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout (${timeoutMs}ms) waiting for response to ${String(msg.method ?? 'notification')}`)),
      timeoutMs,
    );

    const handler = (data: Buffer) => {
      const lines = data.toString().split('\n').filter((l) => l.trim());
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as JsonRpcResponse;
          if (parsed.id === id) {
            clearTimeout(timer);
            proc.stdout.off('data', handler);
            resolve(parsed);
          }
        } catch {
          // skip unparseable lines
        }
      }
    };

    proc.stdout.on('data', handler);
  });
}

/**
 * Typed MCP session object returned by spawnMcpServer().
 *
 * Provides lifecycle helpers and a raw `proc` accessor for tests that
 * need to inspect process state directly.
 */
export interface McpSession {
  /** The spawned child process. */
  proc: McpProcess;

  /**
   * Sends an `initialize` request and waits for the serverInfo response.
   *
   * @param clientInfo  Optional client name/version (defaults to fixture-client/1.0.0).
   */
  sendInitialize(clientInfo?: { name: string; version: string }): Promise<{
    serverInfo: { name: string; version: string };
    protocolVersion: string;
    capabilities: Record<string, unknown>;
  }>;

  /**
   * Sends the `notifications/initialized` notification.
   * Call this after sendInitialize() before listing tools.
   */
  sendInitializedNotification(): void;

  /**
   * Sends a `tools/list` request and returns the tool list.
   */
  sendToolsList(): Promise<Array<{ name: string; description?: string }>>;

  /**
   * Sends a `shutdown` request and waits for the null result.
   */
  sendShutdown(): Promise<unknown>;

  /**
   * Kills the spawned process. Idempotent — safe to call multiple times.
   */
  kill(): void;
}

/**
 * Spawns the MCP server as a child process and returns an McpSession handle.
 *
 * A temporary directory with a symlink to the binary is created automatically
 * (matching the Homebrew install path pattern). The temporary directory is
 * cleaned up when kill() is called.
 *
 * @param args  Extra CLI arguments to pass to the server.
 */
export function spawnMcpServer(args: string[] = []): McpSession {
  const workDir = mkdtempSync(joinPosix(tmpdir(), 'agenticos-mcp-fixture-'));
  const symlinkPath = joinPosix(workDir, 'agenticos-mcp');

  let symlinkCreated = false;
  if (_MCP_BINARY !== 'agenticos-mcp') {
    symlinkSync(_MCP_BINARY, symlinkPath);
    symlinkCreated = true;
    try { chmodSync(_MCP_BINARY, 0o755); } catch { /* ignore */ }
  }

  const binary = symlinkCreated ? symlinkPath : _MCP_BINARY;
  const proc = spawn(binary, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, AGENTICOS_HOME: MONOREPO_ROOT },
  }) as McpProcess;

  return {
    proc,

    async sendInitialize(clientInfo = { name: 'fixture-client', version: '1.0.0' }) {
      const resp = await sendMessage(proc, {
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo,
        },
      });
      if (resp.error) throw new Error(`initialize error: ${resp.error.message}`);
      return resp.result as {
        serverInfo: { name: string; version: string };
        protocolVersion: string;
        capabilities: Record<string, unknown>;
      };
    },

    sendInitializedNotification() {
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    },

    async sendToolsList() {
      const resp = await sendMessage(proc, { method: 'tools/list' });
      if (resp.error) throw new Error(`tools/list error: ${resp.error.message}`);
      const result = resp.result as { tools: Array<{ name: string; description?: string }> };
      return result.tools ?? [];
    },

    async sendShutdown() {
      const resp = await sendMessage(proc, { method: 'shutdown' });
      if (resp.error) throw new Error(`shutdown error: ${resp.error.message}`);
      return resp.result;
    },

    kill() {
      proc.kill();
      if (symlinkCreated) {
        try { unlinkSync(symlinkPath); } catch { /* ignore */ }
      }
      try {
        // Remove all files in the temp workDir
        const { readdirSync, unlinkSync: unlink } = require('fs') as typeof import('fs');
        for (const entry of readdirSync(workDir)) {
          try { unlink(joinPosix(workDir, entry)); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    },
  };
}
