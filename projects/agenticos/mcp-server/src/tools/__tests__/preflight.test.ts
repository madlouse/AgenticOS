import { beforeEach, describe, expect, it, vi } from 'vitest';

const execAsyncMock = vi.hoisted(() => vi.fn());

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

import { runPreflight } from '../preflight.js';

function mockGitResponses(responses: Record<string, string>): void {
  execAsyncMock.mockImplementation(async (cmd: string) => {
    for (const [pattern, stdout] of Object.entries(responses)) {
      if (cmd.includes(pattern)) {
        return { stdout, stderr: '' };
      }
    }
    throw new Error(`Unexpected command: ${cmd}`);
  });
}

describe('runPreflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistGuardrailEvidenceMock.mockResolvedValue({
      attempted: true,
      persisted: true,
      project_id: 'agenticos',
      state_path: '/repo/.context/state.yaml',
    });
  });

  it('returns PASS for a correctly isolated implementation branch', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --abbrev-ref HEAD': 'feat/36-guardrail-preflight\n',
      'rev-parse HEAD': 'abc123\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'worktree list --porcelain': 'worktree /main\nHEAD deadbeef\nbranch refs/heads/main\n\nworktree /repo\nHEAD abc123\nbranch refs/heads/feat/36-guardrail-preflight\n',
      'log --format=%s origin/main..HEAD': '',
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; worktree_ok: boolean; branch_based_on_intended_remote: boolean; persistence?: { persisted: boolean } };

    expect(result.status).toBe('PASS');
    expect(result.worktree_ok).toBe(true);
    expect(result.branch_based_on_intended_remote).toBe(true);
    expect(result.persistence?.persisted).toBe(true);
    expect(persistGuardrailEvidenceMock).toHaveBeenCalledTimes(1);
  });

  it('returns REDIRECT when implementation starts on main workspace', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --abbrev-ref HEAD': 'main\n',
      'rev-parse HEAD': 'abc123\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'worktree list --porcelain': 'worktree /repo\nHEAD abc123\nbranch refs/heads/main\n',
      'log --format=%s origin/main..HEAD': '',
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; redirect_actions: string[] };

    expect(result.status).toBe('REDIRECT');
    expect(result.redirect_actions[0]).toContain('isolated issue branch/worktree');
  });

  it('passes project_path through to guardrail evidence persistence when provided', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --abbrev-ref HEAD': 'feat/113-fail-closed-edit-boundaries\n',
      'rev-parse HEAD': 'abc123\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'worktree list --porcelain': 'worktree /main\nHEAD deadbeef\nbranch refs/heads/main\n\nworktree /repo\nHEAD abc123\nbranch refs/heads/feat/113-fail-closed-edit-boundaries\n',
      'log --format=%s origin/main..HEAD': '',
    });

    await runPreflight({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/repo',
      project_path: '/repo/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
      worktree_required: true,
    });

    expect(persistGuardrailEvidenceMock).toHaveBeenCalledWith(expect.objectContaining({
      project_path: '/repo/projects/agenticos/standards',
    }));
  });

  it('returns BLOCK when branch contains unrelated commits relative to origin/main', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --abbrev-ref HEAD': 'fix/43-mcp-server-clean-install-baseline\n',
      'rev-parse HEAD': 'abc123\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base111\n',
      'worktree list --porcelain': 'worktree /main\nHEAD deadbeef\nbranch refs/heads/main\n\nworktree /repo\nHEAD abc123\nbranch refs/heads/fix/43-mcp-server-clean-install-baseline\n',
      'log --format=%s origin/main..HEAD': 'feat(switch): inline project context in switch output (fixes #23)\nfix(record): defensively parse JSON-stringified array args (fixes #24)\n',
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons[0]).toContain('unrelated commits');
  });

  it('returns BLOCK for structural move without root exception or reproducibility gate', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --abbrev-ref HEAD': 'feat/40-self-hosting\n',
      'rev-parse HEAD': 'abc123\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'worktree list --porcelain': 'worktree /main\nHEAD deadbeef\nbranch refs/heads/main\n\nworktree /repo\nHEAD abc123\nbranch refs/heads/feat/40-self-hosting\n',
      'log --format=%s origin/main..HEAD': '',
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '40',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/**'],
      worktree_required: true,
      structural_move: true,
      root_scoped_exceptions: [],
      clean_reproducibility_gate: [],
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('.github/');
    expect(result.block_reasons.join(' ')).toContain('clean_reproducibility_gate');
  });
});
