import { beforeEach, describe, expect, it, vi } from 'vitest';

const execAsyncMock = vi.hoisted(() => vi.fn());
const loadLatestGuardrailStateMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn(() => execAsyncMock),
}));

// preflight now runs git through execFile-based exec-git helpers (and
// resolveGitCheckoutIdentity); reproducibility-gate commands still use execAsync.
// The shim reconstructs the equivalent `git -C "<repo>" <args>` command string
// and delegates to the existing execAsync mock so command-string matchers and
// the gate-command path keep working.
vi.mock('../../utils/exec-git.js', () => ({
  gitText: async (repoPath: string, args: string[]) => {
    const { stdout } = await execAsyncMock(`git -C "${repoPath}" ${args.join(' ')}`);
    return String(stdout || '').trim();
  },
  execGit: async (repoPath: string, args: string[], options?: { allowFailure?: boolean }) => {
    try {
      const { stdout, stderr } = await execAsyncMock(`git -C "${repoPath}" ${args.join(' ')}`);
      return { ok: true, stdout: String(stdout || ''), stderr: String(stderr || '') };
    } catch (e: any) {
      if (options?.allowFailure) return { ok: false, stdout: String(e?.stdout || ''), stderr: String(e?.stderr || '') };
      throw e;
    }
  },
}));

vi.mock('fs/promises', () => ({
  readFile: readFileMock,
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
  // preflight now reads partition-scoped guardrail state; route it to the same mock
  // so existing scenarios drive the gate's evidence read unchanged.
  loadScopedGuardrailState: loadLatestGuardrailStateMock,
  loadLatestGuardrailState: loadLatestGuardrailStateMock,
}));

vi.mock('../../utils/repo-boundary.js', () => ({
  isImplementationAffectingTask: (taskType: string) => taskType === 'implementation' || taskType === 'bugfix',
  resolveGuardrailProjectTarget: resolveGuardrailProjectTargetMock,
}));

import { runPreflight } from '../preflight.js';

function mockGitResponses(responses: Record<string, string | { throw: unknown }>): void {
  execAsyncMock.mockImplementation(async (cmd: string) => {
    for (const [pattern, response] of Object.entries(responses)) {
      if (cmd.includes(pattern)) {
        if (typeof response === 'object' && response !== null && 'throw' in response) {
          throw response.throw;
        }
        return { stdout: response, stderr: '' };
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
    readFileMock.mockReset();
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

  it('validates coverage evidence when the reproducibility gate includes coverage', async () => {
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
      version: 1,
      generated_at: '2026-05-11T00:00:00.000Z',
      branch: 'feat/36-guardrail-preflight',
      commit: 'abc123',
      base_branch: 'main',
      threshold_aggregate: { lines: 60, functions: 60, branches: 50, statements: 60 },
      threshold_changed_scope: { lines: 100, functions: 100, branches: 100, statements: 100 },
      is_pr: true,
      changed_files: ['src/foo.ts'],
      aggregate: { pct_statements: 90, pct_branches: 90, pct_functions: 90, pct_lines: 90 },
      files: [{ path: 'src/foo.ts', pct_statements: 100, pct_branches: 100, pct_functions: 100, pct_lines: 100 }],
      aggregate_pass: true,
      changed_scope_pass: true,
      pass: true,
      aggregate_failures: [],
      changed_scope_failures: [],
    }));

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      clean_reproducibility_gate: ['./tools/coverage-preflight.sh'],
      worktree_required: true,
    })) as { status: string; evidence: { coverage: { validation_pass: boolean; evidence_path: string } } };

    expect(result.status).toBe('PASS');
    expect(readFileMock).toHaveBeenCalledWith('/repo/mcp-server/coverage/coverage-evidence.json', 'utf-8');
    expect(result.evidence.coverage.validation_pass).toBe(true);
  });

  it('blocks stale coverage evidence metadata', async () => {
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
      version: 1,
      generated_at: '2026-05-11T00:00:00.000Z',
      branch: 'feat/36-guardrail-preflight',
      commit: 'stale123',
      base_branch: 'main',
      threshold_aggregate: { lines: 60, functions: 60, branches: 50, statements: 60 },
      threshold_changed_scope: { lines: 100, functions: 100, branches: 100, statements: 100 },
      is_pr: true,
      changed_files: ['src/foo.ts'],
      aggregate: { pct_statements: 90, pct_branches: 90, pct_functions: 90, pct_lines: 90 },
      files: [{ path: 'src/foo.ts', pct_statements: 100, pct_branches: 100, pct_functions: 100, pct_lines: 100 }],
      aggregate_pass: true,
      changed_scope_pass: true,
      pass: true,
      aggregate_failures: [],
      changed_scope_failures: [],
    }));

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      clean_reproducibility_gate: ['./tools/coverage-preflight.sh'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('coverage evidence commit "stale123" does not match current HEAD "abc123"');
  });

  it('blocks coverage evidence with mismatched base and branch metadata', async () => {
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
      version: 1,
      generated_at: '2026-05-11T00:00:00.000Z',
      branch: 'feat/other',
      commit: 'abc123',
      base_branch: 'develop',
      threshold_aggregate: { lines: 60, functions: 60, branches: 50, statements: 60 },
      threshold_changed_scope: { lines: 100, functions: 100, branches: 100, statements: 100 },
      is_pr: true,
      changed_files: ['src/foo.ts'],
      aggregate: { pct_statements: 90, pct_branches: 90, pct_functions: 90, pct_lines: 90 },
      files: [{ path: 'src/foo.ts', pct_statements: 100, pct_branches: 100, pct_functions: 100, pct_lines: 100 }],
      aggregate_pass: true,
      changed_scope_pass: true,
      pass: true,
      aggregate_failures: [],
      changed_scope_failures: [],
    }));

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      clean_reproducibility_gate: ['./tools/coverage-preflight.sh'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('coverage evidence base_branch "develop" does not match expected base "origin/main"');
    expect(result.block_reasons.join(' ')).toContain('coverage evidence branch "feat/other" does not match current branch "feat/36-guardrail-preflight"');
  });

  it('blocks coverage evidence missing branch metadata on named branches', async () => {
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
      version: 1,
      generated_at: '2026-05-11T00:00:00.000Z',
      commit: 'abc123',
      base_branch: 'main',
      threshold_aggregate: { lines: 60, functions: 60, branches: 50, statements: 60 },
      threshold_changed_scope: { lines: 100, functions: 100, branches: 100, statements: 100 },
      is_pr: true,
      changed_files: ['src/foo.ts'],
      aggregate: { pct_statements: 90, pct_branches: 90, pct_functions: 90, pct_lines: 90 },
      files: [{ path: 'src/foo.ts', pct_statements: 100, pct_branches: 100, pct_functions: 100, pct_lines: 100 }],
      aggregate_pass: true,
      changed_scope_pass: true,
      pass: true,
      aggregate_failures: [],
      changed_scope_failures: [],
    }));

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      clean_reproducibility_gate: ['./tools/coverage-preflight.sh'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('coverage evidence missing branch metadata');
  });

  it('blocks coverage evidence missing commit and base metadata', async () => {
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
      version: 1,
      generated_at: '2026-05-11T00:00:00.000Z',
      branch: 'feat/36-guardrail-preflight',
      threshold_aggregate: { lines: 60, functions: 60, branches: 50, statements: 60 },
      threshold_changed_scope: { lines: 100, functions: 100, branches: 100, statements: 100 },
      is_pr: true,
      changed_files: ['src/foo.ts'],
      aggregate: { pct_statements: 90, pct_branches: 90, pct_functions: 90, pct_lines: 90 },
      files: [{ path: 'src/foo.ts', pct_statements: 100, pct_branches: 100, pct_functions: 100, pct_lines: 100 }],
      aggregate_pass: true,
      changed_scope_pass: true,
      pass: true,
      aggregate_failures: [],
      changed_scope_failures: [],
    }));

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      clean_reproducibility_gate: ['./tools/coverage-preflight.sh'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('coverage evidence missing commit metadata');
    expect(result.block_reasons.join(' ')).toContain('coverage evidence missing base_branch metadata');
  });

  it('blocks coverage evidence paths outside the repo root', async () => {
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
      clean_reproducibility_gate: ['./tools/coverage-preflight.sh'],
      coverage_evidence_path: '/tmp/coverage-evidence.json',
      worktree_required: true,
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('coverage evidence path escapes repo root');
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('blocks invalid coverage evidence when coverage gate is requested', async () => {
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
      version: 1,
      generated_at: '2026-05-11T00:00:00.000Z',
      branch: 'feat/36-guardrail-preflight',
      commit: 'abc123',
      base_branch: 'main',
      threshold_aggregate: { lines: 60, functions: 60, branches: 50, statements: 60 },
      threshold_changed_scope: { lines: 100, functions: 100, branches: 100, statements: 100 },
      is_pr: true,
      changed_files: ['src/foo.ts'],
      aggregate: { pct_statements: 90, pct_branches: 90, pct_functions: 90, pct_lines: 90 },
      files: [{ path: 'src/foo.ts', pct_statements: 100, pct_branches: 100, pct_functions: 100, pct_lines: 50 }],
      aggregate_pass: true,
      changed_scope_pass: true,
      pass: true,
      aggregate_failures: [],
      changed_scope_failures: [],
    }));

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      clean_reproducibility_gate: ['./tools/coverage-preflight.sh'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('coverage evidence validation failed');
    expect(result.block_reasons.join(' ')).toContain('changed-scope: src/foo.ts: lines 50% < 100%');
  });

  it('blocks when requested coverage evidence is missing', async () => {
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
    readFileMock.mockRejectedValue(new Error('ENOENT'));

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      clean_reproducibility_gate: ['./tools/coverage-preflight.sh'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('coverage evidence missing or unreadable');
  });

  it('reports non-Error coverage evidence read failures', async () => {
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
    readFileMock.mockRejectedValue('raw failure');

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      clean_reproducibility_gate: ['./tools/coverage-preflight.sh'],
      worktree_required: true,
    })) as { evidence: { coverage: { errors: string[] } } };

    expect(result.evidence.coverage.errors).toContain('coverage evidence missing or unreadable: raw failure');
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

  it('names the shallow object store and the unshallow recovery when fork-point resolution fails on a shallow checkout (#564)', async () => {
    execAsyncMock.mockImplementation((command: string) => {
      if (command.includes('--is-shallow-repository')) {
        return Promise.resolve({ stdout: 'true\n', stderr: '' });
      }
      return Promise.reject(new Error('git failed'));
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '564',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[]; redirect_actions: string[]; persistence?: { persisted: boolean } };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('is shallow');
    expect(result.block_reasons.join(' ')).not.toContain('failed to resolve git repository identity or remote base');
    expect(result.redirect_actions.join(' ')).toContain('git fetch --unshallow');
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

  it('blocks detected renames when structural_move is not declared', async () => {
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
      'diff --name-status --diff-filter=R origin/main HEAD': 'R100\told.ts\tnew.ts\n',
    });

    const result = JSON.parse(await runPreflight({
      issue_id: '36',
      task_type: 'implementation',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/preflight.ts'],
      worktree_required: true,
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons).toContain('Structural move detected but not declared');
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
      'diff --name-status --diff-filter=R origin/main HEAD': '',
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

  it('blocks when structural move rename detection fails', async () => {
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
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('failed to detect renamed files');
  });

  it('reports non-Error structural move rename detection failures', async () => {
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
      'diff --name-status --diff-filter=R origin/main HEAD': { throw: 'diff failed' },
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
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('failed to detect renamed files: diff failed');
  });

  it('blocks when structural move gate command fails for detected renames', async () => {
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
      'diff --name-status --diff-filter=R origin/main HEAD': 'R100\told.ts\tnew.ts\n',
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
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('clean_reproducibility_gate failed for command "npm run build"');
  });

  it('accepts structural move gate success for detected renames', async () => {
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
      'diff --name-status --diff-filter=R origin/main HEAD': 'R100\told.ts\tnew.ts\n',
      'npm run build': '',
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
    })) as { status: string };

    expect(result.status).toBe('PASS');
  });

  it('reports non-Error structural move gate command failures', async () => {
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
      'diff --name-status --diff-filter=R origin/main HEAD': 'R100\told.ts\tnew.ts\n',
      'npm run build': { throw: 'gate failed' },
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
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('clean_reproducibility_gate failed for command "npm run build": gate failed');
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
