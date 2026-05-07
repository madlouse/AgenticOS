import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/project-target.js', () => ({
  resolveManagedProjectTarget: vi.fn(),
}));

vi.mock('../../utils/case-knowledge.js', () => ({
  normalizeCaseFilterType: vi.fn((value) => value || 'all'),
  normalizeCaseType: vi.fn((value) => value),
  parseCaseTags: vi.fn((value) => Array.isArray(value) ? value : []),
  recordCaseKnowledge: vi.fn(),
  listCasesAcrossProjects: vi.fn(),
  listCasesForProject: vi.fn(),
  renderCaseListMarkdown: vi.fn(() => '# Cases'),
}));

vi.mock('../../utils/registry.js', () => ({
  loadRegistry: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import { runListCases, runRecordCase } from '../case.js';
import { resolveManagedProjectTarget } from '../../utils/project-target.js';
import {
  listCasesAcrossProjects,
  listCasesForProject,
  recordCaseKnowledge,
  renderCaseListMarkdown,
} from '../../utils/case-knowledge.js';
import { loadRegistry } from '../../utils/registry.js';
import { readFile } from 'fs/promises';

const resolveManagedProjectTargetMock = resolveManagedProjectTarget as unknown as ReturnType<typeof vi.fn>;
const recordCaseKnowledgeMock = recordCaseKnowledge as unknown as ReturnType<typeof vi.fn>;
const listCasesAcrossProjectsMock = listCasesAcrossProjects as unknown as ReturnType<typeof vi.fn>;
const listCasesForProjectMock = listCasesForProject as unknown as ReturnType<typeof vi.fn>;
const renderCaseListMarkdownMock = renderCaseListMarkdown as unknown as ReturnType<typeof vi.fn>;
const loadRegistryMock = loadRegistry as unknown as ReturnType<typeof vi.fn>;
const readFileMock = readFile as unknown as ReturnType<typeof vi.fn>;

describe('case tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveManagedProjectTargetMock.mockResolvedValue({
      projectId: 'agenticos',
      projectName: 'AgenticOS',
      projectPath: '/project',
      projectYaml: {},
    });
    recordCaseKnowledgeMock.mockResolvedValue({
      projectId: 'agenticos',
      projectName: 'AgenticOS',
      projectPath: '/project',
      type: 'bad',
      title: 'Bad Case',
      timestamp: '2026-05-07T10:30:00.000Z',
      tags: ['bad-case'],
      filePath: '/project/knowledge/bad-cases/bad.md',
      relativePath: 'knowledge/bad-cases/bad.md',
    });
    listCasesAcrossProjectsMock.mockResolvedValue([]);
    listCasesForProjectMock.mockResolvedValue([]);
    renderCaseListMarkdownMock.mockReturnValue('# Cases');
    loadRegistryMock.mockResolvedValue({
      projects: [],
    });
    readFileMock.mockResolvedValue(JSON.stringify({
      meta: { id: 'agenticos', name: 'AgenticOS' },
      source_control: {
        topology: 'github_versioned',
        context_publication_policy: 'public_distilled',
        github_repo: 'madlouse/AgenticOS',
        branch_strategy: 'github_flow',
      },
      execution: { source_repo_roots: ['.'] },
    }));
  });

  it('records cases against an explicit project_path override', async () => {
    const result = await runRecordCase({
      project: 'agenticos',
      project_path: '/worktree',
      type: 'bad',
      title: 'Bad Case',
      trigger: 'Trigger',
      behavior: 'Behavior',
    });

    expect(resolveManagedProjectTargetMock).toHaveBeenCalledWith({
      project: 'agenticos',
      projectPath: '/worktree',
      commandName: 'agenticos_record_case',
    });
    expect(recordCaseKnowledgeMock).toHaveBeenCalled();
    expect(JSON.parse(result).status).toBe('RECORDED');
  });

  it('returns blocked case knowledge errors instead of throwing out of the tool', async () => {
    recordCaseKnowledgeMock.mockRejectedValue(new Error('agenticos_record_case blocked for "AgenticOS"'));

    const result = await runRecordCase({
      type: 'bad',
      title: 'Bad Case',
      trigger: 'Trigger',
      behavior: 'Behavior',
    });

    expect(result).toContain('agenticos_record_case blocked');
  });

  it('rejects record_case project=all', async () => {
    const result = await runRecordCase({ project: 'all' });

    expect(result).toContain('does not support project="all"');
  });

  it('returns project resolution errors for record_case', async () => {
    resolveManagedProjectTargetMock.mockRejectedValue(new Error('No project provided'));

    const result = await runRecordCase({
      type: 'bad',
      title: 'Bad Case',
      trigger: 'Trigger',
      behavior: 'Behavior',
    });

    expect(result).toContain('No project provided');
  });

  it('lists cases for all active normalized projects', async () => {
    loadRegistryMock.mockResolvedValue({
      projects: [
        {
          id: 'agenticos',
          name: 'AgenticOS',
          path: '/project',
          status: 'active',
        },
        {
          id: 'archived',
          name: 'Archived',
          path: '/archived',
          status: 'archived',
        },
      ],
    });

    const result = await runListCases({ project: 'all', type: 'bad', tags: ['guardrail'] });

    expect(listCasesAcrossProjectsMock).toHaveBeenCalledWith([
      expect.objectContaining({ projectId: 'agenticos', projectPath: '/project' }),
    ], { type: 'bad', tags: ['guardrail'] });
    expect(result).toBe('# Cases');
  });

  it('skips unreadable or invalid projects when listing across all projects', async () => {
    loadRegistryMock.mockResolvedValue({
      projects: [
        {
          id: 'missing',
          name: 'Missing',
          path: '/missing',
          status: 'active',
        },
        {
          id: 'invalid',
          name: 'Invalid',
          path: '/invalid',
          status: 'active',
        },
      ],
    });
    readFileMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/missing')) throw new Error('missing');
      return JSON.stringify({ meta: { id: 'invalid', name: 'Invalid' } });
    });

    await runListCases({ project: 'all' });

    expect(listCasesAcrossProjectsMock).toHaveBeenCalledWith([], { type: 'all', tags: [] });
  });

  it('skips projects whose yaml parses to null when listing across all projects', async () => {
    loadRegistryMock.mockResolvedValue({
      projects: [
        {
          id: 'null-yaml',
          name: 'Null YAML',
          path: '/null-yaml',
          status: 'active',
        },
      ],
    });
    readFileMock.mockResolvedValue('null');

    await runListCases({ project: 'all' });

    expect(listCasesAcrossProjectsMock).toHaveBeenCalledWith([], { type: 'all', tags: [] });
  });

  it('lists cases for the resolved session project', async () => {
    const result = await runListCases({ type: 'corner' });

    expect(resolveManagedProjectTargetMock).toHaveBeenCalledWith({
      project: undefined,
      commandName: 'agenticos_list_cases',
    });
    expect(listCasesForProjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'agenticos' }),
      { type: 'corner', tags: [] },
    );
    expect(renderCaseListMarkdownMock).toHaveBeenCalledWith([], 'Matching Cases for AgenticOS');
    expect(result).toBe('# Cases');
  });

  it('returns project resolution errors for list cases', async () => {
    resolveManagedProjectTargetMock.mockRejectedValue(new Error('No project provided'));

    const result = await runListCases({});

    expect(result).toContain('# Error');
    expect(result).toContain('No project provided');
  });
});
