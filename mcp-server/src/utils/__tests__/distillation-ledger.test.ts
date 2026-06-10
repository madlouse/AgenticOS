import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import yaml from 'yaml';
import {
  getDistillationLedgerPath,
  loadDistillationLedger,
  loadPendingCaptureEntries,
  markCapturesDistilledToState,
  markDistillationLedgerEntry,
  recordCapturedDistillationEntry,
  saveDistillationLedger,
  summarizeDistillationLedger,
  type DistillationLedger,
} from '../distillation-ledger.js';

function captureArgs(date: string, time: string) {
  return {
    filePath: `/tmp/cap-${date}.md`,
    date,
    time,
    entry: 'raw capture',
  };
}

const originalHome = process.env.AGENTICOS_HOME;
let home: string | null = null;

async function setupHome(): Promise<string> {
  home = await mkdtemp(join(tmpdir(), 'agenticos-ledger-'));
  process.env.AGENTICOS_HOME = home;
  return home;
}

afterEach(async () => {
  process.env.AGENTICOS_HOME = originalHome;
  if (home) {
    await rm(home, { recursive: true, force: true });
  }
  home = null;
});

describe('distillation ledger', () => {
  it('stores private runtime ledger entries for captured session records', async () => {
    const root = await setupHome();
    const now = new Date('2026-05-21T10:00:00.000Z');
    const result = await recordCapturedDistillationEntry({
      projectId: 'agenticos/core',
      now,
      summary: 'Captured private session',
      capture: {
        filePath: join(root, '.agent-workspace', 'projects', 'agenticos%2Fcore', 'captures', 'conversations', '2026-05-21.md'),
        date: '2026-05-21',
        time: '10:00',
        entry: 'raw private capture',
      },
    });

    expect(result.created).toBe(true);
    expect(result.path).toBe(getDistillationLedgerPath('agenticos/core'));
    expect(result.path).toContain('/.agent-workspace/projects/agenticos%2Fcore/distillation-ledger.yaml');
    expect(result.entry).toMatchObject({
      project_id: 'agenticos/core',
      status: 'captured',
      captured_at: now.toISOString(),
      capture_date: '2026-05-21',
      capture_time: '10:00',
      summary: 'Captured private session',
    });
    expect(result.entry.refs?.[0]).toMatchObject({
      type: 'runtime_capture',
      visibility: 'private',
    });

    const stored = yaml.parse(await readFile(result.path, 'utf-8'));
    expect(stored.entries).toHaveLength(1);
    expect(String(stored.entries[0].capture_path)).toContain('/.agent-workspace/');
    expect(String(stored.entries[0].capture_path)).not.toContain('/standards/.context/conversations/');
  });

  it('returns the existing entry when the same capture is recorded again', async () => {
    await setupHome();
    const capture = {
      filePath: '/runtime/captures/2026-05-21.md',
      date: '2026-05-21',
      time: '10:00',
      entry: 'raw private capture',
    };

    const first = await recordCapturedDistillationEntry({
      projectId: 'agenticos',
      summary: 'Captured private session',
      capture,
    });
    const second = await recordCapturedDistillationEntry({
      projectId: 'agenticos',
      summary: 'Captured private session',
      capture,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.entry.id).toBe(first.entry.id);
  });

  it('loads a missing ledger as an empty private runtime ledger', async () => {
    await setupHome();
    const loaded = await loadDistillationLedger('missing-project', new Date('2026-05-21T00:00:00.000Z'));
    const health = await summarizeDistillationLedger({
      projectId: 'missing-project',
      now: new Date('2026-05-21T00:00:00.000Z'),
    });

    expect(loaded.exists).toBe(false);
    expect(loaded.ledger.entries).toEqual([]);
    expect(health).toMatchObject({
      status: 'MISSING',
      exists: false,
      unprocessed_capture_count: 0,
      stale_unprocessed_capture_count: 0,
      warnings: [],
    });
  });

  it('marks captured entries through promotion lifecycle statuses', async () => {
    await setupHome();
    const captured = await recordCapturedDistillationEntry({
      projectId: 'agenticos',
      now: new Date('2026-05-01T00:00:00.000Z'),
      summary: 'Captured session',
      capture: {
        filePath: '/runtime/captures/2026-05-01.md',
        date: '2026-05-01',
        time: '00:00',
        entry: 'capture',
      },
    });

    const distilled = await markDistillationLedgerEntry({
      projectId: 'agenticos',
      entryId: captured.entry.id,
      status: 'distilled_to_knowledge',
      knowledge_paths: ['knowledge/session-summary.md'],
      now: new Date('2026-05-02T00:00:00.000Z'),
    });
    expect(distilled.entry).toMatchObject({
      status: 'distilled_to_knowledge',
      knowledge_paths: ['knowledge/session-summary.md'],
      processed_at: '2026-05-02T00:00:00.000Z',
    });

    const second = await recordCapturedDistillationEntry({
      projectId: 'agenticos',
      now: new Date('2026-05-03T00:00:00.000Z'),
      summary: 'Task capture',
      capture: {
        filePath: '/runtime/captures/2026-05-03.md',
        date: '2026-05-03',
        time: '00:00',
        entry: 'capture',
      },
    });
    const converted = await markDistillationLedgerEntry({
      projectId: 'agenticos',
      entryId: second.entry.id,
      status: 'converted_to_task',
      task_id: 'follow-up-task',
      now: new Date('2026-05-04T00:00:00.000Z'),
    });
    expect(converted.entry).toMatchObject({
      status: 'converted_to_task',
      task_id: 'follow-up-task',
    });

    const supersededCapture = await recordCapturedDistillationEntry({
      projectId: 'agenticos',
      now: new Date('2026-05-05T00:00:00.000Z'),
      summary: 'Superseded capture',
      capture: {
        filePath: '/runtime/captures/2026-05-05.md',
        date: '2026-05-05',
        time: '00:00',
        entry: 'capture',
      },
    });
    const superseded = await markDistillationLedgerEntry({
      projectId: 'agenticos',
      entryId: supersededCapture.entry.id,
      status: 'superseded',
      superseded_by: captured.entry.id,
      now: new Date('2026-05-06T00:00:00.000Z'),
    });
    expect(superseded.entry).toMatchObject({
      status: 'superseded',
      superseded_by: captured.entry.id,
    });

    const ignoredCapture = await recordCapturedDistillationEntry({
      projectId: 'agenticos',
      now: new Date('2026-05-07T00:00:00.000Z'),
      summary: 'Ignored capture',
      capture: {
        filePath: '/runtime/captures/2026-05-07.md',
        date: '2026-05-07',
        time: '00:00',
        entry: 'capture',
      },
    });
    const ignored = await markDistillationLedgerEntry({
      projectId: 'agenticos',
      entryId: ignoredCapture.entry.id,
      status: 'ignored_with_reason',
      reason: 'duplicate of a promoted capture',
      now: new Date('2026-05-08T00:00:00.000Z'),
    });
    expect(ignored.entry).toMatchObject({
      status: 'ignored_with_reason',
      reason: 'duplicate of a promoted capture',
    });

    const refreshed = await markDistillationLedgerEntry({
      projectId: 'agenticos',
      entryId: ignoredCapture.entry.id,
      status: 'ignored_with_reason',
      reason: 'duplicate of a promoted capture',
      now: new Date('2026-05-09T00:00:00.000Z'),
    });
    expect(refreshed.entry.updated_at).toBe('2026-05-09T00:00:00.000Z');
  });

  it('validates required transition metadata and missing entries', async () => {
    await setupHome();
    const captured = await recordCapturedDistillationEntry({
      projectId: 'agenticos',
      now: new Date('2026-05-01T00:00:00.000Z'),
      summary: 'Captured session',
      capture: {
        filePath: '/runtime/captures/2026-05-01.md',
        date: '2026-05-01',
        time: '00:00',
        entry: 'capture',
      },
    });

    await expect(markDistillationLedgerEntry({
      projectId: 'agenticos',
      entryId: 'missing',
      status: 'ignored_with_reason',
      reason: 'irrelevant',
    })).rejects.toThrow('not found');
    await expect(markDistillationLedgerEntry({
      projectId: 'agenticos',
      entryId: captured.entry.id,
      status: 'distilled_to_knowledge',
    })).rejects.toThrow('knowledge_paths is required');
    await expect(markDistillationLedgerEntry({
      projectId: 'agenticos',
      entryId: captured.entry.id,
      status: 'converted_to_task',
    })).rejects.toThrow('task_id is required');
    await expect(markDistillationLedgerEntry({
      projectId: 'agenticos',
      entryId: captured.entry.id,
      status: 'ignored_with_reason',
    })).rejects.toThrow('reason is required');
    await expect(markDistillationLedgerEntry({
      projectId: 'agenticos',
      entryId: captured.entry.id,
      status: 'superseded',
    })).rejects.toThrow('superseded_by is required');

    const marked = await markDistillationLedgerEntry({
      projectId: 'agenticos',
      entryId: captured.entry.id,
      status: 'captured',
      now: new Date('2026-05-02T00:00:00.000Z'),
    });
    expect(marked.entry.status).toBe('captured');
    expect(marked.entry.processed_at).toBeUndefined();

    const distilled = await markDistillationLedgerEntry({
      projectId: 'agenticos',
      entryId: captured.entry.id,
      status: 'distilled_to_knowledge',
      knowledge_paths: ['knowledge/session-summary.md'],
      now: new Date('2026-05-03T00:00:00.000Z'),
    });
    expect(distilled.entry.status).toBe('distilled_to_knowledge');
    await expect(markDistillationLedgerEntry({
      projectId: 'agenticos',
      entryId: captured.entry.id,
      status: 'converted_to_task',
      task_id: 'other-task',
    })).rejects.toThrow(`ledger entry "${captured.entry.id}" is already distilled_to_knowledge`);
  });

  it('summarizes stale unprocessed captured entries', async () => {
    await setupHome();
    const ledger: DistillationLedger = {
      version: '1.0.0',
      project_id: 'agenticos',
      updated_at: '2026-05-21T00:00:00.000Z',
      entries: [
        {
          id: 'old-capture',
          project_id: 'agenticos',
          status: 'captured',
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
          captured_at: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'done-capture',
          project_id: 'agenticos',
          status: 'ignored_with_reason',
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
          processed_at: '2026-04-02T00:00:00.000Z',
          reason: 'duplicate',
        },
      ],
    };
    await saveDistillationLedger('agenticos', ledger, new Date('2026-05-21T00:00:00.000Z'));

    const health = await summarizeDistillationLedger({
      projectId: 'agenticos',
      now: new Date('2026-05-21T00:00:00.000Z'),
      staleAfterDays: 14,
    });

    expect(health.status).toBe('WARN');
    expect(health.unprocessed_capture_count).toBe(1);
    expect(health.stale_unprocessed_capture_count).toBe(1);
    expect(health.oldest_unprocessed_capture_at).toBe('2026-04-01T00:00:00.000Z');
    expect(health.warnings).toEqual(['distillation ledger has 1 stale captured entry pending promotion']);
  });

  it('summarizes plural stale captures and missing project ids', async () => {
    await setupHome();
    const missingProject = await summarizeDistillationLedger({ projectId: null });
    expect(missingProject).toMatchObject({
      status: 'MISSING',
      path: '',
      summary: 'Distillation ledger is unavailable because project_id is missing.',
    });

    const ledger: DistillationLedger = {
      version: '1.0.0',
      project_id: 'agenticos',
      updated_at: '2026-05-21T00:00:00.000Z',
      entries: [
        {
          id: 'old-one',
          project_id: 'agenticos',
          status: 'captured',
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
          captured_at: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'old-two',
          project_id: 'agenticos',
          status: 'captured',
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
          captured_at: '2026-04-02T00:00:00.000Z',
        },
      ],
    };
    await saveDistillationLedger('agenticos', ledger, new Date('2026-05-21T00:00:00.000Z'));

    const health = await summarizeDistillationLedger({
      projectId: 'agenticos',
      now: new Date('2026-05-21T00:00:00.000Z'),
      staleAfterDays: 14,
    });

    expect(health.status).toBe('WARN');
    expect(health.stale_unprocessed_capture_count).toBe(2);
    expect(health.warnings).toEqual(['distillation ledger has 2 stale captured entries pending promotion']);
  });

  it('summarizes fresh and empty ledgers without warnings', async () => {
    await setupHome();
    await saveDistillationLedger('agenticos', {
      version: '1.0.0',
      project_id: 'agenticos',
      updated_at: '2026-05-21T00:00:00.000Z',
      entries: [],
    }, new Date('2026-05-21T00:00:00.000Z'));

    const empty = await summarizeDistillationLedger({
      projectId: 'agenticos',
      now: new Date('2026-05-21T00:00:00.000Z'),
    });
    expect(empty).toMatchObject({
      status: 'PASS',
      unprocessed_capture_count: 0,
      oldest_unprocessed_capture_at: null,
      latest_entry_at: null,
      summary: 'Distillation ledger has 0 unprocessed captured entries.',
      warnings: [],
    });

    await saveDistillationLedger('agenticos', {
      version: '1.0.0',
      project_id: 'agenticos',
      updated_at: '2026-05-21T00:00:00.000Z',
      entries: [
        {
          id: 'fresh',
          project_id: 'agenticos',
          status: 'captured',
          created_at: '2026-05-20T00:00:00.000Z',
          updated_at: 'not-a-date',
        },
      ],
    }, new Date('2026-05-21T00:00:00.000Z'));

    const fresh = await summarizeDistillationLedger({
      projectId: 'agenticos',
      now: new Date('2026-05-21T00:00:00.000Z'),
      staleAfterDays: 14,
    });
    expect(fresh).toMatchObject({
      status: 'PASS',
      unprocessed_capture_count: 1,
      stale_unprocessed_capture_count: 0,
      oldest_unprocessed_capture_at: '2026-05-20T00:00:00.000Z',
      latest_entry_at: null,
      summary: 'Distillation ledger has 1 unprocessed captured entry.',
      warnings: [],
    });

    await saveDistillationLedger('agenticos', {
      version: '1.0.0',
      project_id: 'agenticos',
      updated_at: '2026-05-21T00:00:00.000Z',
      entries: [
        {
          id: 'invalid-time',
          project_id: 'agenticos',
          status: 'captured',
          created_at: 'not-a-date',
          updated_at: 'not-a-date',
        },
      ],
    }, new Date('2026-05-21T00:00:00.000Z'));

    const invalidTime = await summarizeDistillationLedger({
      projectId: 'agenticos',
      now: new Date('2026-05-21T00:00:00.000Z'),
    });
    expect(invalidTime).toMatchObject({
      status: 'PASS',
      unprocessed_capture_count: 1,
      oldest_unprocessed_capture_at: null,
      latest_entry_at: null,
    });
  });

  it('normalizes malformed ledger content without leaking invalid entries', async () => {
    await setupHome();
    const path = getDistillationLedgerPath('agenticos');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, yaml.stringify({
      version: '0.1.0',
      project_id: '',
      updated_at: '',
      entries: [
        null,
        'not-an-entry',
        { status: 'captured' },
        { id: 'invalid-status', status: 'unknown' },
        { id: '', status: 'captured' },
        {
          id: 'empty-values',
          status: 'captured',
          created_at: '',
          updated_at: '',
          captured_at: '',
          processed_at: '',
          capture_path: '',
          capture_date: '',
          capture_time: '',
          summary: '',
          knowledge_paths: ['', 1, '  '],
          task_id: '',
          superseded_by: '',
          reason: '',
          refs: [
            null,
            { type: '', uri: '' },
            { type: 'doc', uri: 'gbrain://knowledge/summary', visibility: 'public' },
            { type: 'task', uri: 'agenticos://task/follow-up', visibility: 'restricted' },
            { uri: 'runtime://capture/fallback', visibility: 'secret' },
          ],
        },
        { id: 'valid', status: 'captured', created_at: 'bad-date', updated_at: '2026-05-20T00:00:00.000Z' },
      ],
    }), 'utf-8');

    const loaded = await loadDistillationLedger('agenticos', new Date('2026-05-21T00:00:00.000Z'));

    expect(loaded.exists).toBe(true);
    expect(loaded.ledger.project_id).toBe('agenticos');
    expect(loaded.ledger.updated_at).toBe('2026-05-21T00:00:00.000Z');
    expect(loaded.ledger.entries.map((entry) => entry.id)).toEqual(['empty-values', 'valid']);
    expect(loaded.ledger.entries[0]).toMatchObject({
      project_id: 'agenticos',
      created_at: '2026-05-21T00:00:00.000Z',
      updated_at: '2026-05-21T00:00:00.000Z',
    });
    expect(loaded.ledger.entries[0].knowledge_paths).toBeUndefined();
    expect(loaded.ledger.entries[0].refs).toEqual([
      { type: 'doc', uri: 'gbrain://knowledge/summary', visibility: 'public' },
      { type: 'task', uri: 'agenticos://task/follow-up', visibility: 'restricted' },
      { type: 'reference', uri: 'runtime://capture/fallback', visibility: 'private' },
    ]);
  });

  it('normalizes scalar ledger content as an empty project ledger', async () => {
    await setupHome();
    const path = getDistillationLedgerPath('agenticos');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, 'not-a-ledger', 'utf-8');

    const loaded = await loadDistillationLedger('agenticos', new Date('2026-05-21T00:00:00.000Z'));

    expect(loaded.exists).toBe(true);
    expect(loaded.ledger).toMatchObject({
      version: '1.0.0',
      project_id: 'agenticos',
      updated_at: '2026-05-21T00:00:00.000Z',
      entries: [],
    });
  });

  it('persists and round-trips the structured capture payload', async () => {
    await setupHome();
    const now = new Date('2026-06-10T09:00:00.000Z');
    await recordCapturedDistillationEntry({
      projectId: 'p',
      now,
      summary: 'release session',
      decisions: ['decided X'],
      outcomes: ['shipped Y'],
      pending: ['follow up Z'],
      capture: captureArgs('2026-06-10', '09:00'),
    });

    const reloaded = await loadDistillationLedger('p', now);
    expect(reloaded.ledger.entries[0]).toMatchObject({
      status: 'captured',
      decisions: ['decided X'],
      outcomes: ['shipped Y'],
      pending: ['follow up Z'],
    });
  });

  it('loadPendingCaptureEntries returns only entries still in captured status', async () => {
    await setupHome();
    const now = new Date('2026-06-10T09:00:00.000Z');
    await recordCapturedDistillationEntry({ projectId: 'p', now, summary: 's1', capture: captureArgs('2026-06-10', '09:00') });
    const second = await recordCapturedDistillationEntry({ projectId: 'p', now, summary: 's2', capture: captureArgs('2026-06-10', '10:00') });
    await markDistillationLedgerEntry({ projectId: 'p', entryId: second.entry.id, status: 'ignored_with_reason', reason: 'noise', now });

    const pending = await loadPendingCaptureEntries('p', now);
    expect(pending.entries).toHaveLength(1);
    expect(pending.entries[0].summary).toBe('s1');
  });

  it('markCapturesDistilledToState transitions only captured entries and is idempotent', async () => {
    await setupHome();
    const now = new Date('2026-06-10T09:00:00.000Z');
    const a = await recordCapturedDistillationEntry({ projectId: 'p', now, summary: 'a', capture: captureArgs('2026-06-10', '09:00') });
    const b = await recordCapturedDistillationEntry({ projectId: 'p', now, summary: 'b', capture: captureArgs('2026-06-10', '10:00') });

    const first = await markCapturesDistilledToState({ projectId: 'p', entryIds: [a.entry.id, b.entry.id, 'missing-id'], now });
    expect(first.markedCount).toBe(2);

    const reloaded = await loadDistillationLedger('p', now);
    expect(reloaded.ledger.entries.every((e) => e.status === 'distilled_to_state')).toBe(true);
    expect(reloaded.ledger.entries.every((e) => e.processed_at === now.toISOString())).toBe(true);

    // Already distilled → nothing left to transition.
    const second = await markCapturesDistilledToState({ projectId: 'p', entryIds: [a.entry.id, b.entry.id], now });
    expect(second.markedCount).toBe(0);
  });

  it('does not count distilled_to_state captures as unprocessed in the health summary', async () => {
    await setupHome();
    const now = new Date('2026-06-10T09:00:00.000Z');
    const a = await recordCapturedDistillationEntry({ projectId: 'p', now, summary: 'a', capture: captureArgs('2026-06-10', '09:00') });
    await markCapturesDistilledToState({ projectId: 'p', entryIds: [a.entry.id], now });

    const health = await summarizeDistillationLedger({ projectId: 'p', now });
    expect(health.unprocessed_capture_count).toBe(0);
  });
});
