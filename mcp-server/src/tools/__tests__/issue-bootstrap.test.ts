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

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn(() => execAsyncMock),
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
});
