import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import yaml from 'yaml';
import {
  getDistillationLedgerPath,
  loadDistillationLedger,
  markDistillationLedgerEntry,
  recordCapturedDistillationEntry,
  saveDistillationLedger,
  summarizeDistillationLedger,
  type DistillationLedger,
} from '../distillation-ledger.js';

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
      status: 'ignored_with_reason',
    })).rejects.toThrow('reason is required');
    await expect(markDistillationLedgerEntry({
      projectId: 'agenticos',
      entryId: captured.entry.id,
      status: 'superseded',
    })).rejects.toThrow('superseded_by is required');
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

  it('normalizes malformed ledger content without leaking invalid entries', async () => {
    await setupHome();
    const path = getDistillationLedgerPath('agenticos');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, yaml.stringify({
      version: '0.1.0',
      project_id: '',
      entries: [
        { id: '', status: 'captured' },
        { id: 'valid', status: 'captured', created_at: 'bad-date', updated_at: '2026-05-20T00:00:00.000Z' },
      ],
    }), 'utf-8');

    const loaded = await loadDistillationLedger('agenticos', new Date('2026-05-21T00:00:00.000Z'));

    expect(loaded.exists).toBe(true);
    expect(loaded.ledger.project_id).toBe('agenticos');
    expect(loaded.ledger.entries.map((entry) => entry.id)).toEqual(['valid']);
  });
});
