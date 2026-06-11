import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import yaml from 'yaml';
import { getAgenticOSHome } from './registry.js';

/**
 * Runtime persistence for the active session project binding (#516).
 *
 * The session binding otherwise lives only in MCP process memory, so an MCP
 * server reconnect mid-session wipes it and `agenticos_record` / `agenticos_status`
 * lose the bound project. This store persists the binding to a runtime sidecar
 * keyed by a stable per-session identity that is reconstructable from the
 * environment alone, so the *same* session restores its own binding on reconnect
 * without reintroducing the home-global `active_project` authority that #260/#262
 * removed (two different sessions resolve to different keys and never collide).
 *
 * The sidecar is best-effort: any I/O failure degrades to in-memory-only behavior.
 */

export interface PersistedSessionBinding {
  projectId: string;
  projectName: string;
  projectPath: string;
  boundAt: string;
}

/** Restore is ignored beyond this age, so a long-dead session cannot resurrect a binding. */
const RESTORE_TTL_MS = 24 * 60 * 60 * 1000;

let storeRootOverride: string | null = null;

/** Test seam: point the store at an isolated directory (also lifts the VITEST no-op guard). */
export function __setSessionBindingStoreRootForTests(root: string | null): void {
  storeRootOverride = root;
}

/**
 * Stable identity for "this agent session", reconstructable at restore time from
 * the environment alone:
 *   - Codex exposes CODEX_THREAD_ID, stable across reconnects within a thread.
 *   - Otherwise key by agent type + the MCP process cwd (where the agent launched),
 *     which is stable across a reconnect within the same terminal session.
 */
export function resolveSessionKey(): string {
  const codexThread = process.env.CODEX_THREAD_ID?.trim();
  if (codexThread) return `codex-thread:${codexThread}`;

  const agent = process.env.CLAUDE_CODE !== undefined
    ? 'claude-code'
    : (process.env.CODEX !== undefined
        || process.env.CODEX_CI !== undefined
        || process.env.CODEX_MANAGED_BY_NPM !== undefined)
      ? 'codex'
      : 'other';
  return `${agent}:${process.cwd()}`;
}

/** Default runtime location for session-binding sidecars, under AGENTICOS_HOME. */
export function defaultSessionBindingStoreRoot(): string {
  return join(getAgenticOSHome(), '.agent-workspace', 'runtime', 'session-bindings');
}

function storeRoot(): string {
  return storeRootOverride ?? defaultSessionBindingStoreRoot();
}

function storeFilePath(): string {
  const hash = createHash('sha256').update(resolveSessionKey()).digest('hex').slice(0, 16);
  return join(storeRoot(), `${hash}.yaml`);
}

/**
 * Disabled under the test runner so the broad suite (which manipulates the
 * in-memory binding directly) is never perturbed by real disk state — unless a
 * test explicitly opts in by setting a store-root override.
 */
function isDisabled(): boolean {
  return storeRootOverride === null
    && (process.env.VITEST !== undefined || process.env.NODE_ENV === 'test');
}

export function persistSessionBinding(binding: PersistedSessionBinding): void {
  if (isDisabled()) return;
  try {
    const root = storeRoot();
    mkdirSync(root, { recursive: true });
    const doc = {
      session_key: resolveSessionKey(),
      persisted_at: new Date().toISOString(),
      pid: process.pid,
      binding,
    };
    writeFileSync(storeFilePath(), yaml.stringify(doc), 'utf-8');
  } catch {
    // best-effort: in-memory binding still works this process
  }
}

export function restoreSessionBinding(now: Date = new Date()): PersistedSessionBinding | null {
  if (isDisabled()) return null;
  try {
    const path = storeFilePath();
    if (!existsSync(path)) return null;
    const doc = yaml.parse(readFileSync(path, 'utf-8')) || {};
    const binding = doc.binding;
    if (!binding || typeof binding.projectId !== 'string' || typeof binding.projectPath !== 'string') {
      return null;
    }
    const persistedAt = Date.parse(doc.persisted_at || binding.boundAt || '');
    if (Number.isFinite(persistedAt) && now.getTime() - persistedAt > RESTORE_TTL_MS) {
      return null;
    }
    return {
      projectId: binding.projectId,
      projectName: typeof binding.projectName === 'string' ? binding.projectName : binding.projectId,
      projectPath: binding.projectPath,
      boundAt: typeof binding.boundAt === 'string' ? binding.boundAt : new Date(persistedAt || Date.now()).toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearPersistedSessionBinding(): void {
  if (isDisabled()) return;
  try {
    rmSync(storeFilePath(), { force: true });
  } catch {
    // best-effort
  }
}
