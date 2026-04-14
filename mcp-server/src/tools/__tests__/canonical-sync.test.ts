import { describe, expect, it, vi } from 'vitest';

const canonicalSyncMock = vi.hoisted(() => ({
  runCanonicalSync: vi.fn(),
}));

vi.mock('../../utils/canonical-sync.js', () => ({
  runCanonicalSync: canonicalSyncMock.runCanonicalSync,
}));

import { runCanonicalSync } from '../canonical-sync.js';

describe('runCanonicalSync tool wrapper', () => {
  it('serializes the utility result as formatted JSON', async () => {
    canonicalSyncMock.runCanonicalSync.mockResolvedValue({
      command: 'agenticos_canonical_sync',
      action: 'plan',
      status: 'PASS',
    });

    const result = await runCanonicalSync({ action: 'plan', repo_path: '/repo' });

    expect(canonicalSyncMock.runCanonicalSync).toHaveBeenCalledWith({ action: 'plan', repo_path: '/repo' });
    expect(JSON.parse(result)).toEqual({
      command: 'agenticos_canonical_sync',
      action: 'plan',
      status: 'PASS',
    });
  });

  it('normalizes missing args to an empty object', async () => {
    canonicalSyncMock.runCanonicalSync.mockResolvedValue({
      command: 'agenticos_canonical_sync',
      action: 'plan',
      status: 'PASS',
    });

    await runCanonicalSync(undefined);

    expect(canonicalSyncMock.runCanonicalSync).toHaveBeenCalledWith({});
  });
});
