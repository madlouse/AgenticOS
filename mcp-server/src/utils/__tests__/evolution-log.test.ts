import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'yaml';

const gitTextMock = vi.hoisted(() => vi.fn());
vi.mock('../exec-git.js', () => ({
  gitText: gitTextMock,
}));

import {
  appendEvolutionEntries,
  deriveIssueRefFromBranch,
  evolutionEntryId,
  getEvolutionLogDir,
  readEvolutionTimeline,
  renderEvolutionTimelineMarkdown,
} from '../evolution-log.js';

let contextDir: string;
let statePath: string;
const NOW = new Date('2026-06-12T10:00:00.000Z');

beforeEach(async () => {
  contextDir = await mkdtemp(join(tmpdir(), 'agenticos-evolog-'));
  statePath = join(contextDir, 'state.yaml');
  gitTextMock.mockReset();
});

afterEach(async () => {
  await rm(contextDir, { recursive: true, force: true });
});

describe('appendEvolutionEntries', () => {
  it('appends typed entries to a monthly git-tracked file next to state.yaml', async () => {
    const result = await appendEvolutionEntries({
      statePath,
      now: NOW,
      entries: [
        { kind: 'decision', summary: '采样改用分层抽样', rationale: '低频类别方差过大', refs: { issue: '#355' } },
        { kind: 'decision', summary: 'second decision' },
      ],
    });

    expect(result.appendedCount).toBe(2);
    expect(result.contextRelativePath).toBe('evolution-log/2026-06.yaml');
    expect(result.filePath).toBe(join(contextDir, 'evolution-log', '2026-06.yaml'));

    const written = yaml.parse(await readFile(result.filePath, 'utf-8'));
    expect(written.entries).toHaveLength(2);
    expect(written.entries[0]).toMatchObject({
      kind: 'decision',
      summary: '采样改用分层抽样',
      rationale: '低频类别方差过大',
      refs: { issue: '#355' },
      at: NOW.toISOString(),
    });
    expect(written.entries[0].id).toMatch(/^evo-2026-06-12-/);
  });

  it('deduplicates identical (kind, summary, issue) entries across appends', async () => {
    const draft = { kind: 'decision' as const, summary: 'same decision', refs: { issue: '#1' } };
    await appendEvolutionEntries({ statePath, now: NOW, entries: [draft] });
    const second = await appendEvolutionEntries({ statePath, now: NOW, entries: [draft] });

    expect(second.appendedCount).toBe(0);
    const written = yaml.parse(await readFile(second.filePath, 'utf-8'));
    expect(written.entries).toHaveLength(1);
  });

  it('writes nothing for an empty entry list', async () => {
    const result = await appendEvolutionEntries({ statePath, now: NOW, entries: [] });
    expect(result.appendedCount).toBe(0);
    await expect(readFile(result.filePath, 'utf-8')).rejects.toThrow();
  });

  it('fails loudly when the monthly file is not parseable (git can restore it)', async () => {
    await mkdir(getEvolutionLogDir(statePath), { recursive: true });
    await writeFile(join(getEvolutionLogDir(statePath), '2026-06.yaml'), 'just-a-scalar', 'utf-8');

    await expect(appendEvolutionEntries({
      statePath,
      now: NOW,
      entries: [{ kind: 'decision', summary: 'x' }],
    })).rejects.toThrow(/not parseable/);
  });

  it('leaves no temp files behind after an atomic append', async () => {
    await appendEvolutionEntries({ statePath, now: NOW, entries: [{ kind: 'decision', summary: 'x' }] });
    const files = await readdir(getEvolutionLogDir(statePath));
    expect(files).toEqual(['2026-06.yaml']);
  });
});

describe('readEvolutionTimeline / renderEvolutionTimelineMarkdown (#584)', () => {
  it('renders typed evolution entries chronologically with rationale and refs', async () => {
    await mkdir(getEvolutionLogDir(statePath), { recursive: true });
    await writeFile(join(getEvolutionLogDir(statePath), '2026-06.yaml'), yaml.stringify({
      version: '1.0.0',
      entries: [
        {
          id: 'evo-new',
          at: '2026-06-12T12:00:00.000Z',
          kind: 'knowledge_ref',
          summary: 'Promoted the recall dogfooding note',
          rationale: 'Agents need a durable pointer to the distilled lesson.',
          refs: { issue: '#582', pr: '#600', knowledge: ['standards/knowledge/context-recall-dogfooding-and-restraint-2026-06-13.md'] },
        },
        {
          id: 'evo-old',
          at: '2026-06-10T12:00:00.000Z',
          kind: 'decision',
          summary: 'Use the evolution log as the shared L2 source',
          rationale: 'Human and machine views must not diverge.',
          refs: { issue: '#580' },
        },
      ],
    }), 'utf-8');

    const timeline = await readEvolutionTimeline(statePath);
    expect(timeline.map((entry) => entry.id)).toEqual(['evo-old', 'evo-new']);

    const markdown = renderEvolutionTimelineMarkdown(timeline);
    expect(markdown).toContain('### Project evolution timeline (2)');
    expect(markdown.indexOf('evo-old')).toBeLessThan(markdown.indexOf('evo-new'));
    expect(markdown).toContain('**[decision]** Use the evolution log as the shared L2 source');
    expect(markdown).toContain('rationale: Human and machine views must not diverge.');
    expect(markdown).toContain('refs: issue #580');
    expect(markdown).toContain('refs: issue #582 · PR #600 · knowledge `standards/knowledge/context-recall-dogfooding-and-restraint-2026-06-13.md`');
  });

  it('limits to the latest entries while preserving chronological order', async () => {
    await mkdir(getEvolutionLogDir(statePath), { recursive: true });
    await writeFile(join(getEvolutionLogDir(statePath), '2026-06.yaml'), yaml.stringify({
      version: '1.0.0',
      entries: [
        { id: 'evo-1', at: '2026-06-01T00:00:00.000Z', kind: 'decision', summary: 'one' },
        { id: 'evo-2', at: '2026-06-02T00:00:00.000Z', kind: 'case', summary: 'two' },
        { id: 'evo-3', at: '2026-06-03T00:00:00.000Z', kind: 'knowledge_ref', summary: 'three' },
      ],
    }), 'utf-8');

    const timeline = await readEvolutionTimeline(statePath, { limit: 2 });
    expect(timeline.map((entry) => entry.id)).toEqual(['evo-2', 'evo-3']);
  });

  it('renders an empty timeline without inventing a second source', () => {
    expect(renderEvolutionTimelineMarkdown([])).toContain('No evolution-log entries found');
  });
});

describe('deriveIssueRefFromBranch', () => {
  it('derives #<n> from a guardrail issue branch', async () => {
    gitTextMock.mockResolvedValue('feat/580-evolution-log-580a');
    expect(await deriveIssueRefFromBranch('/repo')).toBe('#580');
  });

  it('returns null on canonical main or non-issue branches', async () => {
    gitTextMock.mockResolvedValue('main');
    expect(await deriveIssueRefFromBranch('/repo')).toBeNull();
  });

  it('returns null when git fails (never guesses)', async () => {
    gitTextMock.mockRejectedValue(new Error('not a repo'));
    expect(await deriveIssueRefFromBranch('/repo')).toBeNull();
  });
});

describe('evolutionEntryId', () => {
  it('is deterministic for the same (kind, summary, issue) and date', () => {
    expect(evolutionEntryId('decision', 's', '#1', NOW)).toBe(evolutionEntryId('decision', 's', '#1', NOW));
    expect(evolutionEntryId('decision', 's', '#1', NOW)).not.toBe(evolutionEntryId('decision', 's', '#2', NOW));
  });
});
