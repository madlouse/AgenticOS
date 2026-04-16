import { beforeEach, describe, expect, it, vi } from 'vitest';

const execAsyncMock = vi.hoisted(() => vi.fn());
const accessMock = vi.hoisted(() => vi.fn());
const mkdirMock = vi.hoisted(() => vi.fn());
const getAgenticOSHomeMock = vi.hoisted(() => vi.fn(() => '/workspace'));

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
const resolveGuardrailProjectTargetMock = vi.hoisted(() => vi.fn());

vi.mock('../../utils/guardrail-evidence.js', () => ({
  persistGuardrailEvidence: persistGuardrailEvidenceMock,
}));

vi.mock('../../utils/repo-boundary.js', () => ({
  resolveGuardrailProjectTarget: resolveGuardrailProjectTargetMock,
}));

vi.mock('../../utils/registry.js', () => ({
  getAgenticOSHome: getAgenticOSHomeMock,
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
    getAgenticOSHomeMock.mockReturnValue('/workspace');
    persistGuardrailEvidenceMock.mockResolvedValue({
      attempted: true,
      persisted: true,
      project_id: 'agenticos',
      state_path: '/repo/.context/state.yaml',
    });
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos',
      resolutionSource: 'repo_path_match',
      resolutionErrors: [],
      targetProject: {
        id: 'agenticos',
        name: 'AgenticOS',
        path: '/workspace/projects/agenticos',
        statePath: '/workspace/projects/agenticos/standards/.context/state.yaml',
        projectYamlPath: '/workspace/projects/agenticos/.project.yaml',
        topology: 'github_versioned',
        githubRepo: 'madlouse/AgenticOS',
        sourceRepoRoots: ['/repo'],
        sourceRepoRootsDeclared: true,
        expectedWorktreeRoot: '/workspace/worktrees/agenticos',
      },
    });
  });

  it('derives the project-scoped worktree root when no override is provided', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse origin/main')) {
        return { stdout: 'base123\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/repo/mcp-server\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '/repo/.git\n', stderr: '' };
      }
      if (cmd.includes('config --get remote.origin.url')) {
        return { stdout: 'https://github.com/madlouse/AgenticOS.git\n', stderr: '' };
      }
      if (cmd.includes('show-ref --verify --quiet refs/heads/feat/36-guardrail-helper')) {
        throw new Error('branch missing');
      }
      if (cmd.includes('worktree add "/workspace/worktrees/agenticos/repo-36-guardrail-helper" -b feat/36-guardrail-helper base123')) {
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
    })) as { status: string; branch_name: string; base_commit: string; worktree_path: string; persistence?: { persisted: boolean } };

    expect(result.status).toBe('CREATED');
    expect(result.branch_name).toBe('feat/36-guardrail-helper');
    expect(result.base_commit).toBe('base123');
    expect(result.worktree_path).toBe('/workspace/worktrees/agenticos/repo-36-guardrail-helper');
    expect(mkdirMock).toHaveBeenCalledWith('/workspace/worktrees/agenticos', { recursive: true });
    expect(result.persistence?.persisted).toBe(true);
    expect(persistGuardrailEvidenceMock).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        requested_worktree_root: null,
        expected_worktree_root: '/workspace/worktrees/agenticos',
        effective_worktree_root: '/workspace/worktrees/agenticos',
        deprecated_override_used: false,
      }),
    }));
  });

  it('accepts a deprecated override when it normalizes to the derived root', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse origin/main')) {
        return { stdout: 'base123\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/repo/mcp-server\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '/repo/.git\n', stderr: '' };
      }
      if (cmd.includes('config --get remote.origin.url')) {
        return { stdout: 'https://github.com/madlouse/AgenticOS.git\n', stderr: '' };
      }
      if (cmd.includes('show-ref --verify --quiet refs/heads/fix/160-boundary')) {
        throw new Error('branch missing');
      }
      if (cmd.includes('worktree add "/workspace/worktrees/agenticos/repo-160-boundary" -b fix/160-boundary base123')) {
        return { stdout: 'Preparing worktree\n', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = JSON.parse(await runBranchBootstrap({
      issue_id: '160',
      branch_type: 'fix',
      slug: 'boundary',
      repo_path: '/repo/mcp-server',
      worktree_root: '/workspace/worktrees/agenticos/.',
    })) as { status: string; notes: string[]; worktree_path: string };

    expect(result.status).toBe('CREATED');
    expect(result.worktree_path).toBe('/workspace/worktrees/agenticos/repo-160-boundary');
    expect(result.notes.join(' ')).toContain('accepted deprecated worktree_root override');
  });

  it('blocks a deprecated override when it points at a different root', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse origin/main')) {
        return { stdout: 'base123\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/repo/mcp-server\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '/repo/.git\n', stderr: '' };
      }
      if (cmd.includes('config --get remote.origin.url')) {
        return { stdout: 'https://github.com/madlouse/AgenticOS.git\n', stderr: '' };
      }
      if (cmd.includes('show-ref --verify --quiet refs/heads/fix/160-boundary')) {
        throw new Error('branch missing');
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = JSON.parse(await runBranchBootstrap({
      issue_id: '160',
      branch_type: 'fix',
      slug: 'boundary',
      repo_path: '/repo/mcp-server',
      worktree_root: '/tmp/shared-worktrees',
    })) as { status: string; block_reasons: string[]; notes: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('does not match derived project-scoped root');
    expect(result.block_reasons.join(' ')).toContain('/tmp/shared-worktrees');
    expect(result.block_reasons.join(' ')).toContain('/workspace/worktrees/agenticos');
    expect(result.block_reasons.join(' ')).toContain('agenticos');
    expect(result.notes.join(' ')).not.toContain('accepted deprecated worktree_root override');
    expect(mkdirMock).not.toHaveBeenCalled();
    expect(persistGuardrailEvidenceMock).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        requested_worktree_root: '/tmp/shared-worktrees',
        expected_worktree_root: '/workspace/worktrees/agenticos',
        effective_worktree_root: '/workspace/worktrees/agenticos',
        deprecated_override_used: false,
      }),
    }));
  });

  it('returns BLOCK when the target branch already exists', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse origin/main')) {
        return { stdout: 'base123\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/repo/mcp-server\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '/repo/.git\n', stderr: '' };
      }
      if (cmd.includes('config --get remote.origin.url')) {
        return { stdout: 'https://github.com/madlouse/AgenticOS.git\n', stderr: '' };
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
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/repo/mcp-server\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '/repo/.git\n', stderr: '' };
      }
      if (cmd.includes('config --get remote.origin.url')) {
        return { stdout: 'https://github.com/madlouse/AgenticOS.git\n', stderr: '' };
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
    })) as { status: string; block_reasons: string[]; worktree_path: string };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons[0]).toContain('worktree path already exists');
    expect(result.worktree_path).toBe('/workspace/worktrees/agenticos/repo-36-guardrail-helper');
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
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons[0]).toContain('failed to resolve remote base');
  });

  it('returns BLOCK when the slug normalizes to nothing', async () => {
    const result = JSON.parse(await runBranchBootstrap({
      issue_id: '36',
      branch_type: 'feat',
      slug: '!!!',
      repo_path: '/repo/mcp-server',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons[0]).toContain('slug must contain at least one alphanumeric character');
  });

  it('returns BLOCK when required inputs are missing before any git calls', async () => {
    const result = JSON.parse(await runBranchBootstrap({
      branch_type: 'feat',
      worktree_root: '/tmp/ignored',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons).toEqual([
      'issue_id is required',
      'slug is required',
      'repo_path is required',
    ]);
    expect(execAsyncMock).not.toHaveBeenCalled();
  });

  it('persists null requested_worktree_root when required inputs fail before any git calls', async () => {
    const result = JSON.parse(await runBranchBootstrap({
      issue_id: '36',
      branch_type: 'feat',
      repo_path: '/repo/mcp-server',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons).toEqual(['slug is required']);
    expect(persistGuardrailEvidenceMock).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        requested_worktree_root: null,
      }),
    }));
  });

  it('returns BLOCK when the target project cannot be resolved', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos',
      resolutionSource: null,
      resolutionErrors: ['project_path is not a resolvable managed project: /missing'],
      targetProject: null,
    });
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse origin/main')) {
        return { stdout: 'base123\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/repo/mcp-server\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '/repo/.git\n', stderr: '' };
      }
      if (cmd.includes('config --get remote.origin.url')) {
        return { stdout: 'https://github.com/madlouse/AgenticOS.git\n', stderr: '' };
      }
      if (cmd.includes('show-ref --verify --quiet refs/heads/feat/36-guardrail-helper')) {
        throw new Error('branch missing');
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = JSON.parse(await runBranchBootstrap({
      issue_id: '36',
      branch_type: 'feat',
      slug: 'guardrail helper',
      repo_path: '/repo/mcp-server',
      project_path: '/missing',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('project_path is not a resolvable managed project');
    expect(persistGuardrailEvidenceMock).toHaveBeenCalledWith(expect.objectContaining({
      project_path: '/missing',
      payload: expect.objectContaining({
        target_project_id: null,
      }),
    }));
  });

  it('returns BLOCK when neither the derived worktree root nor the common repo root is valid for the target project', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/wrong/worktrees/issue-160\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '/external/.git\n', stderr: '' };
      }
      if (cmd.includes('config --get remote.origin.url')) {
        return { stdout: 'https://github.com/madlouse/AgenticOS.git\n', stderr: '' };
      }
      if (cmd.includes('rev-parse origin/main')) {
        return { stdout: 'base123\n', stderr: '' };
      }
      if (cmd.includes('show-ref --verify --quiet refs/heads/fix/160-boundary')) {
        throw new Error('branch missing');
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = JSON.parse(await runBranchBootstrap({
      issue_id: '160',
      branch_type: 'fix',
      slug: 'boundary',
      repo_path: '/wrong/worktrees/issue-160',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('neither git worktree root');
  });

  it('fails closed when the resolved managed project is not github_versioned', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'notes',
      resolutionSource: 'repo_path_match',
      resolutionErrors: [],
      targetProject: {
        id: 'notes',
        name: 'Notes',
        path: '/workspace/projects/notes',
        statePath: '/workspace/projects/notes/.context/state.yaml',
        projectYamlPath: '/workspace/projects/notes/.project.yaml',
        topology: 'local_directory_only',
        githubRepo: null,
        sourceRepoRoots: ['/repo'],
        sourceRepoRootsDeclared: true,
        expectedWorktreeRoot: null,
      },
    });
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse origin/main')) {
        return { stdout: 'base123\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/repo/mcp-server\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '/repo/.git\n', stderr: '' };
      }
      if (cmd.includes('config --get remote.origin.url')) {
        return { stdout: 'https://github.com/madlouse/AgenticOS.git\n', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = JSON.parse(await runBranchBootstrap({
      issue_id: '91',
      branch_type: 'feat',
      slug: 'notes',
      repo_path: '/repo/mcp-server',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons).toContain('agenticos_branch_bootstrap requires a github_versioned managed project');
    expect(mkdirMock).not.toHaveBeenCalled();
  });

  it('falls back to the repo_path basename when the common repo basename sanitizes to empty', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos',
      resolutionSource: 'repo_path_match',
      resolutionErrors: [],
      targetProject: {
        id: 'agenticos',
        name: 'AgenticOS',
        path: '/workspace/projects/agenticos',
        statePath: '/workspace/projects/agenticos/standards/.context/state.yaml',
        projectYamlPath: '/workspace/projects/agenticos/.project.yaml',
        topology: 'github_versioned',
        githubRepo: 'madlouse/AgenticOS',
        sourceRepoRoots: ['/---'],
        sourceRepoRootsDeclared: true,
        expectedWorktreeRoot: '/workspace/worktrees/agenticos',
      },
    });
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse origin/main')) {
        return { stdout: 'base123\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/workspace/current/worktree\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '/---/.git\n', stderr: '' };
      }
      if (cmd.includes('config --get remote.origin.url')) {
        return { stdout: 'https://github.com/madlouse/AgenticOS.git\n', stderr: '' };
      }
      if (cmd.includes('show-ref --verify --quiet refs/heads/feat/52-basename-fallback')) {
        throw new Error('branch missing');
      }
      if (cmd.includes('worktree add "/workspace/worktrees/agenticos/worktree-52-basename-fallback" -b feat/52-basename-fallback base123')) {
        return { stdout: 'Preparing worktree\n', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = JSON.parse(await runBranchBootstrap({
      issue_id: '52',
      branch_type: 'feat',
      slug: 'basename fallback',
      repo_path: '/workspace/current/worktree',
    })) as { status: string; worktree_path: string };

    expect(result.status).toBe('CREATED');
    expect(result.worktree_path).toBe('/workspace/worktrees/agenticos/worktree-52-basename-fallback');
  });

  it('falls back to the literal repo prefix when neither basename sanitizes to a segment', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos',
      resolutionSource: 'repo_path_match',
      resolutionErrors: [],
      targetProject: {
        id: 'agenticos',
        name: 'AgenticOS',
        path: '/workspace/projects/agenticos',
        statePath: '/workspace/projects/agenticos/standards/.context/state.yaml',
        projectYamlPath: '/workspace/projects/agenticos/.project.yaml',
        topology: 'github_versioned',
        githubRepo: 'madlouse/AgenticOS',
        sourceRepoRoots: ['/---'],
        sourceRepoRootsDeclared: true,
        expectedWorktreeRoot: '/workspace/worktrees/agenticos',
      },
    });
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse origin/main')) {
        return { stdout: 'base123\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/---\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '/---/.git\n', stderr: '' };
      }
      if (cmd.includes('config --get remote.origin.url')) {
        return { stdout: 'https://github.com/madlouse/AgenticOS.git\n', stderr: '' };
      }
      if (cmd.includes('show-ref --verify --quiet refs/heads/feat/53-literal-fallback')) {
        throw new Error('branch missing');
      }
      if (cmd.includes('worktree add "/workspace/worktrees/agenticos/repo-53-literal-fallback" -b feat/53-literal-fallback base123')) {
        return { stdout: 'Preparing worktree\n', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = JSON.parse(await runBranchBootstrap({
      issue_id: '53',
      branch_type: 'feat',
      slug: 'literal fallback',
      repo_path: '/---',
    })) as { status: string; worktree_path: string };

    expect(result.status).toBe('CREATED');
    expect(result.worktree_path).toBe('/workspace/worktrees/agenticos/repo-53-literal-fallback');
  });

  it('returns BLOCK instead of throwing when creating the worktree root directory fails', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse origin/main')) {
        return { stdout: 'base123\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/repo/mcp-server\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '/repo/.git\n', stderr: '' };
      }
      if (cmd.includes('config --get remote.origin.url')) {
        return { stdout: 'https://github.com/madlouse/AgenticOS.git\n', stderr: '' };
      }
      if (cmd.includes('show-ref --verify --quiet refs/heads/feat/61-mkdir-failure')) {
        throw new Error('branch missing');
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });
    mkdirMock.mockRejectedValue(new Error('mkdir failed'));

    const result = JSON.parse(await runBranchBootstrap({
      issue_id: '61',
      branch_type: 'feat',
      slug: 'mkdir failure',
      repo_path: '/repo/mcp-server',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons).toContain('mkdir failed');
  });

  it('returns BLOCK instead of throwing when git worktree add fails', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse origin/main')) {
        return { stdout: 'base123\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/repo/mcp-server\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '/repo/.git\n', stderr: '' };
      }
      if (cmd.includes('config --get remote.origin.url')) {
        return { stdout: 'https://github.com/madlouse/AgenticOS.git\n', stderr: '' };
      }
      if (cmd.includes('show-ref --verify --quiet refs/heads/feat/62-worktree-add-failure')) {
        throw new Error('branch missing');
      }
      if (cmd.includes('worktree add "/workspace/worktrees/agenticos/repo-62-worktree-add-failure" -b feat/62-worktree-add-failure base123')) {
        throw new Error('worktree add failed');
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = JSON.parse(await runBranchBootstrap({
      issue_id: '62',
      branch_type: 'feat',
      slug: 'worktree add failure',
      repo_path: '/repo/mcp-server',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons).toContain('worktree add failed');
  });

  it('uses the generic create-worktree failure message when setup throws a non-Error value', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse origin/main')) {
        return { stdout: 'base123\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/repo/mcp-server\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '/repo/.git\n', stderr: '' };
      }
      if (cmd.includes('config --get remote.origin.url')) {
        return { stdout: 'https://github.com/madlouse/AgenticOS.git\n', stderr: '' };
      }
      if (cmd.includes('show-ref --verify --quiet refs/heads/feat/63-non-error-setup-failure')) {
        throw new Error('branch missing');
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });
    mkdirMock.mockRejectedValue('plain mkdir failure');

    const result = JSON.parse(await runBranchBootstrap({
      issue_id: '63',
      branch_type: 'feat',
      slug: 'non error setup failure',
      repo_path: '/repo/mcp-server',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons).toContain('failed to create isolated worktree');
  });
});
