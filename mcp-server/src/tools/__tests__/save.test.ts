import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  default: {
    parse: vi.fn(),
    stringify: vi.fn((obj: unknown) => JSON.stringify(obj)),
  },
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
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

import { saveState } from '../save.js';
import * as fsPromises from 'fs/promises';
import * as registry from '../../utils/registry.js';
import * as childProcess from 'child_process';
import { promisify } from 'util';

const fsPromisesMock = fsPromises as typeof fsPromises & {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
};
const registryMock = registry as typeof registry & { loadRegistry: ReturnType<typeof vi.fn> };
const childProcessMock = childProcess as typeof childProcess & { exec: ReturnType<typeof vi.fn> };

describe('saveState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no active project
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns error when no active project', async () => {
    const result = await saveState({ message: 'test' });
    expect(result).toContain('No active project');
    expect(result).toContain('agenticos_switch');
  });

  it('returns error when active project not found in registry', async () => {
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
    expect(result).toContain('Active project not found in registry');
  });

  it('saves state.yaml with backup timestamp when no git repo', async () => {
    registryMock.loadRegistry.mockResolvedValue({
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
    });

    // Mock readFile to return a valid state
    fsPromisesMock.readFile.mockResolvedValue(JSON.stringify({ session: {} }));

    // Mock exec to throw (no git)
    const execMock = vi.fn((cmd: string, cb: Function) => {
      cb(new Error('not a git repo'), '', '');
    });
    childProcessMock.exec = execMock as any;

    const result = await saveState({ message: 'test save' });

    expect(result).toContain('no git repo');
    expect(result).toContain('State saved');

    // Verify state.yaml was updated
    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateYamlCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    expect(stateYamlCall).toBeDefined();
    const writtenState = JSON.parse(stateYamlCall![1] as string);
    expect(writtenState.session.last_backup).toBeDefined();
  });

  it('runs git add, commit, push when git repo exists', async () => {
    registryMock.loadRegistry.mockResolvedValue({
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
    });

    fsPromisesMock.readFile.mockResolvedValue(JSON.stringify({ session: {} }));

    const execCalls: string[] = [];
    const execMock = vi.fn((cmd: string, cb: Function) => {
      execCalls.push(cmd);
      cb(null, '', '');
    });
    childProcessMock.exec = execMock as any;

    const result = await saveState({ message: 'My commit message' });

    expect(result).toContain('Saved and backed up');
    expect(result).toContain('My commit message');
    expect(result).toContain('test-project');
  });

  it('returns partial save message when error occurs during save', async () => {
    registryMock.loadRegistry.mockResolvedValue({
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
    });

    // readFile throws an error
    fsPromisesMock.readFile.mockRejectedValue(new Error('read error'));

    const execMock = vi.fn((cmd: string, cb: Function) => {
      cb(null, '', '');
    });
    childProcessMock.exec = execMock as any;

    const result = await saveState({ message: 'test' });

    expect(result).toContain('Partial save');
    expect(result).toContain('read error');
  });
});
