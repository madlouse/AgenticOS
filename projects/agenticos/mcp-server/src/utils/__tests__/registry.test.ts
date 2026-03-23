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

// Must import after mocks are set up
import { loadRegistry, saveRegistry, getAgenticOSHome } from '../registry.js';
import * as fsPromises from 'fs/promises';
import * as fs from 'fs';
import * as os from 'os';

const fsPromisesMock = fsPromises as typeof fsPromises & {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
  access: ReturnType<typeof vi.fn>;
};
const fsMock = fs as typeof fs & { existsSync: ReturnType<typeof vi.fn> };
const osMock = os as typeof os & { homedir: ReturnType<typeof vi.fn> };

describe('registry utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AGENTICOS_HOME;
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
      // Need to re-import to pick up the env change; the function reads
      // process.env at call time, so no re-import is needed.
      const result = getAgenticOSHome();
      expect(result).toBe('/custom/path');
    });

    it('falls back to ~/AgenticOS when env var is not set', () => {
      osMock.homedir.mockReturnValue('/home/testuser');
      fsMock.existsSync.mockReturnValue(false);
      const result = getAgenticOSHome();
      expect(result).toBe('/home/testuser/AgenticOS');
    });

    it('returns dev location when default lacks registry but dev location has it', () => {
      osMock.homedir.mockReturnValue('/home/testuser');
      // First call: default home lacks registry, second call: dev home has it
      fsMock.existsSync
        .mockReturnValueOnce(false)  // default home lacks registry
        .mockReturnValueOnce(true);   // dev home has registry
      const result = getAgenticOSHome();
      expect(result).toBe('/home/testuser/dev/AgenticOS');
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


    it('returns default registry when file does not exist', async () => {
      yamlMock.parse.mockRejectedValue(new Error('ENOENT'));
      fsPromisesMock.readFile.mockRejectedValue(new Error('ENOENT'));
      osMock.homedir.mockReturnValue('/home/testuser');
      fsMock.existsSync.mockReturnValue(false);

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
      osMock.homedir.mockReturnValue('/home/testuser');
      fsMock.existsSync.mockReturnValue(true);

      const registry = await loadRegistry();

      // Path should be resolved to absolute
      expect(registry.projects[0].path).toBe('/home/testuser/AgenticOS/projects/my-project');
    });

    it('returns default registry when YAML parse fails', async () => {
      yamlMock.parse.mockRejectedValue(new Error('parse error'));
      fsPromisesMock.readFile.mockResolvedValue('invalid: yaml: content:');
      osMock.homedir.mockReturnValue('/home/testuser');
      fsMock.existsSync.mockReturnValue(false);

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
      osMock.homedir.mockReturnValue('/home/testuser');
      fsMock.existsSync.mockReturnValue(true);

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
      osMock.homedir.mockReturnValue('/home/testuser');
      fsMock.existsSync.mockReturnValue(true);

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
  });
});
