import { beforeEach, describe, expect, it, vi } from 'vitest';

const execAsyncMock = vi.hoisted(() => vi.fn());
const yamlMock = vi.hoisted(() => ({
  parse: vi.fn(),
}));
const resolveGuardrailProjectTargetMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn(() => execAsyncMock),
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

vi.mock('../../utils/repo-boundary.js', () => ({
  isImplementationAffectingTask: (taskType: string) => taskType === 'implementation' || taskType === 'bugfix',
  resolveGuardrailProjectTarget: resolveGuardrailProjectTargetMock,
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
      projects: [],
    });
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos-standards',
      resolutionSource: 'repo_path_match',
      resolutionErrors: [],
      targetProject: {
        id: 'agenticos-standards',
        name: 'agenticos-standards',
        path: '/workspace/projects/agenticos/standards',
        statePath: '/workspace/projects/agenticos/standards/.context/state.yaml',
        projectYamlPath: '/workspace/projects/agenticos/standards/.project.yaml',
        sourceRepoRoots: ['/workspace/source'],
        sourceRepoRootsDeclared: true,
      },
    });
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/workspace/source\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '.git\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --abbrev-ref HEAD')) {
        return { stdout: 'feat/113-fail-closed-edit-boundaries\n', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/.context/state.yaml')) {
        return JSON.stringify({
          issue_bootstrap: {
            latest: {
              issue_id: '113',
              repo_path: '/workspace/source',
              current_branch: 'feat/113-fail-closed-edit-boundaries',
            },
          },
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

  it('blocks when the target project cannot be resolved and asks for an explicit managed project path', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'cc-switch',
      resolutionSource: null,
      resolutionErrors: ['target project could not be resolved from repo_path or session binding; pass project_path explicitly'],
      targetProject: null,
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'implementation',
      repo_path: '/workspace/source',
      declared_target_files: [
        'projects/agenticos/mcp-server/src/index.ts',
      ],
    })) as { status: string; block_reasons: string[]; recovery_actions: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('pass project_path explicitly');
    expect(result.recovery_actions.join(' ')).toContain('pass project_path');
  });

  it('blocks when no preflight evidence is recorded', async () => {
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/.context/state.yaml')) {
        return JSON.stringify({
          issue_bootstrap: {
            latest: {
              issue_id: '113',
              repo_path: '/workspace/source',
              current_branch: 'feat/113-fail-closed-edit-boundaries',
            },
          },
        });
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

  it('blocks when no issue bootstrap evidence is recorded', async () => {
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/.context/state.yaml')) {
        return JSON.stringify({
          guardrail_evidence: {
            preflight: {
              issue_id: '113',
              repo_path: '/workspace/source',
              declared_target_files: [
                'projects/agenticos/mcp-server/src/index.ts',
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
    expect(result.block_reasons.join(' ')).toContain('no issue bootstrap evidence');
  });

  it('blocks when the latest issue bootstrap does not match the requested issue', async () => {
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/.context/state.yaml')) {
        return JSON.stringify({
          issue_bootstrap: {
            latest: {
              issue_id: '179',
              repo_path: '/workspace/source',
              current_branch: 'feat/113-fail-closed-edit-boundaries',
            },
          },
          guardrail_evidence: {
            preflight: {
              issue_id: '113',
              repo_path: '/workspace/source',
              declared_target_files: [
                'projects/agenticos/mcp-server/src/index.ts',
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
    expect(result.block_reasons.join(' ')).toContain('latest issue bootstrap issue');
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

  it('blocks bugfix edits when the git common repo root is not declared for the target project', async () => {
    execAsyncMock.mockImplementation(async (cmd: string) => {
      if (cmd.includes('rev-parse --show-toplevel')) {
        return { stdout: '/workspace/wrong-repo\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --git-common-dir')) {
        return { stdout: '.git\n', stderr: '' };
      }
      if (cmd.includes('rev-parse --abbrev-ref HEAD')) {
        return { stdout: 'fix/113-wrong-repo\n', stderr: '' };
      }
      throw new Error(`Unexpected command: ${cmd}`);
    });

    const result = JSON.parse(await runEditGuard({
      issue_id: '113',
      task_type: 'bugfix',
      repo_path: '/workspace/wrong-repo',
      project_path: '/workspace/projects/agenticos/standards',
      declared_target_files: [
        'projects/agenticos/mcp-server/src/index.ts',
      ],
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('not declared for target project');
  });
});
