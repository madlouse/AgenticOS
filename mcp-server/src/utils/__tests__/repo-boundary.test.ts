import { beforeEach, describe, expect, it, vi } from 'vitest';

const accessMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const yamlMock = vi.hoisted(() => ({
  parse: vi.fn(),
}));
const loadRegistryMock = vi.hoisted(() => vi.fn());
const resolveManagedProjectTargetMock = vi.hoisted(() => vi.fn());

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

vi.mock('../project-target.js', () => ({
  resolveManagedProjectTarget: resolveManagedProjectTargetMock,
}));

import { resolveGuardrailProjectTarget } from '../repo-boundary.js';

describe('resolveGuardrailProjectTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    yamlMock.parse.mockImplementation((content: string) => JSON.parse(content));
    accessMock.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue(JSON.stringify({
      meta: {
        id: 'alpha',
        name: 'Alpha Project',
      },
      agent_context: {
        current_state: '.context/state.yaml',
      },
      execution: {
        source_repo_roots: ['../..'],
      },
    }));
  });

  it('prefers the active managed project and resolves relative source repo roots', async () => {
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
    resolveManagedProjectTargetMock.mockResolvedValue({
      projectId: 'alpha',
      projectName: 'Alpha Project',
      projectPath: '/workspace/projects/alpha',
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      repoPath: '/workspace/repo/worktrees/alpha-160',
    });

    expect(result.activeProjectId).toBe('alpha');
    expect(result.targetProject?.id).toBe('alpha');
    expect(result.targetProject?.sourceRepoRoots).toEqual(['/workspace']);
    expect(result.resolutionSource).toBe('active_project');
  });

  it('falls back to repo_path containment when no active project is set', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
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
      repoPath: '/workspace/projects/alpha/src',
    });

    expect(result.targetProject?.id).toBe('alpha');
    expect(result.resolutionSource).toBe('repo_path_match');
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
    expect(resolveManagedProjectTargetMock).not.toHaveBeenCalled();
  });

  it('returns a fail-closed resolution error when project metadata cannot be proven', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: 'alpha',
      projects: [],
    });
    resolveManagedProjectTargetMock.mockRejectedValue(new Error('Project identity could not be proven.'));

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      repoPath: '/workspace/repo',
    });

    expect(result.targetProject).toBeNull();
    expect(result.resolutionErrors[0]).toContain('could not be proven');
    expect(result.resolutionSource).toBeNull();
  });
});
