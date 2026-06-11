import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../registry.js', () => ({
  getAgenticOSHome: () => '/mock/home',
}));

import {
  __setSessionBindingStoreRootForTests,
  clearPersistedSessionBinding,
  defaultSessionBindingStoreRoot,
  persistSessionBinding,
  resolveSessionKey,
  restoreSessionBinding,
  type PersistedSessionBinding,
} from '../session-binding-store.js';

const BINDING: PersistedSessionBinding = {
  projectId: 'agenticos',
  projectName: 'AgenticOS',
  projectPath: '/Users/x/AgenticOS/projects/agenticos',
  boundAt: '2026-06-11T00:00:00.000Z',
};

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agenticos-session-store-'));
  __setSessionBindingStoreRootForTests(root); // lifts the VITEST no-op guard
});

afterEach(() => {
  __setSessionBindingStoreRootForTests(null);
  rmSync(root, { recursive: true, force: true });
});

describe('session-binding-store', () => {
  it('round-trips a persisted binding', () => {
    persistSessionBinding(BINDING);
    const restored = restoreSessionBinding();
    expect(restored).toEqual(BINDING);
  });

  it('returns null when no binding was persisted', () => {
    expect(restoreSessionBinding()).toBeNull();
  });

  it('clears the persisted binding', () => {
    persistSessionBinding(BINDING);
    clearPersistedSessionBinding();
    expect(restoreSessionBinding()).toBeNull();
  });

  it('ignores a binding older than the restore TTL', () => {
    persistSessionBinding(BINDING);
    const wayLater = new Date(Date.now() + 25 * 60 * 60 * 1000);
    expect(restoreSessionBinding(wayLater)).toBeNull();
  });

  it('restores a binding within the TTL window', () => {
    persistSessionBinding(BINDING);
    const soon = new Date(Date.now() + 60 * 1000);
    expect(restoreSessionBinding(soon)?.projectId).toBe('agenticos');
  });

  it('is a no-op (disabled) under VITEST without an override', () => {
    __setSessionBindingStoreRootForTests(null);
    persistSessionBinding(BINDING);
    expect(restoreSessionBinding()).toBeNull();
    // Restore the override so afterEach cleanup keys off the tmp dir.
    __setSessionBindingStoreRootForTests(root);
  });

  it('returns null for a corrupt / malformed sidecar', () => {
    persistSessionBinding(BINDING);
    // Overwrite the keyed file with junk.
    const files = readdirSync(root);
    writeFileSync(join(root, files[0]), 'not: [valid', 'utf-8');
    expect(restoreSessionBinding()).toBeNull();
  });

  it('returns null when the sidecar has no usable binding fields', () => {
    const files0 = (() => { persistSessionBinding(BINDING); return readdirSync(root); })();
    writeFileSync(join(root, files0[0]), 'binding:\n  note: incomplete\n', 'utf-8');
    expect(restoreSessionBinding()).toBeNull();
  });

  it('derives a Codex session key from CODEX_THREAD_ID when present', () => {
    withEnv({ CODEX_THREAD_ID: 'thread-abc' }, () => {
      expect(resolveSessionKey()).toBe('codex-thread:thread-abc');
    });
  });

  it('derives a claude-code:cwd key when CLAUDE_CODE is set', () => {
    withEnv({ CODEX_THREAD_ID: undefined, CLAUDE_CODE: '1', CODEX: undefined, CODEX_CI: undefined, CODEX_MANAGED_BY_NPM: undefined }, () => {
      expect(resolveSessionKey()).toBe(`claude-code:${process.cwd()}`);
    });
  });

  it('derives a codex:cwd key when a Codex env (no thread id) is set', () => {
    withEnv({ CODEX_THREAD_ID: undefined, CLAUDE_CODE: undefined, CODEX: '1' }, () => {
      expect(resolveSessionKey()).toBe(`codex:${process.cwd()}`);
    });
  });

  it('derives an other:cwd key when no agent env is set', () => {
    withEnv({ CODEX_THREAD_ID: undefined, CLAUDE_CODE: undefined, CODEX: undefined, CODEX_CI: undefined, CODEX_MANAGED_BY_NPM: undefined }, () => {
      expect(resolveSessionKey()).toBe(`other:${process.cwd()}`);
    });
  });

  it('resolves the default store root under AGENTICOS_HOME', () => {
    expect(defaultSessionBindingStoreRoot()).toBe('/mock/home/.agent-workspace/runtime/session-bindings');
  });

  it('survives I/O errors as a best-effort no-throw (catch paths)', () => {
    // Point the store root *under a file* so mkdir/write/rm hit ENOTDIR.
    const blocker = join(root, 'blocker');
    writeFileSync(blocker, 'x', 'utf-8');
    __setSessionBindingStoreRootForTests(join(blocker, 'sub'));
    expect(() => persistSessionBinding(BINDING)).not.toThrow();
    expect(() => clearPersistedSessionBinding()).not.toThrow();
    expect(restoreSessionBinding()).toBeNull();
  });
});

/** Run `fn` with the given env overrides (undefined deletes), then restore. */
function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}
