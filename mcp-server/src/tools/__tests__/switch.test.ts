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
const execFileMock = vi.hoisted(() => vi.fn());
const execMock = vi.hoisted(() => vi.fn());

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

vi.mock('child_process', () => ({
  exec: execMock,
  execFile: execFileMock,
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

import { switchOutProject, switchProject } from '../project.js';
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
    fsMock.existsSync.mockImplementation((path: string) => path === '/test/path');
    yamlMock.parse.mockImplementation((content: string) => {
      try { return JSON.parse(content); } catch { return undefined; }
    });
    yamlMock.stringify.mockImplementation((obj: unknown) => JSON.stringify(obj));
    loadLatestGuardrailStateMock.mockResolvedValue({
      source: null,
      state: {},
      state_path: null,
    });
    execFileMock.mockImplementation((_command: string, _args: string[], callback: (error: Error | null, stdout: string) => void) => {
      callback(null, '');
    });
    execMock.mockImplementation((_command: string, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      callback(null, '', '');
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
      expect(result).toContain('🧰 Project path: /test/path');
      expect(result).toContain('🧰 Recommended explicit workdir for tool calls: /test/path');
      expect(result).toContain('Client shell PWD: unavailable to MCP');
      expect(result.indexOf('Status: active')).toBeLessThan(result.indexOf('🧰 Project path: /test/path'));
      expect(result.indexOf('🧰 Project path: /test/path')).toBeLessThan(result.indexOf('Context loaded from:'));
    });

    it('does not bind or report success when the registered project path is missing', async () => {
      fsMock.existsSync.mockReturnValue(false);
      registryMock.loadRegistry.mockResolvedValue(buildRegistry());

      const result = await switchProject({ project: 'test-project' });

      expect(result).toContain('❌ Project "Test Project" cannot be switched');
      expect(result).toContain('target directory does not exist');
      expect(getSessionProjectBinding()).toBeNull();
      expect(registryMock.patchProjectMetadata).not.toHaveBeenCalled();
    });

    it('does not imply Codex current-session cwd changed after switch', async () => {
      const previousCodex = process.env.CODEX;
      process.env.CODEX = '1';
      try {
        fsMock.existsSync.mockImplementation((path: string) => path === '/test/path');
        vi.spyOn(process, 'cwd').mockReturnValue('/home/testuser');
        registryMock.loadRegistry.mockResolvedValue(buildRegistry());
        mockDefaultReads();

        const result = await switchProject({ project: 'test-project' });

        expect(result).toContain('🧰 Project path: /test/path');
        expect(result).toContain('🧭 Observed MCP process PWD: /home/testuser (differs from project path)');
        expect(result).toContain('Client shell PWD: unavailable to MCP');
        expect(result).toContain('Codex current-session cwd cannot be changed by MCP output');
        expect(result).toContain('Use this project path as explicit workdir');
        expect(result).toContain('To start a new Codex session in this project, run:');
        expect(result).toContain("codex -C '/test/path'");
        expect(result).not.toContain('To align your shell PWD, run:');
      } finally {
        if (previousCodex === undefined) delete process.env.CODEX;
        else process.env.CODEX = previousCodex;
      }
    });

    it('detects Codex from current runtime environment variables', async () => {
      const previousCodex = process.env.CODEX;
      const previousCodexCi = process.env.CODEX_CI;
      const previousCodexThreadId = process.env.CODEX_THREAD_ID;
      const previousCodexManagedByNpm = process.env.CODEX_MANAGED_BY_NPM;
      delete process.env.CODEX;
      process.env.CODEX_CI = '1';
      process.env.CODEX_THREAD_ID = 'test-thread-id';
      process.env.CODEX_MANAGED_BY_NPM = '1';
      try {
        fsMock.existsSync.mockImplementation((path: string) => path === '/test/path');
        vi.spyOn(process, 'cwd').mockReturnValue('/home/testuser');
        registryMock.loadRegistry.mockResolvedValue(buildRegistry());
        mockDefaultReads();

        const result = await switchProject({ project: 'test-project' });

        expect(result).toContain('Codex current-session cwd cannot be changed by MCP output');
        expect(result).toContain("codex -C '/test/path'");
      } finally {
        if (previousCodex === undefined) delete process.env.CODEX;
        else process.env.CODEX = previousCodex;
        if (previousCodexCi === undefined) delete process.env.CODEX_CI;
        else process.env.CODEX_CI = previousCodexCi;
        if (previousCodexThreadId === undefined) delete process.env.CODEX_THREAD_ID;
        else process.env.CODEX_THREAD_ID = previousCodexThreadId;
        if (previousCodexManagedByNpm === undefined) delete process.env.CODEX_MANAGED_BY_NPM;
        else process.env.CODEX_MANAGED_BY_NPM = previousCodexManagedByNpm;
      }
    });

    it('marks the MCP process PWD as matching when it equals the project path', async () => {
      fsMock.existsSync.mockImplementation((path: string) => path === '/test/path');
      vi.spyOn(process, 'cwd').mockReturnValue('/test/path');
      registryMock.loadRegistry.mockResolvedValue(buildRegistry());
      mockDefaultReads();

      const result = await switchProject({ project: 'test-project' });

      expect(result).toContain('🧭 Observed MCP process PWD: /test/path (matches project path)');
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

    it('switches out to the first origin cwd after a single project switch', async () => {
      fsMock.existsSync.mockImplementation((path: string) => path === '/test/path' || path === '/entry/start');
      registryMock.loadRegistry.mockResolvedValue(buildRegistry());
      mockDefaultReads();

      await switchProject({ project: 'test-project', origin_cwd: '/entry/start' });
      const result = await switchOutProject();

      expect(result).toContain('✅ Exited AgenticOS project context "Test Project"');
      expect(result).toContain('origin_cwd: /entry/start');
      expect(result).toContain('target_workdir: /entry/start');
      expect(result).toContain('Recommended explicit workdir for tool calls: /entry/start');
      expect(result).toContain('MCP cannot mutate the parent process cwd');
      expect(getSessionProjectBinding()).toBeNull();
    });

    it('keeps the first origin cwd when switching A to B before switch-out', async () => {
      fsMock.existsSync.mockImplementation((path: string) => (
        path === '/entry/start' ||
        path === '/projects/a' ||
        path === '/projects/b'
      ));
      registryMock.loadRegistry.mockResolvedValue(buildRegistry({
        projects: [
          {
            id: 'project-a',
            name: 'Project A',
            path: '/projects/a',
            status: 'active' as const,
            created: '2025-01-01',
          },
          {
            id: 'project-b',
            name: 'Project B',
            path: '/projects/b',
            status: 'active' as const,
            created: '2025-01-01',
          },
        ],
      }));
      mockDefaultReads();

      await switchProject({ project: 'project-a', origin_cwd: '/entry/start' });
      await switchProject({ project: 'project-b', origin_cwd: '/should/not/use' });
      const result = await switchOutProject();

      expect(result).toContain('✅ Exited AgenticOS project context "Project B"');
      expect(result).toContain('Previous project before last switch: Project A (project-a)');
      expect(result).toContain('target_workdir: /entry/start');
      expect(result).not.toContain('target_workdir: /projects/a');
    });

    it('returns neutral guidance when switch-out has no active project or origin', async () => {
      const result = await switchOutProject();

      expect(result).toContain('No active AgenticOS project context');
      expect(result).toContain('origin_cwd: unknown');
      expect(result).toContain('Choose a neutral non-project workdir');
    });

    it('clears binding but warns when origin cwd is invalid or unknown', async () => {
      fsMock.existsSync.mockImplementation((path: string) => path === '/test/path');
      registryMock.loadRegistry.mockResolvedValue(buildRegistry());
      mockDefaultReads();

      await switchProject({ project: 'test-project', origin_cwd: 'relative/path' });
      const result = await switchOutProject();

      expect(result).toContain('Origin cwd was not usable');
      expect(result).toContain('target_workdir: unknown');
      expect(result).toContain('active project binding was cleared');
      expect(getSessionProjectBinding()).toBeNull();
    });

    it('clears binding but warns when captured origin cwd no longer exists', async () => {
      fsMock.existsSync.mockImplementation((path: string) => path === '/test/path');
      registryMock.loadRegistry.mockResolvedValue(buildRegistry());
      mockDefaultReads();

      await switchProject({ project: 'test-project', origin_cwd: '/missing/origin' });
      const result = await switchOutProject();

      expect(result).toContain('origin_cwd: /missing/origin');
      expect(result).toContain('Restore workdir is not currently usable');
      expect(result).toContain('target directory does not exist');
      expect(getSessionProjectBinding()).toBeNull();
    });

    it('uses Codex-specific target_workdir guidance after switch-out', async () => {
      const previousCodex = process.env.CODEX;
      process.env.CODEX = '1';
      try {
        fsMock.existsSync.mockImplementation((path: string) => path === '/test/path' || path === '/entry/start');
        registryMock.loadRegistry.mockResolvedValue(buildRegistry());
        mockDefaultReads();

        await switchProject({ project: 'test-project', origin_cwd: '/entry/start' });
        const result = await switchOutProject();

        expect(result).toContain('Codex current-session cwd cannot be changed by MCP output');
        expect(result).toContain('Use target_workdir as explicit workdir');
        expect(result).toContain("codex -C '/entry/start'");
      } finally {
        if (previousCodex === undefined) delete process.env.CODEX;
        else process.env.CODEX = previousCodex;
      }
    });

    it('uses per-call alignment hints for Claude Code after switch-out', async () => {
      const previousClaudeCode = process.env.CLAUDE_CODE;
      process.env.CLAUDE_CODE = '1';
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/entry/start');
      try {
        fsMock.existsSync.mockImplementation((path: string) => path === '/test/path' || path === '/entry/start');
        registryMock.loadRegistry.mockResolvedValue(buildRegistry());
        mockDefaultReads();

        await switchProject({ project: 'test-project', origin_cwd: '/entry/start' });
        const result = await switchOutProject();

        expect(result).toContain('Observed MCP process PWD: /entry/start (matches target workdir)');
        expect(result).toContain('Claude Code shell cwd is per-call');
        expect(result).toContain('Use target_workdir as explicit workdir');
        expect(result).toContain("cd '/entry/start' && <command>");
      } finally {
        cwdSpy.mockRestore();
        if (previousClaudeCode === undefined) delete process.env.CLAUDE_CODE;
        else process.env.CLAUDE_CODE = previousClaudeCode;
      }
    });

    it('warns when git status cannot inspect the exited project before switch-out', async () => {
      fsMock.existsSync.mockImplementation((path: string) => (
        path === '/entry/start' ||
        path === '/test/path' ||
        path === '/test/path/.git'
      ));
      execFileMock.mockImplementation((_command: string, _args: string[], callback: (error: Error | null, stdout: string) => void) => {
        callback(new Error('git unavailable'), '');
      });
      registryMock.loadRegistry.mockResolvedValue(buildRegistry());
      mockDefaultReads();

      await switchProject({ project: 'test-project', origin_cwd: '/entry/start' });
      const result = await switchOutProject();

      expect(result).toContain('Project pollution check: git status could not be inspected');
    });

    it('warns when the exited project has uncommitted changes', async () => {
      fsMock.existsSync.mockImplementation((path: string) => (
        path === '/entry/start' ||
        path === '/test/path' ||
        path === '/test/path/.git'
      ));
      execFileMock.mockImplementation((_command: string, _args: string[], callback: (error: Error | null, stdout: string) => void) => {
        callback(null, ' M changed.ts\n');
      });
      registryMock.loadRegistry.mockResolvedValue(buildRegistry());
      mockDefaultReads();

      await switchProject({ project: 'test-project', origin_cwd: '/entry/start' });
      const result = await switchOutProject();

      expect(result).toContain('Project pollution risk: current project worktree has uncommitted changes');
    });

    it('does not emit a dirty warning when the exited project git status is clean', async () => {
      fsMock.existsSync.mockImplementation((path: string) => (
        path === '/entry/start' ||
        path === '/test/path' ||
        path === '/test/path/.git'
      ));
      execFileMock.mockImplementation((_command: string, _args: string[], callback: (error: Error | null, stdout: string) => void) => {
        callback(null, '');
      });
      registryMock.loadRegistry.mockResolvedValue(buildRegistry());
      mockDefaultReads();

      await switchProject({ project: 'test-project', origin_cwd: '/entry/start' });
      const result = await switchOutProject();

      expect(result).not.toContain('Project pollution risk');
      expect(result).toContain('target_workdir: /entry/start');
    });

    it('keeps target workdir guidance when switch-out is repeated after active context was cleared', async () => {
      fsMock.existsSync.mockImplementation((path: string) => path === '/entry/start' || path === '/test/path');
      registryMock.loadRegistry.mockResolvedValue(buildRegistry());
      mockDefaultReads();

      await switchProject({ project: 'test-project', origin_cwd: '/entry/start' });
      await switchOutProject();
      const result = await switchOutProject();

      expect(result).toContain('No active AgenticOS project context');
      expect(result).toContain('target_workdir: /entry/start');
    });

    it('adds an issue worktree warning when leaving a worktree path', async () => {
      const worktreePath = '/home/testuser/AgenticOS/worktrees/test-project/issue-500';
      fsMock.existsSync.mockImplementation((path: string) => path === '/entry/start' || path === worktreePath);
      registryMock.loadRegistry.mockResolvedValue(buildRegistry({
        projects: [{
          id: 'test-project',
          name: 'Test Project',
          path: worktreePath,
          status: 'active' as const,
          created: '2025-01-01',
        }],
      }));
      mockDefaultReads();

      await switchProject({ project: 'test-project', origin_cwd: '/entry/start' });
      const result = await switchOutProject();

      expect(result).toContain('exited project path looks like an issue worktree');
    });
  });

  describe('repo_path override', () => {
    it('binds session to repo_path when project yaml meta.id matches registry id', async () => {
      const worktreePath = '/repo/worktrees/issue-482';
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
      fsMock.existsSync.mockImplementation((path: string) =>
        path === worktreePath || path.startsWith(`${worktreePath}/`));
      fsPromisesMock.readFile.mockImplementation(async (path: string) => {
        if (path.endsWith('/.project.yaml')) {
          return JSON.stringify({
            meta: { id: 'test-project', description: 'Test project description' },
            source_control: { topology: 'local_directory_only' },
          });
        }
        if (path.endsWith('/state.yaml')) {
          return JSON.stringify({
            current_task: { title: 'Test task', status: 'in_progress' },
            working_memory: { pending: ['Next step'], decisions: ['Made a choice'] },
          });
        }
        if (path.endsWith('/quick-start.md')) {
          return '# Quick Start\n\nTest quick start content.\n\nBody text here.';
        }
        return '';
      });

      const result = await switchProject({ project: 'test-project', repo_path: worktreePath });

      expect(result).toContain('✅ Switched to project "Test Project"');
      expect(result).toContain(`Path: ${worktreePath}`);
      const binding = getSessionProjectBinding();
      expect(binding?.projectPath).toBe(worktreePath);
    });

    it('rejects repo_path when meta.id does not match registry id', async () => {
      const worktreePath = '/repo/worktrees/issue-482';
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
      fsPromisesMock.readFile.mockImplementation(async (path: string) => {
        if (path.endsWith('/.project.yaml')) {
          return JSON.stringify({
            meta: { id: 'other-project' },
            source_control: { topology: 'local_directory_only' },
          });
        }
        return '';
      });

      const result = await switchProject({ project: 'test-project', repo_path: worktreePath });

      expect(result).toContain('cannot be bound to repo_path');
      expect(result).toContain('does not match registry id');
    });

    it('rejects repo_path when meta.id is missing', async () => {
      const worktreePath = '/repo/worktrees/issue-482';
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
      fsPromisesMock.readFile.mockImplementation(async (path: string) => {
        if (path.endsWith('/.project.yaml')) {
          return JSON.stringify({
            meta: { description: 'missing id' },
            source_control: { topology: 'local_directory_only' },
          });
        }
        return '';
      });

      const result = await switchProject({ project: 'test-project', repo_path: worktreePath });

      expect(result).toContain('missing meta.id');
    });

    it('rejects repo_path when project yaml is unreadable', async () => {
      const worktreePath = '/repo/worktrees/issue-482';
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
      fsPromisesMock.readFile.mockImplementation(async (path: string) => {
        if (path.endsWith('/.project.yaml')) {
          throw new Error('ENOENT');
        }
        return '';
      });

      const result = await switchProject({ project: 'test-project', repo_path: worktreePath });

      expect(result).toContain('missing or unreadable');
    });

    it('rejects repo_path when project yaml parses to null', async () => {
      const worktreePath = '/repo/worktrees/issue-482';
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
      fsPromisesMock.readFile.mockImplementation(async (path: string) => {
        if (path.endsWith('/.project.yaml')) {
          return '';
        }
        return '';
      });
      yamlMock.parse.mockReturnValue(null);

      const result = await switchProject({ project: 'test-project', repo_path: worktreePath });

      expect(result).toContain('missing meta.id');
    });

    it('ignores non-string repo_path values', async () => {
      registryMock.loadRegistry.mockResolvedValue(buildRegistry());
      mockDefaultReads();

      const result = await switchProject({ project: 'test-project', repo_path: 123 });

      expect(result).toContain('Path: /test/path');
      expect(getSessionProjectBinding()?.projectPath).toBe('/test/path');
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
