import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const childProcessMock = vi.hoisted(() => ({
  exec: vi.fn(),
}));

const standardKitMock = vi.hoisted(() => ({
  checkStandardKitUpgrade: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: childProcessMock.exec,
}));

vi.mock('../standard-kit.js', () => ({
  checkStandardKitUpgrade: standardKitMock.checkStandardKitUpgrade,
}));

import { runHealthCheck } from '../health.js';
import { runHealth } from '../../tools/health.js';

async function setupProjectRoot(stateYaml: string): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'agenticos-health-'));
  await mkdir(join(projectRoot, '.context'), { recursive: true });
  await writeFile(join(projectRoot, '.context', 'state.yaml'), stateYaml, 'utf-8');
  return projectRoot;
}

describe('health command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reports PASS when the canonical checkout is clean and freshness signals are present', async () => {
    const projectRoot = await setupProjectRoot(`session:\n  last_entry_surface_refresh: "2026-03-25T00:00:00.000Z"\nguardrail_evidence:\n  last_command: "agenticos_preflight"\nentry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\n`);
    childProcessMock.exec.mockImplementation((_: string, cb: Function) => cb(null, '## main...origin/main\n', ''));
    standardKitMock.checkStandardKitUpgrade.mockResolvedValue({
      missing_required_files: [],
      generated_files: [{ path: 'AGENTS.md', status: 'current' }],
      copied_templates: [{ path: '.context/quick-start.md', status: 'matches_canonical' }],
    });

    const result = await runHealthCheck({
      repo_path: '/repo',
      project_path: projectRoot,
      check_standard_kit: true,
    });

    expect(result.status).toBe('PASS');
    expect(result.gates).toEqual([
      { gate: 'repo_sync', status: 'PASS', summary: 'Canonical checkout is clean and aligned with origin/main.' },
      { gate: 'entry_surface_refresh', status: 'PASS', summary: 'Entry surfaces have explicit refresh metadata.' },
      { gate: 'guardrail_evidence', status: 'PASS', summary: 'Latest guardrail evidence is present (agenticos_preflight).' },
      { gate: 'standard_kit', status: 'PASS', summary: 'Standard-kit files match the canonical kit.' },
    ]);

    const wrapped = JSON.parse(await runHealth({
      repo_path: '/repo',
      project_path: projectRoot,
    })) as { command: string; status: string };
    expect(wrapped.command).toBe('agenticos_health');
    expect(wrapped.status).toBe('PASS');
  });

  it('reports BLOCK and WARN gates for a behind or dirty canonical checkout with stale state surfaces', async () => {
    const projectRoot = await setupProjectRoot(`session:\n  id: "session-1"\n`);
    childProcessMock.exec.mockImplementation((_: string, cb: Function) => cb(null, '## main...origin/main [behind 2]\n M README.md\n', ''));

    const result = await runHealthCheck({
      repo_path: '/repo',
      project_path: projectRoot,
    });

    expect(result.status).toBe('BLOCK');
    expect(result.gates).toEqual([
      {
        gate: 'repo_sync',
        status: 'BLOCK',
        summary: 'Canonical checkout is not aligned with origin/main: ## main...origin/main [behind 2]',
      },
      {
        gate: 'entry_surface_refresh',
        status: 'WARN',
        summary: 'Entry surfaces do not yet have explicit refresh metadata.',
      },
      {
        gate: 'guardrail_evidence',
        status: 'WARN',
        summary: 'No persisted guardrail evidence is present yet.',
      },
    ]);
  });

  it('reports WARN when project state cannot be read and when standard-kit drift exists', async () => {
    childProcessMock.exec.mockImplementation((_: string, cb: Function) => cb(null, '## main...origin/main\n', ''));
    standardKitMock.checkStandardKitUpgrade.mockResolvedValue({
      missing_required_files: ['CLAUDE.md'],
      generated_files: [{ path: 'AGENTS.md', status: 'stale' }],
      copied_templates: [{ path: '.context/quick-start.md', status: 'diverged_from_canonical' }],
    });

    const result = await runHealthCheck({
      repo_path: '/repo',
      project_path: '/missing/project',
      check_standard_kit: true,
    });

    expect(result.status).toBe('WARN');
    expect(result.gates).toEqual([
      { gate: 'repo_sync', status: 'PASS', summary: 'Canonical checkout is clean and aligned with origin/main.' },
      {
        gate: 'entry_surface_refresh',
        status: 'WARN',
        summary: 'Project state could not be read, so entry-surface freshness was not proven.',
      },
      {
        gate: 'guardrail_evidence',
        status: 'WARN',
        summary: 'Project state could not be read, so guardrail visibility was not proven.',
      },
      {
        gate: 'standard_kit',
        status: 'WARN',
        summary: 'Standard-kit drift was detected and should be reviewed before starting work.',
      },
    ]);
  });

  it('blocks a canonical checkout that is on main but still dirty', async () => {
    const projectRoot = await setupProjectRoot(`entry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\n`);
    childProcessMock.exec.mockImplementation((_: string, cb: Function) => cb(null, '## main...origin/main\n M README.md\n', ''));

    const result = await runHealthCheck({
      repo_path: '/repo',
      project_path: projectRoot,
    });

    expect(result.status).toBe('BLOCK');
    expect(result.gates[0]).toEqual({
      gate: 'repo_sync',
      status: 'BLOCK',
      summary: 'Canonical checkout is dirty and cannot be treated as a trusted starting point.',
    });
  });

  it('fails closed on missing repo_path, git command failure fallbacks, missing branch status, and missing project_path for standard-kit checks', async () => {
    await expect(() => runHealth(undefined)).rejects.toThrow('repo_path is required.');

    childProcessMock.exec.mockImplementation((_: string, cb: Function) => cb(new Error('git failed'), '', 'git failed'));
    await expect(() => runHealthCheck({ repo_path: '/repo' })).rejects.toThrow('git failed');

    childProcessMock.exec.mockImplementation((_: string, cb: Function) => cb(new Error('message only git failure'), '', ''));
    await expect(() => runHealthCheck({ repo_path: '/repo' })).rejects.toThrow('message only git failure');

    const nullStateProjectRoot = await setupProjectRoot('null');
    childProcessMock.exec.mockImplementation((_: string, cb: Function) => cb(null, '\n', ''));
    const missingBranchResult = await runHealthCheck({
      repo_path: '/repo',
      project_path: nullStateProjectRoot,
    });

    expect(missingBranchResult.status).toBe('BLOCK');
    expect(missingBranchResult.gates).toEqual([
      {
        gate: 'repo_sync',
        status: 'BLOCK',
        summary: 'Canonical checkout is not aligned with origin/main: missing branch status',
      },
      {
        gate: 'entry_surface_refresh',
        status: 'WARN',
        summary: 'Entry surfaces do not yet have explicit refresh metadata.',
      },
      {
        gate: 'guardrail_evidence',
        status: 'WARN',
        summary: 'No persisted guardrail evidence is present yet.',
      },
    ]);

    childProcessMock.exec.mockImplementation((_: string, cb: Function) => cb(null, '## main...origin/main\n', ''));
    const result = await runHealthCheck({
      repo_path: '/repo',
      check_standard_kit: true,
    });

    expect(result.status).toBe('WARN');
    expect(result.gates).toEqual([
      { gate: 'repo_sync', status: 'PASS', summary: 'Canonical checkout is clean and aligned with origin/main.' },
      {
        gate: 'entry_surface_refresh',
        status: 'WARN',
        summary: 'Project state could not be read, so entry-surface freshness was not proven.',
      },
      {
        gate: 'guardrail_evidence',
        status: 'WARN',
        summary: 'Project state could not be read, so guardrail visibility was not proven.',
      },
      {
        gate: 'standard_kit',
        status: 'WARN',
        summary: 'Standard-kit drift check was requested without a project_path.',
      },
    ]);
  });
});
