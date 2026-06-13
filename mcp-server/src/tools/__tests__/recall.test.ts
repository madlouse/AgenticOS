import { afterEach, describe, expect, it, vi } from 'vitest';

const resolveTargetMock = vi.hoisted(() => vi.fn());
const resolveContextPathsMock = vi.hoisted(() => vi.fn());
const recallContextMock = vi.hoisted(() => vi.fn());

vi.mock('../../utils/project-target.js', () => ({
  resolveManagedProjectTarget: resolveTargetMock,
  resolveManagedProjectContextPaths: resolveContextPathsMock,
}));
vi.mock('../../utils/recall.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/recall.js')>();
  return { ...actual, recallContext: recallContextMock };
});

import { runRecall } from '../recall.js';

afterEach(() => vi.clearAllMocks());

function wireResolved(): void {
  resolveTargetMock.mockResolvedValue({ projectId: 'agenticos', projectPath: '/p', projectYaml: {} });
  resolveContextPathsMock.mockReturnValue({ statePath: '/p/.context/state.yaml', knowledgeDir: '/p/knowledge' });
}

describe('runRecall', () => {
  it('renders markdown by default', async () => {
    wireResolved();
    recallContextMock.mockResolvedValue([
      { kind: 'knowledge', ref: 'knowledge/m2.md', summary: 'm2 sampling', score: 2, signals: ['keyword: sampling'] },
    ]);

    const out = await runRecall({ query: 'sampling' });

    expect(out).toContain('Recalled context for "sampling"');
    expect(out).toContain('m2 sampling');
    expect(out).toContain('`knowledge/m2.md`');
  });

  it('renders an issue-scoped heading in markdown', async () => {
    wireResolved();
    recallContextMock.mockResolvedValue([]);
    const out = await runRecall({ issue_id: '#355' });
    expect(out).toContain('Recalled context for #355');
  });

  it('renders a generic heading when neither issue nor query is given', async () => {
    wireResolved();
    recallContextMock.mockResolvedValue([]);
    const out = await runRecall({});
    expect(out).toContain('Recalled context');
    expect(out).toContain('No related prior context');
  });

  it('returns JSON when format=json, threading issue_id and project', async () => {
    wireResolved();
    recallContextMock.mockResolvedValue([]);

    const out = JSON.parse(await runRecall({ issue_id: '#355', format: 'json' }));

    expect(out.command).toBe('agenticos_recall');
    expect(out.project_id).toBe('agenticos');
    expect(out.issue_id).toBe('#355');
    expect(out.recalled).toEqual([]);
    expect(recallContextMock).toHaveBeenCalledWith(expect.objectContaining({ issueId: '#355' }));
  });

  it('surfaces a resolution error instead of throwing', async () => {
    resolveTargetMock.mockRejectedValue(new Error('no session project is bound'));

    const out = await runRecall({ query: 'x' });

    expect(out).toContain('❌');
    expect(out).toContain('no session project is bound');
    expect(recallContextMock).not.toHaveBeenCalled();
  });
});
