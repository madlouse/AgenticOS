import { beforeEach, describe, expect, it, vi } from 'vitest';

const execAsyncMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const yamlMock = vi.hoisted(() => ({
  parse: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn(() => execAsyncMock),
}));

vi.mock('fs/promises', () => ({
  readFile: readFileMock,
}));

vi.mock('yaml', () => ({
  default: yamlMock,
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
  extractLatestIssueBootstrap: (state: any) => state?.issue_bootstrap?.latest || null,
}));

vi.mock('../../utils/repo-boundary.js', () => ({
  isImplementationAffectingTask: (taskType: string) => taskType === 'implementation' || taskType === 'bugfix',
  resolveGuardrailProjectTarget: resolveGuardrailProjectTargetMock,
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
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos',
      resolutionSource: 'repo_path_match',
      resolutionErrors: [],
      targetProject: {
        id: 'agenticos',
        name: 'AgenticOS',
        path: '/workspace/projects/agenticos/standards',
        statePath: '/workspace/projects/agenticos/standards/.context/state.yaml',
        projectYamlPath: '/workspace/projects/agenticos/standards/.project.yaml',
        sourceRepoRoots: ['/repo'],
        sourceRepoRootsDeclared: true,
      },
    });
    readFileMock.mockResolvedValue(JSON.stringify({
      issue_bootstrap: {
        updated_at: '2026-04-06T00:00:00.000Z',
        latest: {
          recorded_at: '2026-04-06T00:00:00.000Z',
          issue_id: '36',
          repo_path: '/repo',
          current_branch: 'feat/36-guardrail-preflight',
          startup_context_paths: [
            '/workspace/projects/agenticos/standards/.project.yaml',
            '/workspace/projects/agenticos/standards/.context/quick-start.md',
          ],
          stages: {
            context_reset_performed: true,
            project_hot_load_performed: true,
            issue_payload_attached: true,
          },
        },
      },
    }));
    yamlMock.parse.mockImplementation((content: string) => JSON.parse(content));
  });

  it('returns PASS for a correctly isolated implementation branch', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --git-common-dir': '.git\n',
      'config --get remote.origin.url': 'git@github.com:madlouse/AgenticOS.git\n',
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
      'rev-parse --git-common-dir': '.git\n',
      'config --get remote.origin.url': 'git@github.com:madlouse/AgenticOS.git\n',
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
      'rev-parse --git-common-dir': '.git\n',
      'config --get remote.origin.url': 'git@github.com:madlouse/AgenticOS.git\n',
      'rev-parse --abbrev-ref HEAD': 'feat/113-fail-closed-edit-boundaries\n',
      'rev-parse HEAD': 'abc123\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'worktree list --porcelain': 'worktree /main\nHEAD deadbeef\nbranch refs/heads/main\n\nworktree /repo\nHEAD abc123\nbranch refs/heads/feat/113-fail-closed-edit-boundaries\n',
      'log --format=%s origin/main..HEAD': '',
    });
    readFileMock.mockResolvedValue(JSON.stringify({
      issue_bootstrap: {
        latest: {
          issue_id: '113',
          repo_path: '/repo',
          current_branch: 'feat/113-fail-closed-edit-boundaries',
          startup_context_paths: ['/repo/projects/agenticos/standards/.project.yaml'],
          stages: {
            context_reset_performed: true,
            project_hot_load_performed: true,
            issue_payload_attached: true,
          },
        },
      },
    }));

    await runPreflight({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/repo',
      project_path: '/repo/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
      worktree_required: true,
    });

    expect(persistGuardrailEvidenceMock).toHaveBeenCalledWith(expect.objectContaining({
      project_path: '/workspace/projects/agenticos/standards',
    }));
  });

  it('persists the resolved target project path even when repo_path is a larger checkout root', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --git-common-dir': '.git\n',
      'config --get remote.origin.url': 'git@github.com:madlouse/AgenticOS.git\n',
      'rev-parse --abbrev-ref HEAD': 'feat/160-source-repo-boundary-enforcement\n',
      'rev-parse HEAD': 'abc123\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'worktree list --porcelain': 'worktree /main\nHEAD deadbeef\nbranch refs/heads/main\n\nworktree /repo\nHEAD abc123\nbranch refs/heads/feat/160-source-repo-boundary-enforcement\n',
      'log --format=%s origin/main..HEAD': '',
    });
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos-standards',
      resolutionSource: 'repo_path_match',
      resolutionErrors: [],
      targetProject: {
        id: 'agenticos-standards',
        name: 'agenticos-standards',
        path: '/repo/projects/agenticos/standards',
        statePath: '/repo/projects/agenticos/standards/.context/state.yaml',
        projectYamlPath: '/repo/projects/agenticos/standards/.project.yaml',
        sourceRepoRoots: ['/repo'],
        sourceRepoRootsDeclared: true,
      },
    });
    readFileMock.mockResolvedValue(JSON.stringify({
      issue_bootstrap: {
        latest: {
          issue_id: '160',
          repo_path: '/repo',
          current_branch: 'feat/160-source-repo-boundary-enforcement',
          startup_context_paths: ['/repo/projects/agenticos/standards/.project.yaml'],
          stages: {
            context_reset_performed: true,
            project_hot_load_performed: true,
            issue_payload_attached: true,
          },
        },
      },
    }));

    await runPreflight({
      issue_id: '160',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    });

    expect(persistGuardrailEvidenceMock).toHaveBeenCalledWith(expect.objectContaining({
      project_path: '/repo/projects/agenticos/standards',
    }));
  });

  it('returns BLOCK when branch contains unrelated commits relative to origin/main', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --git-common-dir': '.git\n',
      'config --get remote.origin.url': 'git@github.com:madlouse/AgenticOS.git\n',
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

  it('returns BLOCK when no matching issue bootstrap evidence is recorded', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --git-common-dir': '.git\n',
      'config --get remote.origin.url': 'git@github.com:madlouse/AgenticOS.git\n',
      'rev-parse --abbrev-ref HEAD': 'feat/36-guardrail-preflight\n',
      'rev-parse HEAD': 'abc123\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'worktree list --porcelain': 'worktree /main\nHEAD deadbeef\nbranch refs/heads/main\n\nworktree /repo\nHEAD abc123\nbranch refs/heads/feat/36-guardrail-preflight\n',
      'log --format=%s origin/main..HEAD': '',
    });
    readFileMock.mockResolvedValue(JSON.stringify({}));

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('no issue bootstrap evidence');
  });

  it('returns BLOCK when the latest issue bootstrap belongs to a different issue', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --git-common-dir': '.git\n',
      'config --get remote.origin.url': 'git@github.com:madlouse/AgenticOS.git\n',
      'rev-parse --abbrev-ref HEAD': 'feat/36-guardrail-preflight\n',
      'rev-parse HEAD': 'abc123\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'worktree list --porcelain': 'worktree /main\nHEAD deadbeef\nbranch refs/heads/main\n\nworktree /repo\nHEAD abc123\nbranch refs/heads/feat/36-guardrail-preflight\n',
      'log --format=%s origin/main..HEAD': '',
    });
    readFileMock.mockResolvedValue(JSON.stringify({
      issue_bootstrap: {
        latest: {
          issue_id: '999',
          repo_path: '/repo',
          current_branch: 'feat/36-guardrail-preflight',
          startup_context_paths: ['/workspace/projects/agenticos/standards/.project.yaml'],
          stages: {
            context_reset_performed: true,
            project_hot_load_performed: true,
            issue_payload_attached: true,
          },
        },
      },
    }));

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('does not match requested issue');
  });

  it('returns BLOCK for structural move without root exception or reproducibility gate', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --git-common-dir': '.git\n',
      'config --get remote.origin.url': 'git@github.com:madlouse/AgenticOS.git\n',
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

  it('returns PASS when the worktree root is declared and the remote matches the declared github repo', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos',
      resolutionSource: 'repo_path_match',
      resolutionErrors: [],
      targetProject: {
        id: 'agenticos',
        name: 'AgenticOS',
        path: '/repo/worktrees/issue-160',
        statePath: '/repo/worktrees/issue-160/.context/state.yaml',
        projectYamlPath: '/repo/worktrees/issue-160/.project.yaml',
        githubRepo: 'madlouse/AgenticOS',
        sourceRepoRoots: ['/repo/worktrees/issue-160'],
        sourceRepoRootsDeclared: true,
      },
    });
    readFileMock.mockResolvedValue(JSON.stringify({
      issue_bootstrap: {
        latest: {
          issue_id: '160',
          repo_path: '/repo/worktrees/issue-160',
          current_branch: 'fix/160-source-repo-boundary-enforcement',
          startup_context_paths: ['/repo/worktrees/issue-160/.project.yaml'],
          stages: {
            context_reset_performed: true,
            project_hot_load_performed: true,
            issue_payload_attached: true,
          },
        },
      },
    }));
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo/worktrees/issue-160\n',
      'rev-parse --git-common-dir': '/external/.git\n',
      'config --get remote.origin.url': 'git@github.com:madlouse/AgenticOS.git\n',
      'rev-parse --abbrev-ref HEAD': 'fix/160-source-repo-boundary-enforcement\n',
      'rev-parse HEAD': 'abc123\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'worktree list --porcelain': 'worktree /main\nHEAD deadbeef\nbranch refs/heads/main\n\nworktree /repo/worktrees/issue-160\nHEAD abc123\nbranch refs/heads/fix/160-source-repo-boundary-enforcement\n',
      'log --format=%s origin/main..HEAD': '',
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '160',
      task_type: 'bugfix',
      repo_path: '/repo/worktrees/issue-160',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[]; repo_identity_confirmed: boolean };

    expect(result.status).toBe('PASS');
    expect(result.repo_identity_confirmed).toBe(true);
    expect(result.block_reasons).toEqual([]);
  });

  it('returns BLOCK when the worktree root is declared but the remote points at a different github repo', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos',
      resolutionSource: 'repo_path_match',
      resolutionErrors: [],
      targetProject: {
        id: 'agenticos',
        name: 'AgenticOS',
        path: '/repo/worktrees/issue-160',
        statePath: '/repo/worktrees/issue-160/.context/state.yaml',
        projectYamlPath: '/repo/worktrees/issue-160/.project.yaml',
        githubRepo: 'madlouse/AgenticOS',
        sourceRepoRoots: ['/repo/worktrees/issue-160'],
        sourceRepoRootsDeclared: true,
      },
    });
    readFileMock.mockResolvedValue(JSON.stringify({
      issue_bootstrap: {
        latest: {
          issue_id: '160',
          repo_path: '/repo/worktrees/issue-160',
          current_branch: 'fix/160-source-repo-boundary-enforcement',
          startup_context_paths: ['/repo/worktrees/issue-160/.project.yaml'],
          stages: {
            context_reset_performed: true,
            project_hot_load_performed: true,
            issue_payload_attached: true,
          },
        },
      },
    }));
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo/worktrees/issue-160\n',
      'rev-parse --git-common-dir': '/external/.git\n',
      'config --get remote.origin.url': 'git@github.com:wrong/repo.git\n',
      'rev-parse --abbrev-ref HEAD': 'fix/160-source-repo-boundary-enforcement\n',
      'rev-parse HEAD': 'abc123\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'worktree list --porcelain': 'worktree /main\nHEAD deadbeef\nbranch refs/heads/main\n\nworktree /repo/worktrees/issue-160\nHEAD abc123\nbranch refs/heads/fix/160-source-repo-boundary-enforcement\n',
      'log --format=%s origin/main..HEAD': '',
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '160',
      task_type: 'bugfix',
      repo_path: '/repo/worktrees/issue-160',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[]; repo_identity_confirmed: boolean };

    expect(result.status).toBe('BLOCK');
    expect(result.repo_identity_confirmed).toBe(false);
    expect(result.block_reasons.join(' ')).toContain('does not match declared source_control.github_repo');
  });

  it('returns BLOCK when neither the worktree root nor the common repo root is declared for the active project', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/wrong/worktrees/issue-160\n',
      'rev-parse --git-common-dir': '/external/.git\n',
      'config --get remote.origin.url': 'git@github.com:wrong/repo.git\n',
      'rev-parse --abbrev-ref HEAD': 'fix/160-source-repo-boundary-enforcement\n',
      'rev-parse HEAD': 'abc123\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'worktree list --porcelain': 'worktree /main\nHEAD deadbeef\nbranch refs/heads/main\n\nworktree /wrong/worktrees/issue-160\nHEAD abc123\nbranch refs/heads/fix/160-source-repo-boundary-enforcement\n',
      'log --format=%s origin/main..HEAD': '',
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '160',
      task_type: 'bugfix',
      repo_path: '/wrong/worktrees/issue-160',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('neither git worktree root');
  });
});
