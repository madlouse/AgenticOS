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
  patchProjectMetadata: vi.fn(),
  getAgenticOSHome: vi.fn(() => '/home/testuser/AgenticOS'),
  resolvePath: vi.fn((p: string) => p),
}));

vi.mock('../../utils/distill.js', () => ({
  updateClaudeMdState: vi.fn().mockResolvedValue({ updated: true, created: false }),
}));


import { recordSession } from '../record.js';
import * as fsPromises from 'fs/promises';
import * as registry from '../../utils/registry.js';
import { bindSessionProject, clearSessionProjectBinding } from '../../utils/session-context.js';
const fsPromisesMock = fsPromises as typeof fsPromises & {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
};
const registryMock = registry as typeof registry & {
  loadRegistry: ReturnType<typeof vi.fn>;
  patchProjectMetadata: ReturnType<typeof vi.fn>;
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
    source_control: {
      topology: 'local_directory_only',
      context_publication_policy: 'local_private',
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
    clearSessionProjectBinding();
    bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/test/path',
    });
    // Clear mock calls but preserve implementations
    fsPromisesMock.readFile.mockClear();
    fsPromisesMock.writeFile.mockClear();
    registryMock.loadRegistry.mockClear();
    registryMock.patchProjectMetadata.mockClear();
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
    registryMock.patchProjectMetadata.mockResolvedValue(undefined);
    mockProjectFiles();
  });

  afterEach(() => {
    clearSessionProjectBinding();
    vi.restoreAllMocks();
  });

  it('returns error when summary is missing', async () => {
    const result = await recordSession({} as any);
    expect(result).toContain('summary is required');
  });

  it('returns error when no explicit project and no session project are available', async () => {
    clearSessionProjectBinding();
    const result = await recordSession({ summary: 'test summary' });
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

    const result = await recordSession({ summary: 'test summary' });
    expect(result).toContain('No project provided and no session project is bound');
  });

  it('allows recordSession on canonical main checkout (no git writes, runtime-only)', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    // Guard is not called by recordSession — it writes runtime surfaces only, no git commits
    const result = await recordSession({ summary: 'runtime-only record on canonical main' });

    expect(result).toContain('Session recorded');
    expect(fsPromisesMock.writeFile).toHaveBeenCalled();
    expect(fsPromisesMock.mkdir).toHaveBeenCalled();
    expect(registryMock.patchProjectMetadata).toHaveBeenCalled();
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

    expect(registryMock.patchProjectMetadata).toHaveBeenCalledWith(
      'test-project',
      expect.objectContaining({
        last_recorded: expect.any(String),
      }),
    );
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

  it('falls back to empty arrays when JSON-stringified list arguments are invalid', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      state: {
        session: {},
        working_memory: { decisions: ['existing'], facts: ['fact'], pending: ['pending'] },
      },
    });

    await recordSession({
      summary: 'test',
      decisions: 'not-json',
      outcomes: 'also-not-json',
      pending: 'broken-json',
    });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    const writtenState = JSON.parse(stateCall![1] as string);

    expect(writtenState.working_memory.decisions).toEqual(['existing']);
    expect(writtenState.working_memory.facts).toEqual(['fact']);
    expect(writtenState.working_memory.pending).toEqual(['pending']);
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

  it('routes raw transcripts to a private sidecar path for public_distilled projects', async () => {
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
        execution: {
          source_repo_roots: ['.'],
        },
      },
      state: { session: {}, working_memory: { decisions: [], facts: [], pending: [] } },
    });

    const result = await recordSession({ summary: 'test session' });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const convCall = writeCalls.find((c) => String(c[0]).includes('/.private/conversations/') && String(c[0]).endsWith('.md'));
    expect(convCall).toBeDefined();
    expect(result).toContain('Raw conversation: .private/conversations/');
    expect(result).toContain('Git recovery is distilled-only');
  });

  it('continues when quick-start.md is missing during enrichment', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: { id: 'test-project', name: 'Test Project' },
          source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
        });
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

  it('does not read or rewrite quick-start.md during record', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {}, working_memory: { decisions: [], facts: [], pending: [] } } });

    await recordSession({ summary: 'runtime-only update' });

    expect(fsPromisesMock.readFile.mock.calls.some((call) => String(call[0]).endsWith('/quick-start.md'))).toBe(false);
    expect(fsPromisesMock.writeFile.mock.calls.some((call) => String(call[0]).endsWith('/quick-start.md'))).toBe(false);
  });

  it('creates a new conversation file and default state when conversation and state files do not exist yet', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: { id: 'test-project', name: 'Test Project' },
          source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
        });
      }
      if (path.endsWith('/state.yaml')) {
        throw new Error('missing state');
      }
      if (path.includes('/conversations/') && path.endsWith('.md')) {
        throw new Error('missing conversation');
      }
      if (path.endsWith('/quick-start.md')) {
        return '# Quick Start\n\n1. Define project goals';
      }
      return '';
    });

    const result = await recordSession({
      summary: 'bootstrapped',
      current_task: { title: 'Bootstrap project' },
    });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const convCall = writeCalls.find((c) => c[0].includes('conversations') && c[0].endsWith('.md'));
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    expect(convCall).toBeDefined();
    expect(String(convCall![1])).toContain('# Sessions');
    expect(stateCall).toBeDefined();
    const writtenState = JSON.parse(stateCall![1] as string);
    expect(writtenState.working_memory).toEqual({ facts: [], decisions: [], pending: [] });
    expect(writtenState.session.last_backup).toBeDefined();
    expect(writtenState.current_task.title).toBe('Bootstrap project');
    expect(result).toContain('✅ Session recorded');
  });

  it('falls back to an empty state object when state parsing returns nothing', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: { id: 'test-project', name: 'Test Project' },
          source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
        });
      }
      if (path.endsWith('/state.yaml')) {
        return 'not-json';
      }
      if (path.endsWith('/quick-start.md')) {
        return '# Quick Start\n\n1. Define project goals';
      }
      return '';
    });
    yamlMock.parse.mockImplementation((content: string) => {
      if (content === 'not-json') return undefined;
      try { return JSON.parse(content); } catch { return undefined; }
    });

    await recordSession({ summary: 'test session' });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    const writtenState = JSON.parse(stateCall![1] as string);
    expect(writtenState.working_memory).toEqual({ facts: [], decisions: [], pending: [] });
    expect(writtenState.session.last_backup).toBeDefined();
  });

  it('falls back to an empty state object when state parsing returns null', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: { id: 'test-project', name: 'Test Project' },
          source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
        });
      }
      if (path.endsWith('/state.yaml')) {
        return 'null';
      }
      if (path.endsWith('/quick-start.md')) {
        return '# Quick Start\n\n1. Define project goals';
      }
      return '';
    });

    await recordSession({ summary: 'test session' });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    const writtenState = JSON.parse(stateCall![1] as string);
    expect(writtenState.working_memory).toEqual({ facts: [], decisions: [], pending: [] });
    expect(writtenState.session.last_backup).toBeDefined();
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

    expect(registryMock.patchProjectMetadata).toHaveBeenCalledWith(
      'test-project',
      expect.objectContaining({
        last_recorded: expect.any(String),
      }),
    );
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
        return JSON.stringify({
          session: {},
          working_memory: { decisions: [], facts: [], pending: [] },
        });
      }
      if (path === '/other/path/.context/quick-start.md') {
        return '# Quick Start\n\n1. Define project goals';
      }
      if (path.includes('/other/path/.context/conversations/') && path.endsWith('.md')) {
        return '';
      }
      if (path === '/test/path/.project.yaml') {
        return JSON.stringify({
          meta: { id: 'test-project', name: 'Test Project' },
          source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
        });
      }
      if (path === '/test/path/.context/state.yaml') {
        return JSON.stringify({
          session: {},
          working_memory: { decisions: [], facts: [], pending: [] },
        });
      }
      if (path === '/test/path/.context/quick-start.md') {
        return '# Quick Start\n\n1. Define project goals';
      }
      if (path.includes('/test/path/.context/conversations/') && path.endsWith('.md')) {
        return '';
      }
      return '';
    });

    const result = await recordSession({
      project: 'other-project',
      summary: 'test',
    });

    expect(result).toContain('Session recorded for "Other Project"');
    expect(registryMock.patchProjectMetadata).toHaveBeenCalledWith(
      'other-project',
      expect.objectContaining({
        last_recorded: expect.any(String),
      }),
    );
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
        return JSON.stringify({
          session: {},
          working_memory: { decisions: [], facts: [], pending: [] },
        });
      }
      if (path === '/other/path/.context/quick-start.md') {
        return '# Quick Start\n\n1. Define project goals';
      }
      if (path.includes('/other/path/.context/conversations/') && path.endsWith('.md')) {
        return '';
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await recordSession({ summary: 'session-bound record' });

    expect(result).toContain('Session recorded for "Other Project"');
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

    const result = await recordSession({ summary: 'test' });

    expect(result).toContain('does not match .project.yaml meta.id');
    expect(fsPromisesMock.writeFile).not.toHaveBeenCalled();
  });
});
