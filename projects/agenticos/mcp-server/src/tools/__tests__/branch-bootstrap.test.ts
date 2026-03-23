import { beforeEach, describe, expect, it, vi } from 'vitest';

const execAsyncMock = vi.hoisted(() => vi.fn());
const accessMock = vi.hoisted(() => vi.fn());
const mkdirMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn(() => execAsyncMock),
}));

const persistGuardrailEvidenceMock = vi.hoisted(() => vi.fn().mockResolvedValue({
  attempted: true,
  persisted: true,
  project_id: 'agenticos',
  state_path: '/repo/.context/state.yaml',
}));

vi.mock('../../utils/guardrail-evidence.js', () => ({
  persistGuardrailEvidence: persistGuardrailEvidenceMock,
}));

vi.mock('fs/promises', () => ({
  access: accessMock,
  mkdir: mkdirMock,
}));

import { runBranchBootstrap } from '../branch-bootstrap.js';

describe('runBranchBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMock.mockRejectedValue(new Error('missing'));
    mkdirMock.mockResolvedValue(undefined);
    persistGuardrailEvidenceMock.mockResolvedValue({
      attempted: true,
      persisted: true,
      project_id: 'agenticos',
      state_path: '/repo/.context/state.yaml',
    });
  });

  it('returns CREATED and issues git worktree add from the intended remote base', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse origin/main')) {
        return { stdout: 'base123\n', stderr: '' };
      }
      if (cmd.includes('show-ref --verify --quiet refs/heads/feat/36-guardrail-helper')) {
        throw new Error('branch missing');
      }
      if (cmd.includes('worktree add "/tmp/worktrees/mcp-server-36-guardrail-helper" -b feat/36-guardrail-helper base123')) {
        return { stdout: 'Preparing worktree\n', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = JSON.parse(await runBranchBootstrap({
      issue_id: '36',
      branch_type: 'feat',
      slug: 'guardrail helper',
      repo_path: '/repo/mcp-server',
      remote_base_branch: 'origin/main',
      worktree_root: '/tmp/worktrees',
    })) as { status: string; branch_name: string; base_commit: string; worktree_path: string; notes: string[]; persistence?: { persisted: boolean } };

    expect(result.status).toBe('CREATED');
    expect(result.branch_name).toBe('feat/36-guardrail-helper');
    expect(result.base_commit).toBe('base123');
    expect(result.worktree_path).toBe('/tmp/worktrees/mcp-server-36-guardrail-helper');
    expect(result.notes.join(' ')).toContain('origin/main');
    expect(mkdirMock).toHaveBeenCalledWith('/tmp/worktrees', { recursive: true });
    expect(result.persistence?.persisted).toBe(true);
    expect(persistGuardrailEvidenceMock).toHaveBeenCalledTimes(1);
  });

  it('returns BLOCK when the target branch already exists', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse origin/main')) {
        return { stdout: 'base123\n', stderr: '' };
      }
      if (cmd.includes('show-ref --verify --quiet refs/heads/feat/36-guardrail-helper')) {
        return { stdout: '', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = JSON.parse(await runBranchBootstrap({
      issue_id: '36',
      branch_type: 'feat',
      slug: 'guardrail helper',
      repo_path: '/repo/mcp-server',
      worktree_root: '/tmp/worktrees',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons[0]).toContain('branch already exists');
    expect(mkdirMock).not.toHaveBeenCalled();
  });

  it('returns BLOCK when the target worktree path already exists', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse origin/main')) {
        return { stdout: 'base123\n', stderr: '' };
      }
      if (cmd.includes('show-ref --verify --quiet refs/heads/feat/36-guardrail-helper')) {
        throw new Error('branch missing');
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });
    accessMock.mockResolvedValue(undefined);

    const result = JSON.parse(await runBranchBootstrap({
      issue_id: '36',
      branch_type: 'feat',
      slug: 'guardrail helper',
      repo_path: '/repo/mcp-server',
      worktree_root: '/tmp/worktrees',
    })) as { status: string; block_reasons: string[]; worktree_path: string };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons[0]).toContain('worktree path already exists');
    expect(result.worktree_path).toBe('/tmp/worktrees/mcp-server-36-guardrail-helper');
    expect(mkdirMock).not.toHaveBeenCalled();
  });

  it('returns BLOCK when the remote base cannot be resolved', async () => {
    execAsyncMock.mockRejectedValue(new Error('bad ref'));

    const result = JSON.parse(await runBranchBootstrap({
      issue_id: '36',
      branch_type: 'feat',
      slug: 'guardrail helper',
      repo_path: '/repo/mcp-server',
      remote_base_branch: 'origin/main',
      worktree_root: '/tmp/worktrees',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons[0]).toContain('failed to resolve remote base');
  });
});
