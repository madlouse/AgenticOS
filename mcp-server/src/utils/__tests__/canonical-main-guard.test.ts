import { beforeEach, describe, expect, it, vi } from 'vitest';

const execAsyncMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn(() => execAsyncMock),
}));

import { detectCanonicalMainWriteProtection } from '../canonical-main-guard.js';

describe('detectCanonicalMainWriteProtection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks the main worktree on branch main', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse --show-toplevel')) return { stdout: '/workspace/root\n', stderr: '' };
      if (cmd.includes('rev-parse --abbrev-ref HEAD')) return { stdout: 'main\n', stderr: '' };
      if (cmd.includes('worktree list --porcelain')) return { stdout: 'worktree /workspace/root\nHEAD abc\nbranch refs/heads/main\n', stderr: '' };
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = await detectCanonicalMainWriteProtection('/workspace/root');
    expect(result.blocked).toBe(true);
    expect(result.workspace_type).toBe('main');
  });

  it('does not block isolated issue worktrees', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse --show-toplevel')) return { stdout: '/workspace/root-worktrees/issue-212\n', stderr: '' };
      if (cmd.includes('rev-parse --abbrev-ref HEAD')) return { stdout: 'fix/212-canonical-main-write-guard\n', stderr: '' };
      if (cmd.includes('worktree list --porcelain')) {
        return {
          stdout: 'worktree /workspace/root\nHEAD abc\nbranch refs/heads/main\n\nworktree /workspace/root-worktrees/issue-212\nHEAD def\nbranch refs/heads/fix/212-canonical-main-write-guard\n',
          stderr: '',
        };
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = await detectCanonicalMainWriteProtection('/workspace/root-worktrees/issue-212');
    expect(result.blocked).toBe(false);
    expect(result.workspace_type).toBe('isolated_worktree');
  });
});
