import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// yamlMock MUST be defined with vi.hoisted so it's available at vi.mock hoisting time
const yamlMock = vi.hoisted(() => ({
  parse: vi.fn(),
  stringify: vi.fn((obj: unknown) => JSON.stringify(obj)),
}));
const loadLatestGuardrailStateMock = vi.hoisted(() => vi.fn());

// Mock modules
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  stat: vi.fn(),
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
  generateClaudeMd: vi.fn(() => '# CLAUDE.md\n\nMocked'),
  generateAgentsMd: vi.fn(() => '# AGENTS.md\n\nMocked'),
  updateClaudeMdState: vi.fn().mockResolvedValue({ updated: true, created: false }),
  upgradeClaudeMd: vi.fn(() => '# CLAUDE.md\n\nUpgraded'),
  CURRENT_TEMPLATE_VERSION: 2,
  extractTemplateVersion: vi.fn(() => 2),
}));

vi.mock('../../utils/guardrail-evidence.js', () => ({
  loadLatestGuardrailState: loadLatestGuardrailStateMock,
}));

import { switchProject, listProjects, getStatus } from '../project.js';
import * as fsPromises from 'fs/promises';
import * as registry from '../../utils/registry.js';
import * as distill from '../../utils/distill.js';
import * as fs from 'fs';
import { bindSessionProject, clearSessionProjectBinding } from '../../utils/session-context.js';

const fsPromisesMock = fsPromises as typeof fsPromises & {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
};
const registryMock = registry as typeof registry & {
  loadRegistry: ReturnType<typeof vi.fn>;
  patchProjectMetadata: ReturnType<typeof vi.fn>;
};
const distillMock = distill as typeof distill & {
  extractTemplateVersion: ReturnType<typeof vi.fn>;
};
const fsMock = fs as typeof fs & { existsSync: ReturnType<typeof vi.fn> };

function mockStatusReads(projectYaml: unknown, state: unknown | Error = {}): void {
  fsPromisesMock.readFile.mockImplementation(async (path: string) => {
    if (path.endsWith('/.project.yaml')) {
      return JSON.stringify(projectYaml);
    }
    if (state instanceof Error) {
      throw state;
    }
    return JSON.stringify(state);
  });
  if (state instanceof Error) {
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: null,
      state: {},
      state_path: null,
    });
    return;
  }
  loadLatestGuardrailStateMock.mockResolvedValue({
    source: 'committed',
    state,
    state_path: '/mock/state.yaml',
  });
}

describe('switchProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionProjectBinding();
    // By default, mock existsSync to return false (no CLAUDE.md/AGENTS.md)
    fsMock.existsSync.mockReturnValue(false);
    yamlMock.parse.mockImplementation((content: string) => {
      try { return JSON.parse(content); } catch { return undefined; }
    });
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: null,
      state: {},
      state_path: null,
    });
    fsPromisesMock.readFile.mockResolvedValue(JSON.stringify({
      meta: { description: '' },
      source_control: { topology: 'local_directory_only' },
    }));
  });

  afterEach(() => {
    clearSessionProjectBinding();
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
    expect(registryMock.patchProjectMetadata).toHaveBeenCalled();
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

  it('returns a topology initialization error when project metadata cannot be read', async () => {
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
    fsPromisesMock.readFile.mockRejectedValue(new Error('missing project yaml'));

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('has not completed source-control topology initialization');
  });

  it('returns a topology initialization error when project metadata parses to null', async () => {
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
    fsPromisesMock.readFile.mockResolvedValue('null');

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('has not completed source-control topology initialization');
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

    expect(registryMock.patchProjectMetadata).toHaveBeenCalledWith(
      'my-project',
      expect.objectContaining({
        last_accessed: expect.any(String),
      }),
    );
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

  it('upgrades stale CLAUDE.md and AGENTS.md templates when both files already exist', async () => {
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

    fsMock.existsSync.mockReturnValue(true);
    distillMock.extractTemplateVersion.mockReturnValue(1);
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: { description: '' },
          source_control: { topology: 'local_directory_only' },
        });
      }
      if (path.endsWith('/.context/state.yaml')) {
        return JSON.stringify({
          working_memory: { pending: [], decisions: [] },
        });
      }
      if (path.endsWith('/.context/quick-start.md')) {
        return '# Quick Start\n\nProject summary';
      }
      if (path.endsWith('/CLAUDE.md')) {
        return '# CLAUDE.md\n\nOld';
      }
      if (path.endsWith('/AGENTS.md')) {
        return '# AGENTS.md\n\nOld';
      }
      return '';
    });

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('📝 CLAUDE.md upgraded: v1 → v2 (user content preserved)');
    expect(result).toContain('📝 AGENTS.md upgraded: v1 → v2');
    expect(fsPromisesMock.writeFile).toHaveBeenCalledWith(
      '/test/path/CLAUDE.md',
      expect.any(String),
      'utf-8',
    );
    expect(fsPromisesMock.writeFile).toHaveBeenCalledWith(
      '/test/path/AGENTS.md',
      expect.any(String),
      'utf-8',
    );
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

  it('shows no guardrail when last command is preflight but the runtime slot is missing', async () => {
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
      .mockResolvedValueOnce(JSON.stringify({
        working_memory: { pending: [], decisions: [] },
      }))
      .mockResolvedValueOnce('# Quick Start\n\nProject summary');
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/home/testuser/AgenticOS/.agent-workspace/projects/my-project/guardrail-state.yaml',
      state: {
        guardrail_evidence: {
          last_command: 'agenticos_preflight',
        },
      },
    });

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('🛡️ Latest guardrail: None recorded');
  });

  it('shows no guardrail when last command is branch bootstrap but the runtime slot is missing', async () => {
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
      .mockResolvedValueOnce(JSON.stringify({
        working_memory: { pending: [], decisions: [] },
      }))
      .mockResolvedValueOnce('# Quick Start\n\nProject summary');
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/home/testuser/AgenticOS/.agent-workspace/projects/my-project/guardrail-state.yaml',
      state: {
        guardrail_evidence: {
          last_command: 'agenticos_branch_bootstrap',
        },
      },
    });

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('🛡️ Latest guardrail: None recorded');
  });

  it('shows no guardrail when last command is pr-scope-check but the runtime slot is missing', async () => {
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
      .mockResolvedValueOnce(JSON.stringify({
        working_memory: { pending: [], decisions: [] },
      }))
      .mockResolvedValueOnce('# Quick Start\n\nProject summary');
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/home/testuser/AgenticOS/.agent-workspace/projects/my-project/guardrail-state.yaml',
      state: {
        guardrail_evidence: {
          last_command: 'agenticos_pr_scope_check',
        },
      },
    });

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

    const guardrailState = {
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
    };
    fsPromisesMock.readFile.mockResolvedValue(
      JSON.stringify({
        meta: { description: '' },
        source_control: { topology: 'local_directory_only' },
        ...guardrailState,
      })
    );
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state: guardrailState,
      state_path: '/home/testuser/AgenticOS/.agent-workspace/projects/my-project/guardrail-state.yaml',
    });

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('agenticos_preflight -> REDIRECT');
    expect(result).toContain('Issue: #76');
    expect(result).toContain('create an isolated issue branch/worktree');
  });

  it('shows the latest issue bootstrap summary in switch output when evidence exists', async () => {
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
      .mockResolvedValueOnce(JSON.stringify({
        working_memory: { pending: [], decisions: [] },
        issue_bootstrap: {
          updated_at: '2025-01-02T15:00:00.000Z',
          latest: {
            issue_id: '179',
            issue_title: 'Implement bootstrap evidence',
            recorded_at: '2025-01-02T15:00:00.000Z',
            current_branch: 'feat/179-issue-start-bootstrap-evidence',
            startup_context_paths: ['.project.yaml', '.context/quick-start.md'],
            additional_context: [{ path: 'knowledge/issue-158.md', reason: 'design reference' }],
          },
        },
      }))
      .mockResolvedValueOnce('# Quick Start\n\nProject summary');
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state: {
        issue_bootstrap: {
          updated_at: '2025-01-02T15:00:00.000Z',
          latest: {
            issue_id: '179',
            issue_title: 'Implement bootstrap evidence',
            recorded_at: '2025-01-02T15:00:00.000Z',
            current_branch: 'feat/179-issue-start-bootstrap-evidence',
            startup_context_paths: ['.project.yaml', '.context/quick-start.md'],
            additional_context: [{ path: 'knowledge/issue-158.md', reason: 'design reference' }],
          },
        },
      },
      state_path: '/home/testuser/AgenticOS/.agent-workspace/projects/my-project/guardrail-state.yaml',
    });

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('🧭 Latest issue bootstrap: #179 on feat/179-issue-start-bootstrap-evidence');
    expect(result).toContain('Title: Implement bootstrap evidence');
    expect(result).toContain('2 startup surface(s), 1 additional context document(s)');
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

  it('marks stale committed github-versioned switch context explicitly', async () => {
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
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
          github_repo: 'madlouse/AgenticOS',
          branch_strategy: 'github_flow',
        },
        execution: {
          source_repo_roots: ['.'],
        },
        agent_context: {
          quick_start: 'standards/.context/quick-start.md',
          current_state: 'standards/.context/state.yaml',
        },
      }))
      .mockResolvedValueOnce(JSON.stringify({
        current_task: { title: 'Implement #262 concurrent runtime project resolution', status: 'in_progress' },
        working_memory: { pending: [], decisions: [] },
        entry_surface_refresh: { refreshed_at: '2025-01-02T12:00:00.000Z', status: 'in_progress' },
        issue_bootstrap: {
          latest: {
            issue_id: '260',
            current_branch: 'fix/260-stop-active-project-drift-and-main-state-pollution',
            workspace_type: 'isolated_worktree',
            repo_path: '/tmp/worktrees/issue-260',
          },
        },
      }))
      .mockResolvedValueOnce('# Quick Start\n\nCanonical quick start');
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/home/testuser/AgenticOS/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          latest: {
            issue_id: '260',
            current_branch: 'fix/260-stop-active-project-drift-and-main-state-pollution',
            workspace_type: 'isolated_worktree',
            repo_path: '/tmp/worktrees/issue-260',
          },
        },
      },
    });

    const result = await switchProject({ project: 'agenticos' });

    expect(result).toContain('⚠️ Committed snapshot: stale for canonical mainline use');
    expect(result).toContain('🛡️ Latest committed guardrail snapshot: freshness not proven');
    expect(result).toContain('🧭 Latest committed issue bootstrap snapshot: #260 on fix/260-stop-active-project-drift-and-main-state-pollution');
    expect(result).toContain('🎯 Current committed task snapshot: Implement #262 concurrent runtime project resolution (in_progress)');
  });

  it('prefers runtime guardrail and bootstrap summaries in switch output', async () => {
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
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
          github_repo: 'madlouse/AgenticOS',
          branch_strategy: 'github_flow',
        },
        execution: {
          source_repo_roots: ['.'],
        },
        agent_context: {
          quick_start: 'standards/.context/quick-start.md',
          current_state: 'standards/.context/state.yaml',
        },
      }))
      .mockResolvedValueOnce(JSON.stringify({
        current_task: { title: 'Canonical state', status: 'active' },
        working_memory: { pending: [], decisions: [] },
        issue_bootstrap: {
          latest: {
            issue_id: '236',
            current_branch: 'chore/236-old-bootstrap',
          },
        },
      }))
      .mockResolvedValueOnce('# Quick Start\n\nCanonical quick start');
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/home/testuser/AgenticOS/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {
        guardrail_evidence: {
          last_command: 'agenticos_preflight',
          updated_at: '2025-01-03T15:00:00.000Z',
          preflight: {
            command: 'agenticos_preflight',
            recorded_at: '2025-01-03T15:00:00.000Z',
            issue_id: '294',
            result: { status: 'PASS', summary: 'runtime preflight passed' },
          },
        },
        issue_bootstrap: {
          latest: {
            issue_id: '294',
            current_branch: 'chore/294-eliminate-canonical-main-runtime-write-paths',
          },
        },
      },
    });

    const result = await switchProject({ project: 'agenticos' });

    expect(result).toContain('Issue: #294');
    expect(result).toContain('#294 on chore/294-eliminate-canonical-main-runtime-write-paths');
    expect(result).not.toContain('#236 on chore/236-old-bootstrap');
  });

  it('shows branch bootstrap guardrail summaries with fallback timestamp text', async () => {
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
      .mockResolvedValueOnce(JSON.stringify({
        working_memory: { pending: [], decisions: [] },
      }))
      .mockResolvedValueOnce('# Quick Start\n\nProject summary');
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/home/testuser/AgenticOS/.agent-workspace/projects/my-project/guardrail-state.yaml',
      state: {
        guardrail_evidence: {
          last_command: 'agenticos_branch_bootstrap',
          updated_at: 'not-a-date',
          branch_bootstrap: {
            command: 'agenticos_branch_bootstrap',
            result: {
              status: 'CREATED',
              branch_name: 'feat/71-runtime-guardrails',
            },
          },
        },
      },
    });

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('agenticos_branch_bootstrap -> CREATED (Unknown time)');
    expect(result).toContain('Detail: created feat/71-runtime-guardrails');
  });

  it('shows pr-scope guardrail summaries and preserves summary text', async () => {
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
      .mockResolvedValueOnce(JSON.stringify({
        working_memory: { pending: [], decisions: [] },
      }))
      .mockResolvedValueOnce('# Quick Start\n\nProject summary');
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/home/testuser/AgenticOS/.agent-workspace/projects/my-project/guardrail-state.yaml',
      state: {
        guardrail_evidence: {
          last_command: 'agenticos_pr_scope_check',
          pr_scope_check: {
            command: 'agenticos_pr_scope_check',
            recorded_at: '2025-01-03T10:00:00.000Z',
            issue_id: '88',
            result: {
              status: 'PASS',
              summary: 'diff scope matches declared issue boundary',
            },
          },
        },
      },
    });

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('agenticos_pr_scope_check -> PASS');
    expect(result).toContain('Issue: #88');
    expect(result).toContain('diff scope matches declared issue boundary');
  });

  it('shows unknown guardrail status when the latest entry has no result payload', async () => {
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
      .mockResolvedValueOnce(JSON.stringify({
        working_memory: { pending: [], decisions: [] },
      }))
      .mockResolvedValueOnce('# Quick Start\n\nProject summary');
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/home/testuser/AgenticOS/.agent-workspace/projects/my-project/guardrail-state.yaml',
      state: {
        guardrail_evidence: {
          last_command: 'agenticos_preflight',
          preflight: {
            command: 'agenticos_preflight',
          },
        },
      },
    });

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('agenticos_preflight -> UNKNOWN (Unknown time)');
  });

  it('uses branch bootstrap notes when no branch name is recorded', async () => {
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
      .mockResolvedValueOnce(JSON.stringify({
        working_memory: { pending: [], decisions: [] },
      }))
      .mockResolvedValueOnce('# Quick Start\n\nProject summary');
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/home/testuser/AgenticOS/.agent-workspace/projects/my-project/guardrail-state.yaml',
      state: {
        guardrail_evidence: {
          last_command: 'agenticos_branch_bootstrap',
          branch_bootstrap: {
            command: 'agenticos_branch_bootstrap',
            result: {
              status: 'CREATED',
              notes: ['created worktree without explicit branch label'],
            },
          },
        },
      },
    });

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('created worktree without explicit branch label');
  });

  it('omits guardrail detail when the latest entry has no detail-bearing fields', async () => {
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
      .mockResolvedValueOnce(JSON.stringify({
        working_memory: { pending: [], decisions: [] },
      }))
      .mockResolvedValueOnce('# Quick Start\n\nProject summary');
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/home/testuser/AgenticOS/.agent-workspace/projects/my-project/guardrail-state.yaml',
      state: {
        guardrail_evidence: {
          last_command: 'agenticos_preflight',
          preflight: {
            command: 'agenticos_preflight',
            recorded_at: '2025-01-03T10:00:00.000Z',
            result: {
              status: 'PASS',
            },
          },
        },
      },
    });

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('agenticos_preflight -> PASS');
    expect(result).not.toContain('Detail:');
  });

  it('shows unknown issue bootstrap labels when issue metadata is missing', async () => {
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
      .mockResolvedValueOnce(JSON.stringify({
        working_memory: { pending: [], decisions: [] },
      }))
      .mockResolvedValueOnce('# Quick Start\n\nProject summary');
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/home/testuser/AgenticOS/.agent-workspace/projects/my-project/guardrail-state.yaml',
      state: {
        issue_bootstrap: {
          updated_at: 'bad-date',
          latest: {},
        },
      },
    });

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('🧭 Latest issue bootstrap: unknown issue (Unknown time)');
  });

  it('surfaces a registry metadata patch warning during switch bootstrap', async () => {
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
    registryMock.patchProjectMetadata.mockRejectedValue(new Error('registry busy'));
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: { description: '' },
          source_control: { topology: 'local_directory_only' },
        });
      }
      if (path.endsWith('/.context/quick-start.md')) {
        return '# Only headings\n- ignored';
      }
      return JSON.stringify({});
    });

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('⚠️ Session bound, but registry metadata was not updated: registry busy');
  });

  it('falls back to committed switch state when runtime guardrail loading fails', async () => {
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
      .mockResolvedValueOnce(JSON.stringify({
        working_memory: { pending: [], decisions: [] },
        issue_bootstrap: {
          latest: {
            issue_id: '179',
            current_branch: 'feat/179-issue-start-bootstrap-evidence',
          },
        },
      }))
      .mockResolvedValueOnce('# Quick Start\n\nProject summary');
    loadLatestGuardrailStateMock.mockRejectedValue(new Error('runtime unavailable'));

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('#179 on feat/179-issue-start-bootstrap-evidence');
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

  it('does not infer a project summary from heading-only quick-start content and falls back task status to unknown', async () => {
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
      .mockResolvedValueOnce(JSON.stringify({
        current_task: {
          title: 'Runtime-only summary',
        },
        working_memory: {
          pending: [],
          decisions: [],
        },
      }))
      .mockResolvedValueOnce('# Quick Start\n\n# Heading Only\n- ignored bullet');

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('🎯 Current task: Runtime-only summary (unknown)');
    expect(result).not.toContain('📖 Project summary:');
  });

  it('switches successfully when committed state and quick-start files are missing', async () => {
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
    fsMock.existsSync.mockReturnValue(true);
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: { description: '' },
          source_control: { topology: 'local_directory_only' },
        });
      }
      if (path.endsWith('/CLAUDE.md')) {
        return '# CLAUDE.md\n\nCurrent';
      }
      if (path.endsWith('/AGENTS.md')) {
        return '# AGENTS.md\n\nCurrent';
      }
      throw new Error(`missing: ${path}`);
    });

    const result = await switchProject({ project: 'my-project' });

    expect(result).toContain('✅ Switched to project "My Project"');
    expect(result).not.toContain('📝');
  });

  it('surfaces the public_distilled transcript contract in switch output', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [
        {
          id: 'public-project',
          name: 'Public Project',
          path: '/test/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    fsPromisesMock.readFile
      .mockResolvedValueOnce(JSON.stringify({
        meta: { description: 'Public distilled project' },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
          github_repo: 'example/public-project',
          branch_strategy: 'github_flow',
        },
        execution: {
          source_repo_roots: ['.'],
        },
      }))
      .mockResolvedValueOnce(JSON.stringify({
        working_memory: { pending: [], decisions: [] },
      }))
      .mockResolvedValueOnce('# Quick Start\n\nPublic distilled summary');

    const result = await switchProject({ project: 'public-project' });

    expect(result).toContain('🔒 Raw transcripts: `.private/conversations/`');
    expect(result).toContain('Git recovery is distilled-only');
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
    expect(registryMock.patchProjectMetadata).not.toHaveBeenCalled();
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
    expect(registryMock.patchProjectMetadata).not.toHaveBeenCalled();
  });
});

describe('listProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionProjectBinding();
  });

  afterEach(() => {
    clearSessionProjectBinding();
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
    bindSessionProject({
      projectId: 'project-a',
      projectName: 'Project A',
      projectPath: '/path/a',
    });

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
    clearSessionProjectBinding();
    // Set up yamlMock.parse to handle JSON.parse, fall back to undefined
    yamlMock.parse.mockImplementation((content: string) => {
      try { return JSON.parse(content); } catch { return undefined; }
    });
  });

  afterEach(() => {
    clearSessionProjectBinding();
    vi.restoreAllMocks();
  });

  it('returns error when no session project and no fallback project are available', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [],
    });

    const result = await getStatus();

    expect(result).toContain('No project provided and no session project is bound');
    expect(result).toContain('agenticos_switch');
  });

  it('ignores a populated legacy registry active_project when no session project is bound', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: 'non-existent',
      projects: [],
    });

    const result = await getStatus();

    expect(result).toContain('No project provided and no session project is bound');
  });

  it('returns status for the resolved session project', async () => {
    bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/test/path',
    });

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

    mockStatusReads(
      {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: { topology: 'local_directory_only' },
      },
      {
        source_control: { topology: 'local_directory_only' },
        session: { last_backup: '2025-01-02T12:00:00.000Z' },
        current_task: { title: 'Implement X', status: 'in_progress' },
        working_memory: {
          pending: ['task 1', 'task 2', 'task 3'],
          decisions: ['decision 1', 'decision 2'],
        },
      }
    );

    const result = await getStatus();

    expect(result).toContain('Test Project');
    expect(result).toContain('Implement X');
    expect(result).toContain('in_progress');
    expect(result).toContain('task 1');
    expect(result).toContain('decision 1');
  });

  it('uses configured canonical state paths for self-hosting status output', async () => {
    bindSessionProject({
      projectId: 'agenticos',
      projectName: 'AgenticOS',
      projectPath: '/workspace/projects/agenticos',
    });

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

    mockStatusReads(
      {
        meta: { id: 'agenticos', name: 'AgenticOS' },
        source_control: { topology: 'local_directory_only' },
        agent_context: { current_state: 'standards/.context/state.yaml' },
      },
      {
        current_task: { title: 'Canonical status', status: 'active' },
        working_memory: { pending: [], decisions: [] },
      }
    );

    const result = await getStatus();

    expect(fsPromisesMock.readFile).toHaveBeenCalledWith('/workspace/projects/agenticos/standards/.context/state.yaml', 'utf-8');
    expect(result).toContain('Canonical status');
  });

  it('handles project with no state.yaml', async () => {
    bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/test/path',
    });

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

    mockStatusReads(
      {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: { topology: 'local_directory_only' },
      },
      new Error('ENOENT')
    );

    const result = await getStatus();

    expect(result).toContain('Failed to read state.yaml');
  });

  it('shows None for current task when not set', async () => {
    bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/test/path',
    });

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

    mockStatusReads(
      {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: { topology: 'local_directory_only' },
      },
      {
        source_control: { topology: 'local_directory_only' },
        session: { last_backup: '2025-01-02T12:00:00.000Z' },
        working_memory: { pending: [], decisions: [] },
      }
    );

    const result = await getStatus();

    expect(result).toContain('None');
    expect(result).toContain('Test Project');
  });

  it('shows a friendly guardrail placeholder when no guardrail evidence exists', async () => {
    bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/test/path',
    });

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

    mockStatusReads(
      {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: { topology: 'local_directory_only' },
      },
      {
        source_control: { topology: 'local_directory_only' },
        session: { last_backup: '2025-01-02T12:00:00.000Z' },
        working_memory: { pending: [], decisions: [] },
      }
    );

    const result = await getStatus();

    expect(result).toContain('🛡️ Latest guardrail: None recorded');
  });

  it('shows a friendly issue bootstrap placeholder when no issue bootstrap evidence exists', async () => {
    bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/test/path',
    });

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

    mockStatusReads(
      {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: { topology: 'local_directory_only' },
      },
      {
        source_control: { topology: 'local_directory_only' },
        session: { last_backup: '2025-01-02T12:00:00.000Z' },
        working_memory: { pending: [], decisions: [] },
      }
    );

    const result = await getStatus();

    expect(result).toContain('🧭 Latest issue bootstrap: None recorded');
  });

  it('shows the latest issue bootstrap summary in status output when evidence exists', async () => {
    bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/test/path',
    });

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

    mockStatusReads(
      {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: { topology: 'local_directory_only' },
      },
      {
        source_control: { topology: 'local_directory_only' },
        session: { last_backup: '2025-01-02T12:00:00.000Z' },
        working_memory: { pending: [], decisions: [] },
        issue_bootstrap: {
          updated_at: '2025-01-02T15:00:00.000Z',
          latest: {
            issue_id: '179',
            issue_title: 'Implement bootstrap evidence',
            recorded_at: '2025-01-02T15:00:00.000Z',
            current_branch: 'feat/179-issue-start-bootstrap-evidence',
            startup_context_paths: ['.project.yaml', '.context/quick-start.md'],
            additional_context: [{ path: 'knowledge/issue-158.md', reason: 'design reference' }],
          },
        },
      }
    );

    const result = await getStatus();

    expect(result).toContain('🧭 Latest issue bootstrap: #179 on feat/179-issue-start-bootstrap-evidence');
    expect(result).toContain('Title: Implement bootstrap evidence');
  });

  it('prefers runtime guardrail and bootstrap summaries in status output', async () => {
    bindSessionProject({
      projectId: 'agenticos',
      projectName: 'AgenticOS',
      projectPath: '/workspace/projects/agenticos',
    });

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

    mockStatusReads(
      {
        meta: { id: 'agenticos', name: 'AgenticOS' },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
          github_repo: 'madlouse/AgenticOS',
          branch_strategy: 'github_flow',
        },
        execution: {
          source_repo_roots: ['.'],
        },
      },
      {
        current_task: { title: 'Canonical status', status: 'active' },
        working_memory: { pending: [], decisions: [] },
        issue_bootstrap: {
          latest: {
            issue_id: '236',
            current_branch: 'chore/236-old-bootstrap',
          },
        },
      }
    );
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'runtime',
      state_path: '/home/testuser/AgenticOS/.agent-workspace/projects/agenticos/guardrail-state.yaml',
      state: {
        guardrail_evidence: {
          last_command: 'agenticos_preflight',
          updated_at: '2025-01-03T15:00:00.000Z',
          preflight: {
            command: 'agenticos_preflight',
            recorded_at: '2025-01-03T15:00:00.000Z',
            issue_id: '294',
            result: { status: 'PASS', summary: 'runtime preflight passed' },
          },
        },
        issue_bootstrap: {
          latest: {
            issue_id: '294',
            current_branch: 'chore/294-eliminate-canonical-main-runtime-write-paths',
          },
        },
      },
    });

    const result = await getStatus();

    expect(result).toContain('Issue: #294');
    expect(result).toContain('#294 on chore/294-eliminate-canonical-main-runtime-write-paths');
    expect(result).not.toContain('#236 on chore/236-old-bootstrap');
  });

  it('falls back to committed status state when runtime guardrail loading fails', async () => {
    bindSessionProject({
      projectId: 'my-project',
      projectName: 'My Project',
      projectPath: '/test/path',
    });

    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: 'my-project',
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

    mockStatusReads(
      {
        meta: { id: 'my-project', name: 'My Project' },
        source_control: { topology: 'local_directory_only' },
      },
      {
        working_memory: { pending: [], decisions: [] },
        issue_bootstrap: {
          latest: {
            issue_id: '179',
            current_branch: 'feat/179-issue-start-bootstrap-evidence',
          },
        },
      }
    );
    loadLatestGuardrailStateMock.mockRejectedValue(new Error('runtime unavailable'));

    const result = await getStatus();

    expect(result).toContain('#179 on feat/179-issue-start-bootstrap-evidence');
  });

  it('treats a null parsed status state as an empty state object', async () => {
    bindSessionProject({
      projectId: 'my-project',
      projectName: 'My Project',
      projectPath: '/test/path',
    });

    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: 'my-project',
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

    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: { id: 'my-project', name: 'My Project' },
          source_control: { topology: 'local_directory_only' },
        });
      }
      return 'null';
    });
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: 'committed',
      state: {},
      state_path: '/mock/state.yaml',
    });

    const result = await getStatus();

    expect(result).toContain('🎯 Current task: None');
  });

  it('uses task fallback labels when status task metadata is incomplete', async () => {
    bindSessionProject({
      projectId: 'my-project',
      projectName: 'My Project',
      projectPath: '/test/path',
    });

    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: 'my-project',
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

    mockStatusReads(
      {
        meta: { id: 'my-project', name: 'My Project' },
        source_control: { topology: 'local_directory_only' },
      },
      {
        current_task: {},
        working_memory: { pending: [], decisions: [] },
      }
    );

    const result = await getStatus();

    expect(result).toContain('🎯 Current task: Untitled (unknown)');
    expect(result).toContain('📋 Pending: None');
  });

  it('marks stale committed github-versioned status explicitly', async () => {
    bindSessionProject({
      projectId: 'agenticos',
      projectName: 'AgenticOS',
      projectPath: '/workspace/projects/agenticos',
    });

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

    mockStatusReads(
      {
        meta: { id: 'agenticos', name: 'AgenticOS' },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
          github_repo: 'madlouse/AgenticOS',
          branch_strategy: 'github_flow',
        },
        execution: {
          source_repo_roots: ['.'],
        },
      },
      {
        session: { last_backup: '2025-01-02T12:00:00.000Z', last_entry_surface_refresh: '2025-01-02T12:00:00.000Z' },
        current_task: { title: 'Implement #262 concurrent runtime project resolution', status: 'in_progress' },
        working_memory: { pending: [], decisions: [] },
        entry_surface_refresh: { refreshed_at: '2025-01-02T12:00:00.000Z', status: 'in_progress' },
        issue_bootstrap: {
          latest: {
            issue_id: '260',
            issue_title: 'Stop active-project drift',
            current_branch: 'fix/260-stop-active-project-drift-and-main-state-pollution',
            workspace_type: 'isolated_worktree',
            repo_path: '/tmp/worktrees/issue-260',
          },
        },
      }
    );

    const result = await getStatus();

    expect(result).toContain('⚠️ Committed snapshot: stale for canonical mainline use');
    expect(result).toContain('🛡️ Latest committed guardrail snapshot: freshness not proven');
    expect(result).toContain('🧭 Latest committed issue bootstrap snapshot: #260 on fix/260-stop-active-project-drift-and-main-state-pollution');
    expect(result).toContain('🎯 Current committed task snapshot: Implement #262 concurrent runtime project resolution (in_progress)');
  });

  it('surfaces the public_distilled transcript contract in status output', async () => {
    bindSessionProject({
      projectId: 'public-project',
      projectName: 'Public Project',
      projectPath: '/test/path',
    });

    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: 'public-project',
      projects: [
        {
          id: 'public-project',
          name: 'Public Project',
          path: '/test/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    mockStatusReads(
      {
        meta: { id: 'public-project', name: 'Public Project' },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
          github_repo: 'example/public-project',
          branch_strategy: 'github_flow',
        },
        execution: {
          source_repo_roots: ['.'],
        },
      },
      {
        session: { last_backup: '2025-01-02T12:00:00.000Z' },
        working_memory: { pending: [], decisions: [] },
      }
    );

    const result = await getStatus();

    expect(result).toContain('🔒 Raw transcripts: `.private/conversations/`');
    expect(result).toContain('Git recovery is distilled-only');
  });

  it('shows the latest BLOCK guardrail summary and reason', async () => {
    bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/test/path',
    });

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

    mockStatusReads(
      {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: { topology: 'local_directory_only' },
      },
      {
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
      }
    );

    const result = await getStatus();

    expect(result).toContain('agenticos_preflight -> BLOCK');
    expect(result).toContain('Issue: #74');
    expect(result).toContain('branch includes unrelated commits');
  });

  it('shows the latest REDIRECT guardrail summary and redirect action', async () => {
    bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/test/path',
    });

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

    mockStatusReads(
      {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: { topology: 'local_directory_only' },
      },
      {
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
      }
    );

    const result = await getStatus();

    expect(result).toContain('agenticos_preflight -> REDIRECT');
    expect(result).toContain('create an isolated issue branch/worktree');
  });

  it('refuses status for an archived active project', async () => {
    bindSessionProject({
      projectId: 'archived-project',
      projectName: 'Archived Project',
      projectPath: '/test/path',
    });

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

    mockStatusReads(
      {
        meta: { id: 'archived-project', name: 'Archived Project' },
        archive_contract: {
          version: 1,
          kind: 'archived_reference',
          managed_project: false,
          execution_mode: 'reference_only',
          replacement_project: 'agenticos-standards',
        },
      }
    );

    const result = await getStatus();

    expect(result).toContain('archived reference content');
    expect(result).toContain('agenticos-standards');
  });

  it('refuses status for an active project that has not completed topology initialization', async () => {
    bindSessionProject({
      projectId: 'legacy-project',
      projectName: 'Legacy Project',
      projectPath: '/test/path',
    });

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
