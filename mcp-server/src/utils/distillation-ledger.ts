import { createHash } from 'crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import yaml from 'yaml';
import { getAgenticOSHome } from './registry.js';
import type { AppendedRecordCapture } from './record-capture.js';

export type DistillationLedgerStatus =
  | 'captured'
  | 'distilled_to_knowledge'
  | 'distilled_to_state'
  | 'converted_to_task'
  | 'superseded'
  | 'ignored_with_reason';

export interface DistillationLedgerEntry {
  id: string;
  project_id: string;
  status: DistillationLedgerStatus;
  created_at: string;
  updated_at: string;
  captured_at?: string;
  processed_at?: string;
  capture_path?: string;
  capture_date?: string;
  capture_time?: string;
  summary?: string;
  /** Structured payload retained so a later worktree record can fold the
   * capture into tracked state without re-parsing the markdown capture file. */
  decisions?: string[];
  outcomes?: string[];
  pending?: string[];
  knowledge_paths?: string[];
  task_id?: string;
  superseded_by?: string;
  reason?: string;
  refs?: Array<{
    type: string;
    uri: string;
    visibility: 'private' | 'public' | 'restricted';
  }>;
}

export interface DistillationLedger {
  version: '1.0.0';
  project_id: string;
  updated_at: string;
  entries: DistillationLedgerEntry[];
}

export interface LoadedDistillationLedger {
  path: string;
  exists: boolean;
  /** File exists but could not be parsed. Mutations back it up before rewriting. */
  corrupt: boolean;
  ledger: DistillationLedger;
}

export interface DistillationLedgerWriteResult {
  path: string;
  entry: DistillationLedgerEntry;
  created: boolean;
}

export interface DistillationLedgerHealth {
  status: 'PASS' | 'WARN' | 'MISSING';
  path: string;
  exists: boolean;
  unprocessed_capture_count: number;
  stale_unprocessed_capture_count: number;
  oldest_unprocessed_capture_at: string | null;
  latest_entry_at: string | null;
  summary: string;
  warnings: string[];
}

const LEDGER_VERSION: DistillationLedger['version'] = '1.0.0';
const DEFAULT_STALE_AFTER_DAYS = 14;

export function getDistillationLedgerPath(projectId: string): string {
  return join(
    getAgenticOSHome(),
    '.agent-workspace',
    'projects',
    encodeURIComponent(projectId),
    'distillation-ledger.yaml',
  );
}

function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

function emptyLedger(projectId: string, now: Date = new Date()): DistillationLedger {
  return {
    version: LEDGER_VERSION,
    project_id: projectId,
    updated_at: nowIso(now),
    entries: [],
  };
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return values.length > 0 ? values : undefined;
}

function normalizeEntry(projectId: string, value: unknown, now: Date = new Date()): DistillationLedgerEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  // Forward compatibility: a newer runtime sharing this machine-local ledger may
  // have written statuses/fields this version does not know. Destroying them on
  // a load→save round-trip is data loss, so unknown statuses are preserved
  // verbatim and unknown fields pass through via the raw spread below. Only an
  // entry with no usable id/status at all is dropped as malformed.
  const status = typeof raw.status === 'string' && raw.status.trim()
    ? raw.status.trim() as DistillationLedgerStatus
    : null;
  if (!id || !status) return null;

  const createdAt = typeof raw.created_at === 'string' && raw.created_at.trim() ? raw.created_at : nowIso(now);
  const updatedAt = typeof raw.updated_at === 'string' && raw.updated_at.trim() ? raw.updated_at : createdAt;

  // Unknown fields pass through verbatim; known fields keep their established
  // cleaning (trim, drop-when-empty). Cleaning must only ever touch fields this
  // version understands.
  const entry = { ...raw } as DistillationLedgerEntry & Record<string, unknown>;
  entry.id = id;
  entry.project_id = typeof raw.project_id === 'string' && raw.project_id.trim() ? raw.project_id.trim() : projectId;
  entry.status = status;
  entry.created_at = createdAt;
  entry.updated_at = updatedAt;

  const stringFields = ['captured_at', 'processed_at', 'capture_path', 'capture_date', 'capture_time', 'summary', 'task_id', 'superseded_by', 'reason'] as const;
  for (const field of stringFields) {
    const value = raw[field];
    if (typeof value === 'string' && value.trim()) {
      entry[field] = value.trim();
    } else if (field in entry) {
      delete entry[field];
    }
  }

  const arrayFields = ['decisions', 'outcomes', 'pending', 'knowledge_paths'] as const;
  for (const field of arrayFields) {
    const values = asStringArray(raw[field]);
    if (values) {
      entry[field] = values;
    } else if (field in entry) {
      delete entry[field];
    }
  }

  if (Array.isArray(raw.refs)) {
    const refs = raw.refs
      .filter((ref): ref is Record<string, unknown> => Boolean(ref) && typeof ref === 'object')
      .map((ref) => {
        const visibility: 'private' | 'public' | 'restricted' =
          ref.visibility === 'public' || ref.visibility === 'restricted' ? ref.visibility : 'private';
        return {
          ...ref,
          type: typeof ref.type === 'string' && ref.type.trim() ? ref.type.trim() : 'reference',
          uri: typeof ref.uri === 'string' && ref.uri.trim() ? ref.uri.trim() : '',
          visibility,
        };
      })
      .filter((ref) => ref.uri.length > 0);
    entry.refs = refs;
  } else if ('refs' in entry) {
    delete entry.refs;
  }

  return entry;
}

function normalizeLedger(projectId: string, raw: unknown, now: Date = new Date()): DistillationLedger {
  const parsed = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const entries = Array.isArray(parsed.entries)
    ? parsed.entries
        .map((entry) => normalizeEntry(projectId, entry, now))
        .filter((entry): entry is DistillationLedgerEntry => entry !== null)
    : [];
  return {
    version: LEDGER_VERSION,
    project_id: typeof parsed.project_id === 'string' && parsed.project_id.trim() ? parsed.project_id.trim() : projectId,
    updated_at: typeof parsed.updated_at === 'string' && parsed.updated_at.trim() ? parsed.updated_at.trim() : nowIso(now),
    entries,
  };
}

export async function loadDistillationLedger(projectId: string, now: Date = new Date()): Promise<LoadedDistillationLedger> {
  const path = getDistillationLedgerPath(projectId);
  let content: string;
  try {
    content = await readFile(path, 'utf-8');
  } catch {
    return {
      path,
      exists: false,
      corrupt: false,
      ledger: emptyLedger(projectId, now),
    };
  }

  try {
    const parsed = yaml.parse(content);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('ledger file did not parse to an object');
    }
    return {
      path,
      exists: true,
      corrupt: false,
      ledger: normalizeLedger(projectId, parsed, now),
    };
  } catch {
    // The file exists but is unreadable. Never treat it as an empty ledger for
    // write purposes — a later save would silently erase the entire history.
    return {
      path,
      exists: true,
      corrupt: true,
      ledger: emptyLedger(projectId, now),
    };
  }
}

export async function saveDistillationLedger(projectId: string, ledger: DistillationLedger, now: Date = new Date()): Promise<string> {
  const path = getDistillationLedgerPath(projectId);
  const normalized = normalizeLedger(projectId, ledger, now);
  normalized.updated_at = nowIso(now);
  await mkdir(dirname(path), { recursive: true });
  // Atomic write: a crash mid-write must never leave a torn file behind.
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, yaml.stringify(normalized), 'utf-8');
  await rename(tempPath, path);
  return path;
}

const LEDGER_LOCK_STALE_MS = 30_000;

function getDistillationLedgerLockPath(projectId: string): string {
  return `${getDistillationLedgerPath(projectId)}.lock`;
}

async function reapStaleLedgerLock(lockPath: string): Promise<boolean> {
  // A vanished lock (released between our mkdir failure and this stat) counts
  // as reaped: the caller can retry mkdir immediately.
  const lockStat = await stat(lockPath).catch(() => null);
  if (!lockStat) return true;
  if ((Date.now() - lockStat.mtimeMs) <= LEDGER_LOCK_STALE_MS) {
    return false;
  }
  await rm(lockPath, { recursive: true, force: true }).catch(() => undefined);
  return true;
}

async function withDistillationLedgerLock<T>(projectId: string, callback: () => Promise<T>): Promise<T> {
  const lockPath = getDistillationLedgerLockPath(projectId);
  await mkdir(dirname(lockPath), { recursive: true });

  let locked = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await mkdir(lockPath);
      locked = true;
      break;
    } catch {
      if (await reapStaleLedgerLock(lockPath)) {
        continue;
      }
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 10));
    }
  }
  if (!locked) {
    throw new Error(`failed to acquire distillation ledger lock at ${lockPath}`);
  }

  try {
    return await callback();
  } finally {
    await rm(lockPath, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Locked read-modify-write for ledger mutations: concurrent worktree sessions
 * serialize on the lock instead of overwriting each other's entries. When the
 * existing file is corrupt, it is renamed to a .corrupt-* backup first so the
 * rewrite can never silently destroy history.
 */
async function mutateDistillationLedger<T>(
  projectId: string,
  now: Date,
  mutate: (loaded: LoadedDistillationLedger) => { result: T; save: boolean },
): Promise<T> {
  return withDistillationLedgerLock(projectId, async () => {
    const loaded = await loadDistillationLedger(projectId, now);
    if (loaded.corrupt) {
      const backupPath = `${loaded.path}.corrupt-${Date.now()}`;
      await rename(loaded.path, backupPath).catch(() => undefined);
    }
    const { result, save } = mutate(loaded);
    if (save) {
      await saveDistillationLedger(projectId, loaded.ledger, now);
    }
    return result;
  });
}

function captureEntryId(args: { projectId: string; capture: AppendedRecordCapture; summary: string }): string {
  const hash = createHash('sha256')
    .update(`${args.projectId}\n${args.capture.filePath}\n${args.capture.date}\n${args.capture.time}\n${args.summary}`)
    .digest('hex')
    .slice(0, 12);
  return `capture-${args.capture.date}-${args.capture.time.replace(/[^0-9]/g, '')}-${hash}`;
}

export async function recordCapturedDistillationEntry(args: {
  projectId: string;
  capture: AppendedRecordCapture;
  summary: string;
  decisions?: string[];
  outcomes?: string[];
  pending?: string[];
  now?: Date;
}): Promise<DistillationLedgerWriteResult> {
  const now = args.now ?? new Date();
  const id = captureEntryId(args);
  return mutateDistillationLedger<DistillationLedgerWriteResult>(args.projectId, now, (loaded) => {
    const existing = loaded.ledger.entries.find((entry) => entry.id === id) ?? null;
    if (existing) {
      return {
        result: { path: loaded.path, entry: existing, created: false },
        save: false,
      };
    }

    const timestamp = nowIso(now);
    const entry: DistillationLedgerEntry = {
      id,
      project_id: args.projectId,
      status: 'captured',
      created_at: timestamp,
      updated_at: timestamp,
      captured_at: timestamp,
      capture_path: args.capture.filePath,
      capture_date: args.capture.date,
      capture_time: args.capture.time,
      summary: args.summary,
      ...(args.decisions && args.decisions.length > 0 ? { decisions: args.decisions } : {}),
      ...(args.outcomes && args.outcomes.length > 0 ? { outcomes: args.outcomes } : {}),
      ...(args.pending && args.pending.length > 0 ? { pending: args.pending } : {}),
      refs: [{
        type: 'runtime_capture',
        uri: args.capture.filePath,
        visibility: 'private',
      }],
    };
    loaded.ledger.entries.push(entry);
    return {
      result: { path: loaded.path, entry, created: true },
      save: true,
    };
  });
}

function assertTransitionPatch(entry: DistillationLedgerEntry, patch: Partial<DistillationLedgerEntry> & { status: DistillationLedgerStatus }): void {
  if (patch.status === 'captured') {
    return;
  }
  if (patch.status === 'distilled_to_knowledge' && (!patch.knowledge_paths || patch.knowledge_paths.length === 0)) {
    throw new Error('knowledge_paths is required when marking a ledger entry as distilled_to_knowledge');
  }
  if (patch.status === 'converted_to_task' && !patch.task_id) {
    throw new Error('task_id is required when marking a ledger entry as converted_to_task');
  }
  if (patch.status === 'superseded' && !patch.superseded_by) {
    throw new Error('superseded_by is required when marking a ledger entry as superseded');
  }
  if (patch.status === 'ignored_with_reason' && !patch.reason) {
    throw new Error('reason is required when marking a ledger entry as ignored_with_reason');
  }
  if (entry.status !== 'captured' && entry.status !== patch.status) {
    throw new Error(`ledger entry "${entry.id}" is already ${entry.status}`);
  }
}

export async function markDistillationLedgerEntry(args: {
  projectId: string;
  entryId: string;
  status: DistillationLedgerStatus;
  now?: Date;
  knowledge_paths?: string[];
  task_id?: string;
  superseded_by?: string;
  reason?: string;
}): Promise<DistillationLedgerWriteResult> {
  const now = args.now ?? new Date();
  return mutateDistillationLedger(args.projectId, now, (loaded) => {
    const index = loaded.ledger.entries.findIndex((entry) => entry.id === args.entryId);
    if (index < 0) {
      throw new Error(`distillation ledger entry "${args.entryId}" not found`);
    }

    const existing = loaded.ledger.entries[index];
    const timestamp = nowIso(now);
    const patch = {
      status: args.status,
      ...(args.knowledge_paths ? { knowledge_paths: args.knowledge_paths } : {}),
      ...(args.task_id ? { task_id: args.task_id } : {}),
      ...(args.superseded_by ? { superseded_by: args.superseded_by } : {}),
      ...(args.reason ? { reason: args.reason } : {}),
    };
    assertTransitionPatch(existing, patch);
    const entry: DistillationLedgerEntry = {
      ...existing,
      ...patch,
      updated_at: timestamp,
      ...(args.status === 'captured' ? {} : { processed_at: timestamp }),
    };
    loaded.ledger.entries[index] = entry;
    return {
      result: { path: loaded.path, entry, created: false },
      save: true,
    };
  });
}

/**
 * Load capture entries still awaiting distillation (status 'captured'). Used by
 * a worktree record to drain captures that accumulated on the canonical main
 * checkout (where record is capture-only) into the tracked continuity layer.
 */
export async function loadPendingCaptureEntries(
  projectId: string,
  now: Date = new Date(),
): Promise<{ path: string; entries: DistillationLedgerEntry[] }> {
  const loaded = await loadDistillationLedger(projectId, now);
  return {
    path: loaded.path,
    entries: loaded.ledger.entries.filter((entry) => entry.status === 'captured'),
  };
}

/**
 * Batch-mark captured entries as distilled into tracked state. Loads and saves
 * the ledger once. Only entries currently in 'captured' status are transitioned.
 */
export async function markCapturesDistilledToState(args: {
  projectId: string;
  entryIds: string[];
  now?: Date;
}): Promise<{ path: string; markedCount: number }> {
  const now = args.now ?? new Date();
  return mutateDistillationLedger(args.projectId, now, (loaded) => {
    const ids = new Set(args.entryIds);
    const timestamp = nowIso(now);
    let markedCount = 0;
    for (let index = 0; index < loaded.ledger.entries.length; index += 1) {
      const entry = loaded.ledger.entries[index];
      if (ids.has(entry.id) && entry.status === 'captured') {
        loaded.ledger.entries[index] = {
          ...entry,
          status: 'distilled_to_state',
          updated_at: timestamp,
          processed_at: timestamp,
        };
        markedCount += 1;
      }
    }
    return {
      result: { path: loaded.path, markedCount },
      save: markedCount > 0,
    };
  });
}

function normalizeEntryTime(entry: DistillationLedgerEntry): string | null {
  const value = entry.captured_at ?? entry.created_at;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function latestEntryTime(entries: DistillationLedgerEntry[]): string | null {
  const times = entries
    .map((entry) => {
      const date = new Date(entry.updated_at);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    })
    .filter((value): value is string => value !== null)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return times[0] ?? null;
}

function isStale(value: string, now: Date, staleAfterDays: number): boolean {
  return now.getTime() - new Date(value).getTime() > staleAfterDays * 24 * 60 * 60 * 1000;
}

export async function summarizeDistillationLedger(args: {
  projectId: string | null;
  now?: Date;
  staleAfterDays?: number;
}): Promise<DistillationLedgerHealth> {
  const now = args.now ?? new Date();
  const staleAfterDays = args.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS;
  if (!args.projectId) {
    return {
      status: 'MISSING',
      path: '',
      exists: false,
      unprocessed_capture_count: 0,
      stale_unprocessed_capture_count: 0,
      oldest_unprocessed_capture_at: null,
      latest_entry_at: null,
      summary: 'Distillation ledger is unavailable because project_id is missing.',
      warnings: [],
    };
  }

  const loaded = await loadDistillationLedger(args.projectId, now);
  if (!loaded.exists) {
    return {
      status: 'MISSING',
      path: loaded.path,
      exists: false,
      unprocessed_capture_count: 0,
      stale_unprocessed_capture_count: 0,
      oldest_unprocessed_capture_at: null,
      latest_entry_at: null,
      summary: 'No distillation ledger has been created yet.',
      warnings: [],
    };
  }

  const captured = loaded.ledger.entries.filter((entry) => entry.status === 'captured');
  const capturedTimes = captured
    .map(normalizeEntryTime)
    .filter((value): value is string => value !== null)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const stale = capturedTimes.filter((value) => isStale(value, now, staleAfterDays));
  const warnings = stale.length > 0
    ? [`distillation ledger has ${stale.length} stale captured entr${stale.length === 1 ? 'y' : 'ies'} pending promotion`]
    : [];
  return {
    status: warnings.length > 0 ? 'WARN' : 'PASS',
    path: loaded.path,
    exists: true,
    unprocessed_capture_count: captured.length,
    stale_unprocessed_capture_count: stale.length,
    oldest_unprocessed_capture_at: capturedTimes[0] ?? null,
    latest_entry_at: latestEntryTime(loaded.ledger.entries),
    summary: warnings.length > 0
      ? warnings[0]
      : `Distillation ledger has ${captured.length} unprocessed captured entr${captured.length === 1 ? 'y' : 'ies'}.`,
    warnings,
  };
}
