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

import { recordSession } from '../record.js';
import * as fsPromises from 'fs/promises';
import * as registry from '../../utils/registry.js';

const fsPromisesMock = fsPromises as typeof fsPromises & {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
};
const registryMock = registry as typeof registry & {
  loadRegistry: ReturnType<typeof vi.fn>;
  saveRegistry: ReturnType<typeof vi.fn>;
};

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
  quickStart?: string;
  conversation?: string;
}) {
  const projectYaml = options?.projectYaml || {
    meta: {
      id: 'test-project',
      name: 'Test Project',
    },
  };
  const state = options?.state || {
    session: {},
    working_memory: { decisions: [], facts: [], pending: [] },
  };
  const quickStart = options?.quickStart || '# Quick Start\n\n1. Define project goals';
  const conversation = options?.conversation || '';

  fsPromisesMock.readFile.mockImplementation(async (path: string) => {
    if (path.endsWith('/.project.yaml')) {
      return JSON.stringify(projectYaml);
    }
    if (path.endsWith('/state.yaml')) {
      return JSON.stringify(state);
    }
    if (path.endsWith('/quick-start.md')) {
      return quickStart;
    }
    if (path.includes('/conversations/') && path.endsWith('.md')) {
      return conversation;
    }
    return '';
  });
}

describe('recordSession', () => {
  beforeEach(() => {
    // Clear mock calls but preserve implementations
    fsPromisesMock.readFile.mockClear();
    fsPromisesMock.writeFile.mockClear();
    registryMock.loadRegistry.mockClear();
    registryMock.saveRegistry.mockClear();
    yamlMock.parse.mockClear();
    yamlMock.stringify.mockClear();
    // Set up default yamlMock implementations
    yamlMock.parse.mockImplementation((content: string) => {
      try { return JSON.parse(content); } catch { return undefined; }
    });
    yamlMock.stringify.mockImplementation((obj: unknown) => JSON.stringify(obj));
    // Default: no active project
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [],
    });
    registryMock.saveRegistry.mockResolvedValue(undefined);
    mockProjectFiles();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns error when summary is missing', async () => {
    const result = await recordSession({} as any);
    expect(result).toContain('summary is required');
  });

  it('returns error when no active project', async () => {
    const result = await recordSession({ summary: 'test summary' });
    expect(result).toContain('No active project');
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

    const result = await recordSession({ summary: 'test summary' });
    expect(result).toContain('not found in registry');
  });

  it('creates conversation file with correct date-based filename', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());

    await recordSession({ summary: 'Did some work' });

    // Check conversation file was written
    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const convCall = writeCalls.find((c) => c[0].includes('conversations') && c[0].endsWith('.md'));
    expect(convCall).toBeDefined();
    const convPath = convCall![0] as string;
    // Should contain today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    expect(convPath).toContain(today);
  });

  it('appends to existing conversation file', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      state: { session: {}, working_memory: { decisions: [], facts: [], pending: [] } },
      conversation: '# Existing content\n\nsome previous record',
    });

    await recordSession({ summary: 'Did more work' });

    // The conv file write should contain the existing content + new entry
    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const convCall = writeCalls.find((c) => c[0].includes('conversations') && c[0].endsWith('.md'));
    expect(convCall).toBeDefined();
    const content = convCall![1] as string;
    expect(content).toContain('Existing content');
    expect(content).toContain('Did more work');
  });

  it('updates state.yaml with decisions appended', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());

    const existingState = {
      session: {},
      working_memory: {
        decisions: ['previous decision'],
        facts: [],
        pending: [],
      },
    };
    mockProjectFiles({ state: existingState });

    await recordSession({
      summary: 'test',
      decisions: ['new decision 1', 'new decision 2'],
    });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    expect(stateCall).toBeDefined();
    const writtenState = JSON.parse(stateCall![1] as string);
    // Decisions should be appended
    expect(writtenState.working_memory.decisions).toContain('previous decision');
    expect(writtenState.working_memory.decisions).toContain('new decision 1');
    expect(writtenState.working_memory.decisions).toContain('new decision 2');
  });

  it('replaces pending items in state.yaml', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());

    const existingState = {
      session: {},
      working_memory: {
        decisions: [],
        facts: [],
        pending: ['old pending item'],
      },
    };
    mockProjectFiles({ state: existingState });

    await recordSession({
      summary: 'test',
      pending: ['new pending 1', 'new pending 2'],
    });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    const writtenState = JSON.parse(stateCall![1] as string);
    // Pending should be replaced, not appended
    expect(writtenState.working_memory.pending).toEqual(['new pending 1', 'new pending 2']);
    expect(writtenState.working_memory.pending).not.toContain('old pending item');
  });

  it('appends outcomes as facts in state.yaml', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());

    const existingState = {
      session: {},
      working_memory: {
        decisions: [],
        facts: ['existing fact'],
        pending: [],
      },
    };
    mockProjectFiles({ state: existingState });

    await recordSession({
      summary: 'test',
      outcomes: ['completed feature X', 'fixed bug Y'],
    });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    const writtenState = JSON.parse(stateCall![1] as string);
    // Facts should have existing + new outcomes
    expect(writtenState.working_memory.facts).toContain('existing fact');
    expect(writtenState.working_memory.facts).toContain('completed feature X');
    expect(writtenState.working_memory.facts).toContain('fixed bug Y');
  });

  it('updates current_task in state', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());

    const existingState = {
      session: {},
      working_memory: { decisions: [], facts: [], pending: [] },
    };
    mockProjectFiles({ state: existingState });

    await recordSession({
      summary: 'test',
      current_task: { title: 'Implement feature X', status: 'in_progress' },
    });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    const writtenState = JSON.parse(stateCall![1] as string);
    expect(writtenState.current_task.title).toBe('Implement feature X');
    expect(writtenState.current_task.status).toBe('in_progress');
  });

  it('falls back to existing task title and default status when current_task fields are partial', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      state: {
        session: {},
        current_task: {
          title: 'Existing task title',
        },
        working_memory: {
          pending: [],
        },
      },
    });

    await recordSession({
      summary: 'test',
      decisions: ['decision one'],
      outcomes: ['outcome one'],
      current_task: {},
    });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    const writtenState = JSON.parse(stateCall![1] as string);

    expect(writtenState.current_task.title).toBe('Existing task title');
    expect(writtenState.current_task.status).toBe('in_progress');
    expect(writtenState.working_memory.decisions).toEqual(['decision one']);
    expect(writtenState.working_memory.facts).toEqual(['outcome one']);
  });

  it('calls updateClaudeMdState', async () => {
    const { updateClaudeMdState } = await import('../../utils/distill.js');

    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {}, working_memory: { decisions: [], facts: [], pending: [] } } });

    await recordSession({ summary: 'test' });

    expect(updateClaudeMdState).toHaveBeenCalled();
  });

  it('updates registry with last_recorded timestamp', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {}, working_memory: { decisions: [], facts: [], pending: [] } } });

    await recordSession({ summary: 'test' });

    expect(registryMock.saveRegistry).toHaveBeenCalled();
    const savedRegistry = registryMock.saveRegistry.mock.calls[0][0];
    const testProject = savedRegistry.projects.find((p: any) => p.id === 'test-project');
    expect(testProject.last_recorded).toBeDefined();
  });

  it('parses JSON-stringified array arguments without spreading as characters', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());

    const existingState = {
      session: {},
      working_memory: { decisions: [], facts: [], pending: [] },
    };
    mockProjectFiles({ state: existingState });

    await recordSession({
      summary: 'test',
      decisions: '["decision one","decision two"]',
      outcomes: '["outcome one","outcome two"]',
      pending: '["pending one"]',
    });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    expect(stateCall).toBeDefined();
    const writtenState = JSON.parse(stateCall![1] as string);

    expect(writtenState.working_memory.decisions).toEqual(['decision one', 'decision two']);
    expect(writtenState.working_memory.facts).toEqual(['outcome one', 'outcome two']);
    expect(writtenState.working_memory.pending).toEqual(['pending one']);

    for (const item of writtenState.working_memory.decisions) {
      expect((item as string).length).toBeGreaterThan(1);
    }
  });

  it('returns success message with paths', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {}, working_memory: { decisions: [], facts: [], pending: [] } } });

    const result = await recordSession({ summary: 'test session' });

    expect(result).toContain('Test Project');
    expect(result).toContain('conversations/');
    expect(result).toContain('state.yaml');
    expect(result).toContain('CLAUDE.md');
    expect(result).toContain('✅ Session recorded');
  });

  it('continues when quick-start.md is missing during enrichment', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({ meta: { id: 'test-project', name: 'Test Project' } });
      }
      if (path.endsWith('/state.yaml')) {
        return JSON.stringify({ session: {}, working_memory: { decisions: [], facts: [], pending: [] } });
      }
      if (path.endsWith('/quick-start.md')) {
        throw new Error('missing quick-start');
      }
      return '';
    });

    const result = await recordSession({ summary: 'test session' });

    expect(result).toContain('✅ Session recorded');
  });

  it('only updates last_recorded on the resolved project', async () => {
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
          last_recorded: '2025-01-01T12:00:00.000Z',
        },
      ],
    });
    mockProjectFiles({ state: { session: {}, working_memory: { decisions: [], facts: [], pending: [] } } });

    await recordSession({ summary: 'test session' });

    const savedRegistry = registryMock.saveRegistry.mock.calls[0][0];
    const testProject = savedRegistry.projects.find((p: any) => p.id === 'test-project');
    const otherProject = savedRegistry.projects.find((p: any) => p.id === 'other-project');

    expect(testProject.last_recorded).toBeDefined();
    expect(otherProject.last_recorded).toBe('2025-01-01T12:00:00.000Z');
  });

  it('fails closed when explicit project does not match the active project', async () => {
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

    const result = await recordSession({
      project: 'other-project',
      summary: 'test',
    });

    expect(result).toContain('does not match active project');
    expect(fsPromisesMock.writeFile).not.toHaveBeenCalled();
  });

  it('fails closed when .project.yaml identity mismatches the registry project', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: {
          id: 'wrong-project',
          name: 'Test Project',
        },
      },
    });

    const result = await recordSession({ summary: 'test' });

    expect(result).toContain('does not match .project.yaml meta.id');
    expect(fsPromisesMock.writeFile).not.toHaveBeenCalled();
  });
});
