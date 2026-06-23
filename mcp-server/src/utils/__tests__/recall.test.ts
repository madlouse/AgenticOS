import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'yaml';
import {
  extractTerms,
  knowledgeTitleFromFilename,
  normalizeIssueRef,
  recallContext,
  renderRecallMarkdown,
} from '../recall.js';

let ctxDir: string;
let statePath: string;
let knowledgeDir: string;
const NOW = new Date('2026-06-12T00:00:00.000Z');

async function writeEvolutionMonth(month: string, entries: unknown[]): Promise<void> {
  const dir = join(ctxDir, 'evolution-log');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${month}.yaml`), yaml.stringify({ version: '1.0.0', entries }), 'utf-8');
}

async function writeKnowledge(filename: string, frontmatter?: string): Promise<void> {
  await mkdir(knowledgeDir, { recursive: true });
  const body = frontmatter
    ? `---\n${frontmatter.trim()}\n---\n# doc\n`
    : '# doc\n';
  await writeFile(join(knowledgeDir, filename), body, 'utf-8');
}

beforeEach(async () => {
  ctxDir = await mkdtemp(join(tmpdir(), 'agenticos-recall-'));
  statePath = join(ctxDir, 'state.yaml');
  knowledgeDir = join(ctxDir, 'knowledge');
});

afterEach(async () => {
  await rm(ctxDir, { recursive: true, force: true });
});

describe('extractTerms', () => {
  it('extracts ascii tokens (>=3, non-stopword) and drops noise', () => {
    const terms = extractTerms('Add the precision sampling for M2');
    expect(terms.has('precision')).toBe(true);
    expect(terms.has('sampling')).toBe(true);
    expect(terms.has('the')).toBe(false); // stopword
    expect(terms.has('add')).toBe(false); // stopword
    expect(terms.has('m2')).toBe(true);
  });

  it('extracts CJK bigrams so a Chinese query is matchable without a tokenizer', () => {
    const terms = extractTerms('分层抽样');
    expect(terms.has('分层')).toBe(true);
    expect(terms.has('层抽')).toBe(true);
    expect(terms.has('抽样')).toBe(true);
  });

  it('keeps a lone CJK character as its own term', () => {
    const terms = extractTerms('改 sampling'); // '改' is an isolated CJK run of length 1
    expect(terms.has('改')).toBe(true);
    expect(terms.has('sampling')).toBe(true);
  });
});

describe('normalizeIssueRef / knowledgeTitleFromFilename', () => {
  it('strips a leading # and trims', () => {
    expect(normalizeIssueRef('#355')).toBe('355');
    expect(normalizeIssueRef('355')).toBe('355');
    expect(normalizeIssueRef('')).toBeNull();
  });
  it('derives a title from a dated knowledge filename', () => {
    expect(knowledgeTitleFromFilename('m2-precision-sampling-2026-05-28.md')).toBe('m2 precision sampling');
  });
});

describe('recallContext', () => {
  it('ranks an issue-lineage evolution entry above mere keyword matches', async () => {
    await writeEvolutionMonth('2026-06', [
      { id: 'evo-a', at: '2026-06-10T00:00:00Z', kind: 'decision', summary: 'unrelated sampling note', refs: { issue: '#999' } },
      { id: 'evo-b', at: '2026-06-01T00:00:00Z', kind: 'decision', summary: 'chose layered approach', refs: { issue: '#355' } },
    ]);

    const result = await recallContext({
      statePath, knowledgeDir, issueId: '355', issueTitle: 'sampling redesign', now: NOW,
    });

    expect(result[0].ref).toBe('evo-b'); // issue lineage dominates
    expect(result[0].signals.some((s) => s.includes('issue lineage #355'))).toBe(true);
  });

  it('matches Chinese summaries from a Chinese query (CJK substring)', async () => {
    await writeEvolutionMonth('2026-06', [
      { id: 'evo-cn', at: '2026-06-10T00:00:00Z', kind: 'decision', summary: 'M2 精度采样改用分层抽样而非随机' },
      { id: 'evo-en', at: '2026-06-10T00:00:00Z', kind: 'decision', summary: 'something entirely different' },
    ]);

    const result = await recallContext({ statePath, knowledgeDir, query: '分层抽样', now: NOW });

    expect(result.map((c) => c.ref)).toContain('evo-cn');
    expect(result.map((c) => c.ref)).not.toContain('evo-en');
  });

  it('recalls knowledge docs by filename-derived title (keyword + area proximity)', async () => {
    await writeKnowledge('m2-precision-sampling-2026-05-28.md', `
owner: docs-team
valid_until: 2026-12-31
supersedes: []
confidence: high
`);
    await writeKnowledge('unrelated-topic.md');

    const result = await recallContext({ statePath, knowledgeDir, query: 'precision sampling', now: NOW });

    const knowledge = result.filter((c) => c.kind === 'knowledge');
    expect(knowledge).toHaveLength(1);
    expect(knowledge[0].ref).toBe('knowledge/m2-precision-sampling-2026-05-28.md');
    expect(knowledge[0].lifecycle_status).toBe('current');
  });

  it('annotates and down-weights expired or superseded knowledge docs', async () => {
    await writeKnowledge('current-sampling.md', `
owner: docs-team
valid_until: 2026-12-31
supersedes: []
confidence: high
`);
    await writeKnowledge('expired-sampling.md', `
owner: docs-team
valid_until: 2026-01-01
supersedes: []
confidence: medium
`);
    await writeKnowledge('old-sampling.md', `
owner: docs-team
valid_until: 2026-12-31
supersedes: []
confidence: low
`);
    await writeKnowledge('new-sampling.md', `
owner: docs-team
valid_until: 2026-12-31
supersedes:
  - old-sampling.md
confidence: high
`);

    const result = await recallContext({ statePath, knowledgeDir, query: 'sampling', now: NOW, limit: 10 });
    const byRef = Object.fromEntries(result.filter((c) => c.kind === 'knowledge').map((candidate) => [candidate.ref, candidate]));

    expect(byRef['knowledge/expired-sampling.md'].lifecycle_status).toBe('expired');
    expect(byRef['knowledge/expired-sampling.md'].signals).toContain('lifecycle: expired');
    expect(byRef['knowledge/old-sampling.md'].lifecycle_status).toBe('superseded');
    expect(byRef['knowledge/old-sampling.md'].signals).toContain('lifecycle: superseded by new-sampling.md');
    expect(byRef['knowledge/current-sampling.md'].score).toBeGreaterThan(byRef['knowledge/expired-sampling.md'].score);
  });

  it('annotates legacy knowledge docs as stale without hiding them', async () => {
    await writeKnowledge('legacy-sampling.md');

    const result = await recallContext({ statePath, knowledgeDir, query: 'sampling', now: NOW });
    const legacy = result.find((candidate) => candidate.ref === 'knowledge/legacy-sampling.md');

    expect(legacy?.lifecycle_status).toBe('stale');
    expect(legacy?.signals).toContain('lifecycle: stale missing owner, valid_until, supersedes, confidence');
  });

  it('honors the limit and tie-breaks deterministically by recency then ref', async () => {
    await writeEvolutionMonth('2026-06', [
      { id: 'evo-old', at: '2026-01-01T00:00:00Z', kind: 'decision', summary: 'sampling sampling' },
      { id: 'evo-new', at: '2026-06-11T00:00:00Z', kind: 'decision', summary: 'sampling sampling' },
    ]);

    const result = await recallContext({ statePath, knowledgeDir, query: 'sampling', limit: 1, now: NOW });
    expect(result).toHaveLength(1);
    expect(result[0].ref).toBe('evo-new'); // newer wins the recency tie-break
  });

  it('returns empty on an empty corpus (no evolution log, no knowledge)', async () => {
    const result = await recallContext({ statePath, knowledgeDir, issueId: '1', issueTitle: 'x', now: NOW });
    expect(result).toEqual([]);
  });

  it('tolerates a corrupt monthly file and still recalls from readable ones', async () => {
    await writeEvolutionMonth('2026-06', [{ id: 'evo-ok', at: '2026-06-10T00:00:00Z', kind: 'decision', summary: 'sampling decision' }]);
    await mkdir(join(ctxDir, 'evolution-log'), { recursive: true });
    await writeFile(join(ctxDir, 'evolution-log', '2026-05.yaml'), 'broken: [', 'utf-8');

    const result = await recallContext({ statePath, knowledgeDir, query: 'sampling', now: NOW });
    expect(result.map((c) => c.ref)).toContain('evo-ok');
  });
});

describe('renderRecallMarkdown', () => {
  it('renders a no-context message when empty', () => {
    expect(renderRecallMarkdown([])).toContain('No related prior context');
  });
  it('renders candidates with ref and signals', () => {
    const md = renderRecallMarkdown([
      { kind: 'decision', ref: 'evo-b', summary: 'chose layered approach', score: 101, signals: ['issue lineage #355'] },
    ]);
    expect(md).toContain('**[decision]** chose layered approach');
    expect(md).toContain('`evo-b`');
    expect(md).toContain('issue lineage #355');
  });
});
