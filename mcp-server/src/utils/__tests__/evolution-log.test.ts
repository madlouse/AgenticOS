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
