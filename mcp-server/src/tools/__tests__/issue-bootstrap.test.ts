import { beforeEach, describe, expect, it, vi } from 'vitest';

const execAsyncMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const existsSyncMock = vi.hoisted(() => vi.fn());
const yamlMock = vi.hoisted(() => ({
  parse: vi.fn(),
}));
const resolveGuardrailProjectTargetMock = vi.hoisted(() => vi.fn());
const persistIssueBootstrapEvidenceMock = vi.hoisted(() => vi.fn().mockResolvedValue({
  attempted: true,
  persisted: true,
  project_id: 'agenticos',
  state_path: '/workspace/projects/agenticos/standards/.context/state.yaml',
}));
const recallContextMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn(() => execAsyncMock),
}));

// issue-bootstrap now runs git through execFile-based exec-git helpers (and
// resolveGitCheckoutIdentity). The shim reconstructs the equivalent
// `git -C "<repo>" <args>` command string and delegates to the existing
// execAsync mock so command-string matchers keep working.
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

vi.mock('fs', () => ({
  existsSync: existsSyncMock,
}));

vi.mock('yaml', () => ({
  default: yamlMock,
}));

vi.mock('../../utils/repo-boundary.js', () => ({
  resolveGuardrailProjectTarget: resolveGuardrailProjectTargetMock,
}));

vi.mock('../../utils/guardrail-evidence.js', () => ({
  persistIssueBootstrapEvidence: persistIssueBootstrapEvidenceMock,
}));

vi.mock('../../utils/recall.js', () => ({
  recallContext: recallContextMock,
}));

import { runIssueBootstrap } from '../issue-bootstrap.js';

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

describe('runIssueBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recallContextMock.mockReset();
    recallContextMock.mockResolvedValue([]);
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
      meta: { id: 'agenticos' },
      agent_context: {
        quick_start: '.context/quick-start.md',
        current_state: '.context/state.yaml',
      },
    }));
    existsSyncMock.mockReturnValue(true);
    yamlMock.parse.mockImplementation((content: string) => JSON.parse(content));
    persistIssueBootstrapEvidenceMock.mockResolvedValue({
      attempted: true,
      persisted: true,
      project_id: 'agenticos',
      state_path: '/workspace/projects/agenticos/standards/.context/state.yaml',
    });
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --git-common-dir': '.git\n',
      'rev-parse --abbrev-ref HEAD': 'feat/179-issue-start-bootstrap-evidence\n',
      'worktree list --porcelain': 'worktree /main\nHEAD deadbeef\nbranch refs/heads/main\n\nworktree /repo\nHEAD abc123\nbranch refs/heads/feat/179-issue-start-bootstrap-evidence\n',
    });
  });

  it('records issue bootstrap evidence when reset, hot-load, and issue payload steps are all confirmed', async () => {
    const result = JSON.parse(await runIssueBootstrap({
      issue_id: '179',
      issue_title: 'Implement bootstrap evidence',
      labels: ['enhancement'],
      linked_artifacts: ['tasks/issue-179.md'],
      additional_context: [{ path: 'knowledge/issue-158.md', reason: 'design reference' }],
      context_reset_performed: true,
      project_hot_load_performed: true,
      issue_payload_attached: true,
      repo_path: '/repo',
      project_path: '/workspace/projects/agenticos/standards',
    })) as { status: string; startup_context_paths: string[]; persistence?: { persisted: boolean } };

    expect(result.status).toBe('RECORDED');
    expect(result.startup_context_paths).toContain('/workspace/projects/agenticos/standards/.project.yaml');
    expect(result.persistence?.persisted).toBe(true);
    expect(persistIssueBootstrapEvidenceMock).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        issue_id: '179',
        issue_title: 'Implement bootstrap evidence',
        current_branch: 'feat/179-issue-start-bootstrap-evidence',
        stages: {
          context_reset_performed: true,
          project_hot_load_performed: true,
          issue_payload_attached: true,
        },
      }),
    }));
  });

  it('injects server-generated recall into the bootstrap result (#582)', async () => {
    recallContextMock.mockResolvedValue([
      { kind: 'decision', ref: 'evo-x', summary: 'prior decision', score: 101, signals: ['issue lineage #179'] },
    ]);

    const result = JSON.parse(await runIssueBootstrap({
      issue_id: '179',
      issue_title: 'Implement bootstrap evidence',
      issue_body: 'about sampling',
      context_reset_performed: true,
      project_hot_load_performed: true,
      issue_payload_attached: true,
      repo_path: '/repo',
      project_path: '/workspace/projects/agenticos/standards',
    })) as { status: string; recalled: Array<{ ref: string }> };

    expect(result.status).toBe('RECORDED');
    expect(result.recalled).toEqual([
      { kind: 'decision', ref: 'evo-x', summary: 'prior decision', score: 101, signals: ['issue lineage #179'] },
    ]);
    expect(recallContextMock).toHaveBeenCalledWith(expect.objectContaining({
      issueId: '179',
      issueTitle: 'Implement bootstrap evidence',
      issueBody: 'about sampling',
    }));
  });

  it('never blocks bootstrap when recall throws (best-effort) (#582)', async () => {
    recallContextMock.mockRejectedValue(new Error('recall boom'));

    const result = JSON.parse(await runIssueBootstrap({
      issue_id: '179',
      issue_title: 'Implement bootstrap evidence',
      context_reset_performed: true,
      project_hot_load_performed: true,
      issue_payload_attached: true,
      repo_path: '/repo',
      project_path: '/workspace/projects/agenticos/standards',
    })) as { status: string; recalled: unknown[] };

    expect(result.status).toBe('RECORDED');
    expect(result.recalled).toEqual([]);
  });

  it('blocks when the caller has not explicitly confirmed the clear-equivalent reset', async () => {
    const result = JSON.parse(await runIssueBootstrap({
      issue_id: '179',
      issue_title: 'Implement bootstrap evidence',
      context_reset_performed: false,
      project_hot_load_performed: true,
      issue_payload_attached: true,
      repo_path: '/repo',
      project_path: '/workspace/projects/agenticos/standards',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('context_reset_performed');
    expect(persistIssueBootstrapEvidenceMock).not.toHaveBeenCalled();
  });

  it('records issue bootstrap evidence when the worktree root is declared even if the common repo root differs', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos',
      resolutionSource: 'repo_path_match',
      resolutionErrors: [],
      targetProject: {
        id: 'agenticos',
        name: 'AgenticOS',
        path: '/workspace/worktrees/issue-268',
        statePath: '/workspace/worktrees/issue-268/.context/state.yaml',
        projectYamlPath: '/workspace/worktrees/issue-268/.project.yaml',
        sourceRepoRoots: ['/workspace/worktrees/issue-268'],
        sourceRepoRootsDeclared: true,
      },
    });
    readFileMock.mockResolvedValue(JSON.stringify({
      meta: { id: 'agenticos' },
      agent_context: {
        quick_start: '.context/quick-start.md',
        current_state: '.context/state.yaml',
      },
    }));
    mockGitResponses({
      'rev-parse --show-toplevel': '/workspace/worktrees/issue-268\n',
      'rev-parse --git-common-dir': '/workspace/projects/agenticos/.git\n',
      'rev-parse --abbrev-ref HEAD': 'fix/268-fix-guardrail-worktree-repo-identity\n',
      'worktree list --porcelain': 'worktree /workspace/projects/agenticos\nHEAD deadbeef\nbranch refs/heads/main\n\nworktree /workspace/worktrees/issue-268\nHEAD abc123\nbranch refs/heads/fix/268-fix-guardrail-worktree-repo-identity\n',
    });

    const result = JSON.parse(await runIssueBootstrap({
      issue_id: '268',
      issue_title: 'Fix guardrail worktree false-block',
      context_reset_performed: true,
      project_hot_load_performed: true,
      issue_payload_attached: true,
      repo_path: '/workspace/worktrees/issue-268',
      project_path: '/workspace/worktrees/issue-268',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('RECORDED');
    expect(result.block_reasons).toEqual([]);
  });

  it('blocks when the git checkout identity cannot be resolved', async () => {
    // Every git invocation fails, so resolveGitCheckoutIdentity returns null.
    execAsyncMock.mockRejectedValue(new Error('fatal: not a git repository'));

    const result = JSON.parse(await runIssueBootstrap({
      issue_id: '179',
      issue_title: 'Implement bootstrap evidence',
      context_reset_performed: true,
      project_hot_load_performed: true,
      issue_payload_attached: true,
      repo_path: '/repo',
      project_path: '/workspace/projects/agenticos/standards',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('failed to resolve git checkout identity');
    expect(persistIssueBootstrapEvidenceMock).not.toHaveBeenCalled();
  });
});
