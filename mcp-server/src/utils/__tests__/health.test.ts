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

async function setupProjectRoot(stateYaml: string, options?: { projectYaml?: string }): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'agenticos-health-'));
  await mkdir(join(projectRoot, '.context'), { recursive: true });
  const projectYaml = options?.projectYaml || `meta:\n  id: "health-project"\n  name: "Health Project"\nsource_control:\n  topology: "github_versioned"\n  context_publication_policy: "public_distilled"\n  branch_strategy: "github_flow"\nagent_context:\n  quick_start: "standards/.context/quick-start.md"\n  current_state: "standards/.context/state.yaml"\n  conversations: "standards/.context/conversations/"\n  last_record_marker: "standards/.context/.last_record"\n`;
  await mkdir(join(projectRoot, 'standards', '.context'), { recursive: true });
  await writeFile(join(projectRoot, '.project.yaml'), projectYaml, 'utf-8');
  await writeFile(join(projectRoot, 'standards', '.context', 'state.yaml'), stateYaml, 'utf-8');
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
      { gate: 'versioned_entry_surface_state', status: 'PASS', summary: 'Committed versioned entry surfaces look fresh for canonical mainline use.' },
      { gate: 'guardrail_evidence', status: 'PASS', summary: 'Latest guardrail evidence is present (agenticos_preflight).' },
      { gate: 'standard_kit', status: 'PASS', summary: 'Standard-kit files match the canonical kit.' },
    ]);
    expect(result.repo_sync).toEqual({
      branch_line: '## main...origin/main',
      branch_status: 'aligned',
      dirty_paths: [],
      runtime_dirty_paths: [],
      source_dirty_paths: [],
    });
    expect(result.recovery_actions).toEqual([]);

    const wrapped = JSON.parse(await runHealth({
      repo_path: '/repo',
      project_path: projectRoot,
    })) as { command: string; status: string };
    expect(wrapped.command).toBe('agenticos_health');
    expect(wrapped.status).toBe('PASS');
  });

  it('reports branch misalignment separately from runtime drift and source edits', async () => {
    const projectRoot = await setupProjectRoot(`session:\n  id: "session-1"\n`);
    childProcessMock.exec.mockImplementation((_: string, cb: Function) => cb(null, '## main...origin/main [behind 2]\n M standards/.context/state.yaml\n M README.md\n', ''));

    const result = await runHealthCheck({
      repo_path: '/repo',
      project_path: projectRoot,
    });

    expect(result.status).toBe('BLOCK');
    expect(result.gates).toEqual([
      {
        gate: 'repo_sync',
        status: 'BLOCK',
        summary: 'Canonical checkout is blocked by branch misalignment: ## main...origin/main [behind 2]; runtime-managed drift: 1 path(s); source-tree edits: 1 path(s).',
      },
      {
        gate: 'entry_surface_refresh',
        status: 'WARN',
        summary: 'Entry surfaces do not yet have explicit refresh metadata.',
      },
      {
        gate: 'versioned_entry_surface_state',
        status: 'WARN',
        summary: 'Committed versioned entry surface freshness is not proven.',
      },
      {
        gate: 'guardrail_evidence',
        status: 'WARN',
        summary: 'No persisted guardrail evidence is present yet.',
      },
    ]);
    expect(result.repo_sync).toEqual({
      branch_line: '## main...origin/main [behind 2]',
      branch_status: 'behind',
      dirty_paths: ['standards/.context/state.yaml', 'README.md'],
      runtime_dirty_paths: ['standards/.context/state.yaml'],
      source_dirty_paths: ['README.md'],
    });
    expect(result.recovery_actions).toEqual([
      'fast-forward canonical main to origin/main before treating it as a trusted base checkout',
      'discard or isolate runtime-managed drift from the canonical checkout: standards/.context/state.yaml',
      'review, move, or revert source-tree edits before trusting the canonical checkout: README.md',
      'keep new implementation work inside isolated issue worktrees rather than the canonical main checkout',
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

  it('classifies runtime-only drift in a canonical checkout that is otherwise aligned', async () => {
    const projectRoot = await setupProjectRoot(`entry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\n`);
    childProcessMock.exec.mockImplementation((_: string, cb: Function) => cb(null, '## main...origin/main\n M standards/.context/state.yaml\n M CLAUDE.md\n', ''));

    const result = await runHealthCheck({
      repo_path: '/repo',
      project_path: projectRoot,
    });

    expect(result.status).toBe('BLOCK');
    expect(result.gates[0]).toEqual({
      gate: 'repo_sync',
      status: 'BLOCK',
      summary: 'Canonical checkout is blocked by runtime-managed drift: 2 path(s).',
    });
    expect(result.repo_sync?.runtime_dirty_paths).toEqual(['standards/.context/state.yaml', 'CLAUDE.md']);
    expect(result.repo_sync?.source_dirty_paths).toEqual([]);
  });

  it('warns separately when committed github-versioned entry surfaces look stale', async () => {
    const projectRoot = await setupProjectRoot(`session:\n  last_entry_surface_refresh: "2026-03-25T00:00:00.000Z"\ncurrent_task:\n  title: "Implement #262 concurrent runtime project resolution"\n  status: "in_progress"\nentry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\n  status: "in_progress"\nissue_bootstrap:\n  latest:\n    issue_id: "260"\n    current_branch: "fix/260-stop-active-project-drift-and-main-state-pollution"\n    workspace_type: "isolated_worktree"\n    repo_path: "/tmp/worktrees/issue-260"\n`);
    childProcessMock.exec.mockImplementation((_: string, cb: Function) => cb(null, '## main...origin/main\n', ''));

    const result = await runHealthCheck({
      repo_path: '/repo',
      project_path: projectRoot,
    });

    expect(result.status).toBe('WARN');
    expect(result.gates).toEqual([
      { gate: 'repo_sync', status: 'PASS', summary: 'Canonical checkout is clean and aligned with origin/main.' },
      { gate: 'entry_surface_refresh', status: 'PASS', summary: 'Entry surfaces have explicit refresh metadata.' },
      { gate: 'versioned_entry_surface_state', status: 'WARN', summary: 'Committed versioned entry surfaces look stale for canonical mainline use.' },
      { gate: 'guardrail_evidence', status: 'WARN', summary: 'No persisted guardrail evidence is present yet.' },
    ]);
  });

  it('normalizes managed runtime paths when agent_context uses dot-prefixed and slashless directory paths', async () => {
    const projectRoot = await setupProjectRoot(`entry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\n`, {
      projectYaml: `meta:\n  id: "health-project"\n  name: "Health Project"\nsource_control:\n  topology: "github_versioned"\n  context_publication_policy: "public_distilled"\n  branch_strategy: "github_flow"\nagent_context:\n  quick_start: "./standards/.context/quick-start.md"\n  current_state: "./standards/.context/state.yaml"\n  conversations: "./standards/.context/conversations"\n  last_record_marker: "./standards/.context/.last_record"\n`,
    });
    childProcessMock.exec.mockImplementation((_: string, cb: Function) => cb(null, '## main...origin/main\n M standards/.context/conversations/logs/session-1.md\n', ''));

    const result = await runHealthCheck({
      repo_path: '/repo',
      project_path: projectRoot,
    });

    expect(result.repo_sync?.runtime_dirty_paths).toEqual(['standards/.context/conversations/logs/session-1.md']);
    expect(result.repo_sync?.source_dirty_paths).toEqual([]);
  });

  it('preserves runtime-managed conversation directory paths that already end with a slash', async () => {
    const projectRoot = await setupProjectRoot(`entry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\n`, {
      projectYaml: `meta:\n  id: "health-project"\n  name: "Health Project"\nsource_control:\n  topology: "github_versioned"\n  context_publication_policy: "public_distilled"\n  branch_strategy: "github_flow"\nagent_context:\n  quick_start: "standards/.context/quick-start.md"\n  current_state: "standards/.context/state.yaml"\n  conversations: "standards/.context/conversations/"\n  last_record_marker: "standards/.context/.last_record"\n`,
    });
    childProcessMock.exec.mockImplementation((_: string, cb: Function) => cb(null, '## main...origin/main\n M standards/.context/conversations/logs/session-2.md\n', ''));

    const result = await runHealthCheck({
      repo_path: '/repo',
      project_path: projectRoot,
    });

    expect(result.repo_sync?.runtime_dirty_paths).toEqual(['standards/.context/conversations/logs/session-2.md']);
    expect(result.repo_sync?.source_dirty_paths).toEqual([]);
  });

  it('treats a null project yaml parse as an empty managed config instead of failing closed', async () => {
    const projectRoot = await setupProjectRoot(`entry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\n`, {
      projectYaml: 'null\n',
    });
    childProcessMock.exec.mockImplementation((_: string, cb: Function) => cb(null, '## main...origin/main\n', ''));

    const result = await runHealthCheck({
      repo_path: '/repo',
      project_path: projectRoot,
    });

    expect(result.status).toBe('WARN');
    expect(result.gates).toEqual([
      { gate: 'repo_sync', status: 'PASS', summary: 'Canonical checkout is clean and aligned with origin/main.' },
      { gate: 'entry_surface_refresh', status: 'WARN', summary: 'Project state could not be read, so entry-surface freshness was not proven.' },
      { gate: 'guardrail_evidence', status: 'WARN', summary: 'Project state could not be read, so guardrail visibility was not proven.' },
    ]);
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
        summary: 'Canonical checkout is blocked by branch misalignment: missing branch status.',
      },
      {
        gate: 'entry_surface_refresh',
        status: 'WARN',
        summary: 'Entry surfaces do not yet have explicit refresh metadata.',
      },
      {
        gate: 'versioned_entry_surface_state',
        status: 'WARN',
        summary: 'Committed versioned entry surface freshness is not proven.',
      },
      {
        gate: 'guardrail_evidence',
        status: 'WARN',
        summary: 'No persisted guardrail evidence is present yet.',
      },
    ]);
    expect(missingBranchResult.repo_sync).toEqual({
      branch_line: '',
      branch_status: 'unknown',
      dirty_paths: [],
      runtime_dirty_paths: [],
      source_dirty_paths: [],
    });
    expect(missingBranchResult.recovery_actions).toEqual([
      'inspect canonical branch status "missing branch status" and restore exact main...origin/main alignment',
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
