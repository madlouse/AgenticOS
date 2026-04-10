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
          agent_context: {
            current_state: '.context/state.yaml',
          },
          execution: {
            source_repo_roots: ['../../source/beta'],
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
