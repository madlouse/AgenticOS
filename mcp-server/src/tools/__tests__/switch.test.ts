import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// yamlMock MUST be defined with vi.hoisted so it's available at vi.mock hoisting time
const yamlMock = vi.hoisted(() => ({
  parse: vi.fn(),
  stringify: vi.fn((obj: unknown) => JSON.stringify(obj)),
}));
const loadLatestGuardrailStateMock = vi.hoisted(() => vi.fn());
const worktreeTopologyMock = vi.hoisted(() => ({
  deriveExpectedWorktreeRoot: vi.fn(() => '/home/testuser/AgenticOS/worktrees/project-1'),
  inspectProjectWorktreeTopology: vi.fn(),
}));

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

vi.mock('../../utils/worktree-topology.js', () => ({
  deriveExpectedWorktreeRoot: worktreeTopologyMock.deriveExpectedWorktreeRoot,
  inspectProjectWorktreeTopology: worktreeTopologyMock.inspectProjectWorktreeTopology,
}));

import { switchProject } from '../project.js';
import * as fsPromises from 'fs/promises';
import * as registry from '../../utils/registry.js';
import * as distill from '../../utils/distill.js';
import * as fs from 'fs';
import { bindSessionProject, clearSessionProjectBinding, getSessionProjectBinding } from '../../utils/session-context.js';

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

function buildRegistry(overrides: Record<string, unknown> = {}) {
  return {
    version: '1.0.0',
    last_updated: '2025-01-01T00:00:00.000Z',
    active_project: null,
    projects: [
      {
        id: 'test-project',
        name: 'Test Project',
        path: '/test/path',
        status: 'active' as const,
        created: '2025-01-01',
        last_accessed: '2025-01-01T00:00:00.000Z',
        last_recorded: '2025-01-03T08:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

function mockDefaultReads(projectYaml?: Record<string, unknown>, state?: Record<string, unknown>): void {
  const py = projectYaml || {
    meta: { description: 'Test project description' },
    source_control: { topology: 'local_directory_only' },
  };
  const st = state || {
    current_task: { title: 'Test task', status: 'in_progress' },
    working_memory: { pending: ['Next step'], decisions: ['Made a choice'] },
  };
  fsPromisesMock.readFile.mockImplementation(async (path: string) => {
    if (path.endsWith('/.project.yaml')) {
      return JSON.stringify(py);
    }
    if (path.endsWith('/state.yaml')) {
      return JSON.stringify(st);
    }
    if (path.endsWith('/quick-start.md')) {
      return '# Quick Start\n\nTest quick start content.\n\nBody text here.';
    }
    return '';
  });
}

describe('switchProject — agenticos_switch tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionProjectBinding();
    fsMock.existsSync.mockReturnValue(false);
    yamlMock.parse.mockImplementation((content: string) => {
      try { return JSON.parse(content); } catch { return undefined; }
    });
    yamlMock.stringify.mockImplementation((obj: unknown) => JSON.stringify(obj));
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: null,
      state: {},
      state_path: null,
    });
    worktreeTopologyMock.inspectProjectWorktreeTopology.mockResolvedValue({
      applies: true,
      status: 'PASS',
      summary: 'Worktree topology matches the derived project-scoped root.',
      expected_worktree_root: '/home/testuser/AgenticOS/worktrees/project-1',
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
    clearSessionProjectBinding();
    vi.restoreAllMocks();
  });

  describe('explicit project selection', () => {
    it('returns success message with project name and path on happy path', async () => {
      registryMock.loadRegistry.mockResolvedValue(buildRegistry());
      mockDefaultReads();

      const result = await switchProject({ project: 'test-project' });

      expect(result).toContain('✅ Switched to project "Test Project"');
      expect(result).toContain('Path: /test/path');
      expect(result).toContain('Status: active');
    });

    it('finds project by name', async () => {
      registryMock.loadRegistry.mockResolvedValue(buildRegistry());
      mockDefaultReads();

      const result = await switchProject({ project: 'Test Project' });

      expect(result).toContain('✅ Switched to project "Test Project"');
    });

    it('finds project by id', async () => {
      registryMock.loadRegistry.mockResolvedValue(buildRegistry());
      mockDefaultReads();

      const result = await switchProject({ project: 'test-project' });

      expect(result).toContain('✅ Switched to project "Test Project"');
    });
  });

  describe('session binding after explicit selection', () => {
    it('binds session project after successful switch', async () => {
      registryMock.loadRegistry.mockResolvedValue(buildRegistry());
      mockDefaultReads();

      await switchProject({ project: 'test-project' });

      const binding = getSessionProjectBinding();
      expect(binding).not.toBeNull();
      expect(binding!.projectId).toBe('test-project');
      expect(binding!.projectName).toBe('Test Project');
      expect(binding!.projectPath).toBe('/test/path');
    });

    it('updates last_accessed timestamp in registry', async () => {
      registryMock.loadRegistry.mockResolvedValue(buildRegistry({
        projects: [{
          id: 'test-project',
          name: 'Test Project',
          path: '/test/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2020-01-01T00:00:00.000Z',
        }],
      }));
      mockDefaultReads();

      await switchProject({ project: 'test-project' });

      expect(registryMock.patchProjectMetadata).toHaveBeenCalledWith(
        'test-project',
        expect.objectContaining({ last_accessed: expect.any(String) }),
      );
    });
  });

  describe('registry fallback when no session binding', () => {
    it('switches using registry even when no session project is bound', async () => {
      clearSessionProjectBinding();
      registryMock.loadRegistry.mockResolvedValue(buildRegistry());
      mockDefaultReads();

      const result = await switchProject({ project: 'test-project' });

      expect(result).toContain('✅ Switched to project "Test Project"');
    });

    it('ignores legacy registry active_project when session project is not bound', async () => {
      clearSessionProjectBinding();
      registryMock.loadRegistry.mockResolvedValue(buildRegistry({
        active_project: 'non-existent',
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
      }));
      mockDefaultReads();

      const result = await switchProject({ project: 'test-project' });

      expect(result).toContain('✅ Switched to project "Test Project"');
    });
  });

  describe('error on missing/invalid project', () => {
    it('returns error listing available projects when project not found', async () => {
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

      expect(result).toContain('❌ Project "non-existent" not found');
      expect(result).toContain('Available projects:');
      expect(result).toContain('Project A (project-a)');
      expect(result).toContain('Project B (project-b)');
    });

    it('returns error when registry has no projects', async () => {
      registryMock.loadRegistry.mockResolvedValue({
        version: '1.0.0',
        last_updated: '2025-01-01T00:00:00.000Z',
        active_project: null,
        projects: [],
      });

      const result = await switchProject({ project: 'anything' });

      expect(result).toContain('❌ Project "anything" not found');
      expect(result).toContain('Available projects:');
    });

    it('refuses archived reference projects', async () => {
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
      fsPromisesMock.readFile.mockResolvedValue(JSON.stringify({
        meta: { name: 'Archived Project' },
        archive_contract: {
          version: 1,
          kind: 'archived_reference',
          managed_project: false,
          execution_mode: 'reference_only',
          replacement_project: 'agenticos-standards',
        },
      }));

      const result = await switchProject({ project: 'archived-project' });

      expect(result).toContain('is archived reference content');
      expect(result).toContain('agenticos-standards');
    });

    it('refuses projects without topology initialization', async () => {
      registryMock.loadRegistry.mockResolvedValue(buildRegistry());
      fsPromisesMock.readFile.mockResolvedValue(JSON.stringify({
        meta: { id: 'test-project', name: 'Test Project' },
      }));

      const result = await switchProject({ project: 'test-project' });

      expect(result).toContain('has not completed source-control topology initialization');
    });
  });

  describe('error when no project can be resolved', () => {
    it('lists all available projects when switch target cannot be resolved', async () => {
      registryMock.loadRegistry.mockResolvedValue({
        version: '1.0.0',
        last_updated: '2025-01-01T00:00:00.000Z',
        active_project: null,
        projects: [
          {
            id: 'p1',
            name: 'Project One',
            path: '/p1',
            status: 'active' as const,
            created: '2025-01-01',
            last_accessed: '2025-01-01T00:00:00.000Z',
          },
          {
            id: 'p2',
            name: 'Project Two',
            path: '/p2',
            status: 'active' as const,
            created: '2025-01-01',
            last_accessed: '2025-01-01T00:00:00.000Z',
          },
        ],
      });

      const result = await switchProject({ project: 'missing-project' });

      expect(result).toContain('❌ Project "missing-project" not found');
      expect(result).toContain('Project One (p1)');
      expect(result).toContain('Project Two (p2)');
    });

    it('does not bind session when project cannot be found', async () => {
      registryMock.loadRegistry.mockResolvedValue(buildRegistry());

      await switchProject({ project: 'does-not-exist' });

      expect(getSessionProjectBinding()).toBeNull();
    });

    it('does not call patchProjectMetadata when project cannot be found', async () => {
      registryMock.loadRegistry.mockResolvedValue(buildRegistry());

      await switchProject({ project: 'does-not-exist' });

      expect(registryMock.patchProjectMetadata).not.toHaveBeenCalled();
    });
  });
});
