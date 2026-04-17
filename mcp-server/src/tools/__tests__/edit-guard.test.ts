import { beforeEach, describe, expect, it, vi } from 'vitest';

const execAsyncMock = vi.hoisted(() => vi.fn());
const resolveGuardrailProjectTargetMock = vi.hoisted(() => vi.fn());
const loadLatestGuardrailStateMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn(() => execAsyncMock),
}));

vi.mock('../../utils/registry.js', () => ({
  loadRegistry: vi.fn(),
}));

vi.mock('../../utils/guardrail-evidence.js', () => ({
  extractLatestIssueBootstrap: (state: any) => state?.issue_bootstrap?.latest || null,
  loadLatestGuardrailState: loadLatestGuardrailStateMock,
}));

vi.mock('../../utils/repo-boundary.js', () => ({
  isImplementationAffectingTask: (taskType: string) => taskType === 'implementation' || taskType === 'bugfix',
  resolveGuardrailProjectTarget: resolveGuardrailProjectTargetMock,
}));

import { loadRegistry } from '../../utils/registry.js';
import { runEditGuard } from '../edit-guard.js';

const loadRegistryMock = loadRegistry as unknown as ReturnType<typeof vi.fn>;

describe('runEditGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadRegistryMock.mockResolvedValue({
      active_project: 'agenticos-standards',
      projects: [],
    });
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos-standards',
      resolutionSource: 'repo_path_match',
      resolutionErrors: [],
      targetProject: {
        id: 'agenticos-standards',
        name: 'agenticos-standards',
        path: '/workspace/projects/agenticos/standards',
        statePath: '/workspace/projects/agenticos/standards/.context/state.yaml',
        projectYamlPath: '/workspace/projects/agenticos/standards/.project.yaml',
        sourceRepoRoots: ['/workspace/source'],
        sourceRepoRootsDeclared: true,
      },
    });
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/workspace/source\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '.git\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --abbrev-ref HEAD')) {
        return { stdout: 'feat/113-fail-closed-edit-boundaries\n', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
          issue_bootstrap: {
            latest: {
              issue_id: '113',
              repo_path: '/workspace/source',
              current_branch: 'feat/113-fail-closed-edit-boundaries',
            },
          },
          guardrail_evidence: {
            preflight: {
              issue_id: '113',
              repo_path: '/workspace/source',
              declared_target_files: [
                'projects/agenticos/mcp-server/src/index.ts',
                'projects/agenticos/tools/check-edit-boundary.sh',
              ],
              result: {
                status: 'PASS',
              },
            },
          },
      },
    });
  });

  it('passes when active project and latest preflight both match the intended edit', async () => {
    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: [
        'projects/agenticos/mcp-server/src/index.ts',
      ],
    })) as { status: string; preflight_ok: boolean; scope_ok: boolean };

    expect(result.status).toBe('PASS');
    expect(result.preflight_ok).toBe(true);
    expect(result.scope_ok).toBe(true);
  });

  it('handles undefined args via default destructuring', async () => {
    const result = JSON.parse(await runEditGuard(undefined as any)) as { status: string; summary: string };

    expect(result.status).toBe('BLOCK');
    expect(result.summary).toContain('repo_path is required');
  });

  it('blocks when the target project cannot be resolved and asks for an explicit managed project path', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'cc-switch',
      resolutionSource: null,
      resolutionErrors: ['target project could not be resolved from repo_path or session binding; pass project_path explicitly'],
      targetProject: null,
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      declared_target_files: [
        'projects/agenticos/mcp-server/src/index.ts',
      ],
    })) as { status: string; block_reasons: string[]; recovery_actions: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('pass project_path explicitly');
    expect(result.recovery_actions.join(' ')).toContain('pass project_path');
  });

  it('asks for switch when no active project is available and target resolution fails', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: null,
      resolutionSource: null,
      resolutionErrors: ['target project could not be resolved'],
      targetProject: null,
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
    })) as { status: string; recovery_actions: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.recovery_actions.join(' ')).toContain('agenticos_switch');
  });

  it('blocks when no preflight evidence is recorded', async () => {
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
          issue_bootstrap: {
            latest: {
              issue_id: '113',
              repo_path: '/workspace/source',
              current_branch: 'feat/113-fail-closed-edit-boundaries',
            },
          },
      },
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: [
        'projects/agenticos/mcp-server/src/index.ts',
      ],
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('no preflight evidence');
  });

  it('blocks when no issue bootstrap evidence is recorded', async () => {
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
          guardrail_evidence: {
            preflight: {
              issue_id: '113',
              repo_path: '/workspace/source',
              declared_target_files: [
                'projects/agenticos/mcp-server/src/index.ts',
              ],
              result: {
                status: 'PASS',
              },
            },
          },
      },
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: [
        'projects/agenticos/mcp-server/src/index.ts',
      ],
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('no issue bootstrap evidence');
  });

  it('blocks when the latest issue bootstrap does not match the requested issue', async () => {
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
          issue_bootstrap: {
            latest: {
              issue_id: '179',
              repo_path: '/workspace/source',
              current_branch: 'feat/113-fail-closed-edit-boundaries',
            },
          },
          guardrail_evidence: {
            preflight: {
              issue_id: '113',
              repo_path: '/workspace/source',
              declared_target_files: [
                'projects/agenticos/mcp-server/src/index.ts',
              ],
              result: {
                status: 'PASS',
              },
            },
          },
      },
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: [
        'projects/agenticos/mcp-server/src/index.ts',
      ],
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('latest issue bootstrap issue');
  });

  it('blocks when attempted targets exceed the preflight-declared scope', async () => {
    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: [
        'projects/agenticos/mcp-server/src/index.ts',
        'README.md',
      ],
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('exceed the latest preflight scope');
  });

  it('passes through for non implementation-affecting task types', async () => {
    const result = JSON.parse(await runEditGuard({
      task_type: 'discussion_only',
    })) as { status: string; summary: string };

    expect(result.status).toBe('PASS');
    expect(result.summary).toContain('not required');
  });

  it('blocks when required arguments are missing', async () => {
    const result = JSON.parse(await runEditGuard({
      task_type: 'implementation',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons).toContain('repo_path is required');
    expect(result.block_reasons).toContain('issue_id is required for implementation edits');
    expect(result.block_reasons).toContain('declared_target_files is required for implementation edits');
  });

  it('blocks when git repository identity cannot be resolved', async () => {
    execAsyncMock.mockRejectedValue(new Error('git failed'));

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('failed to resolve git repository identity');
  });

  it('blocks when runtime guardrail state cannot be loaded', async () => {
    loadLatestGuardrailStateMock.mockRejectedValue(new Error('boom'));

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
    })) as { status: string; block_reasons: string[]; recovery_actions: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('managed project guardrail state is missing or unreadable');
    expect(result.recovery_actions.join(' ')).toContain('guardrail state');
  });

  it('blocks when the latest issue bootstrap repo_path differs from the current repo', async () => {
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '113',
            repo_path: '/workspace/other',
            current_branch: 'feat/113-fail-closed-edit-boundaries',
          },
        },
        guardrail_evidence: {
          preflight: {
            issue_id: '113',
            repo_path: '/workspace/source',
            declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
            result: { status: 'PASS' },
          },
        },
      },
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('historical for the current checkout');
  });

  it('blocks when the latest issue bootstrap is missing repo_path continuity evidence', async () => {
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '113',
            repo_path: '   ',
            current_branch: 'feat/113-fail-closed-edit-boundaries',
          },
        },
        guardrail_evidence: {
          preflight: {
            issue_id: '113',
            repo_path: '/workspace/source',
            declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
            result: { status: 'PASS' },
          },
        },
      },
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
    })) as { status: string; block_reasons: string[]; recovery_actions: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('missing repo_path for the current checkout');
    expect(result.recovery_actions).toContain('rerun agenticos_issue_bootstrap in the current checkout');
  });

  it('blocks when the latest issue bootstrap branch differs from the current branch', async () => {
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '113',
            repo_path: '/workspace/source',
            current_branch: 'other-branch',
          },
        },
        guardrail_evidence: {
          preflight: {
            issue_id: '113',
            repo_path: '/workspace/source',
            declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
            result: { status: 'PASS' },
          },
        },
      },
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('does not match current branch');
  });

  it('blocks when the latest preflight belongs to a different issue', async () => {
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '113',
            repo_path: '/workspace/source',
            current_branch: 'feat/113-fail-closed-edit-boundaries',
          },
        },
        guardrail_evidence: {
          preflight: {
            issue_id: '999',
            repo_path: '/workspace/source',
            declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
            result: { status: 'PASS' },
          },
        },
      },
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('latest preflight issue');
  });

  it('blocks when the latest preflight repo_path differs from the current repo', async () => {
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '113',
            repo_path: '/workspace/source',
            current_branch: 'feat/113-fail-closed-edit-boundaries',
          },
        },
        guardrail_evidence: {
          preflight: {
            issue_id: '113',
            repo_path: '/workspace/other',
            declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
            result: { status: 'PASS' },
          },
        },
      },
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('latest preflight was recorded for a different repo_path');
  });

  it('blocks when the latest preflight status is not PASS', async () => {
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '113',
            repo_path: '/workspace/source',
            current_branch: 'feat/113-fail-closed-edit-boundaries',
          },
        },
        guardrail_evidence: {
          preflight: {
            issue_id: '113',
            repo_path: '/workspace/source',
            declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
            result: { status: 'BLOCK' },
          },
        },
      },
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('instead of PASS');
  });

  it('normalizes missing preflight declared_target_files to an empty list', async () => {
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '113',
            repo_path: '/workspace/source',
            current_branch: 'feat/113-fail-closed-edit-boundaries',
          },
        },
        guardrail_evidence: {
          preflight: {
            issue_id: '113',
            repo_path: '/workspace/source',
            declared_target_files: null,
            result: { status: 'PASS' },
          },
        },
      },
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
    })) as { status: string; evidence: { preflight_declared_target_files: string[] } };

    expect(result.status).toBe('BLOCK');
    expect(result.evidence.preflight_declared_target_files).toEqual([]);
  });

  it('normalizes falsey attempted target entries before scope comparison', async () => {
    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts', '' as any, undefined as any],
    })) as { status: string; scope_ok: boolean };

    expect(result.status).toBe('PASS');
    expect(result.scope_ok).toBe(true);
  });

  it('falls back evidence fields to null when bootstrap metadata is not string typed', async () => {
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: 113,
            repo_path: null,
            current_branch: null,
          },
        },
      },
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
    })) as { evidence: { issue_bootstrap_issue_id: null; issue_bootstrap_repo_path: null; issue_bootstrap_branch: null } };

    expect(result.evidence.issue_bootstrap_issue_id).toBeNull();
    expect(result.evidence.issue_bootstrap_repo_path).toBeNull();
    expect(result.evidence.issue_bootstrap_branch).toBeNull();
  });

  it('renders unknown issue id when bootstrap mismatch has no stored issue id', async () => {
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '',
            repo_path: '/workspace/source',
            current_branch: 'feat/113-fail-closed-edit-boundaries',
          },
        },
        guardrail_evidence: {
          preflight: {
            issue_id: '113',
            repo_path: '/workspace/source',
            declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
            result: { status: 'PASS' },
          },
        },
      },
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
    })) as { block_reasons: string[] };

    expect(result.block_reasons.join(' ')).toContain('unknown');
  });

  it('treats missing bootstrap repo_path as a repo mismatch for fail-closed safety', async () => {
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '113',
            current_branch: 'feat/113-fail-closed-edit-boundaries',
          },
        },
        guardrail_evidence: {
          preflight: {
            issue_id: '113',
            repo_path: '/workspace/source',
            declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
            result: { status: 'PASS' },
          },
        },
      },
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
    })) as { block_reasons: string[] };

    expect(result.block_reasons.join(' ')).toContain('missing repo_path for the current checkout');
  });

  it('falls back preflight evidence fields to null when metadata is not string typed', async () => {
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '113',
            repo_path: '/workspace/source',
            current_branch: 'feat/113-fail-closed-edit-boundaries',
          },
        },
        guardrail_evidence: {
          preflight: {
            issue_id: 113,
            repo_path: null,
            declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
            result: { status: null },
          },
        },
      },
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
    })) as { evidence: { preflight_issue_id: null; preflight_repo_path: null; preflight_status: null } };

    expect(result.evidence.preflight_issue_id).toBeNull();
    expect(result.evidence.preflight_repo_path).toBeNull();
    expect(result.evidence.preflight_status).toBeNull();
  });

  it('renders unknown issue id when preflight mismatch has no stored issue id', async () => {
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '113',
            repo_path: '/workspace/source',
            current_branch: 'feat/113-fail-closed-edit-boundaries',
          },
        },
        guardrail_evidence: {
          preflight: {
            issue_id: '',
            repo_path: '/workspace/source',
            declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
            result: { status: 'PASS' },
          },
        },
      },
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
    })) as { block_reasons: string[] };

    expect(result.block_reasons.join(' ')).toContain('unknown');
  });

  it('treats missing preflight repo_path as a repo mismatch for fail-closed safety', async () => {
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '113',
            repo_path: '/workspace/source',
            current_branch: 'feat/113-fail-closed-edit-boundaries',
          },
        },
        guardrail_evidence: {
          preflight: {
            issue_id: '113',
            declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
            result: { status: 'PASS' },
          },
        },
      },
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
    })) as { block_reasons: string[] };

    expect(result.block_reasons.join(' ')).toContain('latest preflight was recorded for a different repo_path');
  });

  it('renders unknown preflight status when the stored status is missing', async () => {
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '113',
            repo_path: '/workspace/source',
            current_branch: 'feat/113-fail-closed-edit-boundaries',
          },
        },
        guardrail_evidence: {
          preflight: {
            issue_id: '113',
            repo_path: '/workspace/source',
            declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
            result: {},
          },
        },
      },
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: ['projects/agenticos/mcp-server/src/index.ts'],
    })) as { block_reasons: string[] };

    expect(result.block_reasons.join(' ')).toContain('unknown instead of PASS');
  });

  it('passes bugfix edits when the worktree root is declared even if the common repo root differs', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos-standards',
      resolutionSource: 'repo_path_match',
      resolutionErrors: [],
      targetProject: {
        id: 'agenticos-standards',
        name: 'agenticos-standards',
        path: '/workspace/worktrees/issue-268',
        statePath: '/workspace/worktrees/issue-268/.context/state.yaml',
        projectYamlPath: '/workspace/worktrees/issue-268/.project.yaml',
        sourceRepoRoots: ['/workspace/worktrees/issue-268'],
        sourceRepoRootsDeclared: true,
      },
    });
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/workspace/worktrees/issue-268\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '/workspace/projects/agenticos/.git\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --abbrev-ref HEAD')) {
        return { stdout: 'fix/268-fix-guardrail-worktree-repo-identity\n', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml',
      state: {
          issue_bootstrap: {
            latest: {
              issue_id: '268',
              repo_path: '/workspace/worktrees/issue-268',
              current_branch: 'fix/268-fix-guardrail-worktree-repo-identity',
            },
          },
          guardrail_evidence: {
            preflight: {
              issue_id: '268',
              repo_path: '/workspace/worktrees/issue-268',
              declared_target_files: [
                'projects/agenticos/mcp-server/src/tools/preflight.ts',
              ],
              result: {
                status: 'PASS',
              },
            },
          },
      },
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '268',
      task_type: 'bugfix',
      repo_path: '/workspace/worktrees/issue-268',
      project_path: '/workspace/worktrees/issue-268',
      declared_target_files: [
        'projects/agenticos/mcp-server/src/tools/preflight.ts',
      ],
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('PASS');
    expect(result.block_reasons).toEqual([]);
  });

  it('blocks bugfix edits when neither the worktree root nor the common repo root is declared for the target project', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/workspace/wrong-repo\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '.git\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --abbrev-ref HEAD')) {
        return { stdout: 'fix/113-wrong-repo\n', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'bugfix',
      repo_path: '/workspace/wrong-repo',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: [
        'projects/agenticos/mcp-server/src/index.ts',
      ],
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('neither git worktree root');
  });
});
