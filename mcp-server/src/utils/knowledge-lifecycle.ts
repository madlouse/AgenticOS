import { readdir, readFile } from 'fs/promises';
import { basename, join, relative } from 'path';
import yaml from 'yaml';

export type KnowledgeLifecycleStatus = 'current' | 'stale' | 'superseded' | 'expired';
export type KnowledgeConfidence = 'high' | 'medium' | 'low';

export interface KnowledgeLifecycleMetadata {
  owner: string | null;
  valid_until: string | null;
  supersedes: string[];
  confidence: KnowledgeConfidence | null;
  missing_fields: string[];
  invalid_fields: string[];
}

export interface KnowledgeDocumentLifecycle {
  path: string;
  status: KnowledgeLifecycleStatus;
  owner: string | null;
  valid_until: string | null;
  supersedes: string[];
  superseded_by: string[];
  confidence: KnowledgeConfidence | null;
  missing_fields: string[];
  invalid_fields: string[];
}

interface RawKnowledgeDoc {
  path: string;
  metadata: KnowledgeLifecycleMetadata;
}

const REQUIRED_FIELDS = ['owner', 'valid_until', 'supersedes', 'confidence'] as const;
const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low']);

function firstObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};
  try {
    return firstObject(yaml.parse(match[1] ?? ''));
  } catch {
    return {};
  }
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeString(item))
      .filter((item): item is string => Boolean(item));
  }
  const single = normalizeString(value);
  return single ? [single] : [];
}

function normalizeConfidence(value: unknown): KnowledgeConfidence | null {
  const normalized = normalizeString(value)?.toLowerCase() ?? null;
  return normalized && CONFIDENCE_VALUES.has(normalized)
    ? normalized as KnowledgeConfidence
    : null;
}

export function parseKnowledgeLifecycleMetadata(content: string): KnowledgeLifecycleMetadata {
  const frontmatter = parseFrontmatter(content);
  const lifecycle = firstObject(frontmatter.lifecycle);
  const source = Object.keys(lifecycle).length > 0 ? lifecycle : frontmatter;

  const owner = normalizeString(source.owner);
  const validUntilRaw = normalizeString(source.valid_until);
  const confidence = normalizeConfidence(source.confidence);
  const supersedes = normalizeStringList(source.supersedes);
  const missingFields = REQUIRED_FIELDS.filter((field) => !(field in source));
  const invalidFields: string[] = [];

  if (validUntilRaw && Number.isNaN(Date.parse(validUntilRaw))) invalidFields.push('valid_until');
  if ('confidence' in source && !confidence) invalidFields.push('confidence');

  return {
    owner,
    valid_until: validUntilRaw,
    supersedes,
    confidence,
    missing_fields: missingFields,
    invalid_fields: invalidFields,
  };
}

function referenceKeys(path: string): Set<string> {
  const name = basename(path);
  return new Set([
    path,
    name,
    name.replace(/\.[^.]+$/, ''),
  ]);
}

function isReferencedBy(targetPath: string, refs: string[]): boolean {
  const keys = referenceKeys(targetPath);
  return refs.some((ref) => keys.has(ref));
}

function deriveStatus(args: {
  metadata: KnowledgeLifecycleMetadata;
  supersededBy: string[];
  now: Date;
}): KnowledgeLifecycleStatus {
  if (args.supersededBy.length > 0) return 'superseded';
  if (args.metadata.valid_until && Date.parse(args.metadata.valid_until) < args.now.getTime()) return 'expired';
  if (args.metadata.missing_fields.length > 0 || args.metadata.invalid_fields.length > 0) return 'stale';
  return 'current';
}

async function listKnowledgeMarkdownFiles(dir: string, root = dir): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listKnowledgeMarkdownFiles(path, root));
    } else if (entry.isFile() && /\.(md|markdown)$/i.test(entry.name)) {
      files.push(relative(root, path));
    }
  }
  return files.sort();
}

export async function readKnowledgeDocumentLifecycles(
  knowledgeDir: string | null | undefined,
  now: Date = new Date(),
): Promise<KnowledgeDocumentLifecycle[]> {
  if (!knowledgeDir) return [];
  const paths = await listKnowledgeMarkdownFiles(knowledgeDir);
  const rawDocs: RawKnowledgeDoc[] = [];
  for (const path of paths) {
    let content = '';
    try {
      content = await readFile(join(knowledgeDir, path), 'utf-8');
    /* c8 ignore next 3 -- race-only path when a file disappears between readdir and readFile. */
    } catch {
      content = '';
    }
    rawDocs.push({ path, metadata: parseKnowledgeLifecycleMetadata(content) });
  }

  return rawDocs.map((doc) => {
    const supersededBy = rawDocs
      .filter((candidate) => candidate.path !== doc.path && isReferencedBy(doc.path, candidate.metadata.supersedes))
      .map((candidate) => candidate.path);
    return {
      path: doc.path,
      status: deriveStatus({ metadata: doc.metadata, supersededBy, now }),
      owner: doc.metadata.owner,
      valid_until: doc.metadata.valid_until,
      supersedes: doc.metadata.supersedes,
      superseded_by: supersededBy,
      confidence: doc.metadata.confidence,
      missing_fields: doc.metadata.missing_fields,
      invalid_fields: doc.metadata.invalid_fields,
    };
  });
}
