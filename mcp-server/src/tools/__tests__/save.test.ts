import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// yamlMock MUST be defined with vi.hoisted so it's available at vi.mock hoisting time
const yamlMock = vi.hoisted(() => ({
  parse: vi.fn(),
  stringify: vi.fn((obj: unknown) => JSON.stringify(obj)),
}));

// Mock modules
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  default: {},
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
  default: {},
}));

vi.mock('yaml', () => ({
  default: yamlMock,
}));

vi.mock('../../utils/registry.js', () => ({
  loadRegistry: vi.fn(),
  saveRegistry: vi.fn(),
  getAgenticOSHome: vi.fn(() => '/home/testuser/AgenticOS'),
  resolvePath: vi.fn((p: string) => p),
}));

vi.mock('../../utils/distill.js', () => ({
  updateClaudeMdState: vi.fn().mockResolvedValue({ updated: true, created: false }),
}));

vi.mock('../../utils/canonical-main-guard.js', () => ({
  detectCanonicalMainWriteProtection: vi.fn(),
}));

// save finalizes pending-commit captures after a durable commit (#593). Mock it
// so tests stay hermetic (no machine-local ledger I/O) and can assert the handoff.
const distillationLedgerMock = vi.hoisted(() => ({
  finalizeDistilledPendingCommit: vi.fn().mockResolvedValue({ path: '', finalizedCount: 0 }),
}));
vi.mock('../../utils/distillation-ledger.js', () => ({
  finalizeDistilledPendingCommit: distillationLedgerMock.finalizeDistilledPendingCommit,
}));

// Mock child_process before the module imports it
const execMock = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({
  exec: execMock,
}));

// save.ts now executes git through execFile-based exec-git helpers. The test
// shim reconstructs the equivalent `git -C "<repo>" <args>` command string and
// delegates to the existing child_process exec mock so per-test command-string
// matchers continue to work. Note: argv elements (paths, commit message) are
// joined unquoted, mirroring execFile semantics — no shell quoting.
vi.mock('../../utils/exec-git.js', () => {
  const run = (repoPath: string, args: string[], options?: { allowFailure?: boolean }) =>
    new Promise<{ ok: boolean; stdout: string; stderr: string }>((resolve, reject) => {
      const cmd = `git -C "${repoPath}" ${args.join(' ')}`;
      execMock(cmd, (error: any, stdout?: string, stderr?: string) => {
        const out = String(stdout || '');
        const err = String(stderr || '');
        if (error) {
          if (options?.allowFailure) {
            resolve({ ok: false, stdout: out, stderr: err });
            return;
          }
          reject(Object.assign(error, { stdout: out, stderr: err }));
          return;
        }
        resolve({ ok: true, stdout: out, stderr: err });
      });
    });
  return {
    execGit: run,
    gitText: async (repoPath: string, args: string[], options?: any) => (await run(repoPath, args, options)).stdout.trim(),
    execGh: (args: string[], options?: any) => run('.', ['gh', ...args], options),
    ghText: async (args: string[], options?: any) => (await run('.', ['gh', ...args], options)).stdout.trim(),
  };
});

import { saveState, validateGitBackedContinuityRepoBinding, extractGitHubRepoFromRemoteOrigin, resolveDeclaredSourceRepoRoots } from '../save.js';
import * as fsPromises from 'fs/promises';
import * as fs from 'fs';
import * as registry from '../../utils/registry.js';
import * as childProcess from 'child_process';
import { updateClaudeMdState } from '../../utils/distill.js';
import { bindSessionProject, clearSessionProjectBinding } from '../../utils/session-context.js';
import { detectCanonicalMainWriteProtection } from '../../utils/canonical-main-guard.js';

const fsPromisesMock = fsPromises as typeof fsPromises & {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
};
const registryMock = registry as typeof registry & { loadRegistry: ReturnType<typeof vi.fn> };
const childProcessMock = childProcess as typeof childProcess & { exec: ReturnType<typeof vi.fn> };
const updateClaudeMdStateMock = updateClaudeMdState as unknown as ReturnType<typeof vi.fn>;
const detectCanonicalMainWriteProtectionMock = detectCanonicalMainWriteProtection as unknown as ReturnType<typeof vi.fn>;
const fsMock = fs as typeof fs & { existsSync: ReturnType<typeof vi.fn> };

function buildRegistry(overrides: Record<string, unknown> = {}) {
  return {
    version: '1.0.0',
    last_updated: '2025-01-01T00:00:00.000Z',
    active_project: 'test-project',
    projects: [
      {
        id: 'test-project',
        name: 'Test Project',
        path: '/test/path',
        status: 'active' as const,
        created: '2025-01-01',
        last_accessed: '2025-01-01T00:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

function mockProjectFiles(options?: {
  projectYaml?: Record<string, unknown>;
  state?: Record<string, unknown>;
}) {
  const projectYaml = options?.projectYaml || {
    meta: {
      id: 'test-project',
      name: 'Test Project',
    },
    source_control: {
      topology: 'local_directory_only',
      context_publication_policy: 'local_private',
    },
  };
  const state = options?.state || { session: {}, working_memory: { pending: [], decisions: [], facts: [] } };

  fsPromisesMock.readFile.mockImplementation(async (path: string) => {
    if (path.endsWith('/.project.yaml')) {
      return JSON.stringify(projectYaml);
    }
    if (path.endsWith('/state.yaml')) {
      return JSON.stringify(state);
    }
    return '';
  });
}

describe('saveState', () => {
  beforeEach(() => {
    clearSessionProjectBinding();
    bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/test/path',
    });
    // Clear specific mocks but preserve yaml mock implementation
    fsPromisesMock.readFile.mockReset();
    fsPromisesMock.writeFile.mockReset();
    fsPromisesMock.mkdir.mockReset();
    registryMock.loadRegistry.mockReset();
    // saveRegistry is not a mock - no need to clear
    yamlMock.parse.mockReset();
    yamlMock.stringify.mockReset();
    // Default: canonical-main guard does NOT block (isolated worktree)
    detectCanonicalMainWriteProtectionMock.mockReset();
    detectCanonicalMainWriteProtectionMock.mockResolvedValue({
      blocked: false,
      git_worktree_root: '/test/path',
      current_branch: 'feat/test',
      workspace_type: 'isolated_worktree',
    });
    // Default exec mock: call callback with error (no git repo)
    childProcessMock.exec.mockReset();
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        cb(new Error('not a git repo'), '', '');
      }
    );
    // Default: no active project
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [],
    });
    // Restore yaml stringify default
    yamlMock.parse.mockImplementation((content: string) => {
      try { return JSON.parse(content); } catch { return undefined; }
    });
    yamlMock.stringify.mockImplementation((obj: unknown) => JSON.stringify(obj));
    updateClaudeMdStateMock.mockResolvedValue({ updated: true, created: false });
    fsMock.existsSync.mockReturnValue(false);
    mockProjectFiles();
  });

  afterEach(() => {
    clearSessionProjectBinding();
    vi.restoreAllMocks();
  });

  it('returns error when no explicit project and no session project are available', async () => {
    clearSessionProjectBinding();
    const result = await saveState({ message: 'test' });
    expect(result).toContain('No project provided and no session project is bound');
    expect(result).toContain('agenticos_switch');
  });

  it('ignores a populated legacy registry active_project when no session project is bound', async () => {
    clearSessionProjectBinding();
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: 'non-existent',
      projects: [
        {
          id: 'other-project',
          name: 'Other Project',
          path: '/some/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    const result = await saveState({ message: 'test' });
    expect(result).toContain('No project provided and no session project is bound');
  });

  it('saves state.yaml with backup timestamp when no git repo', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {} } });

    childProcessMock.exec.mockImplementation(
      (_cmd: string, cb: (err: Error, stdout?: string, stderr?: string) => void) => {
        cb(new Error('not a git repo'), '', '');
      }
    );

    const result = await saveState({ message: 'test save' });

    expect(result).toContain('no git repo');
    expect(result).toContain('State saved but no git repo found');

    // Verify state.yaml was updated
    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateYamlCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    expect(stateYamlCall).toBeDefined();
    // yaml.stringify is mocked to JSON.stringify
    const writtenState = JSON.parse(stateYamlCall![1] as string);
    expect(writtenState.session.last_backup).toBeDefined();
  });

  it('degrades to local-only save behavior for legacy local_directory_only projects with missing publication policy', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: {
          id: 'test-project',
          name: 'Test Project',
        },
        source_control: {
          topology: 'local_directory_only',
        },
      },
      state: { session: {} },
    });

    childProcessMock.exec.mockImplementation(
      (_cmd: string, cb: (err: Error, stdout?: string, stderr?: string) => void) => {
        cb(new Error('not a git repo'), '', '');
      }
    );

    const result = await saveState({ message: 'legacy local-only save' });

    expect(result).toContain('State saved but no git repo found');
    expect(result).toContain('no git repo');
    const stateYamlCall = fsPromisesMock.writeFile.mock.calls.find((c) => c[0].endsWith('state.yaml'));
    expect(stateYamlCall).toBeDefined();
    const writtenState = JSON.parse(stateYamlCall![1] as string);
    expect(writtenState.session.last_backup).toBeDefined();
  });

  it('runs git add, commit, push when git repo exists', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {} } });

    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/path\n', '');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'My commit message' });

    expect(result).toContain('Pushed to remote');
    expect(result).toContain('My commit message');
    expect(result).toContain('Test Project');
  });

  it('stages only runtime-managed paths instead of the whole project tree', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {} } });

    const commands: string[] = [];
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        commands.push(cmd);
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/path\n', '');
          return;
        }
        cb(null, '', '');
      }
    );

    await saveState({ message: 'runtime-only save' });

    const addCommand = commands.find((cmd) => cmd.includes(' add -A -- '));
    expect(addCommand).toBeDefined();
    expect(addCommand).toContain('/test/path/.context/state.yaml');
    expect(addCommand).not.toContain('/test/path/.context/.last_record');
    expect(addCommand).toContain('/test/path/.context/conversations');
    expect(addCommand).toContain('/test/path/CLAUDE.md');
    expect(addCommand).not.toContain('add "/test/path/"');
  });

  it('stages the evolution-log dir when it exists so the L2 timeline reaches git (#594)', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
        execution: { source_repo_roots: ['.'] },
      },
      state: { session: {} },
    });
    // Evolution log dir present on disk → must be staged.
    fsMock.existsSync.mockImplementation((path: string) => String(path).includes('evolution-log'));

    const commands: string[] = [];
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        commands.push(cmd);
        if (cmd.includes('rev-parse --show-toplevel')) { cb(null, '/test/path\n', ''); return; }
        if (cmd.includes('rev-parse --git-common-dir')) { cb(null, '.git\n', ''); return; }
        if (cmd.includes('remote get-url origin')) { cb(null, 'git@github.com:example/test-project.git\n', ''); return; }
        cb(null, '', '');
      }
    );

    await saveState({ message: 'save with evolution log' });

    const addCommand = commands.find((cmd) => cmd.includes(' add -A -- '));
    expect(addCommand).toBeDefined();
    expect(addCommand).toContain('.context/evolution-log');
  });

  it('omits the evolution-log dir when it is absent so git add does not fatal (#594)', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
        execution: { source_repo_roots: ['.'] },
      },
      state: { session: {} },
    });
    fsMock.existsSync.mockReturnValue(false); // no evolution-log dir yet

    const commands: string[] = [];
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        commands.push(cmd);
        if (cmd.includes('rev-parse --show-toplevel')) { cb(null, '/test/path\n', ''); return; }
        if (cmd.includes('rev-parse --git-common-dir')) { cb(null, '.git\n', ''); return; }
        if (cmd.includes('remote get-url origin')) { cb(null, 'git@github.com:example/test-project.git\n', ''); return; }
        cb(null, '', '');
      }
    );

    await saveState({ message: 'save without evolution log' });

    const addCommand = commands.find((cmd) => cmd.includes(' add -A -- '));
    expect(addCommand).toBeDefined();
    expect(addCommand).not.toContain('evolution-log');
  });

  it('does not stage the local_private evolution-log surface when the dir is absent (#594)', async () => {
    // local_private goes through the runtime-review surface, which lists the
    // evolution log unconditionally; without the absence guard `git add` would
    // fatal on a missing pathspec before the first full-mode record.
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {} } });
    fsMock.existsSync.mockReturnValue(false); // no evolution-log dir yet

    const commands: string[] = [];
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        commands.push(cmd);
        if (cmd.includes('rev-parse --show-toplevel')) { cb(null, '/test/path\n', ''); return; }
        cb(null, '', '');
      }
    );

    await saveState({ message: 'local_private save without evolution log' });

    const addCommand = commands.find((cmd) => cmd.includes(' add -A -- '));
    expect(addCommand).toBeDefined();
    expect(addCommand).not.toContain('evolution-log');
  });

  it('notes when CLAUDE.md had to be auto-generated during save', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {} } });
    updateClaudeMdStateMock.mockResolvedValue({ updated: true, created: true });
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(new Error('not a git repo'), '', '');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'test save' });

    expect(result).toContain('CLAUDE.md was auto-generated');
  });

  it('returns partial save message when error occurs during save', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());

    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: {
            id: 'test-project',
            name: 'Test Project',
          },
          source_control: {
            topology: 'local_directory_only',
            context_publication_policy: 'local_private',
          },
        });
      }
      if (path.endsWith('/state.yaml')) {
        throw new Error('read error');
      }
      return '';
    });

    childProcessMock.exec.mockImplementation((_cmd: string, cb: Function) => {
      cb(null, '', '');
    });

    const result = await saveState({ message: 'test' });

    expect(result).toContain('Partial save');
    expect(result).toContain('read error');
  });

  it('handles git commit failure that is not a nothing-to-commit case', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {} } });
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/path\n', '');
          return;
        }
        if (cmd.includes(' add ')) {
          cb(null, '', '');
          return;
        }
        if (cmd.includes(' commit ')) {
          cb(new Error('commit failed'), '', 'fatal: commit failed');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'test' });

    expect(result).toContain('git commit failed');
    expect(result).toContain('commit failed');
  });

  it('surfaces git commit failure details from stdout when stderr is empty', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {} } });
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/path\n', '');
          return;
        }
        if (cmd.includes(' add ')) {
          cb(null, '', '');
          return;
        }
        if (cmd.includes(' commit ')) {
          cb(new Error('commit failed'), 'stdout failure details', '');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'test' });

    expect(result).toContain('git commit failed');
    expect(result).toContain('commit failed');
  });

  it('surfaces git commit failure details from the error message when stdout and stderr are empty', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {} } });
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/path\n', '');
          return;
        }
        if (cmd.includes(' add ')) {
          cb(null, '', '');
          return;
        }
        if (cmd.includes(' commit ')) {
          cb(new Error('message only failure'), '', '');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'test' });

    expect(result).toContain('git commit failed');
    expect(result).toContain('message only failure');
  });

  it('still returns a commit failure when stderr, stdout, and message are all empty', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {} } });
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/path\n', '');
          return;
        }
        if (cmd.includes(' add ')) {
          cb(null, '', '');
          return;
        }
        if (cmd.includes(' commit ')) {
          cb({} as Error, '', '');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'test' });

    expect(result).toContain('git commit failed');
    expect(result).toContain('Error: undefined');
  });

  it('reports when there is nothing new to commit', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {} } });
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/path\n', '');
          return;
        }
        if (cmd.includes(' add ')) {
          cb(null, '', '');
          return;
        }
        if (cmd.includes(' commit ')) {
          cb(new Error('nothing to commit'), '', 'nothing to commit');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'test' });

    expect(result).toContain('No new changes to commit');
  });

  it('uses the default auto-save message when no explicit message is provided', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { working_memory: { pending: [] } } });
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/path\n', '');
          return;
        }
        if (cmd.includes(' commit ')) {
          cb(new Error('nothing to commit'), '', 'nothing to commit');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({});

    expect(result).toContain('Auto-save [');
    expect(result).toContain('No new changes to commit');
  });

  it('reports push failure as degraded but non-fatal', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {} } });
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/path\n', '');
          return;
        }
        if (cmd.includes(' push')) {
          cb(new Error('push failed'), '', '');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'test' });

    expect(result).toContain('Push failed (committed locally, not synced)');
  });

  it('allows an explicit project even when legacy active_project differs', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      ...buildRegistry(),
      projects: [
        ...buildRegistry().projects,
        {
          id: 'other-project',
          name: 'Other Project',
          path: '/other/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path === '/other/path/.project.yaml') {
        return JSON.stringify({
          meta: { id: 'other-project', name: 'Other Project' },
          source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
        });
      }
      if (path === '/other/path/.context/state.yaml') {
        return JSON.stringify({ session: {}, working_memory: { pending: [], decisions: [], facts: [] } });
      }
      if (path === '/test/path/.project.yaml') {
        return JSON.stringify({
          meta: { id: 'test-project', name: 'Test Project' },
          source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
        });
      }
      if (path === '/test/path/.context/state.yaml') {
        return JSON.stringify({ session: {}, working_memory: { pending: [], decisions: [], facts: [] } });
      }
      return '';
    });
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(new Error('not a git repo'), '', '');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ project: 'other-project', message: 'test' });

    expect(result).toContain('State saved but no git repo found at /other/path');
  });

  it('uses the session-local bound project when no explicit project is provided', async () => {
    bindSessionProject({
      projectId: 'other-project',
      projectName: 'Other Project',
      projectPath: '/other/path',
    });
    registryMock.loadRegistry.mockResolvedValue({
      ...buildRegistry({ active_project: null }),
      projects: [
        ...buildRegistry().projects,
        {
          id: 'other-project',
          name: 'Other Project',
          path: '/other/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path === '/other/path/.project.yaml') {
        return JSON.stringify({
          meta: { id: 'other-project', name: 'Other Project' },
          source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
        });
      }
      if (path === '/other/path/.context/state.yaml') {
        return JSON.stringify({ session: {}, working_memory: { pending: [], decisions: [], facts: [] } });
      }
      throw new Error(`unexpected path: ${path}`);
    });
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(new Error('not a git repo'), '', '');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'test' });

    expect(result).toContain('State saved but no git repo found at /other/path');
  });

  it('fails closed when .project.yaml identity mismatches the registry project', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: {
          id: 'wrong-project',
          name: 'Test Project',
        },
        source_control: {
          topology: 'local_directory_only',
          context_publication_policy: 'local_private',
        },
      },
    });

    const result = await saveState({ message: 'test' });

    expect(result).toContain('does not match .project.yaml meta.id');
    expect(childProcessMock.exec).not.toHaveBeenCalled();
  });

  it('stages the full tracked continuity surface for private_continuity projects', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: {
          id: 'test-project',
          name: 'Test Project',
        },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
        execution: {
          source_repo_roots: ['.'],
        },
      },
      state: { session: {} },
    });

    const commands: string[] = [];
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        commands.push(cmd);
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/path\n', '');
          return;
        }
        if (cmd.includes('rev-parse --git-common-dir')) {
          cb(null, '.git\n', '');
          return;
        }
        if (cmd.includes('remote get-url origin')) {
          cb(null, 'git@github.com:example/test-project.git\n', '');
          return;
        }
        if (cmd.includes(' commit ')) {
          cb(new Error('nothing to commit'), '', 'nothing to commit');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'full continuity save' });

    const addCommand = commands.find((cmd) => cmd.includes(' add -A -- '));
    expect(addCommand).toBeDefined();
    expect(addCommand).toContain('.project.yaml');
    expect(addCommand).toContain('.context/quick-start.md');
    expect(addCommand).toContain('.context/state.yaml');
    expect(addCommand).toContain('.context/conversations/');
    expect(addCommand).toContain('knowledge/');
    expect(addCommand).toContain('tasks/');
    expect(addCommand).toContain('CLAUDE.md');
    expect(addCommand).not.toContain('.context/.last_record');
    expect(result).toContain('Recovery: tracked continuity contract evaluated; no new continuity changes were committed');
  });

  it('finalizes pending-commit captures after a successful commit (#593)', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
        execution: { source_repo_roots: ['.'] },
      },
      state: { session: {} },
    });
    distillationLedgerMock.finalizeDistilledPendingCommit.mockResolvedValue({ path: '', finalizedCount: 2 });

    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) { cb(null, '/test/path\n', ''); return; }
        if (cmd.includes('rev-parse --git-common-dir')) { cb(null, '.git\n', ''); return; }
        if (cmd.includes('remote get-url origin')) { cb(null, 'git@github.com:example/test-project.git\n', ''); return; }
        cb(null, '', ''); // add / commit / push all succeed
      }
    );

    const result = await saveState({ message: 'durable save' });

    // Captures are consumed for good only here, keyed to this worktree.
    expect(distillationLedgerMock.finalizeDistilledPendingCommit).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'test-project', worktree: '/test/path' }),
    );
    expect(result).toContain('Finalized 2 pending-commit capture(s) into distilled state');
  });

  it('does not finalize pending-commit captures when there is nothing to commit (#593)', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
        execution: { source_repo_roots: ['.'] },
      },
      state: { session: {} },
    });
    distillationLedgerMock.finalizeDistilledPendingCommit.mockClear();

    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) { cb(null, '/test/path\n', ''); return; }
        if (cmd.includes('rev-parse --git-common-dir')) { cb(null, '.git\n', ''); return; }
        if (cmd.includes('remote get-url origin')) { cb(null, 'git@github.com:example/test-project.git\n', ''); return; }
        if (cmd.includes(' commit ')) { cb(new Error('nothing to commit'), '', 'nothing to commit'); return; }
        cb(null, '', '');
      }
    );

    await saveState({ message: 'no-op save' });

    // Nothing was committed → no source may be consumed.
    expect(distillationLedgerMock.finalizeDistilledPendingCommit).not.toHaveBeenCalled();
  });

  it('fails closed before state mutation when private_continuity cannot prove a git repo', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: {
          id: 'test-project',
          name: 'Test Project',
        },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
        execution: {
          source_repo_roots: ['.'],
        },
      },
      state: { session: {} },
    });

    childProcessMock.exec.mockImplementation(
      (_cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        cb(new Error('not a git repo'), '', '');
      }
    );

    const result = await saveState({ message: 'should fail closed' });

    expect(result).toContain('could not persist tracked continuity');
    expect(result).toContain('git repo root');
    expect(fsPromisesMock.writeFile).not.toHaveBeenCalled();
    expect(updateClaudeMdStateMock).not.toHaveBeenCalled();
  });

  it('fails closed when an agent_context path uses parent-directory traversal (rejected at contract validation)', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry({
      projects: [
        {
          id: 'test-project',
          name: 'Test Project',
          path: '/test/repo/projects/app',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    }));
    clearSessionProjectBinding();
    bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/test/repo/projects/app',
    });
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path === '/test/repo/projects/app/.project.yaml') {
        return JSON.stringify({
          meta: {
            id: 'test-project',
            name: 'Test Project',
          },
          source_control: {
            topology: 'github_versioned',
            context_publication_policy: 'private_continuity',
            github_repo: 'example/test-project',
            branch_strategy: 'github_flow',
          },
          execution: {
            source_repo_roots: ['../..'],
          },
          agent_context: {
            tasks: '../../shared-tasks/',
          },
        });
      }
      if (path === '/test/repo/projects/app/.context/state.yaml') {
        return JSON.stringify({ session: {} });
      }
      throw new Error(`unexpected path: ${path}`);
    });
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/repo\n', '');
          return;
        }
        if (cmd.includes('rev-parse --git-common-dir')) {
          cb(null, '.git\n', '');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'should fail on project escape' });

    // The unsafe agent_context path is now rejected up front by managed-project
    // identity/contract resolution, before save reaches its continuity boundary
    // check — an earlier, stronger fail-closed (#513).
    expect(result).toContain('unsafe agent_context.tasks');
    expect(result).toContain('parent-directory traversal');
    expect(fsPromisesMock.writeFile).not.toHaveBeenCalled();
    expect(updateClaudeMdStateMock).not.toHaveBeenCalled();
  });

  it('does not claim git-backed restore sync when push fails for private_continuity', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: {
          id: 'test-project',
          name: 'Test Project',
        },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
        execution: {
          source_repo_roots: ['.'],
        },
      },
      state: { session: {} },
    });

    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/path\n', '');
          return;
        }
        if (cmd.includes('rev-parse --git-common-dir')) {
          cb(null, '.git\n', '');
          return;
        }
        if (cmd.includes('remote get-url origin')) {
          cb(null, 'git@github.com:example/test-project.git\n', '');
          return;
        }
        if (cmd.includes(' commit ')) {
          cb(null, '', '');
          return;
        }
        if (cmd.includes(' push')) {
          cb(new Error('push failed'), '', '');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'pending remote sync' });

    expect(result).toContain('Push failed');
    expect(result).toContain('tracked continuity committed locally; remote sync is still pending');
    expect(result).not.toContain('Git-backed restore');
  });

  it('fails closed when the discovered git repo root is not a declared source repo root', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry({
      projects: [
        {
          id: 'test-project',
          name: 'Test Project',
          path: '/test/runtime/project',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    }));
    clearSessionProjectBinding();
    bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/test/runtime/project',
    });
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path === '/test/runtime/project/.project.yaml') {
        return JSON.stringify({
          meta: {
            id: 'test-project',
            name: 'Test Project',
          },
          source_control: {
            topology: 'github_versioned',
            context_publication_policy: 'private_continuity',
            github_repo: 'example/test-project',
            branch_strategy: 'github_flow',
          },
          execution: {
            source_repo_roots: ['/declared/elsewhere'],
          },
        });
      }
      if (path === '/test/runtime/project/.context/state.yaml') {
        return JSON.stringify({ session: {} });
      }
      throw new Error(`unexpected path: ${path}`);
    });

    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/runtime/project\n', '');
          return;
        }
        if (cmd.includes('rev-parse --git-common-dir')) {
          cb(null, '../.git\n', '');
          return;
        }
        if (cmd.includes('remote get-url origin')) {
          cb(null, 'git@github.com:example/test-project.git\n', '');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'wrong repo root' });

    expect(result).toContain('could not persist tracked continuity');
    expect(result).toContain('is not one of declared execution.source_repo_roots');
    expect(fsPromisesMock.writeFile).not.toHaveBeenCalled();
    expect(updateClaudeMdStateMock).not.toHaveBeenCalled();
  });

  it('fails closed when git remote origin does not match the declared github repo', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: {
          id: 'test-project',
          name: 'Test Project',
        },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
        execution: {
          source_repo_roots: ['.'],
        },
      },
      state: { session: {} },
    });

    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/path\n', '');
          return;
        }
        if (cmd.includes('rev-parse --git-common-dir')) {
          cb(null, '.git\n', '');
          return;
        }
        if (cmd.includes('remote get-url origin')) {
          cb(null, 'git@github.com:example/other-project.git\n', '');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'wrong remote' });

    expect(result).toContain('could not persist tracked continuity');
    expect(result).toContain('does not match declared source_control.github_repo');
    expect(fsPromisesMock.writeFile).not.toHaveBeenCalled();
    expect(updateClaudeMdStateMock).not.toHaveBeenCalled();
  });

  it('allows private_continuity saves from a nested worktree when the declared source repo root matches the git common repo root', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry({
      projects: [
        {
          id: 'test-project',
          name: 'Test Project',
          path: '/repo/worktrees/issue-244',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    }));
    clearSessionProjectBinding();
    bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/repo/worktrees/issue-244',
    });
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path === '/repo/worktrees/issue-244/.project.yaml') {
        return JSON.stringify({
          meta: {
            id: 'test-project',
            name: 'Test Project',
          },
          source_control: {
            topology: 'github_versioned',
            context_publication_policy: 'private_continuity',
            github_repo: 'example/test-project',
            branch_strategy: 'github_flow',
          },
          execution: {
            source_repo_roots: ['../..'],
          },
        });
      }
      if (path === '/repo/worktrees/issue-244/.context/state.yaml') {
        return JSON.stringify({ session: {} });
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const commands: string[] = [];
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        commands.push(cmd);
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/repo/worktrees/issue-244\n', '');
          return;
        }
        if (cmd.includes('rev-parse --git-common-dir')) {
          cb(null, '/repo/.git\n', '');
          return;
        }
        if (cmd.includes('remote get-url origin')) {
          cb(null, 'git@github.com:example/test-project.git\n', '');
          return;
        }
        if (cmd.includes(' commit ')) {
          cb(new Error('nothing to commit'), '', 'nothing to commit');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'nested worktree continuity save' });

    const addCommand = commands.find((cmd) => cmd.includes(' add -A -- '));
    expect(addCommand).toBeDefined();
    expect(addCommand).toContain('git -C "/repo/worktrees/issue-244" add -A --');
    expect(addCommand).toContain('.project.yaml');
    expect(addCommand).toContain('.context/state.yaml');
    expect(result).toContain('tracked continuity contract evaluated; no new continuity changes were committed');
  });

  it('allows private_continuity saves from an isolated worktree outside the git common repo root', async () => {
    const worktreePath = '/repo/worktrees/hermes-agent-kit/hermes-agent-kit-346-topic';
    registryMock.loadRegistry.mockResolvedValue(buildRegistry({
      projects: [
        {
          id: 'test-project',
          name: 'Test Project',
          path: '/repo/projects/test-project',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    }));
    clearSessionProjectBinding();
    bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/repo/projects/test-project',
    });
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path === `${worktreePath}/.project.yaml`) {
        return JSON.stringify({
          meta: {
            id: 'test-project',
            name: 'Test Project',
          },
          source_control: {
            topology: 'github_versioned',
            context_publication_policy: 'private_continuity',
            github_repo: 'example/test-project',
            branch_strategy: 'github_flow',
          },
          execution: {
            source_repo_roots: ['.'],
          },
        });
      }
      if (path === `${worktreePath}/.context/state.yaml`) {
        return JSON.stringify({ session: {} });
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const commands: string[] = [];
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        commands.push(cmd);
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, `${worktreePath}\n`, '');
          return;
        }
        if (cmd.includes('rev-parse --git-common-dir')) {
          cb(null, '/repo/projects/test-project/.git\n', '');
          return;
        }
        if (cmd.includes('remote get-url origin')) {
          cb(null, 'git@github.com:example/test-project.git\n', '');
          return;
        }
        if (cmd.includes(' commit ')) {
          cb(new Error('nothing to commit'), '', 'nothing to commit');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({
      project: 'test-project',
      project_path: worktreePath,
      repo_path: worktreePath,
      message: 'isolated worktree continuity save',
    });

    expect(result).not.toContain('escapes repo root');
    expect(result).not.toContain('is not one of declared execution.source_repo_roots');
    const addCommand = commands.find((cmd) => cmd.includes(' add -A -- '));
    expect(addCommand).toBeDefined();
    expect(addCommand).toContain(`git -C "${worktreePath}" add -A --`);
    expect(result).toContain('tracked continuity contract evaluated; no new continuity changes were committed');
  });

  it('stages worktree-relative continuity paths when the project lives under a repo subdirectory', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry({
      projects: [
        {
          id: 'test-project',
          name: 'Test Project',
          path: '/repo/projects/app',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    }));
    clearSessionProjectBinding();
    bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/repo/projects/app',
    });
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path === '/repo/projects/app/.project.yaml') {
        return JSON.stringify({
          meta: {
            id: 'test-project',
            name: 'Test Project',
          },
          source_control: {
            topology: 'github_versioned',
            context_publication_policy: 'private_continuity',
            github_repo: 'example/test-project',
            branch_strategy: 'github_flow',
          },
          execution: {
            source_repo_roots: ['../..'],
          },
        });
      }
      if (path === '/repo/projects/app/.context/state.yaml') {
        return JSON.stringify({ session: {} });
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const commands: string[] = [];
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        commands.push(cmd);
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/repo\n', '');
          return;
        }
        if (cmd.includes('rev-parse --git-common-dir')) {
          cb(null, '.git\n', '');
          return;
        }
        if (cmd.includes('remote get-url origin')) {
          cb(null, 'git@github.com:example/test-project.git\n', '');
          return;
        }
        if (cmd.includes(' commit ')) {
          cb(new Error('nothing to commit'), '', 'nothing to commit');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'nested project continuity save' });

    const addCommand = commands.find((cmd) => cmd.includes(' add -A -- '));
    expect(addCommand).toBeDefined();
    expect(addCommand).toContain('git -C "/repo" add -A --');
    expect(addCommand).toContain('projects/app/.project.yaml');
    expect(addCommand).toContain('projects/app/.context/state.yaml');
    expect(addCommand).toContain('projects/app/tasks/');
    expect(result).toContain('tracked continuity contract evaluated; no new continuity changes were committed');
  });

  it('stages the distilled tracked continuity surface for public_distilled projects', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: {
          id: 'test-project',
          name: 'Test Project',
        },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
        execution: {
          source_repo_roots: ['.'],
        },
      },
      state: { session: {} },
    });

    const commands: string[] = [];
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        commands.push(cmd);
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/path\n', '');
          return;
        }
        if (cmd.includes('rev-parse --git-common-dir')) {
          cb(null, '.git\n', '');
          return;
        }
        if (cmd.includes('remote get-url origin')) {
          cb(null, 'git@github.com:example/test-project.git\n', '');
          return;
        }
        if (cmd.includes('status --porcelain')) {
          cb(null, '', '');
          return;
        }
        if (cmd.includes(' commit ')) {
          cb(new Error('nothing to commit'), '', 'nothing to commit');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'public continuity save' });

    const addCommand = commands.find((cmd) => cmd.includes(' add -A -- '));
    expect(addCommand).toBeDefined();
    expect(addCommand).toContain('.project.yaml');
    expect(addCommand).toContain('.context/quick-start.md');
    expect(addCommand).toContain('.context/state.yaml');
    expect(addCommand).toContain('knowledge/');
    expect(addCommand).toContain('tasks/');
    expect(addCommand).toContain('CLAUDE.md');
    expect(addCommand).not.toContain('.context/conversations');
    expect(result).toContain('Recovery: distilled continuity contract evaluated; no new continuity changes were committed');
    expect(result).toContain('.private/conversations/');
  });

  it('blocks save when a public_distilled project has tracked raw transcript diffs', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: {
          id: 'test-project',
          name: 'Test Project',
        },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
        execution: {
          source_repo_roots: ['.'],
        },
      },
      state: { session: {} },
    });

    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/path\n', '');
          return;
        }
        if (cmd.includes('rev-parse --git-common-dir')) {
          cb(null, '.git\n', '');
          return;
        }
        if (cmd.includes('remote get-url origin')) {
          cb(null, 'git@github.com:example/test-project.git\n', '');
          return;
        }
        if (cmd.includes('status --porcelain')) {
          cb(null, ' M .context/conversations/2026-04-13.md\n', '');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'should block' });

    expect(result).toContain('agenticos_save blocked');
    expect(result).toContain('.context/conversations/');
    expect(fsPromisesMock.writeFile).not.toHaveBeenCalled();
    expect(updateClaudeMdStateMock).not.toHaveBeenCalled();
  });

  it('checks tracked public transcript diffs using repo-relative paths for nested projects', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry({
      projects: [
        {
          id: 'test-project',
          name: 'Test Project',
          path: '/repo/projects/app',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    }));
    clearSessionProjectBinding();
    bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/repo/projects/app',
    });
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path === '/repo/projects/app/.project.yaml') {
        return JSON.stringify({
          meta: {
            id: 'test-project',
            name: 'Test Project',
          },
          source_control: {
            topology: 'github_versioned',
            context_publication_policy: 'public_distilled',
            github_repo: 'example/test-project',
            branch_strategy: 'github_flow',
          },
          execution: {
            source_repo_roots: ['../..'],
          },
          agent_context: {
            conversations: 'runtime/conversations/',
          },
        });
      }
      if (path === '/repo/projects/app/.context/state.yaml') {
        return JSON.stringify({ session: {} });
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const commands: string[] = [];
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        commands.push(cmd);
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/repo\n', '');
          return;
        }
        if (cmd.includes('rev-parse --git-common-dir')) {
          cb(null, '.git\n', '');
          return;
        }
        if (cmd.includes('remote get-url origin')) {
          cb(null, 'git@github.com:example/test-project.git\n', '');
          return;
        }
        if (cmd.includes('status --porcelain')) {
          cb(null, ' M projects/app/runtime/conversations/2026-04-13.md\n', '');
          return;
        }
        cb(null, '', '');
      }
    );

    const result = await saveState({ message: 'should block nested project public transcript leak' });

    const statusCommand = commands.find((cmd) => cmd.includes('status --porcelain'));
    expect(statusCommand).toContain('projects/app/runtime/conversations/');
    expect(result).toContain('agenticos_save blocked');
    expect(result).toContain('runtime/conversations/');
  });

  it('blocks save on a canonical main checkout to protect the trusted baseline', async () => {
    detectCanonicalMainWriteProtectionMock.mockResolvedValue({
      blocked: true,
      reason: 'canonical main checkout is not a supported runtime workspace — runtime persistence writes must happen inside isolated issue worktrees',
      git_worktree_root: '/repo',
      current_branch: 'main',
      workspace_type: 'main',
    });
    registryMock.loadRegistry.mockResolvedValue(buildRegistry({
      projects: [{
        id: 'test-project',
        name: 'Test Project',
        path: '/repo/projects/test-project',
        status: 'active' as const,
        created: '2025-01-01',
        last_accessed: '2025-01-01T00:00:00.000Z',
      }],
    }));

    await bindSessionProject({ projectId: 'test-project', projectName: 'Test Project', projectPath: '/repo/projects/test-project' });

    const result = await saveState({ message: 'should be blocked on canonical main' });

    expect(result).toContain('agenticos_save blocked');
    expect(result).toContain('canonical main checkout');
    expect(detectCanonicalMainWriteProtection).toHaveBeenCalledWith('/repo/projects/test-project');
  });

  it('allows save on an isolated worktree (guard passes)', async () => {
    detectCanonicalMainWriteProtectionMock.mockResolvedValue({
      blocked: false,
      git_worktree_root: '/worktrees/test-project',
      current_branch: 'feat/test-issue',
      workspace_type: 'isolated_worktree',
    });
    registryMock.loadRegistry.mockResolvedValue(buildRegistry({
      projects: [{
        id: 'test-project',
        name: 'Test Project',
        path: '/worktrees/test-project',
        status: 'active' as const,
        created: '2025-01-01',
        last_accessed: '2025-01-01T00:00:00.000Z',
      }],
    }));
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('rev-parse --show-toplevel')) { cb(null, '/worktrees/test-project\n', ''); return; }
      if (cmd.includes('rev-parse --git-common-dir')) { cb(null, '/repo/.git\n', ''); return; }
      if (cmd.includes('worktree list')) {
        cb(null, `/worktrees/test-project (bare)\n/worktrees/test-project (isolated)`, '');
        return;
      }
      if (cmd.includes('remote get-url')) { cb(null, 'https://github.com/test/project.git\n', ''); return; }
      if (cmd.includes('add -A')) { cb(null, '', ''); return; }
      if (cmd.includes('commit')) { cb(null, '', ''); return; }
      if (cmd.includes('push')) { cb(new Error('push failed'), '', 'push failed'); return; }
      cb(new Error('Unexpected command: ' + cmd), '', '');
    });

    await bindSessionProject({ projectId: 'test-project', projectName: 'Test Project', projectPath: '/worktrees/test-project' });

    const result = await saveState({ message: 'should succeed on isolated worktree' });

    expect(result).not.toContain('blocked');
    expect(result).toContain('State saved locally');
  });

  it('uses repo_path for canonical-main guard and git binding when registry path differs', async () => {
    const worktreePath = '/repo/worktrees/issue-482';
    detectCanonicalMainWriteProtectionMock.mockResolvedValue({
      blocked: false,
      git_worktree_root: worktreePath,
      current_branch: 'fix/482-guardrail-resolver-gaps',
      workspace_type: 'isolated_worktree',
    });
    registryMock.loadRegistry.mockResolvedValue(buildRegistry({
      projects: [{
        id: 'test-project',
        name: 'Test Project',
        path: '/repo/projects/test-project',
        status: 'active' as const,
        created: '2025-01-01',
        last_accessed: '2025-01-01T00:00:00.000Z',
      }],
    }));
    mockProjectFiles();
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('rev-parse --show-toplevel')) { cb(null, `${worktreePath}\n`, ''); return; }
      if (cmd.includes('rev-parse --git-common-dir')) { cb(null, '/repo/.git\n', ''); return; }
      if (cmd.includes('worktree list')) {
        cb(null, `${worktreePath} (isolated)`, '');
        return;
      }
      if (cmd.includes('remote get-url')) { cb(null, 'https://github.com/test/project.git\n', ''); return; }
      if (cmd.includes('add -A')) { cb(null, '', ''); return; }
      if (cmd.includes('commit')) { cb(null, '', ''); return; }
      if (cmd.includes('push')) { cb(new Error('push failed'), '', 'push failed'); return; }
      cb(new Error('Unexpected command: ' + cmd), '', '');
    });

    await bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/repo/projects/test-project',
    });

    const result = await saveState({
      project: 'test-project',
      repo_path: worktreePath,
      project_path: worktreePath,
      message: 'save from isolated worktree',
    });

    expect(detectCanonicalMainWriteProtection).toHaveBeenCalledWith(worktreePath);
    expect(result).not.toContain('blocked');
    expect(result).toContain('State saved locally');
  });

  it('ignores blank project_path and repo_path overrides', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles();
    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/path\n', '');
          return;
        }
        cb(new Error('not a git repo'), '', '');
      },
    );

    const result = await saveState({
      message: 'blank overrides',
      project_path: '   ',
      repo_path: '',
    });

    expect(detectCanonicalMainWriteProtection).toHaveBeenCalledWith('/test/path');
    expect(result).not.toContain('blocked');
    expect(result).toMatch(/State saved/);
  });

  it('reports full git-backed restore sync when private_continuity push succeeds', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: {
          id: 'test-project',
          name: 'Test Project',
        },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
        execution: {
          source_repo_roots: ['.'],
        },
      },
      state: { session: {} },
    });

    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/path\n', '');
          return;
        }
        if (cmd.includes('rev-parse --git-common-dir')) {
          cb(null, '.git\n', '');
          return;
        }
        if (cmd.includes('remote get-url origin')) {
          cb(null, 'git@github.com:example/test-project.git\n', '');
          return;
        }
        if (cmd.includes(' commit ')) {
          cb(null, '', '');
          return;
        }
        if (cmd.includes(' push')) {
          cb(null, '', '');
          return;
        }
        cb(null, '', '');
      },
    );

    const result = await saveState({ message: 'synced continuity save' });

    expect(result).toContain('Pushed to remote');
    expect(result).toContain('Recovery: full tracked continuity synced for Git-backed restore');
  });

  it('reports distilled restore sync when public_distilled push succeeds', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: {
          id: 'test-project',
          name: 'Test Project',
        },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
        execution: {
          source_repo_roots: ['.'],
        },
      },
      state: { session: {} },
    });

    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/path\n', '');
          return;
        }
        if (cmd.includes('rev-parse --git-common-dir')) {
          cb(null, '.git\n', '');
          return;
        }
        if (cmd.includes('remote get-url origin')) {
          cb(null, 'git@github.com:example/test-project.git\n', '');
          return;
        }
        if (cmd.includes(' commit ')) {
          cb(null, '', '');
          return;
        }
        if (cmd.includes(' push')) {
          cb(null, '', '');
          return;
        }
        cb(null, '', '');
      },
    );

    const result = await saveState({ message: 'public synced save' });

    expect(result).toContain('Recovery: distilled continuity synced for Git-backed restore');
  });

  it('reports pending remote sync for public_distilled when push fails after commit', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: {
          id: 'test-project',
          name: 'Test Project',
        },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
        execution: {
          source_repo_roots: ['.'],
        },
      },
      state: { session: {} },
    });

    childProcessMock.exec.mockImplementation(
      (cmd: string, cb: (err: Error | null, stdout?: string, stderr?: string) => void) => {
        if (cmd.includes('rev-parse --show-toplevel')) {
          cb(null, '/test/path\n', '');
          return;
        }
        if (cmd.includes('rev-parse --git-common-dir')) {
          cb(null, '.git\n', '');
          return;
        }
        if (cmd.includes('remote get-url origin')) {
          cb(null, 'git@github.com:example/test-project.git\n', '');
          return;
        }
        if (cmd.includes(' commit ')) {
          cb(null, '', '');
          return;
        }
        if (cmd.includes(' push')) {
          cb(new Error('push failed'), '', '');
          return;
        }
        cb(null, '', '');
      },
    );

    const result = await saveState({ message: 'public pending sync save' });

    expect(result).toContain('distilled continuity committed locally; remote sync is still pending');
  });

  it('returns resolver errors when project_path override cannot be resolved', async () => {
    const result = await saveState({
      project: 'missing-project',
      project_path: '/missing/worktree',
      message: 'resolver failure',
    });

    expect(result).toContain('❌');
  });

  it('uses project_path alone for git binding when repo_path is omitted', async () => {
    const worktreePath = '/repo/worktrees/issue-482-only-project-path';
    detectCanonicalMainWriteProtectionMock.mockResolvedValue({
      blocked: false,
      git_worktree_root: worktreePath,
      current_branch: 'fix/482-guardrail-resolver-gaps',
      workspace_type: 'isolated_worktree',
    });
    registryMock.loadRegistry.mockResolvedValue(buildRegistry({
      projects: [{
        id: 'test-project',
        name: 'Test Project',
        path: '/repo/projects/test-project',
        status: 'active' as const,
        created: '2025-01-01',
        last_accessed: '2025-01-01T00:00:00.000Z',
      }],
    }));
    mockProjectFiles();
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('rev-parse --show-toplevel')) { cb(null, `${worktreePath}\n`, ''); return; }
      if (cmd.includes('rev-parse --git-common-dir')) { cb(null, '/repo/.git\n', ''); return; }
      if (cmd.includes('remote get-url')) { cb(null, 'https://github.com/test/project.git\n', ''); return; }
      if (cmd.includes('add -A')) { cb(null, '', ''); return; }
      if (cmd.includes('commit')) { cb(new Error('nothing to commit'), '', 'nothing to commit'); return; }
      cb(new Error('Unexpected command: ' + cmd), '', '');
    });

    await saveState({
      project: 'test-project',
      project_path: worktreePath,
      message: 'project_path binding only',
    });

    expect(detectCanonicalMainWriteProtection).toHaveBeenCalledWith(worktreePath);
  });

  it('blocks save on gitBindingPath when canonical-main guard triggers', async () => {
    detectCanonicalMainWriteProtectionMock.mockResolvedValue({
      blocked: true,
      reason: 'canonical main checkout is not a supported runtime workspace',
      git_worktree_root: '/repo',
      current_branch: 'main',
      workspace_type: 'main',
    });
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());

    const result = await saveState({
      project: 'test-project',
      repo_path: '/repo/projects/test-project',
      message: 'blocked on binding path',
    });

    expect(result).toContain('agenticos_save blocked');
    expect(detectCanonicalMainWriteProtection).toHaveBeenCalledWith('/repo/projects/test-project');
  });

  it('returns context policy errors before mutating state', async () => {
    detectCanonicalMainWriteProtectionMock.mockResolvedValue({
      blocked: false,
      git_worktree_root: '/test/path',
      current_branch: 'fix/test',
      workspace_type: 'isolated_worktree',
    });
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: {
          id: 'test-project',
          name: 'Test Project',
        },
        source_control: {
          topology: 'local_directory_only',
          context_publication_policy: 'not-a-real-policy',
        },
      },
    });
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('rev-parse --show-toplevel')) { cb(null, '/test/path\n', ''); return; }
      if (cmd.includes('rev-parse --git-common-dir')) { cb(null, '/repo/.git\n', ''); return; }
      cb(new Error('Unexpected command: ' + cmd), '', '');
    });

    const result = await saveState({
      project: 'test-project',
      message: 'context policy failure',
    });

    expect(result).toMatch(/^❌/);
    expect(fsPromisesMock.writeFile).not.toHaveBeenCalled();
  });

  it('blocks save when github_versioned project omits execution.source_repo_roots', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
      },
    });
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('rev-parse --show-toplevel')) { cb(null, '/test/path\n', ''); return; }
      if (cmd.includes('rev-parse --git-common-dir')) { cb(null, '.git\n', ''); return; }
      cb(new Error('Unexpected command: ' + cmd), '', '');
    });

    const result = await saveState({ message: 'missing source roots' });

    expect(result).toContain('missing execution.source_repo_roots');
    expect(fsPromisesMock.writeFile).not.toHaveBeenCalled();
  });

  it('blocks save when public_distilled routing targets raw conversations in tracked paths', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
        execution: { source_repo_roots: ['.'] },
        agent_context: { conversations: '.private/conversations/' },
      },
    });
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('rev-parse --show-toplevel')) { cb(null, '/test/path\n', ''); return; }
      if (cmd.includes('rev-parse --git-common-dir')) { cb(null, '.git\n', ''); return; }
      if (cmd.includes('remote get-url')) { cb(null, 'https://github.com/example/test-project.git\n', ''); return; }
      cb(null, '', '');
    });

    const result = await saveState({ message: 'misconfigured routing' });

    expect(result).toContain('public transcript routing is misconfigured');
    expect(fsPromisesMock.writeFile).not.toHaveBeenCalled();
  });

  it('reports github repo mismatch using https remote origin URLs', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
          github_repo: 'example/expected-repo',
          branch_strategy: 'github_flow',
        },
        execution: { source_repo_roots: ['.'] },
      },
    });
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('rev-parse --show-toplevel')) { cb(null, '/test/path\n', ''); return; }
      if (cmd.includes('rev-parse --git-common-dir')) { cb(null, '/test/path\n', ''); return; }
      if (cmd.includes('remote get-url')) { cb(null, 'https://github.com/example/actual-repo.git\n', ''); return; }
      cb(new Error('Unexpected command: ' + cmd), '', '');
    });

    const result = await saveState({ message: 'remote mismatch' });

    expect(result).toContain('does not match declared source_control.github_repo');
    expect(fsPromisesMock.writeFile).not.toHaveBeenCalled();
  });

  it('reports github repo mismatch using ssh:// remote origin URLs', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
          github_repo: 'example/expected-repo',
          branch_strategy: 'github_flow',
        },
        execution: { source_repo_roots: ['.'] },
      },
    });
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('rev-parse --show-toplevel')) { cb(null, '/test/path\n', ''); return; }
      if (cmd.includes('rev-parse --git-common-dir')) { cb(null, '/test/path\n', ''); return; }
      if (cmd.includes('remote get-url')) { cb(null, 'ssh://git@github.com/example/actual-repo.git\n', ''); return; }
      cb(new Error('Unexpected command: ' + cmd), '', '');
    });

    const result = await saveState({ message: 'ssh remote mismatch' });

    expect(result).toContain('does not match declared source_control.github_repo');
  });

  it('reports github repo mismatch when remote get-url fails', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
        execution: { source_repo_roots: ['.'] },
      },
    });
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('rev-parse --show-toplevel')) { cb(null, '/test/path\n', ''); return; }
      if (cmd.includes('rev-parse --git-common-dir')) { cb(null, '/test/path\n', ''); return; }
      if (cmd.includes('remote get-url')) { cb(new Error('no origin'), '', 'fatal: No such remote'); return; }
      cb(new Error('Unexpected command: ' + cmd), '', '');
    });

    const result = await saveState({ message: 'missing remote' });

    expect(result).toContain('does not match declared source_control.github_repo');
  });

  it('stages AGENTS.md when it exists for private_continuity projects', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    fsMock.existsSync.mockImplementation((path: string) => path === '/test/path/AGENTS.md');
    mockProjectFiles({
      projectYaml: {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
        execution: { source_repo_roots: ['.'] },
      },
      state: { session: {} },
    });
    const commands: string[] = [];
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      commands.push(cmd);
      if (cmd.includes('rev-parse --show-toplevel')) { cb(null, '/test/path\n', ''); return; }
      if (cmd.includes('rev-parse --git-common-dir')) { cb(null, '.git\n', ''); return; }
      if (cmd.includes('remote get-url')) { cb(null, 'git@github.com:example/test-project.git\n', ''); return; }
      if (cmd.includes(' add -A')) { cb(null, '', ''); return; }
      if (cmd.includes('commit')) { cb(new Error('nothing to commit'), '', 'nothing to commit'); return; }
      cb(null, '', '');
    });

    const result = await saveState({ message: 'stage agents guidance' });

    const addCommand = commands.find((cmd) => cmd.includes(' add -A -- '));
    expect(result).toMatch(/State saved/);
    expect(addCommand).toBeDefined();
    expect(addCommand).toContain('AGENTS.md');
  });

  it('fails closed when tracked continuity paths escape the git worktree root', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry({
      projects: [{
        id: 'test-project',
        name: 'Test Project',
        path: '/repo/projects/app',
        status: 'active' as const,
        created: '2025-01-01',
        last_accessed: '2025-01-01T00:00:00.000Z',
      }],
    }));
    clearSessionProjectBinding();
    bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/repo/projects/app',
    });
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path === '/repo/projects/app/.project.yaml') {
        return JSON.stringify({
          meta: { id: 'test-project', name: 'Test Project' },
          source_control: {
            topology: 'github_versioned',
            context_publication_policy: 'private_continuity',
            github_repo: 'example/test-project',
            branch_strategy: 'github_flow',
          },
          execution: { source_repo_roots: ['/repo'] },
        });
      }
      if (path === '/repo/projects/app/.context/state.yaml') {
        return JSON.stringify({ session: {} });
      }
      throw new Error(`unexpected path: ${path}`);
    });
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('rev-parse --show-toplevel')) { cb(null, '/other/worktree\n', ''); return; }
      if (cmd.includes('rev-parse --git-common-dir')) { cb(null, '/repo/.git\n', ''); return; }
      if (cmd.includes('remote get-url')) { cb(null, 'git@github.com:example/test-project.git\n', ''); return; }
      cb(new Error('Unexpected command: ' + cmd), '', '');
    });

    const result = await saveState({ message: 'escape path' });

    expect(result).toContain('could not persist tracked continuity');
    expect(result).toContain('escapes repo root');
    expect(fsPromisesMock.writeFile).not.toHaveBeenCalled();
  });

  it('returns partial save when a local_private project path escapes the git worktree root', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles();
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('rev-parse --show-toplevel')) { cb(null, '/other/worktree\n', ''); return; }
      if (cmd.includes('rev-parse --git-common-dir')) { cb(null, '/other/worktree/.git\n', ''); return; }
      cb(new Error('Unexpected command: ' + cmd), '', '');
    });

    const result = await saveState({ message: 'escape path local private' });

    expect(result).toContain('Partial save completed');
    expect(result).toContain('Path escapes git worktree root');
  });

  it('blocks save on gitBindingPath when canonical-main guard omits reason', async () => {
    detectCanonicalMainWriteProtectionMock.mockResolvedValue({
      blocked: true,
      git_worktree_root: '/repo',
      current_branch: 'main',
      workspace_type: 'main',
    });
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());

    const result = await saveState({
      project: 'test-project',
      repo_path: '/repo/projects/test-project',
      message: 'blocked on binding path',
    });

    expect(result).toContain('agenticos_save blocked');
    expect(result).toContain('/repo');
  });
});

describe('save repo binding helpers', () => {
  it('resolveDeclaredSourceRepoRoots returns empty when source_repo_roots is not an array', () => {
    expect(resolveDeclaredSourceRepoRoots('/test/path', {
      execution: { source_repo_roots: 'invalid' as unknown as string[] },
    })).toEqual([]);
  });

  it('extractGitHubRepoFromRemoteOrigin returns null for unrecognized remotes', () => {
    expect(extractGitHubRepoFromRemoteOrigin('https://gitlab.com/example/repo.git')).toBeNull();
  });

  it('validateGitBackedContinuityRepoBinding reports missing source_repo_roots', async () => {
    const reasons = await validateGitBackedContinuityRepoBinding({
      projectName: 'Test Project',
      policy: 'private_continuity',
      projectPath: '/test/path',
      projectYaml: {
        source_control: { github_repo: 'example/test-project' },
      },
      gitWorktreeRoot: '/test/path',
      gitCommonRepoRoot: '/test/path',
    });

    expect(reasons).toContain('Project "Test Project" is marked git-backed but missing execution.source_repo_roots.');
  });

  it('validateGitBackedContinuityRepoBinding skips github_repo comparison when repo is undeclared', async () => {
    const reasons = await validateGitBackedContinuityRepoBinding({
      projectName: 'Test Project',
      policy: 'private_continuity',
      projectPath: '/test/path',
      projectYaml: {
        execution: { source_repo_roots: ['.'] },
      },
      gitWorktreeRoot: '/test/path',
      gitCommonRepoRoot: '/test/path',
    });

    expect(reasons).toEqual([]);
  });

  it('validateGitBackedContinuityRepoBinding validates gitlab repository metadata', async () => {
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('remote get-url')) {
        cb(null, 'https://gitlab.com/group/repo.git\n', '');
        return;
      }
      cb(new Error('Unexpected command: ' + cmd), '', '');
    });

    const reasons = await validateGitBackedContinuityRepoBinding({
      projectName: 'GitLab Project',
      policy: 'private_continuity',
      projectPath: '/test/path',
      projectYaml: {
        source_control: {
          repository: {
            provider: 'gitlab',
            slug: 'group/repo',
          },
        },
        execution: { source_repo_roots: ['.'] },
      },
      gitWorktreeRoot: '/test/path',
      gitCommonRepoRoot: '/test/path',
    });

    expect(reasons).toEqual([]);
  });

  it('validateGitBackedContinuityRepoBinding reports host-neutral repository remote mismatches', async () => {
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('remote get-url')) {
        cb(null, 'https://gitlab.com/group/actual.git\n', '');
        return;
      }
      cb(new Error('Unexpected command: ' + cmd), '', '');
    });

    const reasons = await validateGitBackedContinuityRepoBinding({
      projectName: 'GitLab Project',
      policy: 'private_continuity',
      projectPath: '/test/path',
      projectYaml: {
        source_control: {
          repository: {
            provider: 'gitlab',
            slug: 'group/expected',
          },
        },
        execution: { source_repo_roots: ['.'] },
      },
      gitWorktreeRoot: '/test/path',
      gitCommonRepoRoot: '/test/path',
    });

    expect(reasons.join('\n')).toContain('source_control.repository gitlab:group/expected');
  });

  it('validateGitBackedContinuityRepoBinding reports missing non-generic repository slugs', async () => {
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('remote get-url')) {
        cb(null, 'https://gitlab.com/group/repo.git\n', '');
        return;
      }
      cb(new Error('Unexpected command: ' + cmd), '', '');
    });

    const reasons = await validateGitBackedContinuityRepoBinding({
      projectName: 'GitLab Project',
      policy: 'private_continuity',
      projectPath: '/test/path',
      projectYaml: {
        source_control: {
          repository: {
            provider: 'gitlab',
          },
        },
        execution: { source_repo_roots: ['.'] },
      },
      gitWorktreeRoot: '/test/path',
      gitCommonRepoRoot: '/test/path',
    });

    expect(reasons.join('\n')).toContain('source_control.repository gitlab:(no slug)');
  });

  it('validateGitBackedContinuityRepoBinding formats missing host-neutral remote details', async () => {
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('remote get-url')) {
        cb(new Error(''), '', '');
        return;
      }
      cb(new Error('Unexpected command: ' + cmd), '', '');
    });

    const reasons = await validateGitBackedContinuityRepoBinding({
      projectName: 'Gitee Project',
      policy: 'private_continuity',
      projectPath: '/test/path',
      projectYaml: {
        source_control: {
          repository: {
            provider: 'gitee',
            slug: 'owner/repo',
          },
        },
        execution: { source_repo_roots: ['.'] },
      },
      gitWorktreeRoot: '/test/path',
      gitCommonRepoRoot: '/test/path',
    });

    expect(reasons.join('\n')).toContain('git remote origin "missing"');
    expect(reasons.join('\n')).toContain('source_control.repository gitee:owner/repo');
  });

  it('validateGitBackedContinuityRepoBinding treats a blank host-neutral remote as missing', async () => {
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('remote get-url')) {
        cb(null, '\n', '');
        return;
      }
      cb(new Error('Unexpected command: ' + cmd), '', '');
    });

    const reasons = await validateGitBackedContinuityRepoBinding({
      projectName: 'Gitee Project',
      policy: 'private_continuity',
      projectPath: '/test/path',
      projectYaml: {
        source_control: {
          repository: {
            provider: 'gitee',
            slug: 'owner/repo',
          },
        },
        execution: { source_repo_roots: ['.'] },
      },
      gitWorktreeRoot: '/test/path',
      gitCommonRepoRoot: '/test/path',
    });

    expect(reasons.join('\n')).toContain('git remote origin "missing"');
  });

  it('validateGitBackedContinuityRepoBinding formats missing remote details when repository slug is absent', async () => {
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('remote get-url')) {
        cb(new Error(''), '', '');
        return;
      }
      cb(new Error('Unexpected command: ' + cmd), '', '');
    });

    const reasons = await validateGitBackedContinuityRepoBinding({
      projectName: 'GitLab Project',
      policy: 'private_continuity',
      projectPath: '/test/path',
      projectYaml: {
        source_control: {
          repository: {
            provider: 'gitlab',
          },
        },
        execution: { source_repo_roots: ['.'] },
      },
      gitWorktreeRoot: '/test/path',
      gitCommonRepoRoot: '/test/path',
    });

    expect(reasons.join('\n')).toContain('git remote origin "missing"');
    expect(reasons.join('\n')).toContain('source_control.repository gitlab:(no slug)');
  });

  it('validateGitBackedContinuityRepoBinding skips remote comparison for generic git repositories', async () => {
    childProcessMock.exec.mockClear();

    const reasons = await validateGitBackedContinuityRepoBinding({
      projectName: 'Generic Project',
      policy: 'private_continuity',
      projectPath: '/test/path',
      projectYaml: {
        source_control: {
          repository: {
            provider: 'generic',
            remote: 'origin',
            review_system: 'none',
          },
        },
        execution: { source_repo_roots: ['.'] },
      },
      gitWorktreeRoot: '/test/path',
      gitCommonRepoRoot: '/test/path',
    });

    expect(reasons).toEqual([]);
    expect(childProcessMock.exec).not.toHaveBeenCalledWith(expect.stringContaining('remote get-url'), expect.any(Function));
  });

  it('validateGitBackedContinuityRepoBinding reports remote lookup failures', async () => {
    childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
      if (cmd.includes('remote get-url')) {
        cb(Object.assign(new Error('missing remote'), { stderr: 'fatal: No such remote' }), '', 'fatal: No such remote');
        return;
      }
      cb(new Error('Unexpected command: ' + cmd), '', '');
    });

    const reasons = await validateGitBackedContinuityRepoBinding({
      projectName: 'Test Project',
      policy: 'private_continuity',
      projectPath: '/test/path',
      projectYaml: {
        source_control: { github_repo: 'example/test-project' },
        execution: { source_repo_roots: ['.'] },
      },
      gitWorktreeRoot: '/test/path',
      gitCommonRepoRoot: '/test/path',
    });

    expect(reasons.join('\n')).toContain('fatal: No such remote');
  });

  it('validateGitBackedContinuityRepoBinding uses stdout and message fallbacks for remote lookup failures', async () => {
    const cases = [
      Object.assign(new Error('remote failed'), { stdout: 'origin missing from stdout' }),
      Object.assign(new Error('remote failed'), { message: 'origin missing from message' }),
      new Error(''),
    ];

    for (const error of cases) {
      childProcessMock.exec.mockImplementation((cmd: string, cb: Function) => {
        if (cmd.includes('remote get-url')) {
          cb(error, '', '');
          return;
        }
        cb(new Error('Unexpected command: ' + cmd), '', '');
      });

      const reasons = await validateGitBackedContinuityRepoBinding({
        projectName: 'Test Project',
        policy: 'private_continuity',
        projectPath: '/test/path',
        projectYaml: {
          source_control: { github_repo: 'example/test-project' },
          execution: { source_repo_roots: ['.'] },
        },
        gitWorktreeRoot: '/test/path',
        gitCommonRepoRoot: '/test/path',
      });

      expect(reasons.length).toBeGreaterThan(0);
    }
  });
});
