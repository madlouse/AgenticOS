import { beforeEach, describe, expect, it, vi } from 'vitest';

const runHealthCheckMock = vi.hoisted(() => vi.fn());
const assessKnowledgeEvolutionHealthMock = vi.hoisted(() => vi.fn());

vi.mock('../../utils/health.js', () => ({
  runHealthCheck: runHealthCheckMock,
}));

vi.mock('../../utils/knowledge-evolution-health.js', () => ({
  assessKnowledgeEvolutionHealth: assessKnowledgeEvolutionHealthMock,
}));

import { runHealth } from '../health.js';

function baseHealthResult(status: 'PASS' | 'WARN' | 'BLOCK', recoveryActions?: string[]): any {
  return {
    command: 'agenticos_health',
    status,
    repo_path: '/repo',
    project_path: '/project',
    remote_base_branch: 'origin/main',
    checkout_role: 'canonical',
    checked_at: '2026-05-21T00:00:00.000Z',
    gates: [{ gate: 'repo_sync', status: 'PASS', summary: 'Repo is clean.' }],
    repo_sync: {
      branch_line: '## main...origin/main',
      branch_status: 'aligned',
      dirty_paths: [],
      runtime_dirty_paths: [],
      source_dirty_paths: [],
    },
    ...(recoveryActions === undefined ? {} : { recovery_actions: recoveryActions }),
  };
}

function knowledgeResult(status: 'PASS' | 'WARN'): any {
  return {
    status,
    summary: status === 'PASS' ? 'Knowledge evolution signals are fresh.' : 'Knowledge evolution has 1 warning(s).',
    recovery_actions: status === 'PASS' ? [] : ['refresh knowledge evolution signals'],
  };
}

describe('agenticos health tool wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps PASS when canonical health and knowledge evolution both pass', async () => {
    runHealthCheckMock.mockResolvedValue(baseHealthResult('PASS', []));
    assessKnowledgeEvolutionHealthMock.mockResolvedValue(knowledgeResult('PASS'));

    const result = JSON.parse(await runHealth({ repo_path: '/repo' }));

    expect(result.status).toBe('PASS');
    expect(result.gates).toContainEqual({
      gate: 'knowledge_evolution',
      status: 'PASS',
      summary: 'Knowledge evolution signals are fresh.',
    });
    expect(result.recovery_actions).toEqual([]);
    expect(assessKnowledgeEvolutionHealthMock).toHaveBeenCalledWith({
      projectPath: '/project',
      repoPath: '/repo',
      repoSync: {
        branch_line: '## main...origin/main',
        branch_status: 'aligned',
        dirty_paths: [],
        runtime_dirty_paths: [],
        source_dirty_paths: [],
      },
    });
  });

  it('escalates PASS to WARN when knowledge evolution warns and preserves missing recovery_actions', async () => {
    runHealthCheckMock.mockResolvedValue(baseHealthResult('PASS'));
    assessKnowledgeEvolutionHealthMock.mockResolvedValue(knowledgeResult('WARN'));

    const result = JSON.parse(await runHealth({ repo_path: '/repo' }));

    expect(result.status).toBe('WARN');
    expect(result.recovery_actions).toEqual(['refresh knowledge evolution signals']);
  });

  it('preserves BLOCK when the underlying health check blocks', async () => {
    runHealthCheckMock.mockResolvedValue(baseHealthResult('BLOCK', ['fix branch alignment']));
    assessKnowledgeEvolutionHealthMock.mockResolvedValue(knowledgeResult('WARN'));

    const result = JSON.parse(await runHealth({ repo_path: '/repo' }));

    expect(result.status).toBe('BLOCK');
    expect(result.recovery_actions).toEqual([
      'fix branch alignment',
      'refresh knowledge evolution signals',
    ]);
  });
});
