import { beforeEach, describe, expect, it, vi } from 'vitest';

const yamlMock = vi.hoisted(() => ({
  parse: vi.fn(),
  stringify: vi.fn((obj: unknown) => JSON.stringify(obj)),
}));

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('yaml', () => ({
  default: yamlMock,
}));

vi.mock('../registry.js', () => ({
  getAgenticOSHome: vi.fn(() => '/runtime'),
  loadRegistry: vi.fn(),
}));

vi.mock('../canonical-main-guard.js', () => ({
  detectCanonicalMainWriteProtection: vi.fn(async () => ({ blocked: false })),
}));

import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises';
import { detectCanonicalMainWriteProtection } from '../canonical-main-guard.js';
import { loadRegistry } from '../registry.js';
import {
  extractLatestIssueBootstrap,
  guardrailSessionKey,
  loadLatestGuardrailState,
  loadScopedGuardrailState,
  persistGuardrailEvidence,
  persistIssueBootstrapEvidence,
} from '../guardrail-evidence.js';

const accessMock = access as unknown as ReturnType<typeof vi.fn>;
const mkdirMock = mkdir as unknown as ReturnType<typeof vi.fn>;
const readFileMock = readFile as unknown as ReturnType<typeof vi.fn>;
const renameMock = rename as unknown as ReturnType<typeof vi.fn>;
const rmMock = rm as unknown as ReturnType<typeof vi.fn>;
const statMock = stat as unknown as ReturnType<typeof vi.fn>;
const writeFileMock = writeFile as unknown as ReturnType<typeof vi.fn>;
const loadRegistryMock = loadRegistry as unknown as ReturnType<typeof vi.fn>;
const detectCanonicalMainWriteProtectionMock = detectCanonicalMainWriteProtection as unknown as ReturnType<typeof vi.fn>;

function defaultProjectYaml(id = 'agenticos', name = 'AgenticOS'): string {
  return JSON.stringify({
    meta: { id, name },
    agent_context: { current_state: 'standards/.context/state.yaml' },
    source_control: { topology: 'github_versioned', context_publication_policy: 'public_distilled', github_repo: 'madlouse/AgenticOS', branch_strategy: 'github_flow' },
    execution: { source_repo_roots: ['.'] },
  });
}

describe('guardrail runtime persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    yamlMock.parse.mockImplementation((content: string) => {
      try {
        return JSON.parse(content);
      } catch {
        return undefined;
      }
    });
    yamlMock.stringify.mockImplementation((obj: unknown) => JSON.stringify(obj));
    loadRegistryMock.mockResolvedValue({
      active_project: 'agenticos',
      projects: [
        {
          id: 'agenticos',
          name: 'AgenticOS',
          path: '/workspace/projects/agenticos',
          status: 'active',
          created: '2026-03-23',
          last_accessed: '2026-03-23T00:00:00.000Z',
        },
      ],
    });
    accessMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    renameMock.mockResolvedValue(undefined);
    rmMock.mockResolvedValue(undefined);
    statMock.mockResolvedValue({ mtimeMs: Date.now() });
    writeFileMock.mockResolvedValue(undefined);
    detectCanonicalMainWriteProtectionMock.mockResolvedValue({ blocked: false });
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return defaultProjectYaml();
      }
      throw new Error(`missing: ${path}`);
    });
  });

  it('persists latest preflight evidence into the runtime guardrail state file', async () => {
    const result = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: '/workspace/projects/agenticos/mcp-server',
      payload: {
        issue_id: '62',
        result: { status: 'PASS', summary: 'preflight passed' },
      },
    });

    expect(result.persisted).toBe(true);
    expect(result.project_id).toBe('agenticos');
    expect(result.state_path).toBe('/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml');
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(renameMock).toHaveBeenCalledWith(
      expect.stringContaining('/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml.tmp-'),
      '/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml',
    );

    const [, content] = writeFileMock.mock.calls[0];
    const writtenState = JSON.parse(content as string);
    expect(writtenState.guardrail_evidence.last_command).toBe('agenticos_preflight');
    expect(writtenState.guardrail_evidence.preflight.issue_id).toBe('62');
    expect(writtenState.guardrail_evidence.preflight.result.status).toBe('PASS');
  });

  it('stores runtime guardrail state under an encoded project id segment', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: '../escaped-project',
      projects: [
        {
          id: '../escaped-project',
          name: 'Escaped Project',
          path: '/workspace/projects/escaped',
          status: 'active',
          created: '2026-03-23',
          last_accessed: '2026-03-23T00:00:00.000Z',
        },
      ],
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return defaultProjectYaml('../escaped-project', 'Escaped Project');
      }
      throw new Error(`missing: ${path}`);
    });

    const result = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: '/workspace/projects/escaped/mcp-server',
      payload: {
        issue_id: '62',
      },
    });

    expect(result.persisted).toBe(true);
    expect(result.state_path).toBe('/runtime/.agent-workspace/projects/..%2Fescaped-project/guardrail-state.yaml');
    expect(renameMock).toHaveBeenCalledWith(
      expect.stringContaining('/runtime/.agent-workspace/projects/..%2Fescaped-project/guardrail-state.yaml.tmp-'),
      '/runtime/.agent-workspace/projects/..%2Fescaped-project/guardrail-state.yaml',
    );
  });

  it('resolves registry-backed projects when repo_path equals the project root exactly', async () => {
    const result = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: '/workspace/projects/agenticos',
      payload: {
        issue_id: '62',
      },
    });

    expect(result.persisted).toBe(true);
    expect(result.project_id).toBe('agenticos');
  });

  it('overwrites the previous latest entry for the same command in runtime state', async () => {
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return defaultProjectYaml();
      }
      if (path.endsWith('/guardrail-state.yaml')) {
        return JSON.stringify({
          guardrail_evidence: {
            last_command: 'agenticos_preflight',
            preflight: {
              command: 'agenticos_preflight',
              recorded_at: '2026-03-23T09:00:00.000Z',
              issue_id: '36',
              result: { status: 'BLOCK' },
            },
            pr_scope_check: {
              command: 'agenticos_pr_scope_check',
              issue_id: '36',
              result: { status: 'PASS' },
            },
          },
        });
      }
      throw new Error(`missing: ${path}`);
    });

    await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: '/workspace/projects/agenticos/mcp-server',
      payload: {
        issue_id: '62',
        result: { status: 'PASS', summary: 'preflight passed' },
      },
    });

    const [, content] = writeFileMock.mock.calls[0];
    const writtenState = JSON.parse(content as string);
    expect(writtenState.guardrail_evidence.preflight.issue_id).toBe('62');
    expect(writtenState.guardrail_evidence.preflight.result.status).toBe('PASS');
    expect(writtenState.guardrail_evidence.pr_scope_check.issue_id).toBe('36');
  });

  it('persists pr-scope-check evidence into the matching runtime slot', async () => {
    const result = await persistGuardrailEvidence({
      command: 'agenticos_pr_scope_check',
      repo_path: '/workspace/projects/agenticos/mcp-server',
      payload: {
        issue_id: '71',
        result: { status: 'PASS' },
      },
    });

    expect(result.persisted).toBe(true);
    const [, content] = writeFileMock.mock.calls[0];
    const writtenState = JSON.parse(content as string);
    expect(writtenState.guardrail_evidence.last_command).toBe('agenticos_pr_scope_check');
    expect(writtenState.guardrail_evidence.pr_scope_check.issue_id).toBe('71');
  });

  it('falls back to the nearest on-disk project root when registry does not contain the repo path', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [],
    });
    accessMock
      .mockRejectedValueOnce(new Error('missing repo-level .project.yaml'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    readFileMock.mockResolvedValueOnce(JSON.stringify({ meta: { id: 'local-agenticos' } }));

    const result = await persistGuardrailEvidence({
      command: 'agenticos_branch_bootstrap',
      repo_path: '/workspace/source/projects/agenticos/mcp-server',
      payload: {
        issue_id: '62',
        result: { status: 'CREATED', branch_name: 'feat/62-guardrail-evidence' },
      },
    });

    expect(result.persisted).toBe(true);
    expect(result.project_id).toBe('local-agenticos');
    expect(result.state_path).toBe('/runtime/.agent-workspace/projects/local-agenticos/guardrail-state.yaml');
  });

  it('walks up from unreadable nested project metadata until it finds a usable parent project root', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [],
    });
    accessMock.mockImplementation(async (path: string) => {
      const text = String(path);
      if (text.endsWith('/nested/.project.yaml')) return undefined;
      if (text.endsWith('/nested/.context/state.yaml')) throw new Error('missing');
      if (text.endsWith('/parent/.project.yaml')) return undefined;
      if (text.endsWith('/parent/.context/state.yaml')) return undefined;
      throw new Error('missing');
    });
    readFileMock.mockImplementation(async (path: string) => {
      const text = String(path);
      if (text.endsWith('/nested/.project.yaml')) {
        throw new Error('bad yaml');
      }
      if (text.endsWith('/parent/.project.yaml')) {
        return JSON.stringify({ meta: { id: 'parent-project' } });
      }
      throw new Error(`missing: ${path}`);
    });

    const result = await persistGuardrailEvidence({
      command: 'agenticos_branch_bootstrap',
      repo_path: '/workspace/source/parent/nested/mcp-server',
      payload: {
        issue_id: '62',
        result: { status: 'CREATED', branch_name: 'feat/62-guardrail-evidence' },
      },
    });

    expect(result.persisted).toBe(true);
    expect(result.project_id).toBe('parent-project');
    expect(result.state_path).toBe('/runtime/.agent-workspace/projects/parent-project/guardrail-state.yaml');
  });

  it('falls back to a directory-derived id when walked-up project metadata parses to null', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [],
    });
    accessMock.mockImplementation(async (path: string) => {
      const text = String(path);
      if (text.endsWith('/nested/.project.yaml')) return undefined;
      if (text.endsWith('/nested/.context/state.yaml')) return undefined;
      throw new Error('missing');
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith('/nested/.project.yaml')) {
        return 'null';
      }
      throw new Error(`missing: ${path}`);
    });

    const result = await persistGuardrailEvidence({
      command: 'agenticos_branch_bootstrap',
      repo_path: '/workspace/source/nested/mcp-server',
      payload: {
        issue_id: '62',
      },
    });

    expect(result.persisted).toBe(true);
    expect(result.project_id).toBe('nested');
  });

  it('returns unresolved when the filesystem root has project metadata but no readable state surface', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [],
    });
    accessMock.mockImplementation(async (path: string) => {
      const text = String(path);
      if (text === '/.project.yaml') return undefined;
      throw new Error('missing');
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path) === '/.project.yaml') {
        return JSON.stringify({ meta: { id: 'root-project' } });
      }
      throw new Error(`missing: ${path}`);
    });

    const result = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: '/',
      payload: {
        issue_id: '62',
      },
    });

    expect(result.persisted).toBe(false);
    expect(result.reason).toContain('not within a resolvable AgenticOS project');
  });

  it('uses explicit project_path when repo_path is a larger checkout root', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [],
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: { id: 'agenticos-standards' },
          agent_context: { current_state: '.context/state.yaml' },
        });
      }
      throw new Error(`missing: ${path}`);
    });

    const result = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: '/workspace/source',
      project_path: '/workspace/source/projects/agenticos/standards',
      payload: {
        issue_id: '113',
        result: { status: 'PASS' },
      },
    });

    expect(result.persisted).toBe(true);
    expect(result.project_id).toBe('agenticos-standards');
    expect(result.state_path).toBe('/runtime/.agent-workspace/projects/agenticos-standards/guardrail-state.yaml');
  });

  it('fails closed when explicit project_path is not a resolvable AgenticOS project', async () => {
    accessMock.mockRejectedValue(new Error('missing'));

    const result = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: '/workspace/source',
      project_path: '/workspace/source/projects/missing',
      payload: {
        issue_id: '113',
      },
    });

    expect(result.persisted).toBe(false);
    expect(result.reason).toContain('project_path is not a resolvable AgenticOS project');
  });

  it('fails closed when explicit project_path metadata is unreadable or missing state', async () => {
    accessMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith('/projects/explicit/.project.yaml')) {
        return undefined;
      }
      throw new Error('missing');
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith('/projects/explicit/.project.yaml')) {
        throw new Error('bad yaml');
      }
      throw new Error(`missing: ${path}`);
    });

    const result = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: '/workspace/source',
      project_path: '/workspace/source/projects/explicit',
      payload: {
        issue_id: '113',
      },
    });

    expect(result.persisted).toBe(false);
    expect(result.reason).toContain('project_path is not a resolvable AgenticOS project');
  });

  it('falls back to basename when explicit project metadata parses to null but state exists', async () => {
    accessMock.mockImplementation(async (path: string) => {
      const text = String(path);
      if (text.endsWith('/projects/explicit/.project.yaml')) return undefined;
      if (text.endsWith('/projects/explicit/.context/state.yaml')) return undefined;
      throw new Error('missing');
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith('/projects/explicit/.project.yaml')) {
        return 'null';
      }
      throw new Error(`missing: ${path}`);
    });

    const result = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: '/workspace/source',
      project_path: '/workspace/source/projects/explicit',
      payload: {
        issue_id: '113',
      },
    });

    expect(result.persisted).toBe(true);
    expect(result.project_id).toBe('explicit');
  });

  it('fails closed when registry project yaml is unreadable and no readable parent yaml exists', async () => {
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/workspace/projects/agenticos/.project.yaml') || path.endsWith('/workspace/projects/agenticos/.project.yaml'.replace('/workspace', ''))) {
        throw new Error('bad yaml');
      }
      if (path.endsWith('/guardrail-state.yaml')) {
        throw new Error(`missing: ${path}`);
      }
      throw new Error(`missing: ${path}`);
    });

    const result = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: '/workspace/projects/agenticos/mcp-server',
      payload: {
        issue_id: '62',
      },
    });

    expect(result.persisted).toBe(false);
    expect(result.reason).toContain('not within a resolvable AgenticOS project');
  });

  it('falls back to the registry project id when registry project metadata parses to null', async () => {
    accessMock.mockImplementation(async (path: string) => {
      const text = String(path);
      if (text.endsWith('/workspace/projects/agenticos/.project.yaml')) return undefined;
      if (text.endsWith('/workspace/projects/agenticos/.context/state.yaml')) return undefined;
      throw new Error('missing');
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith('/workspace/projects/agenticos/.project.yaml')) {
        return 'null';
      }
      throw new Error(`missing: ${path}`);
    });

    const result = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: '/workspace/projects/agenticos/mcp-server',
      payload: {
        issue_id: '62',
      },
    });

    expect(result.persisted).toBe(true);
    expect(result.project_id).toBe('agenticos');
  });

  it('falls back to basename when registry metadata has neither meta.id nor fallback id', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: '',
      projects: [
        {
          id: '',
          name: 'AgenticOS',
          path: '/workspace/projects/agenticos',
          status: 'active',
          created: '2026-03-23',
          last_accessed: '2026-03-23T00:00:00.000Z',
        },
      ],
    });
    accessMock.mockImplementation(async (path: string) => {
      const text = String(path);
      if (text.endsWith('/workspace/projects/agenticos/.project.yaml')) return undefined;
      if (text.endsWith('/workspace/projects/agenticos/.context/state.yaml')) return undefined;
      throw new Error('missing');
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith('/workspace/projects/agenticos/.project.yaml')) {
        return 'null';
      }
      throw new Error(`missing: ${path}`);
    });

    const result = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: '/workspace/projects/agenticos/mcp-server',
      payload: {
        issue_id: '62',
      },
    });

    expect(result.persisted).toBe(true);
    expect(result.project_id).toBe('agenticos');
  });

  it('persists successfully when registry project metadata is valid even if committed state is absent', async () => {
    accessMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith('/.project.yaml')) {
        return undefined;
      }
      throw new Error('missing');
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return defaultProjectYaml();
      }
      throw new Error(`missing: ${path}`);
    });

    const result = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: '/workspace/projects/agenticos/mcp-server',
      payload: {
        issue_id: '62',
      },
    });

    expect(result.persisted).toBe(true);
    expect(result.project_id).toBe('agenticos');
  });

  it('does not write runtime state when repo_path is outside managed projects', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [],
    });
    accessMock.mockRejectedValue(new Error('missing'));
    readFileMock.mockRejectedValue(new Error('missing'));

    const result = await persistGuardrailEvidence({
      command: 'agenticos_pr_scope_check',
      repo_path: '/external/repo',
      payload: {
        issue_id: '62',
        result: { status: 'BLOCK' },
      },
    });

    expect(result.persisted).toBe(false);
    expect(result.reason).toContain('not within a resolvable AgenticOS project');
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('fails closed when guardrail evidence persistence is called without repo_path', async () => {
    const result = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      payload: { issue_id: '62' },
    } as any);

    expect(result.persisted).toBe(false);
    expect(result.attempted).toBe(false);
    expect(result.reason).toContain('repo_path is required');
  });

  it('does not persist runtime guardrail evidence when AGENTICOS_HOME is canonical main', async () => {
    detectCanonicalMainWriteProtectionMock.mockResolvedValue({
      blocked: true,
      reason: 'canonical main checkout is write-protected for runtime persistence: /runtime',
    });

    const result = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: '/workspace/root/projects/agenticos/mcp-server',
      payload: {
        issue_id: '212',
        result: { status: 'REDIRECT' },
      },
    });

    expect(result.persisted).toBe(false);
    expect(result.reason).toContain('write-protected');
    expect(result.state_path).toBe('/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml');
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('persists the latest issue bootstrap record into runtime guardrail state', async () => {
    const result = await persistIssueBootstrapEvidence({
      repo_path: '/workspace/projects/agenticos/mcp-server',
      payload: {
        issue_id: '260',
        issue_title: 'Stop runtime persistence pollution',
        repo_path: '/workspace/projects/agenticos/mcp-server',
      },
    });

    expect(result.persisted).toBe(true);
    expect(result.project_id).toBe('agenticos');
    expect(result.state_path).toBe('/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml');

    const [, content] = writeFileMock.mock.calls[0];
    const writtenState = JSON.parse(content as string);
    expect(writtenState.issue_bootstrap.latest.issue_id).toBe('260');
    expect(writtenState.issue_bootstrap.latest.issue_title).toBe('Stop runtime persistence pollution');
    expect(writtenState.issue_bootstrap.latest.repo_path).toBe('/workspace/projects/agenticos/mcp-server');
  });

  it('fails closed when issue bootstrap persistence is called without repo_path', async () => {
    const result = await persistIssueBootstrapEvidence({
      payload: {
        issue_id: '260',
        issue_title: 'Stop runtime persistence pollution',
      },
    } as any);

    expect(result.persisted).toBe(false);
    expect(result.attempted).toBe(false);
    expect(result.reason).toContain('repo_path is required');
  });

  it('does not persist issue bootstrap evidence when the target project cannot be resolved', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [],
    });
    accessMock.mockRejectedValue(new Error('missing'));
    readFileMock.mockRejectedValue(new Error('missing'));

    const result = await persistIssueBootstrapEvidence({
      repo_path: '/external/repo',
      payload: {
        issue_id: '260',
        issue_title: 'Stop runtime persistence pollution',
      },
    });

    expect(result.persisted).toBe(false);
    expect(result.reason).toContain('not within a resolvable AgenticOS project');
  });

  it('fails closed when explicit project_path for issue bootstrap is not resolvable', async () => {
    accessMock.mockRejectedValue(new Error('missing'));

    const result = await persistIssueBootstrapEvidence({
      repo_path: '/workspace/source',
      project_path: '/workspace/source/projects/missing',
      payload: {
        issue_id: '260',
        issue_title: 'Stop runtime persistence pollution',
      },
    });

    expect(result.persisted).toBe(false);
    expect(result.reason).toContain('project_path is not a resolvable AgenticOS project');
  });

  it('does not persist issue bootstrap evidence when AGENTICOS_HOME is canonical main', async () => {
    detectCanonicalMainWriteProtectionMock.mockResolvedValue({
      blocked: true,
      reason: 'canonical main checkout is write-protected for runtime persistence: /runtime',
    });

    const result = await persistIssueBootstrapEvidence({
      repo_path: '/workspace/projects/agenticos/mcp-server',
      payload: {
        issue_id: '260',
        issue_title: 'Stop runtime persistence pollution',
      },
    });

    expect(result.persisted).toBe(false);
    expect(result.reason).toContain('write-protected');
    expect(result.state_path).toBe('/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml');
  });

  it('returns an error when the runtime lock cannot be acquired', async () => {
    let mkdirCalls = 0;
    mkdirMock.mockImplementation(async (path: string) => {
      mkdirCalls += 1;
      if (String(path).endsWith('/guardrail-state.lock')) {
        throw new Error('busy');
      }
      return undefined;
    });

    const result = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: '/workspace/projects/agenticos/mcp-server',
      payload: {
        issue_id: '62',
      },
    });

    expect(result.persisted).toBe(false);
    expect(result.reason).toContain('failed to acquire guardrail runtime lock');
    expect(mkdirCalls).toBeGreaterThan(1);
  });

  it('fails lock acquisition when lock metadata cannot be inspected', async () => {
    mkdirMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith('/guardrail-state.lock')) {
        throw new Error('busy');
      }
      return undefined;
    });
    statMock.mockRejectedValue(new Error('stat failed'));

    const result = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: '/workspace/projects/agenticos/mcp-server',
      payload: {
        issue_id: '62',
      },
    });

    expect(result.persisted).toBe(false);
    expect(result.reason).toContain('failed to acquire guardrail runtime lock');
  });

  it('reaps a stale runtime lock before persisting new evidence', async () => {
    let lockAttempts = 0;
    mkdirMock.mockImplementation(async (path: string) => {
      const text = String(path);
      if (!text.endsWith('/guardrail-state.lock')) {
        return undefined;
      }
      lockAttempts += 1;
      if (lockAttempts === 1) {
        throw new Error('busy');
      }
      return undefined;
    });
    statMock.mockResolvedValue({ mtimeMs: Date.now() - 60_000 });

    const result = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: '/workspace/projects/agenticos/mcp-server',
      payload: {
        issue_id: '62',
      },
    });

    expect(result.persisted).toBe(true);
    expect(rmMock).toHaveBeenCalledWith(
      '/runtime/.agent-workspace/projects/agenticos/guardrail-state.lock',
      { recursive: true, force: true },
    );
    expect(lockAttempts).toBe(2);
  });

  it('uses the non-Error fallback message when guardrail persistence throws a primitive', async () => {
    writeFileMock.mockRejectedValue('primitive-failure');

    const result = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: '/workspace/projects/agenticos/mcp-server',
      payload: {
        issue_id: '62',
      },
    });

    expect(result.persisted).toBe(false);
    expect(result.reason).toBe('failed to persist runtime guardrail evidence');
  });

  it('uses repo_path when issue bootstrap payload omits repo_path', async () => {
    const result = await persistIssueBootstrapEvidence({
      repo_path: '/workspace/projects/agenticos/mcp-server',
      payload: {
        issue_id: '260',
        issue_title: 'Stop runtime persistence pollution',
      },
    });

    expect(result.persisted).toBe(true);
    const [, content] = writeFileMock.mock.calls[0];
    const writtenState = JSON.parse(content as string);
    expect(writtenState.issue_bootstrap.latest.repo_path).toBe('/workspace/projects/agenticos/mcp-server');
  });

  it('uses the non-Error fallback message when issue bootstrap persistence throws a primitive', async () => {
    writeFileMock.mockRejectedValue('primitive-failure');

    const result = await persistIssueBootstrapEvidence({
      repo_path: '/workspace/projects/agenticos/mcp-server',
      payload: {
        issue_id: '260',
        issue_title: 'Stop runtime persistence pollution',
      },
    });

    expect(result.persisted).toBe(false);
    expect(result.reason).toBe('failed to persist runtime issue bootstrap evidence');
  });
});

describe('loadLatestGuardrailState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    yamlMock.parse.mockImplementation((content: string) => {
      try {
        return JSON.parse(content);
      } catch {
        return undefined;
      }
    });
  });

  it('prefers runtime state and merges missing fields from committed state', async () => {
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/guardrail-state.yaml')) {
        return JSON.stringify({
          guardrail_evidence: {
            preflight: {
              issue_id: '294',
              result: { status: 'PASS' },
            },
          },
        });
      }
      if (path.endsWith('/standards/.context/state.yaml')) {
        return JSON.stringify({
          issue_bootstrap: {
            latest: {
              issue_id: '294',
              current_branch: 'chore/294-eliminate-canonical-main-runtime-write-paths',
            },
          },
        });
      }
      throw new Error(`missing: ${path}`);
    });

    const loaded = await loadLatestGuardrailState({
      project_id: 'agenticos',
      committed_state_path: '/workspace/projects/agenticos/standards/.context/state.yaml',
    });

    expect(loaded.source).toBe('runtime');
    expect(loaded.state_path).toBe('/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml');
    expect(loaded.state.guardrail_evidence?.preflight?.issue_id).toBe('294');
    expect(loaded.state.issue_bootstrap?.latest?.issue_id).toBe('294');
  });

  it('merges committed guardrail slots when runtime state only updates a subset of evidence', async () => {
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith('/guardrail-state.yaml')) {
        return JSON.stringify({
          guardrail_evidence: {
            last_command: 'agenticos_branch_bootstrap',
            branch_bootstrap: {
              issue_id: '294',
              result: { status: 'CREATED' },
            },
          },
        });
      }
      if (String(path).endsWith('/standards/.context/state.yaml')) {
        return JSON.stringify({
          guardrail_evidence: {
            last_command: 'agenticos_preflight',
            preflight: {
              issue_id: '260',
              result: { status: 'PASS' },
            },
          },
        });
      }
      throw new Error(`missing: ${path}`);
    });

    const loaded = await loadLatestGuardrailState({
      project_id: 'agenticos',
      committed_state_path: '/workspace/projects/agenticos/standards/.context/state.yaml',
    });

    expect(loaded.source).toBe('runtime');
    expect(loaded.state.guardrail_evidence?.last_command).toBe('agenticos_branch_bootstrap');
    expect(loaded.state.guardrail_evidence?.branch_bootstrap?.issue_id).toBe('294');
    expect(loaded.state.guardrail_evidence?.preflight?.issue_id).toBe('260');
  });

  it('merges committed snapshots when runtime state omits guardrail and bootstrap sections', async () => {
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith('/guardrail-state.yaml')) {
        return JSON.stringify({ other: true });
      }
      if (String(path).endsWith('/standards/.context/state.yaml')) {
        return JSON.stringify({
          guardrail_evidence: {
            preflight: {
              issue_id: '294',
            },
          },
          issue_bootstrap: {
            latest: {
              issue_id: '294',
            },
          },
        });
      }
      throw new Error(`missing: ${path}`);
    });

    const loaded = await loadLatestGuardrailState({
      project_id: 'agenticos',
      committed_state_path: '/workspace/projects/agenticos/standards/.context/state.yaml',
    });

    expect(loaded.state.guardrail_evidence?.preflight?.issue_id).toBe('294');
    expect(loaded.state.issue_bootstrap?.latest?.issue_id).toBe('294');
  });

  it('falls back to committed state when runtime state parses to a non-object value', async () => {
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith('/guardrail-state.yaml')) {
        return '"bad-state"';
      }
      if (String(path).endsWith('/standards/.context/state.yaml')) {
        return JSON.stringify({
          issue_bootstrap: {
            latest: {
              issue_id: '260',
            },
          },
        });
      }
      throw new Error(`missing: ${path}`);
    });

    const loaded = await loadLatestGuardrailState({
      project_id: 'agenticos',
      committed_state_path: '/workspace/projects/agenticos/standards/.context/state.yaml',
    });

    expect(loaded.source).toBe('committed');
    expect(loaded.state.issue_bootstrap?.latest?.issue_id).toBe('260');
  });

  it('falls back to committed state when runtime state is absent', async () => {
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/guardrail-state.yaml')) {
        throw new Error(`missing: ${path}`);
      }
      if (path.endsWith('/standards/.context/state.yaml')) {
        return JSON.stringify({
          issue_bootstrap: {
            latest: {
              issue_id: '260',
            },
          },
        });
      }
      throw new Error(`missing: ${path}`);
    });

    const loaded = await loadLatestGuardrailState({
      project_id: 'agenticos',
      committed_state_path: '/workspace/projects/agenticos/standards/.context/state.yaml',
    });

    expect(loaded.source).toBe('committed');
    expect(loaded.state_path).toBe('/workspace/projects/agenticos/standards/.context/state.yaml');
    expect(loaded.state.issue_bootstrap?.latest?.issue_id).toBe('260');
  });

  it('returns an empty runtime result when neither runtime nor committed state exists', async () => {
    readFileMock.mockRejectedValue(new Error('missing'));

    const loaded = await loadLatestGuardrailState({
      project_id: 'agenticos',
    });

    expect(loaded.source).toBeNull();
    expect(loaded.state_path).toBe('/runtime/.agent-workspace/projects/agenticos/guardrail-state.yaml');
    expect(loaded.state).toEqual({});
  });

  it('keeps a runtime-only state when neither runtime nor committed guardrail sections exist', async () => {
    readFileMock.mockImplementation(async (path: string) => {
      if (String(path).endsWith('/guardrail-state.yaml')) {
        return JSON.stringify({ other: true });
      }
      throw new Error(`missing: ${path}`);
    });

    const loaded = await loadLatestGuardrailState({
      project_id: 'agenticos',
    });

    expect(loaded.source).toBe('runtime');
    expect(loaded.state).toEqual({ other: true, guardrail_evidence: undefined, issue_bootstrap: undefined });
  });

  it('extracts the latest issue bootstrap only when the state shape is valid', () => {
    expect(extractLatestIssueBootstrap(undefined)).toBeNull();
    expect(extractLatestIssueBootstrap({ issue_bootstrap: { latest: null } } as any)).toBeNull();
    expect(extractLatestIssueBootstrap({ issue_bootstrap: { latest: 'bad-shape' } } as any)).toBeNull();
    expect(extractLatestIssueBootstrap({
      issue_bootstrap: {
        latest: {
          issue_id: '294',
        },
      },
    } as any)?.issue_id).toBe('294');
  });
});

describe('guardrail session partitioning (#573)', () => {
  // In-memory runtime file so read-modify-write persists across persist calls,
  // letting us simulate two concurrent sessions writing the same project's state.
  const files = new Map<string, string>();
  const temps = new Map<string, string>();

  const REPO_A = '/workspace/projects/agenticos/wt-a';
  const REPO_B = '/workspace/projects/agenticos/wt-b';

  beforeEach(() => {
    vi.clearAllMocks();
    files.clear();
    temps.clear();
    yamlMock.parse.mockImplementation((content: string) => {
      try { return JSON.parse(content); } catch { return undefined; }
    });
    yamlMock.stringify.mockImplementation((obj: unknown) => JSON.stringify(obj));
    loadRegistryMock.mockResolvedValue({
      active_project: 'agenticos',
      projects: [{ id: 'agenticos', name: 'AgenticOS', path: '/workspace/projects/agenticos', status: 'active', created: '2026-03-23', last_accessed: '2026-03-23T00:00:00.000Z' }],
    });
    accessMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    statMock.mockResolvedValue({ mtimeMs: Date.now() });
    detectCanonicalMainWriteProtectionMock.mockResolvedValue({ blocked: false });
    rmMock.mockResolvedValue(undefined);
    writeFileMock.mockImplementation(async (p: string, content: string) => { temps.set(p, content); });
    renameMock.mockImplementation(async (from: string, to: string) => { files.set(to, temps.get(from) ?? ''); temps.delete(from); });
    readFileMock.mockImplementation(async (p: string) => {
      if (p.endsWith('/.project.yaml')) return defaultProjectYaml();
      if (files.has(p)) return files.get(p) as string;
      throw new Error(`missing: ${p}`);
    });
  });

  async function preflightFor(issue: string, repo: string) {
    return persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path: repo,
      payload: { issue_id: issue, result: { status: 'PASS', summary: 'preflight passed' } },
    });
  }
  async function bootstrapFor(issue: string, repo: string) {
    return persistIssueBootstrapEvidence({
      repo_path: repo,
      payload: { issue_id: issue, current_branch: `feat/${issue}`, repo_path: repo },
    });
  }

  it('isolates concurrent sessions so a later session does not clobber an earlier one', async () => {
    await preflightFor('111', REPO_A);
    await bootstrapFor('111', REPO_A);
    // Concurrent session B overwrites the legacy global slot.
    await preflightFor('222', REPO_B);
    await bootstrapFor('222', REPO_B);

    const a = await loadScopedGuardrailState({ project_id: 'agenticos', issue_id: '111', repo_path: REPO_A });
    expect(a.state.guardrail_evidence?.preflight?.issue_id).toBe('111');
    expect(a.state.issue_bootstrap?.latest?.issue_id).toBe('111');

    const b = await loadScopedGuardrailState({ project_id: 'agenticos', issue_id: '222', repo_path: REPO_B });
    expect(b.state.guardrail_evidence?.preflight?.issue_id).toBe('222');
    expect(b.state.issue_bootstrap?.latest?.issue_id).toBe('222');
  });

  it('keeps the legacy single slot mirrored to the latest write for display/back-compat', async () => {
    await preflightFor('111', REPO_A);
    await preflightFor('222', REPO_B);
    const latest = await loadLatestGuardrailState({ project_id: 'agenticos' });
    expect(latest.state.guardrail_evidence?.preflight?.issue_id).toBe('222');
  });

  it('merges committed state into the scoped partition load', async () => {
    await preflightFor('111', REPO_A);
    const committedPath = '/workspace/projects/agenticos/standards/.context/state.yaml';
    files.set(committedPath, JSON.stringify({ current_task: { title: 'committed task' } }));

    const scoped = await loadScopedGuardrailState({
      project_id: 'agenticos',
      issue_id: '111',
      repo_path: REPO_A,
      committed_state_path: committedPath,
    });

    // Partition evidence wins for the gate slots…
    expect(scoped.state.guardrail_evidence?.preflight?.issue_id).toBe('111');
    // …while committed non-evidence fields are still merged in.
    expect((scoped.state as Record<string, any>).current_task?.title).toBe('committed task');
  });

  it('falls back to the legacy latest slot when no matching partition exists', async () => {
    await preflightFor('111', REPO_A);
    const scoped = await loadScopedGuardrailState({
      project_id: 'agenticos',
      issue_id: '999',
      repo_path: '/workspace/projects/agenticos/wt-z',
    });
    expect(scoped.state.guardrail_evidence?.preflight?.issue_id).toBe('111');
  });

  it('falls back to legacy when the session key is null (missing issue_id or repo_path)', async () => {
    await preflightFor('111', REPO_A);
    const noIssue = await loadScopedGuardrailState({ project_id: 'agenticos', issue_id: null, repo_path: REPO_A });
    expect(noIssue.state.guardrail_evidence?.preflight?.issue_id).toBe('111');
  });

  it('derives a stable session key, normalizes a leading #, and returns null on missing parts', () => {
    expect(guardrailSessionKey('#573', '/a/b')).toBe(guardrailSessionKey('573', '/a/b'));
    expect(guardrailSessionKey('573', '/a/b')).toContain('573::');
    expect(guardrailSessionKey('', '/a/b')).toBeNull();
    expect(guardrailSessionKey('573', '')).toBeNull();
    expect(guardrailSessionKey(null, null)).toBeNull();
  });
});
