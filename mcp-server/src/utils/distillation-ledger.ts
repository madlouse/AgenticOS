import { createHash } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import yaml from 'yaml';
import { getAgenticOSHome } from './registry.js';
import type { AppendedRecordCapture } from './record-capture.js';

export type DistillationLedgerStatus =
  | 'captured'
  | 'distilled_to_knowledge'
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
const LEDGER_STATUSES = new Set<DistillationLedgerStatus>([
  'captured',
  'distilled_to_knowledge',
  'converted_to_task',
  'superseded',
  'ignored_with_reason',
]);

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

function normalizeEntry(projectId: string, value: unknown): DistillationLedgerEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const status = typeof raw.status === 'string' && LEDGER_STATUSES.has(raw.status as DistillationLedgerStatus)
    ? raw.status as DistillationLedgerStatus
    : null;
  if (!id || !status) return null;

  const createdAt = typeof raw.created_at === 'string' && raw.created_at.trim() ? raw.created_at : nowIso();
  const updatedAt = typeof raw.updated_at === 'string' && raw.updated_at.trim() ? raw.updated_at : createdAt;
  return {
    id,
    project_id: typeof raw.project_id === 'string' && raw.project_id.trim() ? raw.project_id.trim() : projectId,
    status,
    created_at: createdAt,
    updated_at: updatedAt,
    ...(typeof raw.captured_at === 'string' && raw.captured_at.trim() ? { captured_at: raw.captured_at.trim() } : {}),
    ...(typeof raw.processed_at === 'string' && raw.processed_at.trim() ? { processed_at: raw.processed_at.trim() } : {}),
    ...(typeof raw.capture_path === 'string' && raw.capture_path.trim() ? { capture_path: raw.capture_path.trim() } : {}),
    ...(typeof raw.capture_date === 'string' && raw.capture_date.trim() ? { capture_date: raw.capture_date.trim() } : {}),
    ...(typeof raw.capture_time === 'string' && raw.capture_time.trim() ? { capture_time: raw.capture_time.trim() } : {}),
    ...(typeof raw.summary === 'string' && raw.summary.trim() ? { summary: raw.summary.trim() } : {}),
    ...(asStringArray(raw.knowledge_paths) ? { knowledge_paths: asStringArray(raw.knowledge_paths) } : {}),
    ...(typeof raw.task_id === 'string' && raw.task_id.trim() ? { task_id: raw.task_id.trim() } : {}),
    ...(typeof raw.superseded_by === 'string' && raw.superseded_by.trim() ? { superseded_by: raw.superseded_by.trim() } : {}),
    ...(typeof raw.reason === 'string' && raw.reason.trim() ? { reason: raw.reason.trim() } : {}),
    ...(Array.isArray(raw.refs) ? {
      refs: raw.refs
        .filter((ref): ref is Record<string, unknown> => Boolean(ref) && typeof ref === 'object')
        .map((ref) => {
          const visibility: 'private' | 'public' | 'restricted' =
            ref.visibility === 'public' || ref.visibility === 'restricted' ? ref.visibility : 'private';
          return {
            type: typeof ref.type === 'string' && ref.type.trim() ? ref.type.trim() : 'reference',
            uri: typeof ref.uri === 'string' && ref.uri.trim() ? ref.uri.trim() : '',
            visibility,
          };
        })
        .filter((ref) => ref.uri.length > 0),
    } : {}),
  };
}

function normalizeLedger(projectId: string, raw: unknown, now: Date = new Date()): DistillationLedger {
  const parsed = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const entries = Array.isArray(parsed.entries)
    ? parsed.entries
        .map((entry) => normalizeEntry(projectId, entry))
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
  try {
    const parsed = yaml.parse(await readFile(path, 'utf-8'));
    return {
      path,
      exists: true,
      ledger: normalizeLedger(projectId, parsed, now),
    };
  } catch {
    return {
      path,
      exists: false,
      ledger: emptyLedger(projectId, now),
    };
  }
}

export async function saveDistillationLedger(projectId: string, ledger: DistillationLedger, now: Date = new Date()): Promise<string> {
  const path = getDistillationLedgerPath(projectId);
  const normalized = normalizeLedger(projectId, ledger, now);
  normalized.updated_at = nowIso(now);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, yaml.stringify(normalized), 'utf-8');
  return path;
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
  now?: Date;
}): Promise<DistillationLedgerWriteResult> {
  const now = args.now ?? new Date();
  const loaded = await loadDistillationLedger(args.projectId, now);
  const id = captureEntryId(args);
  const existing = loaded.ledger.entries.find((entry) => entry.id === id) ?? null;
  if (existing) {
    return {
      path: loaded.path,
      entry: existing,
      created: false,
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
    refs: [{
      type: 'runtime_capture',
      uri: args.capture.filePath,
      visibility: 'private',
    }],
  };
  loaded.ledger.entries.push(entry);
  await saveDistillationLedger(args.projectId, loaded.ledger, now);
  return {
    path: loaded.path,
    entry,
    created: true,
  };
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
  const loaded = await loadDistillationLedger(args.projectId, now);
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
  await saveDistillationLedger(args.projectId, loaded.ledger, now);
  return {
    path: loaded.path,
    entry,
    created: false,
  };
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

function isStale(value: string | null, now: Date, staleAfterDays: number): boolean {
  if (!value) return false;
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
