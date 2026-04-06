import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const yamlMock = vi.hoisted(() => ({
  parse: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('yaml', () => ({
  default: yamlMock,
}));

vi.mock('../../utils/project-target.js', () => ({
  resolveManagedProjectTarget: vi.fn(),
}));

import { readFile } from 'fs/promises';
import { getProjectContext } from '../context.js';
import { resolveManagedProjectTarget } from '../../utils/project-target.js';

const readFileMock = readFile as unknown as ReturnType<typeof vi.fn>;
const resolveManagedProjectTargetMock = resolveManagedProjectTarget as unknown as ReturnType<typeof vi.fn>;

describe('getProjectContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    yamlMock.parse.mockImplementation((content: string) => JSON.parse(content));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns project identity with loaded context', async () => {
    resolveManagedProjectTargetMock.mockResolvedValue({
      projectName: 'Alpha Project',
      projectId: 'alpha',
      projectPath: '/workspace/alpha',
      projectYamlPath: '/workspace/alpha/.project.yaml',
      quickStartPath: '/workspace/alpha/.context/quick-start.md',
      statePath: '/workspace/alpha/.context/state.yaml',
    });

    readFileMock
      .mockResolvedValueOnce('meta:\n  id: alpha\n')
      .mockResolvedValueOnce('# Quick Start\n\nAlpha summary')
      .mockResolvedValueOnce(JSON.stringify({
        current_task: { title: 'Test' },
        issue_bootstrap: {
          latest: {
            issue_id: '179',
            issue_title: 'Bootstrap issue',
            recorded_at: '2026-04-06T00:00:00.000Z',
            current_branch: 'feat/179-issue-start-bootstrap-evidence',
            startup_context_paths: ['.project.yaml'],
            additional_context: [],
          },
        },
      }));

    const result = await getProjectContext();

    expect(result).toContain('# Alpha Project');
    expect(result).toContain('Project ID: alpha');
    expect(result).toContain('Project Path: /workspace/alpha');
    expect(result).toContain('## Quick Start');
    expect(result).toContain('## Latest Issue Bootstrap');
    expect(result).toContain('Issue: #179');
    expect(result).toContain('## Current State');
  });

  it('fails closed when managed project identity cannot be resolved', async () => {
    resolveManagedProjectTargetMock.mockRejectedValue(new Error('Project identity mismatch'));

    const result = await getProjectContext();

    expect(result).toContain('# Error');
    expect(result).toContain('Project identity mismatch');
  });

  it('returns a load error when one of the context files cannot be read', async () => {
    resolveManagedProjectTargetMock.mockResolvedValue({
      projectName: 'Alpha Project',
      projectId: 'alpha',
      projectPath: '/workspace/alpha',
      projectYamlPath: '/workspace/alpha/.project.yaml',
      quickStartPath: '/workspace/alpha/.context/quick-start.md',
      statePath: '/workspace/alpha/.context/state.yaml',
    });

    readFileMock
      .mockResolvedValueOnce('meta:\n  id: alpha\n')
      .mockRejectedValueOnce(new Error('quick-start missing'));

    const result = await getProjectContext();

    expect(result).toContain('# Error Loading Context');
    expect(result).toContain('quick-start missing');
  });
});
