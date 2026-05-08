import { mkdtemp, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../registry.js', () => ({
  getAgenticOSHome: vi.fn(() => '/runtime/home'),
}));

import {
  appendRecordCapture,
  buildRecordCaptureEntry,
  getRuntimeCaptureConversationDir,
} from '../record-capture.js';

describe('record-capture', () => {
  const now = new Date('2026-05-07T10:30:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives runtime capture paths from encoded project ids', () => {
    expect(getRuntimeCaptureConversationDir('agenticos/core')).toBe(
      '/runtime/home/.agent-workspace/projects/agenticos%2Fcore/captures/conversations',
    );
  });

  it('builds a markdown capture entry with structured sections', () => {
    const entry = buildRecordCaptureEntry({
      now,
      summary: 'Did work',
      decisions: ['Decision'],
      outcomes: ['Outcome'],
      pending: ['Pending'],
    });

    expect(entry.date).toBe('2026-05-07');
    expect(entry.time).toBe('10:30');
    expect(entry.entry).toContain('### 10:30 - Session Record');
    expect(entry.entry).toContain('**Summary**: Did work');
    expect(entry.entry).toContain('- Decision');
    expect(entry.entry).toContain('- Outcome');
    expect(entry.entry).toContain('- Pending');
  });

  it('creates and appends daily capture files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agenticos-capture-'));

    const first = await appendRecordCapture({
      dir,
      now,
      summary: 'First record',
      decisions: [],
      outcomes: [],
      pending: [],
    });
    const second = await appendRecordCapture({
      dir,
      now: new Date('2026-05-07T10:35:00.000Z'),
      summary: 'Second record',
      decisions: ['Keep going'],
      outcomes: [],
      pending: [],
    });

    expect(first.filePath).toBe(second.filePath);
    const content = await readFile(first.filePath, 'utf-8');
    expect(content).toContain('# Sessions - 2026-05-07');
    expect(content).toContain('First record');
    expect(content).toContain('Second record');
    expect(content).toContain('Keep going');
  });
});
