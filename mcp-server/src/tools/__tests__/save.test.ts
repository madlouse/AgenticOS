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

// Mock child_process before the module imports it
// Mock child_process before the module imports it
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

import { saveState } from '../save.js';
import * as fsPromises from 'fs/promises';
import * as registry from '../../utils/registry.js';
import * as childProcess from 'child_process';
import { updateClaudeMdState } from '../../utils/distill.js';
import { bindSessionProject, clearSessionProjectBinding } from '../../utils/session-context.js';

const fsPromisesMock = fsPromises as typeof fsPromises & {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
};
const registryMock = registry as typeof registry & { loadRegistry: ReturnType<typeof vi.fn> };
const childProcessMock = childProcess as typeof childProcess & { exec: ReturnType<typeof vi.fn> };
const updateClaudeMdStateMock = updateClaudeMdState as unknown as ReturnType<typeof vi.fn>;

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
    expect(addCommand).toContain('/test/path/.context/.last_record');
    expect(addCommand).toContain('/test/path/.context/conversations');
    expect(addCommand).toContain('/test/path/CLAUDE.md');
    expect(addCommand).not.toContain('add "/test/path/"');
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

    const execMock = vi.fn((cmd: string, cb: Function) => {
      cb(null, '', '');
    });
    childProcessMock.exec = execMock as any;

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
    expect(addCommand).toContain('/test/path/.project.yaml');
    expect(addCommand).toContain('/test/path/.context/quick-start.md');
    expect(addCommand).toContain('/test/path/.context/state.yaml');
    expect(addCommand).toContain('/test/path/.context/conversations');
    expect(addCommand).toContain('/test/path/knowledge');
    expect(addCommand).toContain('/test/path/tasks');
    expect(addCommand).toContain('/test/path/CLAUDE.md');
    expect(addCommand).not.toContain('/test/path/.context/.last_record');
    expect(result).toContain('Recovery: full tracked continuity staged for Git-backed restore');
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
    expect(addCommand).toContain('/test/path/.project.yaml');
    expect(addCommand).toContain('/test/path/.context/quick-start.md');
    expect(addCommand).toContain('/test/path/.context/state.yaml');
    expect(addCommand).toContain('/test/path/knowledge');
    expect(addCommand).toContain('/test/path/tasks');
    expect(addCommand).toContain('/test/path/CLAUDE.md');
    expect(addCommand).not.toContain('/test/path/.context/conversations');
    expect(result).toContain('Recovery: distilled continuity staged for Git-backed restore');
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
    expect(fsPromisesMock.writeFile).not.toHaveBeenCalledWith('/test/path/CLAUDE.md', expect.anything(), 'utf-8');
  });
});
