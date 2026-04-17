import { beforeEach, describe, expect, it, vi } from 'vitest';

const execAsyncMock = vi.hoisted(() => vi.fn());
const loadLatestGuardrailStateMock = vi.hoisted(() => vi.fn());

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
  extractLatestIssueBootstrap: (state: any) => state?.issue_bootstrap?.latest || null,
  loadLatestGuardrailState: loadLatestGuardrailStateMock,
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
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {
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
      },
    });
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

  it('returns BLOCK immediately when repo_path is missing', async () => {
    const result = JSON.parse(await runPreflight({
      task_type: 'implementation',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons).toContain('repo_path is required');
  });

  it('treats workspace detection failures as canonical main for safety', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/repo\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '.git\n', stderr: '' };
      }
      if (cmd.includes('config --get remote.origin.url')) {
        return { stdout: 'git@github.com:madlouse/AgenticOS.git\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --abbrev-ref HEAD')) {
        return { stdout: 'feat/36-guardrail-preflight\n', stderr: '' };
      }
      if (cmd.includes('rev-parse HEAD')) {
        return { stdout: 'abc123\n', stderr: '' };
      }
      if (cmd.includes('rev-parse origin/main')) {
        return { stdout: 'base999\n', stderr: '' };
      }
      if (cmd.includes('merge-base HEAD origin/main')) {
        return { stdout: 'base999\n', stderr: '' };
      }
      if (cmd.includes('worktree list --porcelain')) {
        throw new Error('git worktree failed');
      }
      if (cmd.includes('log --format=%s origin/main..HEAD')) {
        return { stdout: '', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; redirect_actions: string[] };

    expect(result.status).toBe('REDIRECT');
    expect(result.redirect_actions.join(' ')).toContain('isolated issue branch/worktree');
  });

  it('returns BLOCK when implementation-affecting arguments are missing', async () => {
    const result = JSON.parse(await runPreflight({
      task_type: 'implementation',
      repo_path: '/repo',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons).toContain('issue_id is required for implementation work');
    expect(result.block_reasons).toContain('declared_target_files is required for implementation work');
  });

  it('adds explicit redirect guidance when project_path is invalid', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos',
      resolutionSource: null,
      resolutionErrors: ['project_path is not a resolvable managed project: /bad/project'],
      targetProject: null,
    });
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
      project_path: '/bad/project',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; redirect_actions: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.redirect_actions.join(' ')).toContain('valid project_path');
  });

  it('adds switch guidance when no explicit project identity is available', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: null,
      resolutionSource: null,
      resolutionErrors: ['target project could not be resolved'],
      targetProject: null,
    });
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
    })) as { status: string; redirect_actions: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.redirect_actions.join(' ')).toContain('agenticos_switch');
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
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {
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
      },
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
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
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
      },
    });

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

  it('accepts branch commits when they all include the requested issue marker', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --git-common-dir': '.git\n',
      'config --get remote.origin.url': 'git@github.com:madlouse/AgenticOS.git\n',
      'rev-parse --abbrev-ref HEAD': 'feat/36-guardrail-preflight\n',
      'rev-parse HEAD': 'abc123\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'worktree list --porcelain': 'worktree /main\nHEAD deadbeef\nbranch refs/heads/main\n\nworktree /repo\nHEAD abc123\nbranch refs/heads/feat/36-guardrail-preflight\n',
      'log --format=%s origin/main..HEAD': 'feat: tighten guardrail flow (#36)\nfix: preserve branch evidence (#36)\n',
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; branch_based_on_intended_remote: boolean };

    expect(result.status).toBe('PASS');
    expect(result.branch_based_on_intended_remote).toBe(true);
  });

  it('accepts a clean issue branch commit even when the subject omits the issue marker', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --git-common-dir': '.git\n',
      'config --get remote.origin.url': 'git@github.com:madlouse/AgenticOS.git\n',
      'rev-parse --abbrev-ref HEAD': 'fix/296-save-pr-scope-guardrail-release-flow\n',
      'rev-parse HEAD': 'abc123\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'worktree list --porcelain': 'worktree /main\nHEAD deadbeef\nbranch refs/heads/main\n\nworktree /repo\nHEAD abc123\nbranch refs/heads/fix/296-save-pr-scope-guardrail-release-flow\n',
      'log --format=%s origin/main..HEAD': 'fix: preserve teams session and hotel booking guardrails\n',
    });
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '296',
            repo_path: '/repo',
            current_branch: 'fix/296-save-pr-scope-guardrail-release-flow',
            startup_context_paths: ['/workspace/projects/agenticos/standards/.project.yaml'],
            stages: {
              context_reset_performed: true,
              project_hot_load_performed: true,
              issue_payload_attached: true,
            },
          },
        },
      },
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '296',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/pr-scope-check.ts'],
      worktree_required: true,
    })) as { status: string; branch_based_on_intended_remote: boolean; block_reasons: string[] };

    expect(result.status).toBe('PASS');
    expect(result.branch_based_on_intended_remote).toBe(true);
    expect(result.block_reasons).toEqual([]);
  });

  it('treats neutral commit subjects as in-scope even when issue_id is missing', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --git-common-dir': '.git\n',
      'config --get remote.origin.url': 'git@github.com:madlouse/AgenticOS.git\n',
      'rev-parse --abbrev-ref HEAD': 'feat/guardrail-preflight\n',
      'rev-parse HEAD': 'abc123\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'worktree list --porcelain': 'worktree /main\nHEAD deadbeef\nbranch refs/heads/main\n\nworktree /repo\nHEAD abc123\nbranch refs/heads/feat/guardrail-preflight\n',
      'log --format=%s origin/main..HEAD': 'feat: change with no issue marker\n',
    });
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            repo_path: '/repo',
            current_branch: 'feat/guardrail-preflight',
            startup_context_paths: ['/workspace/projects/agenticos/standards/.project.yaml'],
            stages: {
              context_reset_performed: true,
              project_hot_load_performed: true,
              issue_payload_attached: true,
            },
          },
        },
      },
    });

    const result = JSON.parse(await runPreflight({
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { block_reasons: string[]; branch_based_on_intended_remote: boolean };

    expect(result.block_reasons).toContain('issue_id is required for implementation work');
    expect(result.block_reasons.join(' ')).not.toContain('unrelated commits');
    expect(result.branch_based_on_intended_remote).toBe(true);
  });

  it('returns BLOCK and persists evidence when git repository resolution fails', async () => {
    execAsyncMock.mockRejectedValue(new Error('git failed'));

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[]; persistence?: { persisted: boolean } };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('failed to resolve git repository identity or remote base');
    expect(result.persistence?.persisted).toBe(true);
  });

  it('uses explicit project_path fallbacks in persisted evidence when git resolution fails before target proof exists', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos',
      resolutionSource: null,
      resolutionErrors: ['project_path is not a resolvable managed project: /bad/project'],
      targetProject: null,
    });
    execAsyncMock.mockRejectedValue(new Error('git failed'));

    await runPreflight({
      task_type: 'implementation',
      repo_path: '/repo',
      project_path: '/bad/project',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    });

    expect(persistGuardrailEvidenceMock).toHaveBeenCalledWith(expect.objectContaining({
      project_path: '/bad/project',
      payload: expect.objectContaining({
        issue_id: null,
        project_path: '/bad/project',
      }),
    }));
  });

  it('falls back to null project identity in persisted evidence when git resolution fails without any resolved project', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: null,
      resolutionSource: null,
      resolutionErrors: ['target project could not be resolved'],
      targetProject: null,
    });
    execAsyncMock.mockRejectedValue(new Error('git failed'));

    await runPreflight({
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    });

    expect(persistGuardrailEvidenceMock).toHaveBeenCalledWith(expect.objectContaining({
      project_path: undefined,
      payload: expect.objectContaining({
        issue_id: null,
        project_path: null,
      }),
    }));
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
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: null,
      state_path: '/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {},
    });

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
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {
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
      },
    });

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

  it('returns BLOCK when the latest issue bootstrap repo_path differs from the current repo', async () => {
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
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '36',
            repo_path: '/other',
            current_branch: 'feat/36-guardrail-preflight',
            startup_context_paths: ['/workspace/projects/agenticos/standards/.project.yaml'],
            stages: {
              context_reset_performed: true,
              project_hot_load_performed: true,
              issue_payload_attached: true,
            },
          },
        },
      },
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('historical for the current checkout');
  });

  it('returns BLOCK when the latest issue bootstrap is missing repo_path continuity evidence', async () => {
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
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '36',
            repo_path: '   ',
            current_branch: 'feat/36-guardrail-preflight',
            startup_context_paths: ['/workspace/projects/agenticos/standards/.project.yaml'],
            stages: {
              context_reset_performed: true,
              project_hot_load_performed: true,
              issue_payload_attached: true,
            },
          },
        },
      },
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[]; redirect_actions: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('missing repo_path for the current checkout');
    expect(result.redirect_actions).toContain('rerun agenticos_issue_bootstrap in the current checkout');
  });

  it('returns BLOCK when the latest issue bootstrap branch differs from the current branch', async () => {
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
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '36',
            repo_path: '/repo',
            current_branch: 'other-branch',
            startup_context_paths: ['/workspace/projects/agenticos/standards/.project.yaml'],
            stages: {
              context_reset_performed: true,
              project_hot_load_performed: true,
              issue_payload_attached: true,
            },
          },
        },
      },
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('does not match current branch');
  });

  it('returns BLOCK when bootstrap stage evidence is incomplete', async () => {
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
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '36',
            repo_path: '/repo',
            current_branch: 'feat/36-guardrail-preflight',
            startup_context_paths: [],
            stages: {
              context_reset_performed: false,
              project_hot_load_performed: false,
              issue_payload_attached: false,
            },
          },
        },
      },
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('clear-equivalent context reset');
    expect(result.block_reasons.join(' ')).toContain('project hot-load occurred');
    expect(result.block_reasons.join(' ')).toContain('issue payload attachment');
    expect(result.block_reasons.join(' ')).toContain('startup context evidence');
  });

  it('returns BLOCK when runtime guardrail state cannot be loaded', async () => {
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
    loadLatestGuardrailStateMock.mockRejectedValue(new Error('boom'));

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('guardrail state is missing or unreadable');
  });

  it('falls back bootstrap evidence fields to null when runtime bootstrap metadata is not string typed', async () => {
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
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            recorded_at: '',
            issue_id: '',
            repo_path: '',
            current_branch: '',
            startup_context_paths: ['/workspace/projects/agenticos/standards/.project.yaml'],
            stages: {
              context_reset_performed: true,
              project_hot_load_performed: true,
              issue_payload_attached: true,
            },
          },
        },
      },
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { evidence: { issue_bootstrap: { recorded_at: null; issue_id: null; repo_path: null; current_branch: null } | null } };

    expect(result.evidence.issue_bootstrap).toEqual({
      recorded_at: null,
      issue_id: null,
      repo_path: null,
      current_branch: null,
    });
  });

  it('renders unknown bootstrap issue id when mismatch evidence has no stored id', async () => {
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
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '',
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
      },
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { block_reasons: string[] };

    expect(result.block_reasons.join(' ')).toContain('unknown');
  });

  it('treats missing bootstrap repo_path as a repo mismatch for fail-closed safety', async () => {
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
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '36',
            current_branch: 'feat/36-guardrail-preflight',
            startup_context_paths: ['/workspace/projects/agenticos/standards/.project.yaml'],
            stages: {
              context_reset_performed: true,
              project_hot_load_performed: true,
              issue_payload_attached: true,
            },
          },
        },
      },
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { block_reasons: string[] };

    expect(result.block_reasons.join(' ')).toContain('missing repo_path for the current checkout');
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

  it('accepts structural move when root exception and reproducibility gate are both defined', async () => {
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
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '40',
            repo_path: '/repo',
            current_branch: 'feat/40-self-hosting',
            startup_context_paths: ['/workspace/projects/agenticos/standards/.project.yaml'],
            stages: {
              context_reset_performed: true,
              project_hot_load_performed: true,
              issue_payload_attached: true,
            },
          },
        },
      },
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '40',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/**'],
      worktree_required: true,
      structural_move: true,
      root_scoped_exceptions: ['.github/'],
      clean_reproducibility_gate: ['npm run build'],
    })) as { status: string; reproducibility_gate_defined: boolean };

    expect(result.status).toBe('PASS');
    expect(result.reproducibility_gate_defined).toBe(true);
  });

  it('returns PASS for non implementation-affecting task types without bootstrap enforcement', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --git-common-dir': '.git\n',
      'config --get remote.origin.url': 'git@github.com:madlouse/AgenticOS.git\n',
      'rev-parse --abbrev-ref HEAD': 'docs/notes\n',
      'rev-parse HEAD': 'abc123\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'worktree list --porcelain': 'worktree /main\nHEAD deadbeef\nbranch refs/heads/main\n\nworktree /repo\nHEAD abc123\nbranch refs/heads/docs/notes\n',
    });

    const result = JSON.parse(await runPreflight({
      task_type: 'analysis_or_doc',
      repo_path: '/repo',
      declared_target_files: [],
      worktree_required: false,
    })) as { status: string; scope_ok: boolean; reproducibility_gate_defined: boolean };

    expect(result.status).toBe('PASS');
    expect(result.scope_ok).toBe(true);
    expect(result.reproducibility_gate_defined).toBe(true);
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
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {
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
      },
    });
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
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {
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
      },
    });
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
