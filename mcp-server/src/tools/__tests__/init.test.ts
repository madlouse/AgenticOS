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

// Mock the distill utils module
vi.mock('../utils/distill.js', () => ({
  generateClaudeMd: vi.fn(() => '# CLAUDE.md\n\nMocked CLAUDE.md content'),
  generateAgentsMd: vi.fn(() => '# AGENTS.md\n\nMocked AGENTS.md content'),
  updateClaudeMdState: vi.fn().mockResolvedValue({ updated: true, created: false }),
}));

import { initProject } from '../init.js';
import * as fsPromises from 'fs/promises';
import * as fs from 'fs';
import * as os from 'os';

const fsPromisesMock = fsPromises as typeof fsPromises & {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
  access: ReturnType<typeof vi.fn>;
};
const fsMock = fs as typeof fs & { existsSync: ReturnType<typeof vi.fn> };
const osMock = os as typeof os & { homedir: ReturnType<typeof vi.fn> };

describe('initProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AGENTICOS_HOME = '/home/testuser/AgenticOS';
    // Default: simulate registry file does not exist (causes loadRegistry to return default)
    fsMock.existsSync.mockReturnValue(false);
    fsPromisesMock.readFile.mockRejectedValue(new Error('ENOENT'));
    // access() throws → path doesn't exist → normal creation path
    fsPromisesMock.access.mockRejectedValue(new Error('ENOENT'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails fast when AGENTICOS_HOME is not configured', async () => {
    delete process.env.AGENTICOS_HOME;

    await expect(
      initProject({ name: 'Test Project', description: 'A test project' }),
    ).rejects.toThrow('AGENTICOS_HOME is not set.');
  });

  it('creates directories with correct structure', async () => {
    fsMock.existsSync.mockReturnValue(false);
    fsPromisesMock.access.mockRejectedValue(new Error('ENOENT'));

    await initProject({ name: 'Test Project', description: 'A test project' });

    // Collect all mkdir calls
    const mkdirCalls = fsPromisesMock.mkdir.mock.calls.map((c) => c[0]);

    // The project path is: /home/testuser/AgenticOS/projects/test-project
    // We expect mkdir for: .context/conversations, knowledge, tasks, artifacts
    const base = '/home/testuser/AgenticOS/projects/test-project';
    const expectedDirs = [
      `${base}/.context/conversations`,
      `${base}/knowledge`,
      `${base}/tasks`,
      `${base}/artifacts`,
    ];

    for (const dir of expectedDirs) {
      expect(mkdirCalls).toContain(dir);
    }
    // 5 calls: .context/conversations (implicitly creates .context), knowledge, tasks, artifacts
    expect(mkdirCalls.length).toBe(5);
  });

  it('writes .project.yaml with correct content', async () => {
    fsMock.existsSync.mockReturnValue(false);
    fsPromisesMock.access.mockRejectedValue(new Error('ENOENT'));

    await initProject({ name: 'Test Project', description: 'A test project' });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const projectYamlCall = writeCalls.find((c) => c[0].endsWith('.project.yaml'));
    expect(projectYamlCall).toBeDefined();

    const content = projectYamlCall![1] as string;
    const parsed = JSON.parse(content);
    expect(parsed.meta.name).toBe('Test Project');
    expect(parsed.meta.id).toBe('test-project');
    expect(parsed.meta.description).toBe('A test project');
    expect(parsed.meta.version).toBe('1.0.0');
    expect(parsed.agent_context.quick_start).toBe('.context/quick-start.md');
    expect(parsed.agent_context.current_state).toBe('.context/state.yaml');
  });

  it('writes state.yaml with correct structure', async () => {
    fsMock.existsSync.mockReturnValue(false);
    fsPromisesMock.access.mockRejectedValue(new Error('ENOENT'));

    await initProject({ name: 'Test Project', description: 'A test project' });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateYamlCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    expect(stateYamlCall).toBeDefined();

    const content = stateYamlCall![1] as string;
    const parsed = JSON.parse(content);
    expect(parsed.session).toBeDefined();
    expect(parsed.session.agent).toBe('claude-sonnet-4.6');
    expect(parsed.current_task).toBeNull();
    expect(parsed.working_memory.facts).toEqual([]);
    expect(parsed.working_memory.decisions).toEqual([]);
    expect(parsed.working_memory.pending).toEqual([]);
    expect(parsed.loaded_context).toContain('.project.yaml');
    expect(parsed.loaded_context).toContain('.context/quick-start.md');
  });

  it('updates registry with new project entry', async () => {
    fsMock.existsSync.mockReturnValue(false);
    fsPromisesMock.access.mockRejectedValue(new Error('ENOENT'));

    await initProject({ name: 'Test Project', description: 'A test project' });

    // find the writeFile call for the registry
    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const registryCall = writeCalls.find((c) => c[0].includes('registry.yaml'));
    expect(registryCall).toBeDefined();
  });

  it('overwrites existing project entry with same ID', async () => {
    // Simulate an existing registry with the same project ID
    const existingRegistry = {
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: 'old-project',
      projects: [
        {
          id: 'test-project', // same ID as what we're creating
          name: 'Old Name',
          path: '/old/path',
          status: 'archived' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'other-project',
          name: 'Other Project',
          path: '/other/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    };

    // First readFile call returns the existing registry
    fsPromisesMock.readFile.mockResolvedValueOnce(JSON.stringify(existingRegistry));
    fsMock.existsSync.mockReturnValue(true);
    // Path exists → access succeeds (no ENOENT)
    fsPromisesMock.access.mockResolvedValue(undefined);

    await initProject({ name: 'Test Project', description: 'Updated' });

    // Find the registry write call
    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const registryWriteCall = writeCalls.find((c) => c[0].includes('registry.yaml'));
    expect(registryWriteCall).toBeDefined();

    // Verify the written registry has only one entry for test-project (the updated one)
    const registryContent = registryWriteCall![1] as string;
    const writtenRegistry = JSON.parse(registryContent);
    const testProject = writtenRegistry.projects.find((p: any) => p.id === 'test-project');
    expect(testProject).toBeDefined();
    expect(testProject.name).toBe('Test Project');
    expect(testProject.status).toBe('active');
    expect(writtenRegistry.active_project).toBe('test-project');
  });

  it('returns success message with project path and ID', async () => {
    fsMock.existsSync.mockReturnValue(false);
    fsPromisesMock.access.mockRejectedValue(new Error('ENOENT'));

    const result = await initProject({ name: 'Test Project', description: 'A test project' });

    expect(result).toContain('Test Project');
    expect(result).toContain('test-project');
    expect(result).toContain('Active');
    expect(result).toContain('agenticos_switch');
  });

  it('creates quick-start.md with project details', async () => {
    fsMock.existsSync.mockReturnValue(false);
    fsPromisesMock.access.mockRejectedValue(new Error('ENOENT'));

    await initProject({ name: 'My Test Project', description: 'Test description' });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const quickStartCall = writeCalls.find((c) => c[0].endsWith('quick-start.md'));
    expect(quickStartCall).toBeDefined();

    const content = quickStartCall![1] as string;
    expect(content).toContain('# My Test Project - Quick Start');
    expect(content).toContain('Test description');
    expect(content).toContain('Status: Active');
  });
});
