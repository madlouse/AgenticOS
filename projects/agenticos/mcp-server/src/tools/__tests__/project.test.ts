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
  generateClaudeMd: vi.fn(() => '# CLAUDE.md\n\nMocked'),
  generateAgentsMd: vi.fn(() => '# AGENTS.md\n\nMocked'),
  updateClaudeMdState: vi.fn().mockResolvedValue({ updated: true, created: false }),
  upgradeClaudeMd: vi.fn(() => '# CLAUDE.md\n\nUpgraded'),
  CURRENT_TEMPLATE_VERSION: 2,
  extractTemplateVersion: vi.fn(() => 2),
}));

import { switchProject, listProjects, getStatus } from '../project.js';
import * as fsPromises from 'fs/promises';
import * as registry from '../../utils/registry.js';
import * as fs from 'fs';

const fsPromisesMock = fsPromises as typeof fsPromises & {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
};
const registryMock = registry as typeof registry & {
  loadRegistry: ReturnType<typeof vi.fn>;
  saveRegistry: ReturnType<typeof vi.fn>;
};
const fsMock = fs as typeof fs & { existsSync: ReturnType<typeof vi.fn> };

describe('switchProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // By default, mock existsSync to return false (no CLAUDE.md/AGENTS.md)
    fsMock.existsSync.mockReturnValue(false);
    yamlMock.parse.mockImplementation((content: string) => {
      try { return JSON.parse(content); } catch { return undefined; }
    });
    fsPromisesMock.readFile.mockResolvedValue(JSON.stringify({
      meta: { description: '' },
      source_control: { topology: 'local_directory_only' },
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('finds project by ID', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [
        {
          id: 'my-project',
          name: 'My Project',
          path: '/test/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    // Mock readFile for .project.yaml and state.yaml
    fsPromisesMock.readFile.mockResolvedValue(JSON.stringify({
      meta: { description: '' },
      source_control: { topology: 'local_directory_only' },
    }));

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('Switched to project');
    expect(result).toContain('My Project');
    expect(result).toContain('/test/path');
    expect(registryMock.saveRegistry).toHaveBeenCalled();
  });

  it('finds project by name', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [
        {
          id: 'my-project',
          name: 'My Project',
          path: '/test/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    fsPromisesMock.readFile.mockResolvedValue(JSON.stringify({
      meta: { description: '' },
      source_control: { topology: 'local_directory_only' },
    }));

    const result = await switchProject({ project: 'My Project' });

    expect(result).toContain('Switched to project');
    expect(result).toContain('My Project');
  });

  it('returns error with available list when project not found', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [
        {
          id: 'project-a',
          name: 'Project A',
          path: '/path/a',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'project-b',
          name: 'Project B',
          path: '/path/b',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    const result = await switchProject({ project: 'non-existent' });

    expect(result).toContain('not found');
    expect(result).toContain('Project A');
    expect(result).toContain('Project B');
    expect(result).toContain('project-a');
    expect(result).toContain('project-b');
  });

  it('updates last_accessed timestamp on switch', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [
        {
          id: 'my-project',
          name: 'My Project',
          path: '/test/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2020-01-01T00:00:00.000Z',
        },
      ],
    });

    fsPromisesMock.readFile.mockResolvedValue(JSON.stringify({
      meta: { description: '' },
      source_control: { topology: 'local_directory_only' },
    }));

    await switchProject({ project: 'my-project' });

    expect(registryMock.saveRegistry).toHaveBeenCalled();
    const savedRegistry = registryMock.saveRegistry.mock.calls[0][0];
    const switchedProject = savedRegistry.projects.find((p: any) => p.id === 'my-project');
    expect(switchedProject.last_accessed).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('creates CLAUDE.md if missing', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [
        {
          id: 'my-project',
          name: 'My Project',
          path: '/test/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    fsPromisesMock.readFile.mockResolvedValue(JSON.stringify({
      meta: { description: '' },
      source_control: { topology: 'local_directory_only' },
    }));

    await switchProject({ project: 'my-project' });

    // find writeFile calls for CLAUDE.md
    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const claudeMdCall = writeCalls.find((c) => c[0].endsWith('CLAUDE.md'));
    expect(claudeMdCall).toBeDefined();
  });

  it('shows a friendly guardrail placeholder in switch output when no evidence exists', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [
        {
          id: 'my-project',
          name: 'My Project',
          path: '/test/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    fsPromisesMock.readFile.mockResolvedValue(
      JSON.stringify({
        meta: { description: '' },
        source_control: { topology: 'local_directory_only' },
        session: { last_backup: '2025-01-02T12:00:00.000Z' },
        working_memory: { pending: [], decisions: [] },
      })
    );

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('🛡️ Latest guardrail: None recorded');
  });

  it('shows the latest guardrail summary in switch output when evidence exists', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [
        {
          id: 'my-project',
          name: 'My Project',
          path: '/test/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    fsPromisesMock.readFile.mockResolvedValue(
      JSON.stringify({
        meta: { description: '' },
        source_control: { topology: 'local_directory_only' },
        guardrail_evidence: {
          updated_at: '2025-01-02T14:00:00.000Z',
          last_command: 'agenticos_preflight',
          preflight: {
            command: 'agenticos_preflight',
            recorded_at: '2025-01-02T14:00:00.000Z',
            issue_id: '76',
            result: {
              status: 'REDIRECT',
              redirect_actions: ['create an isolated issue branch/worktree before implementation'],
            },
          },
        },
      })
    );

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('agenticos_preflight -> REDIRECT');
    expect(result).toContain('Issue: #76');
    expect(result).toContain('create an isolated issue branch/worktree');
  });

  it('inlines actionable project context into switch output', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [
        {
          id: 'my-project',
          name: 'My Project',
          path: '/test/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
          last_recorded: '2025-01-03T08:00:00.000Z',
        },
      ],
    });

    fsPromisesMock.readFile
      .mockResolvedValueOnce(JSON.stringify({
        meta: { description: 'Agent-first project operating system' },
        source_control: { topology: 'local_directory_only' },
      }))
      .mockResolvedValueOnce(
        JSON.stringify({
          current_task: {
            title: 'Ship context-rich switch output',
            status: 'in_progress',
          },
          working_memory: {
            pending: ['Close issue #23', 'Review switch UX'],
            decisions: ['Keep switch compact', 'Persist guardrail evidence separately'],
          },
        })
      )
      .mockResolvedValueOnce('# Quick Start\n\nAgenticOS quick-start summary');

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('📍 Last recorded:');
    expect(result).toContain('🎯 Current task: Ship context-rich switch output (in_progress)');
    expect(result).toContain('📋 Pending (2):');
    expect(result).toContain('  - Close issue #23');
    expect(result).toContain('✅ Recent decisions (2):');
    expect(result).toContain('📖 Project summary: Agent-first project operating system');
    expect(result).toContain('💡 Suggested next step: Close issue #23');
  });

  it('uses configured canonical context paths for self-hosting switch output', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [
        {
          id: 'agenticos',
          name: 'AgenticOS',
          path: '/workspace/projects/agenticos',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    fsPromisesMock.readFile
      .mockResolvedValueOnce(JSON.stringify({
        meta: { description: 'Self-hosting product' },
        source_control: { topology: 'local_directory_only' },
        agent_context: {
          quick_start: 'standards/.context/quick-start.md',
          current_state: 'standards/.context/state.yaml',
        },
      }))
      .mockResolvedValueOnce(JSON.stringify({
        current_task: { title: 'Canonical state', status: 'active' },
        working_memory: { pending: [], decisions: [] },
      }))
      .mockResolvedValueOnce('# Quick Start\n\nCanonical quick start');

    const result = await switchProject({ project: 'agenticos' });

    expect(fsPromisesMock.readFile).toHaveBeenCalledWith('/workspace/projects/agenticos/standards/.context/state.yaml', 'utf-8');
    expect(fsPromisesMock.readFile).toHaveBeenCalledWith('/workspace/projects/agenticos/standards/.context/quick-start.md', 'utf-8');
    expect(result).toContain('/workspace/projects/agenticos/standards/.context/quick-start.md');
    expect(result).toContain('/workspace/projects/agenticos/standards/.context/state.yaml');
  });

  it('falls back to quick-start summary when project description is missing', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [
        {
          id: 'my-project',
          name: 'My Project',
          path: '/test/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    fsPromisesMock.readFile
      .mockResolvedValueOnce(JSON.stringify({
        meta: { description: '' },
        source_control: { topology: 'local_directory_only' },
      }))
      .mockResolvedValueOnce(
        JSON.stringify({
          working_memory: {
            pending: [],
            decisions: [],
          },
        })
      )
      .mockResolvedValueOnce('# Quick Start\n\nFallback project summary from quick-start.\n\n- bullet ignored');

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('📖 Project summary: Fallback project summary from quick-start.');
  });

  it('refuses to switch into archived reference content', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [
        {
          id: 'archived-project',
          name: 'Archived Project',
          path: '/test/path',
          status: 'archived' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    fsPromisesMock.readFile.mockResolvedValue(
      JSON.stringify({
        meta: { description: 'Archive' },
        archive_contract: {
          version: 1,
          kind: 'archived_reference',
          managed_project: false,
          execution_mode: 'reference_only',
          replacement_project: 'agenticos-standards',
        },
      })
    );

    const result = await switchProject({ project: 'archived-project' });

    expect(result).toContain('archived reference content');
    expect(result).toContain('agenticos-standards');
    expect(registryMock.saveRegistry).not.toHaveBeenCalled();
  });

  it('refuses to switch into a legacy project that has not completed topology initialization', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [
        {
          id: 'legacy-project',
          name: 'Legacy Project',
          path: '/test/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    fsPromisesMock.readFile.mockResolvedValue(JSON.stringify({
      meta: { id: 'legacy-project', name: 'Legacy Project' },
    }));

    const result = await switchProject({ project: 'legacy-project' });

    expect(result).toContain('has not completed source-control topology initialization');
    expect(registryMock.saveRegistry).not.toHaveBeenCalled();
  });
});

describe('listProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats empty registry', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [],
    });

    const result = await listProjects();

    expect(result).toContain('No projects found');
    expect(result).toContain('agenticos_init');
  });

  it('formats registry with projects', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: 'project-a',
      projects: [
        {
          id: 'project-a',
          name: 'Project A',
          path: '/path/a',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
          last_recorded: '2025-01-01T12:00:00.000Z',
        },
        {
          id: 'project-b',
          name: 'Project B',
          path: '/path/b',
          status: 'archived' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    const result = await listProjects();

    expect(result).toContain('AgenticOS Projects');
    expect(result).toContain('Project A');
    expect(result).toContain('Project B');
    expect(result).toContain('/path/a');
    expect(result).toContain('/path/b');
    expect(result).toContain('active');
    expect(result).toContain('archived');
    // Active project should have indicator
    expect(result).toContain('project-a');
  });

  it('shows Never for last recorded when not set', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [
        {
          id: 'project-a',
          name: 'Project A',
          path: '/path/a',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
          // no last_recorded
        },
      ],
    });

    const result = await listProjects();

    expect(result).toContain('Never');
  });
});

describe('getStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up yamlMock.parse to handle JSON.parse, fall back to undefined
    yamlMock.parse.mockImplementation((content: string) => {
      try { return JSON.parse(content); } catch { return undefined; }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns error when no active project', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [],
    });

    const result = await getStatus();

    expect(result).toContain('No active project');
    expect(result).toContain('agenticos_switch');
  });

  it('returns error when active project not found in registry', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: 'non-existent',
      projects: [],
    });

    const result = await getStatus();

    expect(result).toContain('not found in registry');
  });

  it('returns status for active project', async () => {
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
          last_recorded: '2025-01-02T10:00:00.000Z',
        },
      ],
    });

    fsPromisesMock.readFile.mockResolvedValue(
      JSON.stringify({
        source_control: { topology: 'local_directory_only' },
        session: { last_backup: '2025-01-02T12:00:00.000Z' },
        current_task: { title: 'Implement X', status: 'in_progress' },
        working_memory: {
          pending: ['task 1', 'task 2', 'task 3'],
          decisions: ['decision 1', 'decision 2'],
        },
      })
    );

    const result = await getStatus();

    expect(result).toContain('Test Project');
    expect(result).toContain('Implement X');
    expect(result).toContain('in_progress');
    expect(result).toContain('task 1');
    expect(result).toContain('decision 1');
  });

  it('uses configured canonical state paths for self-hosting status output', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: 'agenticos',
      projects: [
        {
          id: 'agenticos',
          name: 'AgenticOS',
          path: '/workspace/projects/agenticos',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    fsPromisesMock.readFile
      .mockResolvedValueOnce(JSON.stringify({
        meta: { id: 'agenticos', name: 'AgenticOS' },
        source_control: { topology: 'local_directory_only' },
        agent_context: { current_state: 'standards/.context/state.yaml' },
      }))
      .mockResolvedValueOnce(JSON.stringify({
        current_task: { title: 'Canonical status', status: 'active' },
        working_memory: { pending: [], decisions: [] },
      }));

    const result = await getStatus();

    expect(fsPromisesMock.readFile).toHaveBeenCalledWith('/workspace/projects/agenticos/standards/.context/state.yaml', 'utf-8');
    expect(result).toContain('Canonical status');
  });

  it('handles project with no state.yaml', async () => {
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

    fsPromisesMock.readFile
      .mockResolvedValueOnce(JSON.stringify({
        source_control: { topology: 'local_directory_only' },
      }))
      .mockRejectedValue(new Error('ENOENT'));

    const result = await getStatus();

    expect(result).toContain('Failed to read state.yaml');
  });

  it('shows None for current task when not set', async () => {
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
          last_recorded: '2025-01-02T10:00:00.000Z',
        },
      ],
    });

    fsPromisesMock.readFile.mockResolvedValue(
      JSON.stringify({
        source_control: { topology: 'local_directory_only' },
        session: { last_backup: '2025-01-02T12:00:00.000Z' },
        working_memory: { pending: [], decisions: [] },
      })
    );

    const result = await getStatus();

    expect(result).toContain('None');
    expect(result).toContain('Test Project');
  });

  it('shows a friendly guardrail placeholder when no guardrail evidence exists', async () => {
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

    fsPromisesMock.readFile.mockResolvedValue(
      JSON.stringify({
        source_control: { topology: 'local_directory_only' },
        session: { last_backup: '2025-01-02T12:00:00.000Z' },
        working_memory: { pending: [], decisions: [] },
      })
    );

    const result = await getStatus();

    expect(result).toContain('🛡️ Latest guardrail: None recorded');
  });

  it('shows the latest BLOCK guardrail summary and reason', async () => {
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

    fsPromisesMock.readFile.mockResolvedValue(
      JSON.stringify({
        source_control: { topology: 'local_directory_only' },
        session: { last_backup: '2025-01-02T12:00:00.000Z' },
        working_memory: { pending: [], decisions: [] },
        guardrail_evidence: {
          updated_at: '2025-01-02T13:00:00.000Z',
          last_command: 'agenticos_preflight',
          preflight: {
            command: 'agenticos_preflight',
            recorded_at: '2025-01-02T13:00:00.000Z',
            issue_id: '74',
            result: {
              status: 'BLOCK',
              block_reasons: ['branch includes unrelated commits relative to origin/main'],
            },
          },
        },
      })
    );

    const result = await getStatus();

    expect(result).toContain('agenticos_preflight -> BLOCK');
    expect(result).toContain('Issue: #74');
    expect(result).toContain('branch includes unrelated commits');
  });

  it('shows the latest REDIRECT guardrail summary and redirect action', async () => {
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

    fsPromisesMock.readFile.mockResolvedValue(
      JSON.stringify({
        source_control: { topology: 'local_directory_only' },
        session: { last_backup: '2025-01-02T12:00:00.000Z' },
        working_memory: { pending: [], decisions: [] },
        guardrail_evidence: {
          updated_at: '2025-01-02T14:00:00.000Z',
          last_command: 'agenticos_preflight',
          preflight: {
            command: 'agenticos_preflight',
            recorded_at: '2025-01-02T14:00:00.000Z',
            issue_id: '74',
            result: {
              status: 'REDIRECT',
              redirect_actions: ['create an isolated issue branch/worktree before implementation'],
            },
          },
        },
      })
    );

    const result = await getStatus();

    expect(result).toContain('agenticos_preflight -> REDIRECT');
    expect(result).toContain('create an isolated issue branch/worktree');
  });

  it('refuses status for an archived active project', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: 'archived-project',
      projects: [
        {
          id: 'archived-project',
          name: 'Archived Project',
          path: '/test/path',
          status: 'archived' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    fsPromisesMock.readFile.mockResolvedValue(
      JSON.stringify({
        archive_contract: {
          version: 1,
          kind: 'archived_reference',
          managed_project: false,
          execution_mode: 'reference_only',
          replacement_project: 'agenticos-standards',
        },
      })
    );

    const result = await getStatus();

    expect(result).toContain('archived reference content');
    expect(result).toContain('agenticos-standards');
  });

  it('refuses status for an active project that has not completed topology initialization', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: 'legacy-project',
      projects: [
        {
          id: 'legacy-project',
          name: 'Legacy Project',
          path: '/test/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    fsPromisesMock.readFile.mockResolvedValue(JSON.stringify({
      meta: { id: 'legacy-project', name: 'Legacy Project' },
    }));

    const result = await getStatus();

    expect(result).toContain('has not completed source-control topology initialization');
  });
});
