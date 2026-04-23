import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// Hoisted at module level so vi.mock can reference them
const execMock = vi.hoisted(() => vi.fn());
const spawnMock = vi.hoisted(() => vi.fn());

const mcpTransportGateMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    gate: 'mcp_transport' as const,
    status: 'PASS' as const,
    summary: 'MCP transport check skipped in unit tests.',
  }),
);

vi.mock('child_process', () => ({
  exec: execMock,
  spawn: spawnMock,
}));

const standardKitMock = vi.hoisted(() => ({
  checkStandardKitUpgrade: vi.fn(),
}));

const registryMock = vi.hoisted(() => ({
  getAgenticOSHome: vi.fn(() => '/workspace'),
}));

const repoBoundaryMock = vi.hoisted(() => ({
  resolveGuardrailProjectTarget: vi.fn(),
}));

const worktreeTopologyMock = vi.hoisted(() => ({
  deriveExpectedWorktreeRoot: vi.fn(() => '/workspace/worktrees/health-project'),
  inspectProjectWorktreeTopology: vi.fn(),
}));

vi.mock('../standard-kit.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../standard-kit.js')>();
  return {
    ...actual,
    checkStandardKitUpgrade: standardKitMock.checkStandardKitUpgrade,
  };
});

vi.mock('../registry.js', () => ({
  getAgenticOSHome: registryMock.getAgenticOSHome,
}));

vi.mock('../repo-boundary.js', () => ({
  resolveGuardrailProjectTarget: repoBoundaryMock.resolveGuardrailProjectTarget,
}));

vi.mock('../worktree-topology.js', () => ({
  deriveExpectedWorktreeRoot: worktreeTopologyMock.deriveExpectedWorktreeRoot,
  inspectProjectWorktreeTopology: worktreeTopologyMock.inspectProjectWorktreeTopology,
}));

vi.mock('../health.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../health.js')>();
  return {
    ...actual,
    buildMcpTransportGate: mcpTransportGateMock,
  };
});

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
  beforeEach(() => {
    // Default exec mock — individual tests override this
    execMock.mockReset();
    spawnMock.mockReset();

    // Default exec mock: 'which agenticos-mcp' returns a path so spawn is called
    execMock.mockImplementation((command: string, cb: Function) => {
      if (command.includes('which agenticos-mcp')) {
        cb(null, '/usr/local/bin/agenticos-mcp\n', '');
        return;
      }
      cb(null, '## main...origin/main\n', '');
    });

    // Default spawn mock: simulate a working MCP server
    spawnMock.mockReturnValue({
      on: vi.fn((event: string, cb: Function) => {
        if (event === 'exit') setTimeout(() => cb(0), 15000); // exit after 15s if not killed
      }),
      stdout: { on: vi.fn((_: string, cb: (d: Buffer) => void) => {
        // Emit serverInfo on the next microtask so the data handler is registered first
        queueMicrotask(() => {
          cb(Buffer.from(JSON.stringify({
            jsonrpc: '2.0', id: 1,
            result: { serverInfo: { name: 'agenticos-mcp', version: '0.4.7' }, capabilities: {} },
          }) + '\n'));
        });
      }) },
      stdin: { write: vi.fn() },
      kill: vi.fn(),
    });

    repoBoundaryMock.resolveGuardrailProjectTarget.mockResolvedValue({
      activeProjectId: null,
      resolutionSource: 'repo_path_match',
      targetProject: {
        id: 'health-project',
        path: '/resolved/project',
      },
      resolutionErrors: [],
    });
    worktreeTopologyMock.inspectProjectWorktreeTopology.mockResolvedValue({
      applies: true,
      status: 'PASS',
      summary: 'Worktree topology matches the derived project-scoped root.',
      expected_worktree_root: '/workspace/worktrees/health-project',
      worktrees: [],
      counts: {
        canonical_main: 1,
        project_scoped: 0,
        misplaced_clean: 0,
        misplaced_dirty: 0,
      },
      inspection_errors: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reports PASS when the canonical checkout is clean and freshness signals are present', async () => {
    const projectRoot = await setupProjectRoot(`session:\n  last_entry_surface_refresh: "2026-03-25T00:00:00.000Z"\nguardrail_evidence:\n  last_command: "agenticos_preflight"\nentry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\nissue_bootstrap:\n  latest:\n    issue_id: "300"\n    current_branch: "main"\n    workspace_type: "main"\n    repo_path: "/repo"\n`);
    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(null, '## main...origin/main\n', '');
    });
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
      { gate: 'issue_bootstrap_continuity', status: 'PASS', summary: 'Latest issue bootstrap evidence is current for this checkout.' },
      { gate: 'worktree_topology', status: 'PASS', summary: 'Worktree topology matches the derived project-scoped root.' },
      { gate: 'standard_kit', status: 'PASS', summary: 'Standard-kit files match the canonical kit.' },
      { gate: 'mcp_transport', status: 'PASS', summary: 'MCP transport check skipped in test environment.' },
    ]);
    expect(result.repo_sync).toEqual({
      branch_line: '## main...origin/main',
      branch_status: 'aligned',
      dirty_paths: [],
      runtime_dirty_paths: [],
      source_dirty_paths: [],
    });
    expect(result.worktree_topology?.status).toBe('PASS');
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
    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(null, '## main...origin/main [behind 2]\n M standards/.context/state.yaml\n M README.md\n', '');
    });
    worktreeTopologyMock.inspectProjectWorktreeTopology.mockResolvedValue({
      applies: true,
      status: 'WARN',
      summary: 'Worktree topology has 1 misplaced clean worktree(s).',
      expected_worktree_root: '/workspace/worktrees/health-project',
      worktrees: [],
      counts: {
        canonical_main: 1,
        project_scoped: 0,
        misplaced_clean: 1,
        misplaced_dirty: 0,
      },
      inspection_errors: [],
    });

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
      {
        gate: 'issue_bootstrap_continuity',
        status: 'BLOCK',
        summary: 'No issue bootstrap evidence is recorded for the current checkout.',
      },
      {
        gate: 'worktree_topology',
        status: 'WARN',
        summary: 'Worktree topology has 1 misplaced clean worktree(s).',
      },
      { gate: 'mcp_transport', status: 'PASS', summary: 'MCP transport check skipped in test environment.' },
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
      'run agenticos_issue_bootstrap in the current checkout',
      'recreate misplaced clean worktrees under the derived project-scoped worktree root and remove the old paths',
    ]);
  });

  it('reports WARN when project state cannot be read and when standard-kit drift exists', async () => {
    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(null, '## main...origin/main\n', '');
    });
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
      { gate: 'mcp_transport', status: 'PASS', summary: 'MCP transport check skipped in test environment.' },
    ]);
  });

  it('still evaluates issue bootstrap continuity for an explicit trusted project_path without a resolved managed target', async () => {
    const projectRoot = await setupProjectRoot(`entry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\nissue_bootstrap:\n  latest:\n    issue_id: "300"\n    current_branch: "main"\n    workspace_type: "main"\n    repo_path: "/repo"\n`);
    repoBoundaryMock.resolveGuardrailProjectTarget.mockResolvedValue({
      activeProjectId: null,
      resolutionSource: null,
      targetProject: null,
      resolutionErrors: ['explicit project path is outside the managed registry'],
    });
    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(null, '## main...origin/main\n', '');
    });

    const result = await runHealthCheck({
      repo_path: '/repo',
      project_path: projectRoot,
    });

    expect(result.project_path).toBe(projectRoot);
    expect(result.gates).toContainEqual({
      gate: 'issue_bootstrap_continuity',
      status: 'PASS',
      summary: 'Latest issue bootstrap evidence is current for this checkout.',
    });
  });

  it('skips issue bootstrap continuity for non-github_versioned projects', async () => {
    const projectRoot = await setupProjectRoot(`entry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\nissue_bootstrap:\n  latest:\n    issue_id: "300"\n    repo_path: "/repo"\n`, {
      projectYaml: `meta:\n  id: "health-project"\n  name: "Health Project"\nsource_control:\n  topology: "local_directory_only"\nagent_context:\n  quick_start: "standards/.context/quick-start.md"\n  current_state: "standards/.context/state.yaml"\n  conversations: "standards/.context/conversations/"\n  last_record_marker: "standards/.context/.last_record"\n`,
    });
    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(null, '## main...origin/main\n', '');
    });

    const result = await runHealthCheck({
      repo_path: '/repo',
      project_path: projectRoot,
    });

    expect(result.gates.some((gate) => gate.gate === 'issue_bootstrap_continuity')).toBe(false);
  });

  it('classifies runtime-only drift in a canonical checkout that is otherwise aligned', async () => {
    const projectRoot = await setupProjectRoot(`entry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\n`);
    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(null, '## main...origin/main\n M standards/.context/state.yaml\n M CLAUDE.md\n', '');
    });

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
    expect(result.gates[4]).toEqual({
      gate: 'issue_bootstrap_continuity',
      status: 'BLOCK',
      summary: 'No issue bootstrap evidence is recorded for the current checkout.',
    });
    expect(result.gates[5]).toEqual({
      gate: 'worktree_topology',
      status: 'PASS',
      summary: 'Worktree topology matches the derived project-scoped root.',
    });
    expect(result.repo_sync?.runtime_dirty_paths).toEqual(['standards/.context/state.yaml', 'CLAUDE.md']);
    expect(result.repo_sync?.source_dirty_paths).toEqual([]);
  });

  it('warns separately when committed github-versioned entry surfaces look stale', async () => {
    const projectRoot = await setupProjectRoot(`session:\n  last_entry_surface_refresh: "2026-03-25T00:00:00.000Z"\ncurrent_task:\n  title: "Implement #262 concurrent runtime project resolution"\n  status: "in_progress"\nentry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\n  status: "in_progress"\nissue_bootstrap:\n  latest:\n    issue_id: "260"\n    current_branch: "fix/260-stop-active-project-drift-and-main-state-pollution"\n    workspace_type: "isolated_worktree"\n    repo_path: "/tmp/worktrees/issue-260"\n`);
    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(null, '## main...origin/main\n', '');
    });

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
      { gate: 'issue_bootstrap_continuity', status: 'WARN', summary: 'Latest issue bootstrap evidence is historical for the current checkout.' },
      { gate: 'worktree_topology', status: 'PASS', summary: 'Worktree topology matches the derived project-scoped root.' },
      { gate: 'mcp_transport', status: 'PASS', summary: 'MCP transport check skipped in test environment.' },
    ]);
  });

  it('surfaces invalid issue bootstrap continuity as a dedicated BLOCK gate', async () => {
    const projectRoot = await setupProjectRoot(`session:\n  last_entry_surface_refresh: "2026-03-25T00:00:00.000Z"\nentry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\nissue_bootstrap:\n  latest:\n    issue_id: "300"\n    current_branch: "main"\n    workspace_type: "main"\n    repo_path: "   "\n`);
    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(null, '## main...origin/main\n', '');
    });

    const result = await runHealthCheck({
      repo_path: '/repo',
      project_path: projectRoot,
    });

    expect(result.status).toBe('BLOCK');
    expect(result.gates).toContainEqual({
      gate: 'issue_bootstrap_continuity',
      status: 'BLOCK',
      summary: 'Latest issue bootstrap evidence is missing repo_path for the current checkout.',
    });
    expect(result.recovery_actions).toContain('rerun agenticos_issue_bootstrap in the current checkout');
  });

  it('normalizes managed runtime paths when agent_context uses dot-prefixed and slashless directory paths', async () => {
    const projectRoot = await setupProjectRoot(`entry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\n`, {
      projectYaml: `meta:\n  id: "health-project"\n  name: "Health Project"\nsource_control:\n  topology: "github_versioned"\n  context_publication_policy: "public_distilled"\n  branch_strategy: "github_flow"\nagent_context:\n  quick_start: "./standards/.context/quick-start.md"\n  current_state: "./standards/.context/state.yaml"\n  conversations: "./standards/.context/conversations"\n  last_record_marker: "./standards/.context/.last_record"\n`,
    });
    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(null, '## main...origin/main\n M standards/.context/conversations/logs/session-1.md\n', '');
    });

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
    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(null, '## main...origin/main\n M standards/.context/conversations/logs/session-2.md\n', '');
    });

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
    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(null, '## main...origin/main\n', '');
    });

    const result = await runHealthCheck({
      repo_path: '/repo',
      project_path: projectRoot,
    });

    expect(result.status).toBe('WARN');
    expect(result.gates).toEqual([
      { gate: 'repo_sync', status: 'PASS', summary: 'Canonical checkout is clean and aligned with origin/main.' },
      { gate: 'entry_surface_refresh', status: 'WARN', summary: 'Project state could not be read, so entry-surface freshness was not proven.' },
      { gate: 'guardrail_evidence', status: 'WARN', summary: 'Project state could not be read, so guardrail visibility was not proven.' },
      { gate: 'mcp_transport', status: 'PASS', summary: 'MCP transport check skipped in test environment.' },
    ]);
  });

  it('reports BLOCK when topology inspection finds dirty misplaced worktrees', async () => {
    const projectRoot = await setupProjectRoot(`entry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\n`);
    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(null, '## main...origin/main\n', '');
    });
    worktreeTopologyMock.inspectProjectWorktreeTopology.mockResolvedValue({
      applies: true,
      status: 'BLOCK',
      summary: 'Worktree topology is blocked by 1 misplaced dirty worktree(s).',
      expected_worktree_root: '/workspace/worktrees/health-project',
      worktrees: [],
      counts: {
        canonical_main: 1,
        project_scoped: 0,
        misplaced_clean: 0,
        misplaced_dirty: 1,
      },
      inspection_errors: [],
    });

    const result = await runHealthCheck({
      repo_path: '/repo',
      project_path: projectRoot,
    });

    expect(result.status).toBe('BLOCK');
    expect(result.gates[4]).toEqual({
      gate: 'issue_bootstrap_continuity',
      status: 'BLOCK',
      summary: 'No issue bootstrap evidence is recorded for the current checkout.',
    });
    expect(result.gates[5]).toEqual({
      gate: 'worktree_topology',
      status: 'BLOCK',
      summary: 'Worktree topology is blocked by 1 misplaced dirty worktree(s).',
    });
    expect(result.recovery_actions).toContain('run agenticos_issue_bootstrap in the current checkout');
    expect(result.recovery_actions).toContain('protect dirty misplaced worktrees first, then recreate them under the derived project-scoped worktree root before removing the old paths');
  });

  it('fails topology checks when a github_versioned project is missing meta.id', async () => {
    const projectRoot = await setupProjectRoot(`entry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\n`, {
      projectYaml: `meta:\n  name: "Health Project"\nsource_control:\n  topology: "github_versioned"\n  context_publication_policy: "public_distilled"\n  github_repo: "madlouse/health-project"\n  branch_strategy: "github_flow"\nagent_context:\n  quick_start: "standards/.context/quick-start.md"\n  current_state: "standards/.context/state.yaml"\n  conversations: "standards/.context/conversations/"\n  last_record_marker: "standards/.context/.last_record"\n`,
    });
    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(null, '## main...origin/main\n', '');
    });

    const result = await runHealthCheck({
      repo_path: '/repo',
      project_path: projectRoot,
    });

    expect(result.status).toBe('BLOCK');
    expect(result.gates[4]).toEqual({
      gate: 'issue_bootstrap_continuity',
      status: 'BLOCK',
      summary: 'No issue bootstrap evidence is recorded for the current checkout.',
    });
    expect(result.gates[5]).toEqual({
      gate: 'worktree_topology',
      status: 'BLOCK',
      summary: 'Worktree topology could not be checked because the project is missing meta.id.',
    });
    expect(result.recovery_actions).toContain('run agenticos_issue_bootstrap in the current checkout');
    expect(result.recovery_actions).toContain('restore project meta.id before relying on derived project-scoped worktree-root checks');
  });

  it('uses the resolved managed project path when health runs from repo_path only', async () => {
    const projectRoot = await setupProjectRoot(`entry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\n`);
    execMock.mockImplementation((command: string, cb: Function) => {
      if (command.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      if (command.includes('status --short --branch')) {
        cb(null, '## main...origin/main\n', '');
        return;
      }
      if (command.includes('rev-parse --show-toplevel')) {
        cb(null, '/workspace/worktrees/health-project/issue-1\n', '');
        return;
      }
      if (command.includes('rev-parse --git-common-dir')) {
        cb(null, '/workspace/projects/health-project/.git\n', '');
        return;
      }
      if (command.includes('config --get remote.origin.url')) {
        cb(null, 'https://github.com/madlouse/health-project.git\n', '');
        return;
      }
      cb(new Error(`Unexpected command: ${command}`), '', '');
    });
    repoBoundaryMock.resolveGuardrailProjectTarget.mockResolvedValue({
      activeProjectId: null,
      resolutionSource: 'repo_path_match',
      targetProject: {
        id: 'health-project',
        path: projectRoot,
        statePath: `${projectRoot}/standards/.context/state.yaml`,
        projectYamlPath: `${projectRoot}/.project.yaml`,
        topology: 'github_versioned',
        githubRepo: 'madlouse/health-project',
        sourceRepoRoots: ['/workspace/projects/health-project'],
        sourceRepoRootsDeclared: true,
        expectedWorktreeRoot: '/workspace/worktrees/health-project',
      },
      resolutionErrors: [],
    });

    const result = await runHealthCheck({
      repo_path: '/workspace/worktrees/health-project/issue-1',
    });

    expect(result.project_path).toBe(projectRoot);
    expect(result.gates.some((gate) => gate.gate === 'worktree_topology')).toBe(true);
    expect(worktreeTopologyMock.inspectProjectWorktreeTopology).toHaveBeenCalled();
  });

  it('drops the inferred managed project path when repo identity validation itself fails to execute', async () => {
    const projectRoot = await setupProjectRoot(`entry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\n`);
    repoBoundaryMock.resolveGuardrailProjectTarget.mockResolvedValue({
      activeProjectId: null,
      resolutionSource: 'repo_path_match',
      targetProject: {
        id: 'health-project',
        path: projectRoot,
        statePath: `${projectRoot}/standards/.context/state.yaml`,
        projectYamlPath: `${projectRoot}/.project.yaml`,
        topology: 'github_versioned',
        githubRepo: 'madlouse/health-project',
        sourceRepoRoots: ['/workspace/projects/health-project'],
        sourceRepoRootsDeclared: true,
        expectedWorktreeRoot: '/workspace/worktrees/health-project',
      },
      resolutionErrors: [],
    });
    execMock.mockImplementation((command: string, cb: Function) => {
      if (command.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      if (command.includes('status --short --branch')) {
        cb(null, '## main...origin/main\n', '');
        return;
      }
      if (command.includes('rev-parse --show-toplevel')) {
        cb(new Error('show-toplevel failed'), '', 'show-toplevel failed');
        return;
      }
      cb(new Error(`Unexpected command: ${command}`), '', '');
    });

    const result = await runHealthCheck({
      repo_path: '/workspace/worktrees/health-project/issue-1',
    });

    expect(result.project_path).toBeNull();
    expect(result.recovery_actions).toContain(
      'verify git repo identity before treating repo_path as a managed project: show-toplevel failed',
    );
    expect(result.gates.some((gate) => gate.gate === 'worktree_topology')).toBe(false);
    expect(result.gates.some((gate) => gate.gate === 'issue_bootstrap_continuity')).toBe(false);
  });

  it('fails closed on missing repo_path, git command failure fallbacks, missing branch status, and missing project_path for standard-kit checks', async () => {
    await expect(() => runHealth(undefined)).rejects.toThrow('repo_path is required.');

    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(new Error('git failed'), '', 'git failed');
    });
    await expect(() => runHealthCheck({ repo_path: '/repo' })).rejects.toThrow('git failed');

    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(new Error('message only git failure'), '', '');
    });
    await expect(() => runHealthCheck({ repo_path: '/repo' })).rejects.toThrow('message only git failure');

    const nullStateProjectRoot = await setupProjectRoot('null');
    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(null, '\n', '');
    });
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
      {
        gate: 'issue_bootstrap_continuity',
        status: 'BLOCK',
        summary: 'No issue bootstrap evidence is recorded for the current checkout.',
      },
      {
        gate: 'worktree_topology',
        status: 'PASS',
        summary: 'Worktree topology matches the derived project-scoped root.',
      },
      { gate: 'mcp_transport', status: 'PASS', summary: 'MCP transport check skipped in test environment.' },
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
      'run agenticos_issue_bootstrap in the current checkout',
    ]);

    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(null, '## main...origin/main\n', '');
    });
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
        summary: 'Standard-kit drift was detected and should be reviewed before starting work.',
      },
      { gate: 'mcp_transport', status: 'PASS', summary: 'MCP transport check skipped in test environment.' },
    ]);
  });

  it('returns a null project_path and skips topology when repo_path cannot resolve a managed project', async () => {
    repoBoundaryMock.resolveGuardrailProjectTarget.mockResolvedValue({
      activeProjectId: null,
      resolutionSource: null,
      targetProject: null,
      resolutionErrors: ['unmatched repo'],
    });
    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(null, '## main...origin/main\n', '');
    });

    const result = await runHealthCheck({
      repo_path: '/repo',
      check_standard_kit: true,
    });

    expect(result.project_path).toBeNull();
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
      { gate: 'mcp_transport', status: 'PASS', summary: 'MCP transport check skipped in test environment.' },
    ]);
    expect(result.worktree_topology).toBeUndefined();
    expect(standardKitMock.checkStandardKitUpgrade).not.toHaveBeenCalled();
  });

  it('does not trust a repo_path-only match under the derived worktree root when repo identity validation fails', async () => {
    const projectRoot = await setupProjectRoot(`entry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\n`);
    repoBoundaryMock.resolveGuardrailProjectTarget.mockResolvedValue({
      activeProjectId: null,
      resolutionSource: 'repo_path_match',
      targetProject: {
        id: 'health-project',
        path: projectRoot,
        statePath: `${projectRoot}/standards/.context/state.yaml`,
        projectYamlPath: `${projectRoot}/.project.yaml`,
        topology: 'github_versioned',
        githubRepo: 'madlouse/health-project',
        sourceRepoRoots: ['/workspace/projects/health-project'],
        sourceRepoRootsDeclared: true,
        expectedWorktreeRoot: '/workspace/worktrees/health-project',
      },
      resolutionErrors: [],
    });
    execMock.mockImplementation((command: string, cb: Function) => {
      if (command.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      if (command.includes('status --short --branch')) {
        cb(null, '## main...origin/main\n', '');
        return;
      }
      if (command.includes('rev-parse --show-toplevel')) {
        cb(null, '/workspace/worktrees/health-project/issue-1\n', '');
        return;
      }
      if (command.includes('rev-parse --git-common-dir')) {
        cb(null, '/external/shared.git\n', '');
        return;
      }
      if (command.includes('config --get remote.origin.url')) {
        cb(null, 'https://github.com/madlouse/health-project.git\n', '');
        return;
      }
      cb(new Error(`Unexpected command: ${command}`), '', '');
    });

    const result = await runHealthCheck({
      repo_path: '/workspace/worktrees/health-project/issue-1',
    });

    expect(result.project_path).toBeNull();
    expect(result.gates.some((gate) => gate.gate === 'worktree_topology')).toBe(false);
    expect(result.gates.some((gate) => gate.gate === 'issue_bootstrap_continuity')).toBe(false);
    expect(result.recovery_actions).toContain(
      'verify git repo identity before treating repo_path as a managed project: git worktree root "/workspace/worktrees/health-project/issue-1" is under the derived project worktree root "/workspace/worktrees/health-project", but git common repo root "/external" is not declared for target project "health-project"',
    );
  });

  it('does not trust a session-bound github project when repo identity validation fails for the provided repo_path', async () => {
    const projectRoot = await setupProjectRoot(`entry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\n`);
    repoBoundaryMock.resolveGuardrailProjectTarget.mockResolvedValue({
      activeProjectId: null,
      resolutionSource: 'session_project',
      targetProject: {
        id: 'health-project',
        path: projectRoot,
        statePath: `${projectRoot}/standards/.context/state.yaml`,
        projectYamlPath: `${projectRoot}/.project.yaml`,
        topology: 'github_versioned',
        githubRepo: 'madlouse/health-project',
        sourceRepoRoots: ['/workspace/projects/health-project'],
        sourceRepoRootsDeclared: true,
        expectedWorktreeRoot: '/workspace/worktrees/health-project',
      },
      resolutionErrors: [],
    });
    execMock.mockImplementation((command: string, cb: Function) => {
      if (command.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      if (command.includes('status --short --branch')) {
        cb(null, '## main...origin/main\n', '');
        return;
      }
      if (command.includes('rev-parse --show-toplevel')) {
        cb(null, '/workspace/other-repo\n', '');
        return;
      }
      if (command.includes('rev-parse --git-common-dir')) {
        cb(null, '/workspace/other-repo/.git\n', '');
        return;
      }
      if (command.includes('config --get remote.origin.url')) {
        cb(null, 'https://github.com/other/repo.git\n', '');
        return;
      }
      cb(new Error(`Unexpected command: ${command}`), '', '');
    });

    const result = await runHealthCheck({
      repo_path: '/workspace/other-repo',
    });

    expect(result.project_path).toBeNull();
    expect(result.gates.some((gate) => gate.gate === 'worktree_topology')).toBe(false);
    expect(result.gates.some((gate) => gate.gate === 'issue_bootstrap_continuity')).toBe(false);
    expect(result.recovery_actions).toContain(
      'verify git repo identity before treating repo_path as a managed project: neither git worktree root "/workspace/other-repo" nor git common repo root "/workspace/other-repo" is declared for target project "health-project"',
    );
  });

  it('uses topology-failure-specific recovery actions instead of dirty-worktree guidance', async () => {
    const projectRoot = await setupProjectRoot(`entry_surface_refresh:\n  refreshed_at: "2026-03-25T00:00:00.000Z"\n`);
    execMock.mockImplementation((_: string, cb: Function) => {
      if (_.includes('which')) { cb(null, '/usr/local/bin/agenticos-mcp\n', ''); return; }
      cb(null, '## main...origin/main\n', '');
    });
    worktreeTopologyMock.inspectProjectWorktreeTopology.mockResolvedValue({
      applies: true,
      status: 'BLOCK',
      summary: 'Worktree topology inspection failed: git worktree listing failed.',
      expected_worktree_root: '/workspace/worktrees/health-project',
      worktrees: [],
      counts: {
        canonical_main: 1,
        project_scoped: 0,
        misplaced_clean: 0,
        misplaced_dirty: 0,
      },
      inspection_errors: ['git worktree listing failed'],
    });

    const result = await runHealthCheck({
      repo_path: '/repo',
      project_path: projectRoot,
    });

    expect(result.recovery_actions).toContain(
      'inspect git worktree topology failures and restore accurate worktree visibility before trusting this checkout',
    );
    expect(result.recovery_actions).not.toContain(
      'protect dirty misplaced worktrees first, then recreate them under the derived project-scoped worktree root before removing the old paths',
    );
  });
});
