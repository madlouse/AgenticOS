import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const yamlMock = vi.hoisted(() => ({
  parse: vi.fn(),
  stringify: vi.fn((obj: unknown) => JSON.stringify(obj)),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('yaml', () => ({
  default: yamlMock,
}));

vi.mock('../registry.js', () => ({
  loadRegistry: vi.fn(),
}));

import { readFile } from 'fs/promises';
import { loadRegistry } from '../registry.js';
import { resolveManagedProjectContextPaths, resolveManagedProjectTarget } from '../project-target.js';

const readFileMock = readFile as unknown as ReturnType<typeof vi.fn>;
const loadRegistryMock = loadRegistry as unknown as ReturnType<typeof vi.fn>;

function buildRegistry(overrides: Record<string, unknown> = {}) {
  return {
    version: '1.0.0',
    last_updated: '2025-01-01T00:00:00.000Z',
    active_project: 'alpha',
    projects: [
      {
        id: 'alpha',
        name: 'Alpha Project',
        path: '/workspace/alpha',
        status: 'active' as const,
        created: '2025-01-01',
        last_accessed: '2025-01-01T00:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('resolveManagedProjectTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    yamlMock.parse.mockImplementation((content: string) => {
      try {
        return JSON.parse(content);
      } catch {
        return undefined;
      }
    });
    loadRegistryMock.mockResolvedValue(buildRegistry());
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: {
            id: 'alpha',
            name: 'Alpha Project',
          },
        });
      }
      throw new Error(`unexpected path: ${path}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves the active project when identity is valid', async () => {
    const result = await resolveManagedProjectTarget({
      commandName: 'agenticos_record',
    });

    expect(result.projectId).toBe('alpha');
    expect(result.projectPath).toBe('/workspace/alpha');
    expect(result.projectYamlPath).toBe('/workspace/alpha/.project.yaml');
  });

  it('honors configured agent_context paths for self-hosting layouts', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({
      meta: {
        id: 'alpha',
        name: 'Alpha Project',
      },
      agent_context: {
        quick_start: 'standards/.context/quick-start.md',
        current_state: 'standards/.context/state.yaml',
        conversations: 'standards/.context/conversations/',
        last_record_marker: 'standards/.context/.last_record',
      },
    }));

    const result = await resolveManagedProjectTarget({
      commandName: 'agenticos_record',
    });

    expect(result.quickStartPath).toBe('/workspace/alpha/standards/.context/quick-start.md');
    expect(result.statePath).toBe('/workspace/alpha/standards/.context/state.yaml');
    expect(result.conversationsDir).toBe('/workspace/alpha/standards/.context/conversations/');
    expect(result.markerPath).toBe('/workspace/alpha/standards/.context/.last_record');
  });

  it('fails when there is no active project and no explicit project', async () => {
    loadRegistryMock.mockResolvedValue(buildRegistry({ active_project: null }));

    await expect(resolveManagedProjectTarget({
      commandName: 'agenticos_record',
    })).rejects.toThrow('No active project. Use agenticos_switch first or pass project to agenticos_record.');
  });

  it('fails when the requested project is missing', async () => {
    await expect(resolveManagedProjectTarget({
      commandName: 'agenticos_record',
      project: 'missing-project',
    })).rejects.toThrow('Project "missing-project" not found in registry.');
  });

  it('fails when the requested project is ambiguous by name', async () => {
    loadRegistryMock.mockResolvedValue(buildRegistry({
      active_project: null,
      projects: [
        {
          id: 'alpha',
          name: 'Shared Name',
          path: '/workspace/alpha',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'beta',
          name: 'Shared Name',
          path: '/workspace/beta',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    }));

    await expect(resolveManagedProjectTarget({
      commandName: 'agenticos_record',
      project: 'Shared Name',
    })).rejects.toThrow('Project "Shared Name" is ambiguous in registry.');
  });

  it('fails when explicit project does not match the active project', async () => {
    loadRegistryMock.mockResolvedValue(buildRegistry({
      active_project: 'alpha',
      projects: [
        {
          id: 'alpha',
          name: 'Alpha Project',
          path: '/workspace/alpha',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'beta',
          name: 'Beta Project',
          path: '/workspace/beta',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    }));

    await expect(resolveManagedProjectTarget({
      commandName: 'agenticos_record',
      project: 'beta',
    })).rejects.toThrow('Requested project "beta" does not match active project "alpha".');
  });

  it('fails when registry id is duplicated', async () => {
    loadRegistryMock.mockResolvedValue(buildRegistry({
      active_project: null,
      projects: [
        {
          id: 'alpha',
          name: 'Alpha Project',
          path: '/workspace/alpha',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'alpha',
          name: 'Alpha Mirror',
          path: '/workspace/alpha-mirror',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    }));

    await expect(resolveManagedProjectTarget({
      commandName: 'agenticos_record',
      project: '/workspace/alpha',
    })).rejects.toThrow('Project identity is ambiguous because registry id "alpha" is duplicated.');
  });

  it('fails when registry path is duplicated', async () => {
    loadRegistryMock.mockResolvedValue(buildRegistry({
      projects: [
        {
          id: 'alpha',
          name: 'Alpha Project',
          path: '/workspace/shared',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'beta',
          name: 'Beta Project',
          path: '/workspace/shared',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    }));

    readFileMock.mockResolvedValue(JSON.stringify({
      meta: {
        id: 'alpha',
        name: 'Alpha Project',
      },
    }));

    await expect(resolveManagedProjectTarget({
      commandName: 'agenticos_record',
    })).rejects.toThrow('Project identity is ambiguous because registry path "/workspace/shared" is duplicated.');
  });

  it('fails when registry name is duplicated after resolving by id', async () => {
    loadRegistryMock.mockResolvedValue(buildRegistry({
      active_project: null,
      projects: [
        {
          id: 'alpha',
          name: 'Shared Name',
          path: '/workspace/alpha',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'beta',
          name: 'Shared Name',
          path: '/workspace/beta',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    }));
    readFileMock.mockResolvedValue(JSON.stringify({
      meta: {
        id: 'alpha',
        name: 'Shared Name',
      },
    }));

    await expect(resolveManagedProjectTarget({
      commandName: 'agenticos_record',
      project: 'alpha',
    })).rejects.toThrow('Project identity is ambiguous because registry name "Shared Name" is duplicated.');
  });

  it('fails when .project.yaml is missing', async () => {
    readFileMock.mockRejectedValue(new Error('missing'));

    await expect(resolveManagedProjectTarget({
      commandName: 'agenticos_record',
    })).rejects.toThrow('Project identity could not be proven because /workspace/alpha/.project.yaml is missing or unreadable.');
  });

  it('fails when .project.yaml is missing meta.id', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({
      meta: {
        name: 'Alpha Project',
      },
    }));

    await expect(resolveManagedProjectTarget({
      commandName: 'agenticos_record',
    })).rejects.toThrow('Project identity could not be proven because /workspace/alpha/.project.yaml is missing meta.id.');
  });

  it('fails when .project.yaml parses to an empty value', async () => {
    readFileMock.mockResolvedValue('not-json');
    yamlMock.parse.mockReturnValueOnce(undefined);

    await expect(resolveManagedProjectTarget({
      commandName: 'agenticos_record',
    })).rejects.toThrow('Project identity could not be proven because /workspace/alpha/.project.yaml is missing meta.id.');
  });

  it('fails when .project.yaml id mismatches the registry id', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({
      meta: {
        id: 'beta',
        name: 'Alpha Project',
      },
    }));

    await expect(resolveManagedProjectTarget({
      commandName: 'agenticos_record',
    })).rejects.toThrow('Project identity mismatch: registry id "alpha" does not match .project.yaml meta.id "beta".');
  });

  it('fails when .project.yaml name mismatches the registry name', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({
      meta: {
        id: 'alpha',
        name: 'Wrong Project Name',
      },
    }));

    await expect(resolveManagedProjectTarget({
      commandName: 'agenticos_record',
    })).rejects.toThrow('Project identity mismatch: registry name "Alpha Project" does not match .project.yaml meta.name "Wrong Project Name".');
  });

  it('fails when the resolved project is archived reference content', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({
      meta: {
        id: 'alpha',
        name: 'Alpha Project',
      },
      archive_contract: {
        version: 1,
        kind: 'archived_reference',
        managed_project: false,
        execution_mode: 'reference_only',
        replacement_project: 'agenticos-standards',
      },
    }));

    await expect(resolveManagedProjectTarget({
      commandName: 'agenticos_record',
    })).rejects.toThrow(
      'Project "Alpha Project" is archived reference content, not an active managed project. Use "agenticos-standards" instead. agenticos_record only works with active managed projects.',
    );
  });
});

describe('resolveManagedProjectContextPaths', () => {
  it('falls back to root .context defaults when agent_context paths are not declared', () => {
    expect(resolveManagedProjectContextPaths('/workspace/alpha', {})).toEqual({
      quickStartPath: '/workspace/alpha/.context/quick-start.md',
      statePath: '/workspace/alpha/.context/state.yaml',
      conversationsDir: '/workspace/alpha/.context/conversations',
      markerPath: '/workspace/alpha/.context/.last_record',
    });
  });
});
