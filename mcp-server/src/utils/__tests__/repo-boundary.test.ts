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
  getAgenticOSHome: vi.fn(() => '/workspace'),
}));

import { isImplementationAffectingTask, resolveGuardrailProjectTarget } from '../repo-boundary.js';
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
      if (path.endsWith('/epsilon/.project.yaml')) {
        return JSON.stringify({
          meta: {
            id: 'epsilon',
            name: 'Epsilon Project',
          },
          source_control: {
            topology: 'github_versioned',
            github_repo: 'madlouse/epsilon',
            branch_strategy: 'github_flow',
          },
          agent_context: {
            current_state: '.context/state.yaml',
          },
          execution: {
            source_repo_roots: ['../../source/epsilon'],
          },
        });
      }
      if (path.endsWith('/theta/.project.yaml')) {
        return JSON.stringify({
          source_control: {
            topology: 'github_versioned',
            github_repo: 'madlouse/theta',
            branch_strategy: 'github_flow',
          },
          execution: {
            source_repo_roots: ['', '/workspace/source/theta', './relative', '/workspace/source/theta'],
          },
        });
      }
      if (path.endsWith('/iota/.project.yaml')) {
        return JSON.stringify({
          meta: {
            id: 'iota',
            name: 'Iota Project',
          },
          source_control: {
            topology: 'local_directory_only',
          },
          execution: {
            source_repo_roots: 'not-an-array',
          },
        });
      }
      if (path.endsWith('/lambda/.project.yaml') || path.endsWith('/mu/.project.yaml')) {
        return JSON.stringify({
          meta: {
            id: path.includes('/lambda/') ? 'lambda' : 'mu',
            name: path.includes('/lambda/') ? 'Lambda Project' : 'Mu Project',
          },
          source_control: {
            topology: 'local_directory_only',
          },
          execution: {
            source_repo_roots: ['../../source/shared'],
          },
        });
      }
      if (path.endsWith('/sigma/.project.yaml')) {
        return JSON.stringify({
          source_control: {
            topology: 'local_directory_only',
          },
        });
      }
      if (path.endsWith('/phi/.project.yaml')) {
        return 'null';
      }
      throw new Error(`unexpected path: ${path}`);
    });
  });

  it('classifies implementation-affecting task types explicitly', () => {
    expect(isImplementationAffectingTask('implementation')).toBe(true);
    expect(isImplementationAffectingTask('bugfix')).toBe(true);
    expect(isImplementationAffectingTask('discussion_only')).toBe(false);
    expect(isImplementationAffectingTask('analysis_or_doc')).toBe(false);
    expect(isImplementationAffectingTask('bootstrap')).toBe(false);
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
    expect(result.targetProject?.expectedWorktreeRoot).toBeNull();
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
    expect(result.targetProject?.expectedWorktreeRoot).toBeNull();
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

  it('derives an expected worktree root for github_versioned projects and matches repo_path under that derived root', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [
        {
          id: 'epsilon',
          name: 'Epsilon Project',
          path: '/workspace/projects/epsilon',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
      ],
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      repoPath: '/workspace/worktrees/epsilon/epsilon-297-scope',
    });

    expect(result.targetProject?.id).toBe('epsilon');
    expect(result.targetProject?.expectedWorktreeRoot).toBe('/workspace/worktrees/epsilon');
    expect(result.resolutionSource).toBe('repo_path_match');
  });

  it('returns a resolvable-project error when explicit project_path has no project metadata', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [],
    });
    accessMock.mockRejectedValueOnce(new Error('missing'));

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      projectPath: '/workspace/projects/missing',
    });

    expect(result.targetProject).toBeNull();
    expect(result.resolutionErrors[0]).toContain('project_path is not a resolvable managed project');
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

  it('returns a session-project error when the bound session project is missing in the registry', async () => {
    bindSessionProject({
      projectId: 'missing-project',
      projectName: 'Missing Project',
      projectPath: '/workspace/projects/missing-project',
    });
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [],
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
    });

    expect(result.targetProject).toBeNull();
    expect(result.resolutionErrors[0]).toContain('Session project "missing-project" not found in registry.');
  });

  it('returns an unmatched-repo error when repo_path cannot be proven and no session project is bound', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [],
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      repoPath: '/workspace/unmatched/repo',
    });

    expect(result.targetProject).toBeNull();
    expect(result.resolutionErrors[0]).toContain('target project could not be resolved from repo_path or session binding');
  });

  it('uses registry fallback id/name and normalizes declared repo roots for session-bound github projects', async () => {
    bindSessionProject({
      projectId: 'theta',
      projectName: 'Theta Project',
      projectPath: '/workspace/projects/theta',
    });
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [
        {
          id: 'theta',
          name: 'Theta Project',
          path: '/workspace/projects/theta',
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

    expect(result.targetProject?.id).toBe('theta');
    expect(result.targetProject?.name).toBe('Theta Project');
    expect(result.targetProject?.statePath).toBe('/workspace/projects/theta/.context/state.yaml');
    expect(result.targetProject?.sourceRepoRoots).toEqual([
      '/workspace/source/theta',
      '/workspace/projects/theta/relative',
    ]);
    expect(result.targetProject?.sourceRepoRootsDeclared).toBe(true);
    expect(result.targetProject?.expectedWorktreeRoot).toBeNull();
  });

  it('marks source repo roots as undeclared when execution.source_repo_roots is not an array', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [],
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      projectPath: '/workspace/projects/iota',
    });

    expect(result.targetProject?.id).toBe('iota');
    expect(result.targetProject?.sourceRepoRoots).toEqual([]);
    expect(result.targetProject?.sourceRepoRootsDeclared).toBe(false);
  });

  it('falls back to basename-derived project metadata when the parsed project yaml is null', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [],
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      projectPath: '/workspace/projects/sigma',
    });

    expect(result.targetProject?.id).toBe('sigma');
    expect(result.targetProject?.name).toBe('sigma');
    expect(result.targetProject?.path).toBe('/workspace/projects/sigma');
  });

  it('fails closed when project yaml parses to a non-object value', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [],
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      projectPath: '/workspace/projects/phi',
    });

    expect(result.targetProject).toBeNull();
    expect(result.resolutionErrors[0]).toContain('parsed to null/empty');
  });

  it('fails closed when repo_path matches multiple managed projects with equally strong proof', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [
        {
          id: 'lambda',
          name: 'Lambda Project',
          path: '/workspace/projects/lambda',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
        {
          id: 'mu',
          name: 'Mu Project',
          path: '/workspace/projects/mu',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
      ],
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      repoPath: '/workspace/source/shared/worktrees/issue-1',
    });

    expect(result.targetProject).toBeNull();
    expect(result.resolutionErrors[0]).toContain('matches multiple managed projects');
  });

  it('returns the underlying repo-path resolution error when project metadata loading throws', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [
        {
          id: 'nu',
          name: 'Nu Project',
          path: '/workspace/projects/nu',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
      ],
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/nu/.project.yaml')) {
        throw new Error('nu read failed');
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      repoPath: '/workspace/projects/nu/worktrees/issue-1',
    });

    expect(result.targetProject).toBeNull();
    expect(result.resolutionErrors[0]).toContain('target project could not be resolved from repo_path or session binding');
  });

  it('uses the generic repo-path error when repo-path resolution throws a non-Error value', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [
        {
          id: 'chi',
          name: 'Chi Project',
          path: '/workspace/projects/chi',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
      ],
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/chi/.project.yaml')) {
        throw 'plain repo-path failure';
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      repoPath: '/workspace/projects/chi/worktrees/issue-1',
    });

    expect(result.targetProject).toBeNull();
    expect(result.resolutionErrors[0]).toContain('target project could not be resolved from repo_path or session binding');
  });

  it('uses the generic explicit-project error when project-path resolution throws a non-Error value', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [],
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/tau/.project.yaml')) {
        throw 'plain project failure';
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      projectPath: '/workspace/projects/tau',
    });

    expect(result.targetProject).toBeNull();
    expect(result.resolutionErrors[0]).toContain('project_path is not a resolvable managed project');
  });

  it('returns a session-project error when the bound session project has no readable project metadata', async () => {
    bindSessionProject({
      projectId: 'omega',
      projectName: 'Omega Project',
      projectPath: '/workspace/projects/omega',
    });
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [
        {
          id: 'omega',
          name: 'Omega Project',
          path: '/workspace/projects/omega',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
      ],
    });
    accessMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/omega/.project.yaml')) {
        throw new Error('missing omega project yaml');
      }
      return undefined;
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
      repoPath: '/workspace/unmatched/repo',
    });

    expect(result.targetProject).toBeNull();
    expect(result.resolutionErrors[0]).toContain('session project "omega" is missing a readable .project.yaml');
  });

  it('uses the generic session-project error when session resolution throws a non-Error value', async () => {
    bindSessionProject({
      projectId: 'upsilon',
      projectName: 'Upsilon Project',
      projectPath: '/workspace/projects/upsilon',
    });
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [
        {
          id: 'upsilon',
          name: 'Upsilon Project',
          path: '/workspace/projects/upsilon',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
      ],
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/upsilon/.project.yaml')) {
        throw 'plain session failure';
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await resolveGuardrailProjectTarget({
      commandName: 'agenticos_preflight',
    });

    expect(result.targetProject).toBeNull();
    expect(result.resolutionErrors[0]).toContain('session project "upsilon" is missing a readable');
  });

  it('returns an ambiguity error when the session binding matches multiple registry entries', async () => {
    bindSessionProject({
      projectId: 'dupe',
      projectName: 'Dupe Project',
      projectPath: '/workspace/projects/dupe',
    });
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [
        {
          id: 'dupe',
          name: 'Dupe Project',
          path: '/workspace/projects/dupe',
          status: 'active',
          created: '2026-04-06',
          last_accessed: '2026-04-06T00:00:00.000Z',
        },
        {
          id: 'dupe',
          name: 'Dupe Project Copy',
          path: '/workspace/projects/dupe-copy',
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
    expect(result.resolutionErrors[0]).toContain('is ambiguous in registry');
  });
});
