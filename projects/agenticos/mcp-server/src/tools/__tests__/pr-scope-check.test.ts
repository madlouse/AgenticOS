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

import { runPrScopeCheck } from '../pr-scope-check.js';

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

describe('runPrScopeCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistGuardrailEvidenceMock.mockResolvedValue({
      attempted: true,
      persisted: true,
      project_id: 'agenticos',
      state_path: '/repo/.context/state.yaml',
    });
  });

  it('returns PASS when commits and files stay within the intended issue scope', async () => {
    mockGitResponses({
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'log --format=%s origin/main..HEAD': 'feat(mcp-server): add agenticos_branch_bootstrap helper (#36)\n',
      'diff --name-only origin/main...HEAD': 'projects/agenticos/mcp-server/src/tools/branch-bootstrap.ts\nprojects/agenticos/mcp-server/src/tools/__tests__/branch-bootstrap.test.ts\n',
    });

    const result = JSON.parse(await runPrScopeCheck({
      issue_id: '36',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/**', 'projects/agenticos/mcp-server/src/index.ts'],
      expected_issue_scope: 'single_guardrail_feature',
    })) as { status: string; unexpected_files: string[]; unrelated_commit_subjects: string[]; persistence?: { persisted: boolean } };

    expect(result.status).toBe('PASS');
    expect(result.unexpected_files).toEqual([]);
    expect(result.unrelated_commit_subjects).toEqual([]);
    expect(result.persistence?.persisted).toBe(true);
    expect(persistGuardrailEvidenceMock).toHaveBeenCalledTimes(1);
  });

  it('returns BLOCK when commit subjects do not match the current issue', async () => {
    mockGitResponses({
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'log --format=%s origin/main..HEAD': 'fix(record): defensively parse JSON-stringified array args (fixes #24)\n',
      'diff --name-only origin/main...HEAD': 'projects/agenticos/mcp-server/src/tools/preflight.ts\n',
    });

    const result = JSON.parse(await runPrScopeCheck({
      issue_id: '36',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/**'],
      expected_issue_scope: 'single_guardrail_feature',
    })) as { status: string; unrelated_commit_subjects: string[]; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.unrelated_commit_subjects).toHaveLength(1);
    expect(result.block_reasons[0]).toContain('unrelated commits');
  });

  it('returns BLOCK when changed files escape the declared target scope', async () => {
    mockGitResponses({
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'log --format=%s origin/main..HEAD': 'feat(mcp-server): add agenticos_pr_scope_check (#36)\n',
      'diff --name-only origin/main...HEAD': 'projects/agenticos/mcp-server/src/tools/pr-scope-check.ts\nREADME.md\n',
    });

    const result = JSON.parse(await runPrScopeCheck({
      issue_id: '36',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/**'],
      expected_issue_scope: 'single_guardrail_feature',
    })) as { status: string; unexpected_files: string[]; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.unexpected_files).toContain('README.md');
    expect(result.block_reasons.join(' ')).toContain('declared target scope');
  });

  it('returns BLOCK when the branch is not comparable to the intended remote base', async () => {
    execAsyncMock.mockRejectedValue(new Error('bad ref'));

    const result = JSON.parse(await runPrScopeCheck({
      issue_id: '36',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/**'],
      expected_issue_scope: 'single_guardrail_feature',
    })) as { status: string; branch_ancestry_verified: boolean; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.branch_ancestry_verified).toBe(false);
    expect(result.block_reasons[0]).toContain('not comparable');
  });
});
