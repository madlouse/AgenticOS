import { afterEach, describe, expect, it, vi } from 'vitest';

const resolveTargetMock = vi.hoisted(() => vi.fn());
const resolveContextPathsMock = vi.hoisted(() => vi.fn());
const readEvolutionTimelineMock = vi.hoisted(() => vi.fn());

vi.mock('../../utils/project-target.js', () => ({
  resolveManagedProjectTarget: resolveTargetMock,
  resolveManagedProjectContextPaths: resolveContextPathsMock,
}));
vi.mock('../../utils/evolution-log.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/evolution-log.js')>();
  return { ...actual, readEvolutionTimeline: readEvolutionTimelineMock };
});

import { runEvolutionTimeline } from '../evolution-timeline.js';

afterEach(() => vi.clearAllMocks());

function wireResolved(): void {
  resolveTargetMock.mockResolvedValue({ projectId: 'agenticos', projectPath: '/p', projectYaml: {} });
  resolveContextPathsMock.mockReturnValue({ statePath: '/p/.context/state.yaml' });
}

describe('runEvolutionTimeline (#584)', () => {
  it('renders a human timeline from the evolution log by default', async () => {
    wireResolved();
    readEvolutionTimelineMock.mockResolvedValue([
      {
        id: 'evo-1',
        at: '2026-06-12T00:00:00.000Z',
        kind: 'decision',
        summary: 'Use L2 evolution log as shared context',
        rationale: 'Human and machine views must read the same source.',
        refs: { issue: '#584', pr: '#614' },
      },
    ]);

    const out = await runEvolutionTimeline({ limit: 5 });

    expect(out).toContain('Project evolution timeline for agenticos');
    expect(out).toContain('**[decision]** Use L2 evolution log as shared context');
    expect(out).toContain('rationale: Human and machine views must read the same source.');
    expect(out).toContain('refs: issue #584 · PR #614');
    expect(readEvolutionTimelineMock).toHaveBeenCalledWith('/p/.context/state.yaml', { limit: 5 });
  });

  it('returns JSON with the same evolution-log source path', async () => {
    wireResolved();
    readEvolutionTimelineMock.mockResolvedValue([
      { id: 'evo-1', at: '2026-06-12T00:00:00.000Z', kind: 'case', summary: 'case summary' },
    ]);

    const out = JSON.parse(await runEvolutionTimeline({ format: 'json' }));

    expect(out.command).toBe('agenticos_evolution_timeline');
    expect(out.project_id).toBe('agenticos');
    expect(out.source).toBe('.context/evolution-log');
    expect(out.entries).toEqual([
      { id: 'evo-1', at: '2026-06-12T00:00:00.000Z', kind: 'case', summary: 'case summary' },
    ]);
  });

  it('surfaces a resolution error instead of throwing', async () => {
    resolveTargetMock.mockRejectedValue(new Error('No project provided'));

    const out = await runEvolutionTimeline({});

    expect(out).toContain('❌');
    expect(out).toContain('No project provided');
    expect(readEvolutionTimelineMock).not.toHaveBeenCalled();
  });
});
