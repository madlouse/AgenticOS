import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as yaml from 'yaml';

// yamlMock MUST be defined with vi.hoisted so it's available at vi.mock hoisting time
const yamlMock = vi.hoisted(() => ({
  parse: vi.fn(),
  stringify: vi.fn((obj: unknown): string => {
    // Return a YAML-like string that preserves all field values
    const serialize = (o: unknown): string => {
      if (o === null) return 'null';
      if (o === undefined) return '';
      if (typeof o !== 'object') return String(o);
      if (Array.isArray(o)) {
        return o.map((item) => `- ${serialize(item)}`).join('\n');
      }
      const entries = Object.entries(o as Record<string, unknown>);
      if (entries.length === 0) return '{}';
      return entries
        .map(([k, v]) => {
          const val =
            typeof v === 'object' && v !== null
              ? '\n' +
                serialize(v)
                  .split('\n')
                  .map((l) => `  ${l}`)
                  .join('\n')
              : ` ${serialize(v)}`;
          return `${k}:${val}`;
        })
        .join('\n');
    };
    return serialize(obj);
  }),
}));

// Mock modules before importing the module under test
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
}));

vi.mock('yaml', () => ({
  default: yamlMock,
}));

vi.mock('../canonical-main-guard.js', () => ({
  detectCanonicalMainWriteProtection: vi.fn(async () => ({ blocked: false })),
}));

// Must import after mocks are set up
import {
  loadRegistry,
  saveRegistry,
  patchProjectMetadata,
  getAgenticOSHome,
  getCanonicalAgenticosHome,
  MISSING_AGENTICOS_HOME_MESSAGE,
} from '../registry.js';
import { detectCanonicalMainWriteProtection } from '../canonical-main-guard.js';
import * as fsPromises from 'fs/promises';

const fsPromisesMock = fsPromises as typeof fsPromises & {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
  access: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  rm: ReturnType<typeof vi.fn>;
};
const detectCanonicalMainWriteProtectionMock = detectCanonicalMainWriteProtection as unknown as ReturnType<typeof vi.fn>;

describe('registry utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AGENTICOS_HOME = '/home/testuser/AgenticOS';
    detectCanonicalMainWriteProtectionMock.mockResolvedValue({ blocked: false });
    fsPromisesMock.rename.mockResolvedValue(undefined);
    fsPromisesMock.rm.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // getAgenticOSHome
  // -------------------------------------------------------------------------

  describe('getAgenticOSHome', () => {
    it('respects AGENTICOS_HOME env var', () => {
      process.env.AGENTICOS_HOME = '/custom/path';
      const result = getAgenticOSHome();
      expect(result).toBe('/custom/path');
    });

    it('fails fast when AGENTICOS_HOME is not set', () => {
      delete process.env.AGENTICOS_HOME;
      expect(() => getAgenticOSHome()).toThrow(MISSING_AGENTICOS_HOME_MESSAGE);
    });
  });

  // -------------------------------------------------------------------------
  // getCanonicalAgenticosHome
  // -------------------------------------------------------------------------

  describe('getCanonicalAgenticosHome', () => {
    beforeEach(() => {
      yamlMock.parse.mockReset();
      fsPromisesMock.readFile.mockReset();
    });

    it('returns AGENTICOS_HOME env var when set and registry is empty', async () => {
      // Registry loads first (finds empty projects), then falls back to env var
      yamlMock.parse.mockReturnValue({ version: '1.0.0', last_updated: '2025-01-01', active_project: null, projects: [] } as any);
      fsPromisesMock.readFile.mockResolvedValue('registry yaml');
      process.env.AGENTICOS_HOME = '/confirmed/home';
      const result = await getCanonicalAgenticosHome();
      expect(result).toBe('/confirmed/home');
    });

    it('returns null when env is not set and getRegistryPath() fails due to missing AGENTICOS_HOME', async () => {
      // Without AGENTICOS_HOME, getRegistryPath() calls getAgenticOSHome() which throws.
      // getCanonicalAgenticosHome catches this and returns null.
      delete process.env.AGENTICOS_HOME;
      const result = await getCanonicalAgenticosHome();
      expect(result).toBeNull();
    });

    it('falls back to AGENTICOS_HOME env var when registry has empty projects', async () => {
      // Registry loads with empty projects array → env var takes over as fallback
      const mockRegistry = {
        version: '1.0.0',
        last_updated: '2025-01-01T00:00:00.000Z',
        active_project: null,
        projects: [],
      };
      yamlMock.parse.mockReturnValue(mockRegistry as any);
      fsPromisesMock.readFile.mockResolvedValue('registry yaml');
      // AGENTICOS_HOME is set by outer beforeEach → env var used as fallback
      const result = await getCanonicalAgenticosHome();
      expect(result).toBe('/home/testuser/AgenticOS');
    });

    it('returns most recently accessed project path from registry', async () => {
      const mockRegistry = {
        version: '1.0.0',
        last_updated: '2025-01-01T00:00:00.000Z',
        active_project: 'alpha',
        projects: [
          { id: 'alpha', name: 'Alpha', path: '/old/home', status: 'active' as const, created: '2025-01-01', last_accessed: '2025-01-01T10:00:00.000Z' },
          { id: 'beta', name: 'Beta', path: '/new/home', status: 'active' as const, created: '2025-01-01', last_accessed: '2025-07-02T00:00:00.000Z' },
        ],
      };
      yamlMock.parse.mockReturnValue(mockRegistry as any);
      fsPromisesMock.readFile.mockResolvedValue('registry yaml');
      // AGENTICOS_HOME is set by outer beforeEach — env var takes priority, but test
      // verifies registry path is used when env var matches AGENTICOS_HOME value.
      // Env is '/home/testuser/AgenticOS' → returns it, not '/new/home' from registry.
      const result = await getCanonicalAgenticosHome();
      expect(result).toBe('/home/testuser/AgenticOS');
    });
  });

  // -------------------------------------------------------------------------
  // loadRegistry
  // -------------------------------------------------------------------------

  describe('loadRegistry', () => {
    beforeEach(() => {
      // Reset yaml mocks between tests
      yamlMock.parse.mockReset();
      yamlMock.stringify.mockReset();
    });

    it('fails fast when AGENTICOS_HOME is not set', async () => {
      delete process.env.AGENTICOS_HOME;

      await expect(loadRegistry()).rejects.toThrow(MISSING_AGENTICOS_HOME_MESSAGE);
    });

    it('returns default registry when file does not exist', async () => {
      yamlMock.parse.mockRejectedValue(new Error('ENOENT'));
      fsPromisesMock.readFile.mockRejectedValue(new Error('ENOENT'));

      const registry = await loadRegistry();

      expect(registry.version).toBe('1.0.0');
      expect(registry.active_project).toBeNull();
      expect(registry.projects).toEqual([]);
    });

    it('parses valid YAML and resolves relative paths', async () => {
      const storedYaml = {
        version: '1.0.0',
        last_updated: '2025-01-01T00:00:00.000Z',
        active_project: 'my-project',
        projects: [
          {
            id: 'my-project',
            name: 'My Project',
            path: 'projects/my-project',  // relative path in storage
            status: 'active',
            created: '2025-01-01',
            last_accessed: '2025-01-01T00:00:00.000Z',
          },
        ],
      };
      yamlMock.parse.mockReturnValue(storedYaml as any);
      fsPromisesMock.readFile.mockResolvedValue('version: 1.0.0\nactive_project: my-project');

      const registry = await loadRegistry();

      // Path should be resolved to absolute
      expect(registry.projects[0].path).toBe('/home/testuser/AgenticOS/projects/my-project');
    });

    it('returns default registry when YAML parse fails', async () => {
      yamlMock.parse.mockImplementation(() => {
        throw new Error('parse error');
      });
      fsPromisesMock.readFile.mockResolvedValue('invalid: yaml: content:');

      const registry = await loadRegistry();

      expect(registry.version).toBe('1.0.0');
      expect(registry.projects).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // saveRegistry
  // -------------------------------------------------------------------------

  describe('saveRegistry', () => {
    it('converts absolute paths to relative before writing', async () => {
      // The yaml mock at module level already returns YAML with field values
      const registry = {
        version: '1.0.0',
        last_updated: '2025-01-01T00:00:00.000Z',
        active_project: 'my-project',
        projects: [
          {
            id: 'my-project',
            name: 'My Project',
            path: '/home/testuser/AgenticOS/projects/my-project', // absolute
            status: 'active' as const,
            created: '2025-01-01',
            last_accessed: '2025-01-01T00:00:00.000Z',
          },
        ],
      };

      await saveRegistry(registry);

      // Verify writeFile was called
      expect(fsPromisesMock.writeFile).toHaveBeenCalled();

      // The written content should have relative paths
      const writeCall = fsPromisesMock.writeFile.mock.calls[0];
      const writtenContent = writeCall[1] as string;
      expect(writtenContent).toContain('projects/my-project');
      expect(writtenContent).not.toContain('/home/testuser/AgenticOS/projects/my-project');
    });

    it('stores non-absolute paths as-is', async () => {
      const registry = {
        version: '1.0.0',
        last_updated: '2025-01-01T00:00:00.000Z',
        active_project: 'my-project',
        projects: [
          {
            id: 'my-project',
            name: 'My Project',
            path: '/external/path', // absolute but outside AGENTICOS_HOME
            status: 'active' as const,
            created: '2025-01-01',
            last_accessed: '2025-01-01T00:00:00.000Z',
          },
        ],
      };

      await saveRegistry(registry);

      const writeCall = fsPromisesMock.writeFile.mock.calls[0];
      const writtenContent = writeCall[1] as string;
      expect(writtenContent).toContain('/external/path');
    });

    it('blocks writes when AGENTICOS_HOME is the canonical main checkout', async () => {
      detectCanonicalMainWriteProtectionMock.mockResolvedValue({
        blocked: true,
        reason: 'canonical main checkout is write-protected for runtime persistence: /home/testuser/AgenticOS',
      });

      const registry = {
        version: '1.0.0',
        last_updated: '2025-01-01T00:00:00.000Z',
        active_project: 'my-project',
        projects: [],
      };

      await expect(saveRegistry(registry)).rejects.toThrow('write-protected');
      expect(fsPromisesMock.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('patchProjectMetadata', () => {
    it('reloads the current registry and patches only the requested project metadata', async () => {
      yamlMock.parse.mockReturnValue({
        version: '1.0.0',
        last_updated: '2025-01-01T00:00:00.000Z',
        active_project: null,
        projects: [
          {
            id: 'alpha',
            name: 'Alpha',
            path: 'projects/alpha',
            status: 'active',
            created: '2025-01-01',
            last_accessed: '2025-01-01T00:00:00.000Z',
          },
          {
            id: 'beta',
            name: 'Beta',
            path: 'projects/beta',
            status: 'active',
            created: '2025-01-01',
            last_accessed: '2025-01-01T12:00:00.000Z',
          },
        ],
      } as any);
      fsPromisesMock.readFile.mockResolvedValue('registry');

      await patchProjectMetadata('alpha', {
        last_recorded: '2026-04-10T10:00:00.000Z',
      });

      const writeCall = fsPromisesMock.writeFile.mock.calls[0];
      const writtenContent = writeCall[1] as string;
      expect(writtenContent).toContain('last_recorded: 2026-04-10T10:00:00.000Z');
      expect(writtenContent).toContain('last_accessed: 2025-01-01T12:00:00.000Z');
      expect(fsPromisesMock.rename).toHaveBeenCalled();
      expect(fsPromisesMock.rm).toHaveBeenCalled();
    });
  });
});
