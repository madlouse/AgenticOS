import { beforeEach, describe, expect, it, vi } from 'vitest';

const yamlMock = vi.hoisted(() => ({
  parse: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('yaml', () => ({
  default: yamlMock,
}));

vi.mock('../../utils/registry.js', () => ({
  loadRegistry: vi.fn(),
}));

import { readFile } from 'fs/promises';
import { loadRegistry } from '../../utils/registry.js';
import { runEditGuard } from '../edit-guard.js';

const readFileMock = readFile as unknown as ReturnType<typeof vi.fn>;
const loadRegistryMock = loadRegistry as unknown as ReturnType<typeof vi.fn>;

describe('runEditGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadRegistryMock.mockResolvedValue({
      active_project: 'agenticos-standards',
      projects: [
        {
          id: 'agenticos-standards',
          name: 'agenticos-standards',
          path: '/workspace/projects/agenticos/standards',
          status: 'active',
          created: '2026-03-20',
          last_accessed: '2026-03-20T00:00:00.000Z',
        },
      ],
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: {
            id: 'agenticos-standards',
            name: 'agenticos-standards',
          },
        });
      }

      if (path.endsWith('/.context/state.yaml')) {
        return JSON.stringify({
          guardrail_evidence: {
            preflight: {
              issue_id: '113',
              repo_path: '/workspace/source',
              declared_target_files: [
                'projects/agenticos/mcp-server/src/index.ts',
                'projects/agenticos/tools/check-edit-boundary.sh',
              ],
              result: {
                status: 'PASS',
              },
            },
          },
        });
      }

      throw new Error(`Unexpected path: ${path}`);
    });
    yamlMock.parse.mockImplementation((content: string) => JSON.parse(content));
  });

  it('passes when active project and latest preflight both match the intended edit', async () => {
    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: [
        'projects/agenticos/mcp-server/src/index.ts',
      ],
    })) as { status: string; preflight_ok: boolean; scope_ok: boolean };

    expect(result.status).toBe('PASS');
    expect(result.preflight_ok).toBe(true);
    expect(result.scope_ok).toBe(true);
  });

  it('blocks when active project does not match the intended target project', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: 'cc-switch',
      projects: [],
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: [
        'projects/agenticos/mcp-server/src/index.ts',
      ],
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('does not match target project');
  });

  it('blocks when no preflight evidence is recorded', async () => {
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: {
            id: 'agenticos-standards',
            name: 'agenticos-standards',
          },
        });
      }

      if (path.endsWith('/.context/state.yaml')) {
        return JSON.stringify({});
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: [
        'projects/agenticos/mcp-server/src/index.ts',
      ],
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('no preflight evidence');
  });

  it('blocks when attempted targets exceed the preflight-declared scope', async () => {
    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: [
        'projects/agenticos/mcp-server/src/index.ts',
        'README.md',
      ],
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('exceed the latest preflight scope');
  });
});
