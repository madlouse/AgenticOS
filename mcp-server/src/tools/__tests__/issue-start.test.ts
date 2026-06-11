import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runPreflightMock = vi.hoisted(() => vi.fn());
const runBranchBootstrapMock = vi.hoisted(() => vi.fn());
const runIssueBootstrapMock = vi.hoisted(() => vi.fn());
const runEditGuardMock = vi.hoisted(() => vi.fn());

vi.mock('../preflight.js', () => ({ runPreflight: runPreflightMock }));
vi.mock('../branch-bootstrap.js', () => ({ runBranchBootstrap: runBranchBootstrapMock }));
vi.mock('../issue-bootstrap.js', () => ({ runIssueBootstrap: runIssueBootstrapMock }));
vi.mock('../edit-guard.js', () => ({ runEditGuard: runEditGuardMock }));

import { runIssueStart } from '../issue-start.js';

const WORKTREE = '/home/x/AgenticOS/worktrees/agenticos/agenticos-519-issue-start-orchestration';

const BASE_ARGS = {
  issue_id: '519',
  slug: 'issue-start-orchestration',
  repo_path: '/home/x/AgenticOS/projects/agenticos',
  issue_title: 'add orchestration entrypoint',
};

function json(obj: unknown): string {
  return JSON.stringify(obj);
}

/** Wire the happy-path defaults; individual tests override a single step. */
function wireHappyPath(): void {
  runPreflightMock
    .mockResolvedValueOnce(json({ status: 'REDIRECT', evidence: { current_branch: 'main' } }))
    .mockResolvedValueOnce(json({ status: 'PASS', evidence: { current_branch: 'feat/519-x' } }));
  runBranchBootstrapMock.mockResolvedValue(json({ status: 'CREATED', worktree_path: WORKTREE, branch_name: 'feat/519-x' }));
  runIssueBootstrapMock.mockResolvedValue(json({ status: 'RECORDED', startup_context_paths: ['/p/.project.yaml'] }));
  runEditGuardMock.mockResolvedValue(json({ status: 'PASS' }));
}

beforeEach(() => {
  runPreflightMock.mockReset();
  runBranchBootstrapMock.mockReset();
  runIssueBootstrapMock.mockReset();
  runEditGuardMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('runIssueStart', () => {
  it('drives the full chain and returns READY with the created worktree', async () => {
    wireHappyPath();

    const result = JSON.parse(await runIssueStart(BASE_ARGS));

    expect(result.status).toBe('READY');
    expect(result.worktree_path).toBe(WORKTREE);
    expect(result.branch_name).toBe('feat/519-x');
    expect(result.startup_context_paths).toEqual(['/p/.project.yaml']);
    expect(result.steps.map((s: any) => s.step)).toEqual(['preflight', 'branch_bootstrap', 'issue_bootstrap', 'preflight']);
    // No declared_target_files → edit_guard is not requested.
    expect(result.edit_guard).toBe('NOT_REQUESTED');
    expect(runEditGuardMock).not.toHaveBeenCalled();
  });

  it('threads the created worktree path into issue_bootstrap and the second preflight', async () => {
    wireHappyPath();

    await runIssueStart(BASE_ARGS);

    expect(runIssueBootstrapMock).toHaveBeenCalledWith(expect.objectContaining({
      repo_path: WORKTREE,
      context_reset_performed: true,
      project_hot_load_performed: true,
      issue_payload_attached: true,
    }));
    // Second preflight runs inside the worktree.
    expect(runPreflightMock.mock.calls[1][0]).toMatchObject({ repo_path: WORKTREE });
  });

  it('runs edit_guard when declared_target_files are provided', async () => {
    wireHappyPath();

    const result = JSON.parse(await runIssueStart({ ...BASE_ARGS, declared_target_files: ['mcp-server/src/tools/issue-start.ts'] }));

    expect(result.status).toBe('READY');
    expect(result.edit_guard).toBe('PASS');
    expect(runEditGuardMock).toHaveBeenCalledWith(expect.objectContaining({
      repo_path: WORKTREE,
      declared_target_files: ['mcp-server/src/tools/issue-start.ts'],
    }));
  });

  it('reports SKIPPED edit_guard when run_edit_guard is forced but no target files exist', async () => {
    wireHappyPath();

    const result = JSON.parse(await runIssueStart({ ...BASE_ARGS, run_edit_guard: true }));

    expect(result.status).toBe('READY');
    expect(result.edit_guard).toBe('SKIPPED');
    expect(runEditGuardMock).not.toHaveBeenCalled();
  });

  it('skips branch_bootstrap when the source checkout already passes preflight', async () => {
    runPreflightMock
      .mockResolvedValueOnce(json({ status: 'PASS', evidence: { current_branch: 'feat/existing' } }))
      .mockResolvedValueOnce(json({ status: 'PASS', evidence: { current_branch: 'feat/existing' } }));
    runIssueBootstrapMock.mockResolvedValue(json({ status: 'RECORDED', startup_context_paths: [] }));

    const result = JSON.parse(await runIssueStart(BASE_ARGS));

    expect(result.status).toBe('READY');
    expect(runBranchBootstrapMock).not.toHaveBeenCalled();
    expect(result.worktree_path).toBe(BASE_ARGS.repo_path);
    expect(result.steps[0].note).toMatch(/skipped branch_bootstrap/);
  });

  it('BLOCKS on missing required input without calling any guardrail', async () => {
    const result = JSON.parse(await runIssueStart({ slug: 'x', repo_path: '/r', issue_title: 't' }));

    expect(result.status).toBe('BLOCKED');
    expect(result.summary).toMatch(/issue_id/);
    expect(runPreflightMock).not.toHaveBeenCalled();
  });

  it('BLOCKS and stops when the source preflight is blocked', async () => {
    runPreflightMock.mockResolvedValueOnce(json({ status: 'BLOCK', block_reasons: ['identity mismatch'] }));

    const result = JSON.parse(await runIssueStart(BASE_ARGS));

    expect(result.status).toBe('BLOCKED');
    expect(result.block_reasons).toContain('identity mismatch');
    expect(runBranchBootstrapMock).not.toHaveBeenCalled();
  });

  it('BLOCKS when branch_bootstrap does not create a worktree', async () => {
    runPreflightMock.mockResolvedValueOnce(json({ status: 'REDIRECT', evidence: {} }));
    runBranchBootstrapMock.mockResolvedValue(json({ status: 'BLOCK', block_reasons: ['dirty worktree'] }));

    const result = JSON.parse(await runIssueStart(BASE_ARGS));

    expect(result.status).toBe('BLOCKED');
    expect(result.block_reasons).toContain('dirty worktree');
    expect(runIssueBootstrapMock).not.toHaveBeenCalled();
  });

  it('BLOCKS when issue_bootstrap is not recorded', async () => {
    runPreflightMock.mockResolvedValueOnce(json({ status: 'REDIRECT', evidence: {} }));
    runBranchBootstrapMock.mockResolvedValue(json({ status: 'CREATED', worktree_path: WORKTREE, branch_name: 'b' }));
    runIssueBootstrapMock.mockResolvedValue(json({ status: 'BLOCK', block_reasons: ['no payload'] }));

    const result = JSON.parse(await runIssueStart(BASE_ARGS));

    expect(result.status).toBe('BLOCKED');
    expect(result.block_reasons).toContain('no payload');
  });

  it('BLOCKS when the worktree preflight does not pass', async () => {
    runPreflightMock
      .mockResolvedValueOnce(json({ status: 'REDIRECT', evidence: {} }))
      .mockResolvedValueOnce(json({ status: 'REDIRECT', redirect_actions: ['still not in worktree'] }));
    runBranchBootstrapMock.mockResolvedValue(json({ status: 'CREATED', worktree_path: WORKTREE, branch_name: 'b' }));
    runIssueBootstrapMock.mockResolvedValue(json({ status: 'RECORDED', startup_context_paths: [] }));

    const result = JSON.parse(await runIssueStart(BASE_ARGS));

    expect(result.status).toBe('BLOCKED');
    expect(result.block_reasons).toContain('still not in worktree');
  });

  it('BLOCKS when edit_guard does not pass', async () => {
    wireHappyPath();
    runEditGuardMock.mockResolvedValue(json({ status: 'BLOCK', block_reasons: ['scope drift'] }));

    const result = JSON.parse(await runIssueStart({ ...BASE_ARGS, declared_target_files: ['a.ts'] }));

    expect(result.status).toBe('BLOCKED');
    expect(result.block_reasons).toContain('scope drift');
  });

  it('derives a fix branch prefix for bugfix task type', async () => {
    wireHappyPath();

    await runIssueStart({ ...BASE_ARGS, task_type: 'bugfix' });

    expect(runBranchBootstrapMock).toHaveBeenCalledWith(expect.objectContaining({ branch_type: 'fix' }));
  });

  it('tolerates a non-JSON sub-tool result without throwing', async () => {
    runPreflightMock.mockResolvedValueOnce('❌ catastrophic non-json failure');

    const result = JSON.parse(await runIssueStart(BASE_ARGS));

    expect(result.status).toBe('BLOCKED');
  });
});
