import { createHash } from 'crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import yaml from 'yaml';
import { gitText } from './exec-git.js';

/**
 * Git-tracked project evolution log (#580 / L2).
 *
 * The distillation ledger is a machine-local runtime sidecar — the right place
 * for raw capture lifecycle (it may reference private transcripts), but the
 * wrong carrier for "what did this project learn and why": that timeline must
 * travel with the repo and stay readable by humans. The evolution log is the
 * shared half of the two-tier split: typed, distilled entries appended to
 * `<context>/evolution-log/YYYY-MM.yaml` next to state.yaml, committed through
 * the normal agenticos_save flow. Append-only; monthly files keep merge
 * conflicts between parallel issue worktrees rare and trivially resolvable.
 */

export interface EvolutionLogEntry {
  id: string;
  at: string;
  kind: 'decision' | 'case' | 'knowledge_ref';
  summary: string;
  rationale?: string;
  refs?: {
    issue?: string;
    pr?: string;
    knowledge?: string[];
  };
}

export interface EvolutionLogAppendResult {
  filePath: string;
  /** Path of the monthly file relative to the context dir, e.g. "evolution-log/2026-06.yaml". */
  contextRelativePath: string;
  appendedCount: number;
}

export interface EvolutionTimelineOptions {
  limit?: number;
}

export const EVOLUTION_LOG_DIRNAME = 'evolution-log';

export function getEvolutionLogDir(statePath: string): string {
  return join(dirname(statePath), EVOLUTION_LOG_DIRNAME);
}

function monthlyFileName(now: Date): string {
  return `${now.toISOString().slice(0, 7)}.yaml`;
}

/**
 * Deterministic entry id so re-recording the same decision in the same month
 * (e.g. a drain replay) deduplicates instead of duplicating the timeline.
 */
export function evolutionEntryId(kind: string, summary: string, issueRef: string | null, now: Date): string {
  const hash = createHash('sha256')
    .update(`${kind}\n${summary}\n${issueRef ?? ''}`)
    .digest('hex')
    .slice(0, 10);
  return `evo-${now.toISOString().slice(0, 10)}-${hash}`;
}

/**
 * Derive the current issue ref from the checkout's branch name
 * (feat|fix|chore|docs/<issue>-<slug>). This is the deterministic auto-stamp:
 * relying on agents to remember refs is the failure mode the design names, and
 * the branch is authoritative inside the guardrail worktree flow. Returns null
 * outside that convention (e.g. canonical main) — never guesses.
 */
export async function deriveIssueRefFromBranch(repoPath: string): Promise<string | null> {
  try {
    const branch = await gitText(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'], { timeout: 5000 });
    const match = branch.match(/^[a-z]+\/(\d+)-/);
    return match ? `#${match[1]}` : null;
  } catch {
    return null;
  }
}

interface MonthlyLogFile {
  version: '1.0.0';
  entries: EvolutionLogEntry[];
}

async function loadMonthlyFile(filePath: string): Promise<MonthlyLogFile> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    return { version: '1.0.0', entries: [] };
  }
  // The log is git-tracked: a corrupt file is repo state the operator can
  // git-restore, so fail loudly instead of silently dropping the month.
  const parsed = yaml.parse(content);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as MonthlyLogFile).entries)) {
    throw new Error(`evolution log file is not parseable: ${filePath}`);
  }
  return {
    version: '1.0.0',
    entries: (parsed as MonthlyLogFile).entries,
  };
}

/**
 * Read every monthly evolution-log entry for a project, oldest file first.
 * Tolerant by design — recall must degrade gracefully, so an unreadable month
 * is skipped rather than failing the whole read (unlike append, which fails loud
 * because it is git-tracked state the operator can restore).
 */
export async function readEvolutionLog(statePath: string): Promise<EvolutionLogEntry[]> {
  const dir = getEvolutionLogDir(statePath);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((name) => /^\d{4}-\d{2}\.yaml$/.test(name)).sort();
  } catch {
    return [];
  }
  const entries: EvolutionLogEntry[] = [];
  for (const file of files) {
    try {
      const parsed = yaml.parse(await readFile(join(dir, file), 'utf-8'));
      if (parsed && Array.isArray(parsed.entries)) {
        for (const entry of parsed.entries) {
          if (entry && typeof entry === 'object' && typeof entry.id === 'string') {
            entries.push(entry as EvolutionLogEntry);
          }
        }
      }
    } catch {
      // skip an unreadable month
    }
  }
  return entries;
}

function entryTimestamp(entry: EvolutionLogEntry): number {
  const parsed = Date.parse(entry.at ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareTimelineEntries(a: EvolutionLogEntry, b: EvolutionLogEntry): number {
  return entryTimestamp(a) - entryTimestamp(b) || a.id.localeCompare(b.id);
}

export async function readEvolutionTimeline(statePath: string, options: EvolutionTimelineOptions = {}): Promise<EvolutionLogEntry[]> {
  const entries = (await readEvolutionLog(statePath)).slice().sort(compareTimelineEntries);
  const limit = Number.isFinite(options.limit) && options.limit && options.limit > 0
    ? Math.floor(options.limit)
    : null;
  return limit ? entries.slice(-limit) : entries;
}

function renderEntryRefs(refs: EvolutionLogEntry['refs']): string {
  const rendered: string[] = [];
  if (refs?.issue) rendered.push(`issue ${refs.issue}`);
  if (refs?.pr) rendered.push(`PR ${refs.pr}`);
  if (refs?.knowledge && refs.knowledge.length > 0) {
    rendered.push(`knowledge ${refs.knowledge.map((item) => `\`${item}\``).join(', ')}`);
  }
  return rendered.length > 0 ? rendered.join(' · ') : 'none';
}

export function renderEvolutionTimelineMarkdown(
  entries: EvolutionLogEntry[],
  heading = 'Project evolution timeline',
): string {
  if (entries.length === 0) {
    return `### ${heading}\n\n_No evolution-log entries found._`;
  }

  const lines = [`### ${heading} (${entries.length})`, ''];
  for (const entry of entries) {
    lines.push(`- ${entry.at || 'unknown time'} · **[${entry.kind}]** ${entry.summary || entry.id}`);
    if (entry.rationale) lines.push(`  - rationale: ${entry.rationale}`);
    lines.push(`  - ref: \`${entry.id}\``);
    lines.push(`  - refs: ${renderEntryRefs(entry.refs)}`);
  }
  return lines.join('\n');
}

export async function appendEvolutionEntries(args: {
  statePath: string;
  entries: Array<Omit<EvolutionLogEntry, 'id' | 'at'>>;
  now?: Date;
}): Promise<EvolutionLogAppendResult> {
  const now = args.now ?? new Date();
  const dir = getEvolutionLogDir(args.statePath);
  const fileName = monthlyFileName(now);
  const filePath = join(dir, fileName);
  const contextRelativePath = `${EVOLUTION_LOG_DIRNAME}/${fileName}`;

  if (args.entries.length === 0) {
    return { filePath, contextRelativePath, appendedCount: 0 };
  }

  const log = await loadMonthlyFile(filePath);
  const existingIds = new Set(log.entries.map((entry) => entry.id));
  let appendedCount = 0;
  for (const draft of args.entries) {
    const id = evolutionEntryId(draft.kind, draft.summary, draft.refs?.issue ?? null, now);
    if (existingIds.has(id)) continue;
    existingIds.add(id);
    log.entries.push({
      id,
      at: now.toISOString(),
      ...draft,
    });
    appendedCount += 1;
  }

  if (appendedCount > 0) {
    await mkdir(dir, { recursive: true });
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tempPath, yaml.stringify(log), 'utf-8');
    await rename(tempPath, filePath);
  }
  return { filePath, contextRelativePath, appendedCount };
}
