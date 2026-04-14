import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import { join, relative } from 'path';
import { resolveManagedProjectContextPaths } from './agent-context-paths.js';

export type CaseType = 'corner' | 'bad';
export type CaseFilterType = CaseType | 'all';

const CASE_TYPE_LABEL: Record<CaseType, string> = {
  corner: 'corner-case',
  bad: 'bad-case',
};

const CASE_TYPE_DIRECTORY: Record<CaseType, string> = {
  corner: 'corner-cases',
  bad: 'bad-cases',
};

const SECTION_LABELS = {
  timestamp: 'Timestamp',
  trigger: 'Trigger',
  behavior: 'Observed Behavior',
  rootCause: 'Root Cause',
  impact: 'Impact',
  workaround: 'Workaround / Fix',
  prevention: 'Prevention',
  tags: 'Tags',
} as const;

const OPTIONAL_PLACEHOLDER = '(not provided)';

export interface CaseRecordInput {
  type: CaseType;
  title: string;
  trigger: string;
  behavior: string;
  rootCause?: string;
  impact?: string;
  workaround?: string;
  prevention?: string;
  tags?: string[];
  timestamp?: string;
}

export interface CaseProjectTarget {
  projectId: string;
  projectName: string;
  projectPath: string;
  projectYaml: any;
}

export interface CaseEntry extends CaseProjectTarget {
  type: CaseType;
  title: string;
  timestamp: string;
  trigger: string;
  behavior: string;
  rootCause: string | null;
  impact: string | null;
  workaround: string | null;
  prevention: string | null;
  tags: string[];
  filePath: string;
  relativePath: string;
}

interface ListCasesOptions {
  type?: CaseFilterType;
  tags?: string[];
}

interface ContextCaseSelection {
  heading: 'Relevant Cases' | 'Recent Cases';
  entries: CaseEntry[];
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeCaseType(value: unknown): CaseType {
  if (value === 'corner' || value === 'bad') {
    return value;
  }
  throw new Error('type is required and must be "corner" or "bad".');
}

export function normalizeCaseFilterType(value: unknown): CaseFilterType {
  if (value === undefined || value === null || value === '' || value === 'all') {
    return 'all';
  }
  return normalizeCaseType(value);
}

export function getCaseTypeLabel(type: CaseType): string {
  return CASE_TYPE_LABEL[type];
}

export function getCaseDirectoryName(type: CaseType): string {
  return CASE_TYPE_DIRECTORY[type];
}

export function parseCaseTags(value: unknown, type?: CaseType): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n]/g)
      : [];

  const normalized = source
    .map((entry) => normalizeText(entry).toLowerCase())
    .filter((entry) => entry.length > 0);

  if (type) {
    normalized.unshift(getCaseTypeLabel(type));
  }

  return [...new Set(normalized)];
}

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/g, '')
    .replace(/-+$/g, '');
  return slug || 'untitled-case';
}

function validateTimestamp(value: unknown): string {
  const candidate = normalizeText(value);
  const timestamp = candidate.length > 0 ? candidate : new Date().toISOString();
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('timestamp must be a valid ISO-8601 string when provided.');
  }
  return parsed.toISOString();
}

function renderSection(label: string, value: string | null): string {
  return `## ${label}\n${value ?? OPTIONAL_PLACEHOLDER}\n`;
}

function buildRelativeCasePath(projectPath: string, filePath: string): string {
  return relative(projectPath, filePath).replace(/\\/g, '/');
}

function sortCasesDescending(entries: CaseEntry[]): CaseEntry[] {
  return [...entries].sort((left, right) => {
    const timestampOrder = right.timestamp.localeCompare(left.timestamp);
    if (timestampOrder !== 0) return timestampOrder;
    return left.relativePath.localeCompare(right.relativePath);
  });
}

function extractSectionMap(content: string): Map<string, string> {
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const sections = new Map<string, string>();
  let currentLabel: string | null = null;
  let currentLines: string[] = [];

  const flush = (): void => {
    if (currentLabel) {
      sections.set(currentLabel, currentLines.join('\n').trim());
    }
  };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush();
      currentLabel = line.slice(3).trim();
      currentLines = [];
      continue;
    }

    if (currentLabel) {
      currentLines.push(line);
    }
  }

  flush();
  return sections;
}

function parseOptionalSection(value: string | undefined): string | null {
  if (!value || value === OPTIONAL_PLACEHOLDER) {
    return null;
  }
  return value;
}

function parseRequiredSection(value: string | undefined, label: string): string {
  const normalized = parseOptionalSection(value);
  if (!normalized) {
    throw new Error(`Case document is missing required section "${label}".`);
  }
  return normalized;
}

function scoreCaseAgainstKeywords(entry: CaseEntry, keywords: string[]): number {
  if (keywords.length === 0) return 0;

  let score = 0;
  for (const keyword of keywords) {
    if (entry.tags.some((tag) => tag.includes(keyword))) score += 3;
    if (entry.title.toLowerCase().includes(keyword)) score += 2;
    if (entry.trigger.toLowerCase().includes(keyword)) score += 1;
    if (entry.behavior.toLowerCase().includes(keyword)) score += 1;
    if ((entry.rootCause || '').toLowerCase().includes(keyword)) score += 1;
    if ((entry.workaround || '').toLowerCase().includes(keyword)) score += 1;
    if ((entry.prevention || '').toLowerCase().includes(keyword)) score += 1;
  }
  return score;
}

function extractRelevanceKeywords(state: any): string[] {
  const candidates = [
    normalizeText(state?.current_task?.title),
    normalizeText(state?.current_task?.next_step),
    ...(Array.isArray(state?.working_memory?.pending) ? state.working_memory.pending : []),
  ];

  const tokens = candidates
    .flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/g))
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

  return [...new Set(tokens)];
}

function selectContextCases(entries: CaseEntry[], state: any, limit: number): ContextCaseSelection {
  const keywords = extractRelevanceKeywords(state);
  if (keywords.length === 0) {
    return {
      heading: 'Recent Cases',
      entries: sortCasesDescending(entries).slice(0, limit),
    };
  }

  const scored = entries
    .map((entry) => ({ entry, score: scoreCaseAgainstKeywords(entry, keywords) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      const scoreOrder = right.score - left.score;
      if (scoreOrder !== 0) return scoreOrder;
      return right.entry.timestamp.localeCompare(left.entry.timestamp);
    });

  if (scored.length === 0) {
    return {
      heading: 'Recent Cases',
      entries: sortCasesDescending(entries).slice(0, limit),
    };
  }

  return {
    heading: 'Relevant Cases',
    entries: scored.slice(0, limit).map((entry) => entry.entry),
  };
}

async function allocateCaseFilePath(caseDir: string, baseName: string): Promise<string> {
  const existingFiles = new Set(
    (await readdir(caseDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name),
  );

  const primaryName = `${baseName}.md`;
  if (!existingFiles.has(primaryName)) {
    return join(caseDir, primaryName);
  }

  let suffix = 2;
  while (existingFiles.has(`${baseName}-${suffix}.md`)) {
    suffix += 1;
  }
  return join(caseDir, `${baseName}-${suffix}.md`);
}

export async function ensureCaseKnowledgeDirectories(projectPath: string, projectYaml: any): Promise<void> {
  const { knowledgeDir } = resolveManagedProjectContextPaths(projectPath, projectYaml);
  await mkdir(knowledgeDir, { recursive: true });
  await mkdir(join(knowledgeDir, getCaseDirectoryName('corner')), { recursive: true });
  await mkdir(join(knowledgeDir, getCaseDirectoryName('bad')), { recursive: true });
}

export function renderCaseDocument(input: CaseRecordInput): string {
  const type = normalizeCaseType(input.type);
  const title = normalizeText(input.title);
  const trigger = normalizeText(input.trigger);
  const behavior = normalizeText(input.behavior);

  if (!title) {
    throw new Error('title is required.');
  }
  if (!trigger) {
    throw new Error('trigger is required.');
  }
  if (!behavior) {
    throw new Error('behavior is required.');
  }

  const timestamp = validateTimestamp(input.timestamp);
  const tags = parseCaseTags(input.tags, type);

  return [
    `# ${getCaseTypeLabel(type)}: ${title}`,
    '',
    renderSection(SECTION_LABELS.timestamp, timestamp).trimEnd(),
    '',
    renderSection(SECTION_LABELS.trigger, trigger).trimEnd(),
    '',
    renderSection(SECTION_LABELS.behavior, behavior).trimEnd(),
    '',
    renderSection(SECTION_LABELS.rootCause, normalizeOptionalText(input.rootCause)).trimEnd(),
    '',
    renderSection(SECTION_LABELS.impact, normalizeOptionalText(input.impact)).trimEnd(),
    '',
    renderSection(SECTION_LABELS.workaround, normalizeOptionalText(input.workaround)).trimEnd(),
    '',
    renderSection(SECTION_LABELS.prevention, normalizeOptionalText(input.prevention)).trimEnd(),
    '',
    renderSection(SECTION_LABELS.tags, tags.join(', ')).trimEnd(),
    '',
  ].join('\n');
}

export function parseCaseDocument(
  content: string,
  project: CaseProjectTarget,
  filePath: string,
): CaseEntry {
  const normalized = content.replace(/\r\n/g, '\n');
  const headingMatch = normalized.match(/^# ([^:]+): (.+)$/m);
  if (!headingMatch) {
    throw new Error(`Case document ${filePath} is missing the title heading.`);
  }

  const rawTypeLabel = headingMatch[1].trim().toLowerCase();
  const type = rawTypeLabel === 'corner-case'
    ? 'corner'
    : rawTypeLabel === 'bad-case'
      ? 'bad'
      : (() => {
          throw new Error(`Case document ${filePath} has an unknown type heading "${headingMatch[1].trim()}".`);
        })();

  const sections = extractSectionMap(normalized);

  const entry: CaseEntry = {
    ...project,
    type,
    title: headingMatch[2].trim(),
    timestamp: validateTimestamp(parseRequiredSection(sections.get(SECTION_LABELS.timestamp), SECTION_LABELS.timestamp)),
    trigger: parseRequiredSection(sections.get(SECTION_LABELS.trigger), SECTION_LABELS.trigger),
    behavior: parseRequiredSection(sections.get(SECTION_LABELS.behavior), SECTION_LABELS.behavior),
    rootCause: parseOptionalSection(sections.get(SECTION_LABELS.rootCause)),
    impact: parseOptionalSection(sections.get(SECTION_LABELS.impact)),
    workaround: parseOptionalSection(sections.get(SECTION_LABELS.workaround)),
    prevention: parseOptionalSection(sections.get(SECTION_LABELS.prevention)),
    tags: parseCaseTags(sections.get(SECTION_LABELS.tags), type),
    filePath,
    relativePath: buildRelativeCasePath(project.projectPath, filePath),
  };

  return entry;
}

export async function recordCaseKnowledge(
  project: CaseProjectTarget,
  input: CaseRecordInput,
): Promise<CaseEntry> {
  const type = normalizeCaseType(input.type);
  await ensureCaseKnowledgeDirectories(project.projectPath, project.projectYaml);

  const content = renderCaseDocument({ ...input, type });
  const { knowledgeDir } = resolveManagedProjectContextPaths(project.projectPath, project.projectYaml);
  const caseDir = join(knowledgeDir, getCaseDirectoryName(type));
  const timestamp = validateTimestamp(input.timestamp);
  const datePrefix = timestamp.slice(0, 10);
  const filePath = await allocateCaseFilePath(caseDir, `${datePrefix}-${slugifyTitle(normalizeText(input.title))}`);

  await writeFile(filePath, content, 'utf-8');
  return parseCaseDocument(content, project, filePath);
}

export async function listCasesForProject(
  project: CaseProjectTarget,
  options: ListCasesOptions = {},
): Promise<CaseEntry[]> {
  const type = normalizeCaseFilterType(options.type);
  const tags = parseCaseTags(options.tags);
  const { knowledgeDir } = resolveManagedProjectContextPaths(project.projectPath, project.projectYaml);
  const types: CaseType[] = type === 'all' ? ['corner', 'bad'] : [type];

  const entries: CaseEntry[] = [];
  for (const caseType of types) {
    const caseDir = join(knowledgeDir, getCaseDirectoryName(caseType));
    let files: string[] = [];
    try {
      files = (await readdir(caseDir))
        .filter((entry) => entry.endsWith('.md'))
        .sort();
    } catch {
      files = [];
    }

    for (const fileName of files) {
      const filePath = join(caseDir, fileName);
      const parsed = parseCaseDocument(await readFile(filePath, 'utf-8'), project, filePath);
      if (tags.length > 0 && !tags.every((tag) => parsed.tags.includes(tag))) {
        continue;
      }
      entries.push(parsed);
    }
  }

  return sortCasesDescending(entries);
}

export async function listCasesAcrossProjects(
  projects: CaseProjectTarget[],
  options: ListCasesOptions = {},
): Promise<CaseEntry[]> {
  const nested = await Promise.all(projects.map((project) => listCasesForProject(project, options)));
  return sortCasesDescending(nested.flat());
}

export function renderCaseListMarkdown(entries: CaseEntry[], heading = 'Matching Cases'): string {
  if (entries.length === 0) {
    return `# ${heading}\n\nNo matching cases found.`;
  }

  const sections = entries.map((entry) => [
    `## ${entry.projectName} · ${getCaseTypeLabel(entry.type)}: ${entry.title}`,
    `- Timestamp: ${entry.timestamp}`,
    `- Project ID: ${entry.projectId}`,
    `- Tags: ${entry.tags.join(', ')}`,
    `- File: ${entry.relativePath}`,
    '',
    '### Trigger',
    entry.trigger,
    '',
    '### Observed Behavior',
    entry.behavior,
    '',
    '### Root Cause',
    entry.rootCause ?? OPTIONAL_PLACEHOLDER,
    '',
    '### Workaround / Fix',
    entry.workaround ?? OPTIONAL_PLACEHOLDER,
    '',
    '### Prevention',
    entry.prevention ?? OPTIONAL_PLACEHOLDER,
  ].join('\n'));

  return `# ${heading}\n\n${sections.join('\n\n')}`;
}

export async function buildCaseContextSection(
  project: CaseProjectTarget,
  state: any,
  limit = 3,
): Promise<string> {
  const entries = await listCasesForProject(project, { type: 'all' });
  if (entries.length === 0) {
    return '## Recent Cases\nNo recorded corner or bad cases.\n';
  }

  const selection = selectContextCases(entries, state, limit);
  const body = selection.entries.map((entry) => [
    `### ${getCaseTypeLabel(entry.type)}: ${entry.title}`,
    `- Timestamp: ${entry.timestamp}`,
    `- Tags: ${entry.tags.join(', ')}`,
    `- File: ${entry.relativePath}`,
    `- Trigger: ${entry.trigger}`,
    `- Workaround / Fix: ${entry.workaround ?? OPTIONAL_PLACEHOLDER}`,
  ].join('\n'));

  return `## ${selection.heading}\n\n${body.join('\n\n')}\n`;
}
