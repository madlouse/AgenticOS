import { describe, expect, it, vi, beforeEach } from 'vitest';

const execAsyncMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn(() => execAsyncMock),
}));

import {
  deriveExpectedWorktreeRoot,
  inspectProjectWorktreeTopology,
  isPathWithinRoot,
  resolveProjectWorktreeRoot,
} from '../worktree-topology.js';

describe('worktree-topology utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives the expected project-scoped worktree root', () => {
    expect(deriveExpectedWorktreeRoot('/workspace', 'agenticos')).toBe('/workspace/worktrees/agenticos');
  });

  it('accepts a missing override and returns the derived root', () => {
    expect(resolveProjectWorktreeRoot({
      agenticosHome: '/workspace',
      projectId: 'agenticos',
    })).toEqual({
      requestedWorktreeRoot: null,
      expectedWorktreeRoot: '/workspace/worktrees/agenticos',
      effectiveWorktreeRoot: '/workspace/worktrees/agenticos',
      deprecatedOverrideUsed: false,
      mismatchReason: null,
    });
  });

  it('accepts a deprecated override when it normalizes to the derived root', () => {
    expect(resolveProjectWorktreeRoot({
      agenticosHome: '/workspace',
      projectId: 'agenticos',
      requestedWorktreeRoot: '/workspace/worktrees/agenticos/../agenticos/',
    })).toEqual({
      requestedWorktreeRoot: '/workspace/worktrees/agenticos',
      expectedWorktreeRoot: '/workspace/worktrees/agenticos',
      effectiveWorktreeRoot: '/workspace/worktrees/agenticos',
      deprecatedOverrideUsed: true,
      mismatchReason: null,
    });
  });

  it('rejects a deprecated override when it points at a different root', () => {
    const result = resolveProjectWorktreeRoot({
      agenticosHome: '/workspace',
      projectId: 'agenticos',
      requestedWorktreeRoot: '/tmp/shared',
    });

    expect(result.mismatchReason).toContain('/tmp/shared');
    expect(result.expectedWorktreeRoot).toBe('/workspace/worktrees/agenticos');
  });

  it('checks whether a path is within a root after normalization', () => {
    expect(isPathWithinRoot('/workspace/worktrees/agenticos/issue-1', '/workspace/worktrees/agenticos')).toBe(true);
    expect(isPathWithinRoot('/workspace/worktrees/agenticos/../agenticos/issue-1', '/workspace/worktrees/agenticos')).toBe(true);
    expect(isPathWithinRoot('/workspace/worktrees/other/issue-1', '/workspace/worktrees/agenticos')).toBe(false);
  });
});

describe('inspectProjectWorktreeTopology', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies canonical, project-scoped, misplaced clean, and misplaced dirty worktrees', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/workspace/projects/agenticos\n', stderr: '' };
      }
      if (cmd.includes('worktree list --porcelain')) {
        return {
          stdout: [
            'worktree /workspace/projects/agenticos',
            'branch refs/heads/main',
            '',
            'worktree /workspace/worktrees/agenticos/agenticos-297-scope',
            'branch refs/heads/fix/297-scope',
            '',
            'worktree /workspace/shared/agenticos-13-clean',
            'branch refs/heads/fix/13-clean',
            '',
            'worktree /workspace/shared/agenticos-14-dirty',
            'branch refs/heads/fix/14-dirty',
            '',
          ].join('\n'),
          stderr: '',
        };
      }
      if (cmd.includes('/workspace/projects/agenticos') && cmd.includes('status --porcelain')) {
        return { stdout: '', stderr: '' };
      }
      if (cmd.includes('/workspace/projects/agenticos') && cmd.includes('rev-parse --abbrev-ref --symbolic-full-name @{upstream}')) {
        return { stdout: 'origin/main\n', stderr: '' };
      }
      if (cmd.includes('/workspace/worktrees/agenticos/agenticos-297-scope') && cmd.includes('status --porcelain')) {
        return { stdout: '', stderr: '' };
      }
      if (cmd.includes('/workspace/worktrees/agenticos/agenticos-297-scope') && cmd.includes('rev-parse --abbrev-ref --symbolic-full-name @{upstream}')) {
        return { stdout: 'origin/fix/297-scope\n', stderr: '' };
      }
      if (cmd.includes('/workspace/shared/agenticos-13-clean') && cmd.includes('status --porcelain')) {
        return { stdout: '', stderr: '' };
      }
      if (cmd.includes('/workspace/shared/agenticos-13-clean') && cmd.includes('rev-parse --abbrev-ref --symbolic-full-name @{upstream}')) {
        return { stdout: 'origin/fix/13-clean\n', stderr: '' };
      }
      if (cmd.includes('/workspace/shared/agenticos-14-dirty') && cmd.includes('status --porcelain')) {
        return { stdout: ' M README.md\n', stderr: '' };
      }
      if (cmd.includes('/workspace/shared/agenticos-14-dirty') && cmd.includes('rev-parse --abbrev-ref --symbolic-full-name @{upstream}')) {
        return { stdout: '', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = await inspectProjectWorktreeTopology({
      repoPath: '/workspace/projects/agenticos',
      canonicalProjectPath: '/workspace/projects/agenticos',
      expectedWorktreeRoot: '/workspace/worktrees/agenticos',
    });

    expect(result.status).toBe('BLOCK');
    expect(result.counts).toEqual({
      canonical_main: 1,
      project_scoped: 1,
      misplaced_clean: 1,
      misplaced_dirty: 1,
    });
    expect(result.worktrees.find((entry) => entry.path === '/workspace/projects/agenticos')?.placement).toBe('canonical_main');
    expect(result.worktrees.find((entry) => entry.path === '/workspace/worktrees/agenticos/agenticos-297-scope')?.placement).toBe('project_scoped');
    expect(result.worktrees.find((entry) => entry.path === '/workspace/shared/agenticos-13-clean')?.suggested_action).toContain('recreate under the expected worktree root');
    expect(result.worktrees.find((entry) => entry.path === '/workspace/shared/agenticos-14-dirty')?.suggested_action).toContain('stash or commit changes');
  });

  it('returns WARN when only misplaced clean worktrees exist', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/workspace/projects/agenticos\n', stderr: '' };
      }
      if (cmd.includes('worktree list --porcelain')) {
        return {
          stdout: [
            'worktree /workspace/projects/agenticos',
            'branch refs/heads/main',
            '',
            'worktree /workspace/shared/agenticos-13-clean',
            'branch refs/heads/fix/13-clean',
            '',
          ].join('\n'),
          stderr: '',
        };
      }
      if (cmd.includes('status --porcelain')) {
        return { stdout: '', stderr: '' };
      }
      if (cmd.includes('rev-parse --abbrev-ref --symbolic-full-name @{upstream}')) {
        return { stdout: '', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = await inspectProjectWorktreeTopology({
      repoPath: '/workspace/projects/agenticos',
      canonicalProjectPath: '/workspace/projects/agenticos',
      expectedWorktreeRoot: '/workspace/worktrees/agenticos',
    });

    expect(result.status).toBe('WARN');
    expect(result.counts.misplaced_clean).toBe(1);
    expect(result.counts.misplaced_dirty).toBe(0);
  });

  it('returns PASS when all non-canonical worktrees are under the derived project-scoped root', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/workspace/projects/agenticos\n', stderr: '' };
      }
      if (cmd.includes('worktree list --porcelain')) {
        return {
          stdout: [
            'worktree /workspace/projects/agenticos',
            'branch refs/heads/main',
            '',
            'worktree /workspace/worktrees/agenticos/agenticos-297-scope',
            'branch refs/heads/fix/297-scope',
            '',
          ].join('\n'),
          stderr: '',
        };
      }
      if (cmd.includes('status --porcelain')) {
        return { stdout: '', stderr: '' };
      }
      if (cmd.includes('rev-parse --abbrev-ref --symbolic-full-name @{upstream}')) {
        return { stdout: 'origin/main\n', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = await inspectProjectWorktreeTopology({
      repoPath: '/workspace/projects/agenticos',
      canonicalProjectPath: '/workspace/projects/agenticos',
      expectedWorktreeRoot: '/workspace/worktrees/agenticos',
    });

    expect(result.status).toBe('PASS');
    expect(result.summary).toBe('Worktree topology matches the derived project-scoped root.');
    expect(result.counts).toEqual({
      canonical_main: 1,
      project_scoped: 1,
      misplaced_clean: 0,
      misplaced_dirty: 0,
    });
  });

  it('returns BLOCK when inspection fails', async () => {
    execAsyncMock.mockRejectedValue(new Error('git failed'));

    const result = await inspectProjectWorktreeTopology({
      repoPath: '/workspace/projects/agenticos',
      canonicalProjectPath: '/workspace/projects/agenticos',
      expectedWorktreeRoot: '/workspace/worktrees/agenticos',
    });

    expect(result.status).toBe('BLOCK');
    expect(result.inspection_errors[0]).toContain('git failed');
  });

  it('falls back to a generic inspection-listing error when git worktree listing throws a non-Error value', async () => {
    execAsyncMock.mockRejectedValue('plain failure');

    const result = await inspectProjectWorktreeTopology({
      repoPath: '/workspace/projects/agenticos',
      canonicalProjectPath: '/workspace/projects/agenticos',
      expectedWorktreeRoot: '/workspace/worktrees/agenticos',
    });

    expect(result.status).toBe('BLOCK');
    expect(result.inspection_errors[0]).toContain('failed to list git worktrees');
  });

  it('marks a misplaced worktree dirty when per-worktree inspection fails', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/workspace/projects/agenticos\n', stderr: '' };
      }
      if (cmd.includes('worktree list --porcelain')) {
        return {
          stdout: [
            'worktree /workspace/shared/agenticos-14-dirty',
            'branch refs/heads/fix/14-dirty',
            '',
          ].join('\n'),
          stderr: '',
        };
      }
      if (cmd.includes('/workspace/shared/agenticos-14-dirty') && cmd.includes('rev-parse --abbrev-ref --symbolic-full-name @{upstream}')) {
        throw new Error('no upstream');
      }
      if (cmd.includes('/workspace/shared/agenticos-14-dirty') && cmd.includes('status --porcelain')) {
        throw new Error('status failed');
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = await inspectProjectWorktreeTopology({
      repoPath: '/workspace/projects/agenticos',
      canonicalProjectPath: '/workspace/projects/agenticos',
      expectedWorktreeRoot: '/workspace/worktrees/agenticos',
    });

    expect(result.status).toBe('BLOCK');
    expect(result.counts.misplaced_dirty).toBe(1);
    expect(result.inspection_errors[0]).toContain('status failed');
  });

  it('falls back to a generic per-worktree inspection error when a non-Error value is thrown', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/workspace/projects/agenticos\n', stderr: '' };
      }
      if (cmd.includes('worktree list --porcelain')) {
        return {
          stdout: [
            'worktree /workspace/shared/agenticos-14-dirty',
            'branch refs/heads/fix/14-dirty',
            '',
          ].join('\n'),
          stderr: '',
        };
      }
      if (cmd.includes('/workspace/shared/agenticos-14-dirty') && cmd.includes('rev-parse --abbrev-ref --symbolic-full-name @{upstream}')) {
        return { stdout: '', stderr: '' };
      }
      if (cmd.includes('/workspace/shared/agenticos-14-dirty') && cmd.includes('status --porcelain')) {
        throw 'plain status failure';
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = await inspectProjectWorktreeTopology({
      repoPath: '/workspace/projects/agenticos',
      canonicalProjectPath: '/workspace/projects/agenticos',
      expectedWorktreeRoot: '/workspace/worktrees/agenticos',
    });

    expect(result.status).toBe('BLOCK');
    expect(result.inspection_errors[0]).toContain('failed to inspect worktree /workspace/shared/agenticos-14-dirty');
  });

  it('returns a non-applicable result when no expected worktree root is available', async () => {
    const result = await inspectProjectWorktreeTopology({
      repoPath: '/workspace/projects/local-only',
      canonicalProjectPath: '/workspace/projects/local-only',
      expectedWorktreeRoot: null,
    });

    expect(result.applies).toBe(false);
    expect(result.status).toBe('PASS');
  });

  it('treats the actual git worktree root as canonical when repoPath is inside a larger checkout', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/workspace/checkout\n', stderr: '' };
      }
      if (cmd.includes('worktree list --porcelain')) {
        return {
          stdout: [
            'worktree /workspace/checkout',
            'branch refs/heads/main',
            '',
            'worktree /workspace/worktrees/agenticos/agenticos-297-scope',
            'branch refs/heads/fix/297-scope',
            '',
          ].join('\n'),
          stderr: '',
        };
      }
      if (cmd.includes('status --porcelain')) {
        return { stdout: '', stderr: '' };
      }
      if (cmd.includes('rev-parse --abbrev-ref --symbolic-full-name @{upstream}')) {
        return { stdout: 'origin/main\n', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = await inspectProjectWorktreeTopology({
      repoPath: '/workspace/checkout/projects/agenticos',
      canonicalProjectPath: '/workspace/checkout/projects/agenticos',
      expectedWorktreeRoot: '/workspace/worktrees/agenticos',
    });

    expect(result.status).toBe('PASS');
    expect(result.worktrees.find((entry) => entry.path === '/workspace/checkout')?.placement).toBe('canonical_main');
  });
});
