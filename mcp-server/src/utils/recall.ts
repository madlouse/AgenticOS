import { readdir } from 'fs/promises';
import { readEvolutionLog, type EvolutionLogEntry } from './evolution-log.js';

/**
 * Context Recall v1 (#582 / L3) — the read half of the write-heavy/read-light loop.
 *
 * Given the current issue (or a free query), surface the most relevant prior
 * evolution-log entries and knowledge documents so a cold-starting agent sees
 * strongly-related history instead of only the fixed startup files. v1 is
 * deterministic by design (no vector store — that is #583): three signals only.
 *   1. issue lineage — an evolution entry whose refs.issue is the current issue.
 *   2. keyword/substring overlap — CJK-aware (ASCII tokens, CJK bigrams) so a
 *      Chinese query matches Chinese summaries and an English query matches
 *      English knowledge filenames.
 *   3. recency — evolution entries carry a reliable `at`; a mild boost + final
 *      tie-break. Knowledge freshness is deferred (mtime resets on clone; the
 *      accurate signal arrives with #581/#583).
 */

export interface RecallCandidate {
  kind: 'decision' | 'case' | 'knowledge_ref' | 'knowledge';
  ref: string; // evolution entry id, or knowledge display path
  summary: string;
  score: number;
  signals: string[];
}

export interface RecallInput {
  statePath: string;
  knowledgeDir: string;
  knowledgeDisplayDir?: string;
  issueId?: string | null;
  issueTitle?: string | null;
  issueBody?: string | null;
  query?: string | null;
  limit?: number;
  now?: Date;
}

const DEFAULT_LIMIT = 5;
const ISSUE_LINEAGE_SCORE = 100;
const RECENCY_30D_BOOST = 2;
const RECENCY_90D_BOOST = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

// Generic words that would create noise matches across unrelated entries.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'via', 'are', 'was',
  'add', 'fix', 'use', 'new', 'not', 'but', 'all', 'any', 'how', 'why', 'when',
  'issue', 'pr', 'agenticos', 'mcp', 'test', 'tests', 'support',
]);

export function normalizeIssueRef(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/^#/, '');
  return trimmed.length > 0 ? trimmed : null;
}

/** Extract match terms: ASCII tokens (>=3, non-stopword) + CJK bigrams (and singletons). */
export function extractTerms(text: string): Set<string> {
  const terms = new Set<string>();
  const lower = (text || '').toLowerCase();
  for (const token of lower.split(/[^a-z0-9]+/)) {
    if (STOPWORDS.has(token)) continue;
    // >=3 chars, or a short capability tag like "m2"/"g3" (>=2 with a digit).
    if (token.length >= 3 || (token.length === 2 && /[0-9]/.test(token))) {
      terms.add(token);
    }
  }
  for (const run of lower.match(/[一-鿿]+/g) ?? []) {
    if (run.length === 1) {
      terms.add(run);
      continue;
    }
    for (let i = 0; i + 1 < run.length; i += 1) terms.add(run.slice(i, i + 2));
  }
  return terms;
}

function matchTerms(queryTerms: Set<string>, candidateText: string): string[] {
  const lower = (candidateText || '').toLowerCase();
  const matched: string[] = [];
  for (const term of queryTerms) {
    if (lower.includes(term)) matched.push(term);
  }
  return matched;
}

/** A knowledge filename like `m2-precision-sampling-2026-05-28.md` → "m2 precision sampling". */
export function knowledgeTitleFromFilename(filename: string): string {
  return filename
    .replace(/\.md$/i, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

function recencyBoost(at: string | undefined, now: Date): number {
  if (!at) return 0;
  const ts = Date.parse(at);
  if (!Number.isFinite(ts)) return 0;
  const ageMs = now.getTime() - ts;
  if (ageMs <= 30 * DAY_MS) return RECENCY_30D_BOOST;
  if (ageMs <= 90 * DAY_MS) return RECENCY_90D_BOOST;
  return 0;
}

function entryAtMs(entry: EvolutionLogEntry): number {
  const ts = Date.parse(entry.at ?? '');
  return Number.isFinite(ts) ? ts : 0;
}

export async function recallContext(input: RecallInput): Promise<RecallCandidate[]> {
  const now = input.now ?? new Date();
  const limit = input.limit && input.limit > 0 ? input.limit : DEFAULT_LIMIT;
  const knowledgeDisplayDir = (input.knowledgeDisplayDir ?? 'knowledge/').replace(/\/?$/, '/');
  const issueRef = normalizeIssueRef(input.issueId);

  const queryText = input.query && input.query.trim().length > 0
    ? input.query
    : [input.issueTitle, input.issueBody].filter(Boolean).join(' ');
  const queryTerms = extractTerms(queryText);

  const candidates: Array<RecallCandidate & { _at: number }> = [];

  // Evolution-log entries.
  const entries = await readEvolutionLog(input.statePath);
  for (const entry of entries) {
    const signals: string[] = [];
    let score = 0;

    const entryIssue = normalizeIssueRef(entry.refs?.issue);
    if (issueRef && entryIssue === issueRef) {
      score += ISSUE_LINEAGE_SCORE;
      signals.push(`issue lineage #${issueRef}`);
    }

    const matched = matchTerms(queryTerms, `${entry.summary ?? ''} ${entry.rationale ?? ''}`);
    if (matched.length > 0) {
      score += matched.length;
      signals.push(`keyword: ${matched.slice(0, 4).join(', ')}`);
    }

    if (score <= 0) continue;
    score += recencyBoost(entry.at, now);
    candidates.push({
      kind: entry.kind ?? 'decision',
      ref: entry.id,
      summary: entry.summary ?? entry.id,
      score,
      signals,
      _at: entryAtMs(entry),
    });
  }

  // Knowledge documents (filename-derived title carries both keyword and
  // capability-area proximity; no per-file content read on cold start).
  let knowledgeFiles: string[] = [];
  try {
    knowledgeFiles = (await readdir(input.knowledgeDir)).filter((name) => name.toLowerCase().endsWith('.md'));
  } catch {
    knowledgeFiles = [];
  }
  for (const file of knowledgeFiles) {
    const title = knowledgeTitleFromFilename(file);
    const matched = matchTerms(queryTerms, title);
    if (matched.length === 0) continue;
    candidates.push({
      kind: 'knowledge',
      ref: `${knowledgeDisplayDir}${file}`,
      summary: title,
      score: matched.length,
      signals: [`keyword: ${matched.slice(0, 4).join(', ')}`],
      _at: 0,
    });
  }

  candidates.sort((a, b) => b.score - a.score || b._at - a._at || a.ref.localeCompare(b.ref));
  return candidates.slice(0, limit).map(({ _at, ...candidate }) => candidate);
}

/** Operator-facing markdown rendering (also the #584 P1 slice). */
export function renderRecallMarkdown(candidates: RecallCandidate[], heading = 'Recalled context'): string {
  if (candidates.length === 0) {
    return `### ${heading}\n\n_No related prior context found._`;
  }
  const lines = [`### ${heading} (${candidates.length})`, ''];
  for (const candidate of candidates) {
    lines.push(`- **[${candidate.kind}]** ${candidate.summary}`);
    lines.push(`  - ref: \`${candidate.ref}\` · ${candidate.signals.join(' · ')}`);
  }
  return lines.join('\n');
}
