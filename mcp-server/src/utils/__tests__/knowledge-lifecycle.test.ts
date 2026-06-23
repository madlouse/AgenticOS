import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import {
  parseKnowledgeLifecycleMetadata,
  readKnowledgeDocumentLifecycles,
} from '../knowledge-lifecycle.js';

let dir: string;
const now = new Date('2026-06-23T00:00:00.000Z');

async function writeDoc(path: string, content: string): Promise<void> {
  await mkdir(dirname(join(dir, path)), { recursive: true });
  await writeFile(join(dir, path), content, 'utf-8');
}

function doc(frontmatter: string): string {
  return `---\n${frontmatter.trim()}\n---\n# Doc\n`;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'agenticos-knowledge-lifecycle-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('parseKnowledgeLifecycleMetadata', () => {
  it('supports top-level lifecycle fields', () => {
    const metadata = parseKnowledgeLifecycleMetadata(doc(`
owner: docs-team
valid_until: 2026-12-31
supersedes: []
confidence: high
`));

    expect(metadata).toMatchObject({
      owner: 'docs-team',
      valid_until: '2026-12-31',
      supersedes: [],
      confidence: 'high',
      missing_fields: [],
      invalid_fields: [],
    });
  });

  it('supports nested lifecycle fields and reports missing/invalid fields', () => {
    const metadata = parseKnowledgeLifecycleMetadata(doc(`
lifecycle:
  owner: docs-team
  valid_until: not-a-date
  confidence: certain
`));

    expect(metadata.owner).toBe('docs-team');
    expect(metadata.missing_fields).toEqual(['supersedes']);
    expect(metadata.invalid_fields).toEqual(['valid_until', 'confidence']);
  });

  it('treats malformed frontmatter as missing lifecycle fields', () => {
    const metadata = parseKnowledgeLifecycleMetadata('---\nowner: [\n---\n# broken\n');
    expect(metadata.missing_fields).toEqual(['owner', 'valid_until', 'supersedes', 'confidence']);
  });
});

describe('readKnowledgeDocumentLifecycles', () => {
  it('detects current, expired, superseded, and stale knowledge docs', async () => {
    await writeDoc('current.md', doc(`
owner: docs-team
valid_until: 2026-12-31
supersedes: []
confidence: high
`));
    await writeDoc('expired.md', doc(`
owner: docs-team
valid_until: 2026-01-01
supersedes: []
confidence: medium
`));
    await writeDoc('old-decision.md', doc(`
owner: docs-team
valid_until: 2026-12-31
supersedes: []
confidence: low
`));
    await writeDoc('new-decision.md', doc(`
owner: docs-team
valid_until: 2026-12-31
supersedes:
  - old-decision.md
confidence: high
`));
    await writeDoc('legacy.md', '# Legacy doc without lifecycle frontmatter\n');

    const lifecycles = await readKnowledgeDocumentLifecycles(dir, now);
    const byPath = Object.fromEntries(lifecycles.map((entry) => [entry.path, entry]));

    expect(byPath['current.md'].status).toBe('current');
    expect(byPath['expired.md'].status).toBe('expired');
    expect(byPath['old-decision.md'].status).toBe('superseded');
    expect(byPath['old-decision.md'].superseded_by).toEqual(['new-decision.md']);
    expect(byPath['legacy.md'].status).toBe('stale');
    expect(byPath['legacy.md'].missing_fields).toEqual(['owner', 'valid_until', 'supersedes', 'confidence']);
  });

  it('returns an empty lifecycle list when the knowledge directory is absent', async () => {
    expect(await readKnowledgeDocumentLifecycles(join(dir, 'missing'), now)).toEqual([]);
  });
});
