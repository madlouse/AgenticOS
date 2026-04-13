import { beforeEach, describe, expect, it, vi } from 'vitest';

const accessMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const yamlMock = vi.hoisted(() => ({
  parse: vi.fn(),
}));
const loadRegistryMock = vi.hoisted(() => vi.fn());

vi.mock('fs/promises', () => ({
  access: accessMock,
  readFile: readFileMock,
}));

vi.mock('yaml', () => ({
  default: yamlMock,
}));

vi.mock('../registry.js', () => ({
  loadRegistry: loadRegistryMock,
}));

import { resolveGuardrailProjectTarget } from '../repo-boundary.js';
import { bindSessionProject, clearSessionProjectBinding } from '../session-context.js';

describe('resolveGuardrailProjectTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionProjectBinding();
    yamlMock.parse.mockImplementation((content: string) => JSON.parse(content));
    accessMock.mockResolvedValue(undefined);
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/alpha/.project.yaml')) {
        return JSON.stringify({
          meta: {
            id: 'alpha',
            name: 'Alpha Project',
          },
          source_control: {
            topology: 'local_directory_only',
          },
          agent_context: {
            current_state: '.context/state.yaml',
          },
          execution: {
            source_repo_roots: ['../../source/alpha'],
          },
        });
      }
      if (path.endsWith('/beta/.project.yaml')) {
        return JSON.stringify({
          meta: {
            id: 'beta',
            name: 'Beta Project',
          },
          source_control: {
            topology: 'local_directory_only',
          },
          agent_context: {
            current_state: '.context/state.yaml',
          },
          execution: {
            source_repo_roots: ['../../source/beta'],
          },
        });
      }
      if (path.endsWith('/gamma/.project.yaml')) {
        return JSON.stringify({
          meta: {
            id: 'gamma',
            name: 'Gamma Project',
          },
          source_control: {
            topology: 'github_versioned',
            branch_strategy: 'github_flow',
          },
          execution: {
            source_repo_roots: ['../../source/gamma'],
          },
        });
      }
      if (path.endsWith('/delta/.project.yaml')) {
        return JSON.stringify({
          meta: {
            id: 'delta',
            name: 'Delta Project',
          },
          source_control: {
            topology: 'github_versioned',
            branch_strategy: 'github_flow',
          },
          execution: {
            source_repo_roots: ['../../source'],
          },
        });
      }
      throw new Error(`unexpected path: ${path}`);
    });
  });

  it('prefers repo_path proof over a drifted legacy registry active_project field', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: 'alpha',
      projects: [
        {
          id: 'alpha',
          name: 'Alpha Project',
          path: '/workspace/projects/alpha',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
        {
          id: 'beta',
          name: 'Beta Project',
          path: '/workspace/projects/beta',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
      ],
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      repoPath: '/workspace/source/beta/worktrees/issue-160',
    });

    expect(result.activeProjectId).toBe('alpha');
    expect(result.targetProject?.id).toBe('beta');
    expect(result.targetProject?.sourceRepoRoots).toEqual(['/workspace/source/beta']);
    expect(result.resolutionSource).toBe('repo_path_match');
  });

  it('uses the session-bound project when repo_path cannot be proven', async () => {
    bindSessionProject({
      projectId: 'beta',
      projectName: 'Beta Project',
      projectPath: '/workspace/projects/beta',
    });
    loadRegistryMock.mockResolvedValue({
      active_project: 'alpha',
      projects: [
        {
          id: 'alpha',
          name: 'Alpha Project',
          path: '/workspace/projects/alpha',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
        {
          id: 'beta',
          name: 'Beta Project',
          path: '/workspace/projects/beta',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
      ],
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      repoPath: '/workspace/unmatched/repo',
    });

    expect(result.activeProjectId).toBe('alpha');
    expect(result.targetProject?.id).toBe('beta');
    expect(result.resolutionSource).toBe('session_project');
  });

  it('resolves an explicit project_path even when active_project has drifted elsewhere', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: 'beta',
      projects: [
        {
          id: 'alpha',
          name: 'Alpha Project',
          path: '/workspace/projects/alpha',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
        {
          id: 'beta',
          name: 'Beta Project',
          path: '/workspace/projects/beta',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
      ],
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      repoPath: '/workspace/source',
      projectPath: '/workspace/projects/alpha',
    });

    expect(result.activeProjectId).toBe('beta');
    expect(result.targetProject?.id).toBe('alpha');
    expect(result.targetProject?.path).toBe('/workspace/projects/alpha');
    expect(result.resolutionSource).toBe('explicit_project_path');
    expect(result.resolutionErrors).toEqual([]);
  });

  it('fails closed for an explicit project_path whose github_versioned metadata is incomplete', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: 'beta',
      projects: [
        {
          id: 'gamma',
          name: 'Gamma Project',
          path: '/workspace/projects/gamma',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
      ],
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      projectPath: '/workspace/projects/gamma',
    });

    expect(result.targetProject).toBeNull();
    expect(result.resolutionSource).toBeNull();
    expect(result.resolutionErrors[0]).toContain('missing source_control.github_repo');
  });

  it('fails closed when repo_path matches a project with incomplete github_versioned metadata', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: 'alpha',
      projects: [
        {
          id: 'gamma',
          name: 'Gamma Project',
          path: '/workspace/projects/gamma',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
      ],
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      repoPath: '/workspace/source/gamma/worktrees/issue-268',
    });

    expect(result.targetProject).toBeNull();
    expect(result.resolutionSource).toBeNull();
    expect(result.resolutionErrors[0]).toContain('missing source_control.github_repo');
  });

  it('does not let an unrelated malformed project block a valid repo_path match', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: 'gamma',
      projects: [
        {
          id: 'alpha',
          name: 'Alpha Project',
          path: '/workspace/projects/alpha',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
        {
          id: 'gamma',
          name: 'Gamma Project',
          path: '/workspace/projects/gamma',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
      ],
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      repoPath: '/workspace/source/alpha/worktrees/issue-268',
    });

    expect(result.activeProjectId).toBe('gamma');
    expect(result.targetProject?.id).toBe('alpha');
    expect(result.resolutionSource).toBe('repo_path_match');
    expect(result.resolutionErrors).toEqual([]);
  });

  it('prefers the strongest valid repo_path match over a broader malformed candidate', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: 'delta',
      projects: [
        {
          id: 'delta',
          name: 'Delta Project',
          path: '/workspace/projects/delta',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
        {
          id: 'alpha',
          name: 'Alpha Project',
          path: '/workspace/projects/alpha',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
      ],
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      repoPath: '/workspace/source/alpha/worktrees/issue-268',
    });

    expect(result.activeProjectId).toBe('delta');
    expect(result.targetProject?.id).toBe('alpha');
    expect(result.resolutionSource).toBe('repo_path_match');
    expect(result.resolutionErrors).toEqual([]);
  });

  it('fails closed when only the legacy registry active_project field is available', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: 'alpha',
      projects: [
        {
          id: 'alpha',
          name: 'Alpha Project',
          path: '/workspace/projects/alpha',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
      ],
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
    });

    expect(result.targetProject).toBeNull();
    expect(result.resolutionSource).toBeNull();
    expect(result.resolutionErrors[0]).toContain('No project_path, repo_path proof, or session binding is available');
  });

  it('ignores a populated legacy registry active_project field even when its metadata exists', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: 'alpha',
      projects: [
        {
          id: 'alpha',
          name: 'Alpha Project',
          path: '/workspace/projects/alpha',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
      ],
    });
    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
    });

    expect(result.targetProject).toBeNull();
    expect(result.resolutionErrors[0]).toContain('No project_path, repo_path proof, or session binding is available');
    expect(result.resolutionSource).toBeNull();
  });
});
