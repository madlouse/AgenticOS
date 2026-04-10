import { beforeEach, describe, expect, it, vi } from 'vitest';

const yamlMock = vi.hoisted(() => ({
  parse: vi.fn(),
  stringify: vi.fn((obj: unknown) => JSON.stringify(obj)),
}));

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('yaml', () => ({
  default: yamlMock,
}));

vi.mock('../registry.js', () => ({
  loadRegistry: vi.fn(),
}));

vi.mock('../canonical-main-guard.js', () => ({
  detectCanonicalMainWriteProtection: vi.fn(async () => ({ blocked: false })),
}));

import { access, readFile, writeFile } from 'fs/promises';
import { detectCanonicalMainWriteProtection } from '../canonical-main-guard.js';
import { loadRegistry } from '../registry.js';
import { persistGuardrailEvidence, persistIssueBootstrapEvidence } from '../guardrail-evidence.js';

const accessMock = access as unknown as ReturnType<typeof vi.fn>;
const readFileMock = readFile as unknown as ReturnType<typeof vi.fn>;
const writeFileMock = writeFile as unknown as ReturnType<typeof vi.fn>;
const loadRegistryMock = loadRegistry as unknown as ReturnType<typeof vi.fn>;
const detectCanonicalMainWriteProtectionMock = detectCanonicalMainWriteProtection as unknown as ReturnType<typeof vi.fn>;

describe('persistGuardrailEvidence', () => {
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
    readFileMock.mockResolvedValue(JSON.stringify({ session: {}, working_memory: { facts: [], decisions: [], pending: [] } }));
    writeFileMock.mockResolvedValue(undefined);
    detectCanonicalMainWriteProtectionMock.mockResolvedValue({ blocked: false });
  });

  it('persists latest preflight evidence into the matching managed project state', async () => {
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: { id: 'agenticos', name: 'AgenticOS' },
          agent_context: { current_state: 'standards/.context/state.yaml' },
        });
      }
      return JSON.stringify({ session: {}, working_memory: { facts: [], decisions: [], pending: [] } });
    });

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
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(writeFileMock.mock.calls[0]?.[0]).toBe('/workspace/projects/agenticos/standards/.context/state.yaml');

    const [, content] = writeFileMock.mock.calls[0];
    const writtenState = JSON.parse(content as string);
    expect(writtenState.guardrail_evidence.last_command).toBe('agenticos_preflight');
    expect(writtenState.guardrail_evidence.preflight.issue_id).toBe('62');
    expect(writtenState.guardrail_evidence.preflight.result.status).toBe('PASS');
  });

  it('overwrites the previous latest entry for the same command instead of appending', async () => {
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: { id: 'agenticos', name: 'AgenticOS' },
          agent_context: { current_state: 'standards/.context/state.yaml' },
        });
      }
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

  it('falls back to the nearest on-disk project root when registry does not contain the repo path', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [],
    });
    accessMock
      .mockRejectedValueOnce(new Error('missing repo-level .project.yaml'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    readFileMock
      .mockResolvedValueOnce(JSON.stringify({ meta: { id: 'local-agenticos' } }))
      .mockResolvedValueOnce(JSON.stringify({ session: {}, working_memory: { facts: [], decisions: [], pending: [] } }));

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

    const [statePath, content] = writeFileMock.mock.calls[0];
    expect(statePath).toBe('/workspace/source/projects/agenticos/.context/state.yaml');
    const writtenState = JSON.parse(content as string);
    expect(writtenState.guardrail_evidence.branch_bootstrap.issue_id).toBe('62');
  });

  it('uses explicit project_path when repo_path is a larger checkout root', async () => {
    loadRegistryMock.mockResolvedValue({
      active_project: null,
      projects: [],
    });
    accessMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    readFileMock
      .mockResolvedValueOnce(JSON.stringify({ meta: { id: 'agenticos-standards' }, agent_context: { current_state: '.context/state.yaml' } }))
      .mockResolvedValueOnce(JSON.stringify({ session: {}, working_memory: { facts: [], decisions: [], pending: [] } }));

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

    const [statePath] = writeFileMock.mock.calls[0];
    expect(statePath).toBe('/workspace/source/projects/agenticos/standards/.context/state.yaml');
  });

  it('uses registry project metadata to resolve canonical state paths for self-hosting roots', async () => {
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: { id: 'agenticos', name: 'AgenticOS' },
          agent_context: { current_state: 'standards/.context/state.yaml' },
        });
      }
      return JSON.stringify({ session: {}, working_memory: { facts: [], decisions: [], pending: [] } });
    });

    await persistGuardrailEvidence({
      command: 'agenticos_branch_bootstrap',
      repo_path: '/workspace/projects/agenticos/mcp-server',
      payload: {
        issue_id: '167',
        result: { status: 'CREATED', branch_name: 'fix/167-self-hosting-root-project-identity-resolution' },
      },
    });

    expect(writeFileMock.mock.calls[0]?.[0]).toBe('/workspace/projects/agenticos/standards/.context/state.yaml');
  });

  it('does not write state when repo_path is outside managed projects', async () => {
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

  it('does not persist guardrail evidence into canonical main checkouts', async () => {
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: { id: 'agenticos', name: 'AgenticOS' },
          agent_context: { current_state: 'standards/.context/state.yaml' },
        });
      }
      return JSON.stringify({ session: {}, working_memory: { facts: [], decisions: [], pending: [] } });
    });
    detectCanonicalMainWriteProtectionMock.mockResolvedValue({
      blocked: true,
      reason: 'canonical main checkout is write-protected for runtime persistence: /workspace/root',
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
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});

describe('persistIssueBootstrapEvidence', () => {
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
    readFileMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: { id: 'agenticos', name: 'AgenticOS' },
          agent_context: { current_state: 'standards/.context/state.yaml' },
        });
      }
      return JSON.stringify({ session: {}, working_memory: { facts: [], decisions: [], pending: [] } });
    });
    writeFileMock.mockResolvedValue(undefined);
    detectCanonicalMainWriteProtectionMock.mockResolvedValue({ blocked: false });
  });

  it('persists the latest issue bootstrap record into the matching managed project state', async () => {
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
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(writeFileMock.mock.calls[0]?.[0]).toBe('/workspace/projects/agenticos/standards/.context/state.yaml');

    const [, content] = writeFileMock.mock.calls[0];
    const writtenState = JSON.parse(content as string);
    expect(writtenState.issue_bootstrap.latest.issue_id).toBe('260');
    expect(writtenState.issue_bootstrap.latest.issue_title).toBe('Stop runtime persistence pollution');
    expect(writtenState.issue_bootstrap.latest.repo_path).toBe('/workspace/projects/agenticos/mcp-server');
  });

  it('does not persist issue bootstrap evidence into canonical main checkouts', async () => {
    detectCanonicalMainWriteProtectionMock.mockResolvedValue({
      blocked: true,
      reason: 'canonical main checkout is write-protected for runtime persistence: /workspace/root',
    });

    const result = await persistIssueBootstrapEvidence({
      repo_path: '/workspace/root/projects/agenticos/mcp-server',
      payload: {
        issue_id: '260',
        issue_title: 'Stop runtime persistence pollution',
      },
    });

    expect(result.persisted).toBe(false);
    expect(result.reason).toContain('write-protected');
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});
