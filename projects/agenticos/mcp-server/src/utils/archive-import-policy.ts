import { readFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'yaml';

export type ArchiveImportDecision = 'active_source' | 'provenance_only' | 'reject' | 'unclassified';

export interface ArchiveImportPolicy {
  active_source_allowlist: string[];
  provenance_only_allowlist: string[];
  reject_list: string[];
}

export interface ArchiveImportEvaluationItem {
  path: string;
  decision: ArchiveImportDecision;
  matched_pattern: string | null;
  reason: string;
}

export interface ArchiveImportEvaluateResult {
  command: 'agenticos_archive_import_evaluate';
  status: 'PASS' | 'BLOCK';
  summary: string;
  project_path: string;
  candidate_count: number;
  policy: ArchiveImportPolicy;
  evaluations: ArchiveImportEvaluationItem[];
  active_source_files: string[];
  provenance_only_files: string[];
  rejected_files: string[];
  unclassified_files: string[];
  block_reasons: string[];
}

const DEFAULT_ACTIVE_SOURCE_ALLOWLIST = [
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'LICENSE.*',
  '.gitignore',
  '.editorconfig',
  'AGENTS.md',
  'CLAUDE.md',
  '*.md',
  'docs/**',
  'knowledge/**',
  'tasks/**',
  'artifacts/**',
  'src/**',
  'app/**',
  'lib/**',
  'scripts/**',
  'config/**',
  'benchmarks/**',
  'resources/**',
  'setup/**',
  'optimizations/**',
  'current-config/**',
] as const;

const DEFAULT_PROVENANCE_ONLY_ALLOWLIST = [
  '.context/**',
  '.meta/transcripts/**',
  'archive/**',
  'archives/**',
  'provenance/**',
  'artifacts/source-history/**',
  '**/*.bundle',
  '**/*.patch',
  '**/*.diff',
  '**/*.log',
  '**/*.trace',
] as const;

const DEFAULT_REJECT_LIST = [
  '.DS_Store',
  '**/.DS_Store',
  'Thumbs.db',
  '**/Thumbs.db',
  '.git/**',
  '.gitmodules',
  '.Spotlight-V100/**',
  '.Trashes/**',
  '__MACOSX/**',
  '.agent-workspace/**',
  'node_modules/**',
  '**/*.swp',
  '**/*~',
  '**/*.tmp',
] as const;

function normalizePath(candidate: string): string {
  return candidate.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternToRegex(pattern: string): RegExp {
  const normalized = normalizePath(pattern);
  const tokens = normalized.match(/\*\*|\*|[^*.]+|\./g) ?? [];
  const source = tokens.map((token) => {
    if (token === '**') return '.*';
    if (token === '*') return '[^/]*';
    return escapeRegex(token);
  }).join('');
  return new RegExp(`^${source}$`);
}

function matchPattern(path: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    if (patternToRegex(pattern).test(path)) {
      return pattern;
    }
  }
  return null;
}

function parseStringArray(candidate: unknown): string[] {
  if (!Array.isArray(candidate)) return [];
  return candidate
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

async function loadProjectYaml(projectPath: string): Promise<any> {
  try {
    const content = await readFile(join(projectPath, '.project.yaml'), 'utf-8');
    return yaml.parse(content) || {};
  } catch {
    return {};
  }
}

export async function resolveArchiveImportPolicy(projectPath: string): Promise<ArchiveImportPolicy> {
  const projectYaml = await loadProjectYaml(projectPath);
  const configured = projectYaml?.archive_import_policy || {};

  return {
    active_source_allowlist: [
      ...DEFAULT_ACTIVE_SOURCE_ALLOWLIST,
      ...parseStringArray(configured.active_source_allowlist),
    ],
    provenance_only_allowlist: [
      ...DEFAULT_PROVENANCE_ONLY_ALLOWLIST,
      ...parseStringArray(configured.provenance_only_allowlist),
    ],
    reject_list: [
      ...DEFAULT_REJECT_LIST,
      ...parseStringArray(configured.reject_list),
    ],
  };
}

function classifyCandidate(path: string, policy: ArchiveImportPolicy): ArchiveImportEvaluationItem {
  const normalizedPath = normalizePath(path);

  const rejectPattern = matchPattern(normalizedPath, policy.reject_list);
  if (rejectPattern) {
    return {
      path: normalizedPath,
      decision: 'reject',
      matched_pattern: rejectPattern,
      reason: `matches reject pattern ${rejectPattern}`,
    };
  }

  const provenancePattern = matchPattern(normalizedPath, policy.provenance_only_allowlist);
  if (provenancePattern) {
    return {
      path: normalizedPath,
      decision: 'provenance_only',
      matched_pattern: provenancePattern,
      reason: `matches provenance-only allowlist pattern ${provenancePattern}`,
    };
  }

  const activePattern = matchPattern(normalizedPath, policy.active_source_allowlist);
  if (activePattern) {
    return {
      path: normalizedPath,
      decision: 'active_source',
      matched_pattern: activePattern,
      reason: `matches active-source allowlist pattern ${activePattern}`,
    };
  }

  return {
    path: normalizedPath,
    decision: 'unclassified',
    matched_pattern: null,
    reason: 'does not match the active-source allowlist, provenance-only allowlist, or reject list',
  };
}

export async function evaluateArchiveImportPolicy(args: {
  project_path?: string;
  candidate_paths?: string[];
}): Promise<ArchiveImportEvaluateResult> {
  const projectPath = args.project_path?.trim();
  const candidatePaths = Array.isArray(args.candidate_paths) ? args.candidate_paths : [];

  const emptyResult = {
    command: 'agenticos_archive_import_evaluate' as const,
    status: 'BLOCK' as const,
    summary: '',
    project_path: projectPath || '',
    candidate_count: candidatePaths.length,
    policy: {
      active_source_allowlist: [...DEFAULT_ACTIVE_SOURCE_ALLOWLIST],
      provenance_only_allowlist: [...DEFAULT_PROVENANCE_ONLY_ALLOWLIST],
      reject_list: [...DEFAULT_REJECT_LIST],
    },
    evaluations: [] as ArchiveImportEvaluationItem[],
    active_source_files: [] as string[],
    provenance_only_files: [] as string[],
    rejected_files: [] as string[],
    unclassified_files: [] as string[],
    block_reasons: [] as string[],
  };

  if (!projectPath) {
    emptyResult.block_reasons.push('project_path is required');
    emptyResult.summary = emptyResult.block_reasons.join('; ');
    return emptyResult;
  }

  if (candidatePaths.length === 0) {
    emptyResult.project_path = projectPath;
    emptyResult.block_reasons.push('candidate_paths is required');
    emptyResult.summary = emptyResult.block_reasons.join('; ');
    return emptyResult;
  }

  const policy = await resolveArchiveImportPolicy(projectPath);
  const evaluations = candidatePaths.map((path) => classifyCandidate(path, policy));
  const activeSourceFiles = evaluations.filter((item) => item.decision === 'active_source').map((item) => item.path);
  const provenanceOnlyFiles = evaluations.filter((item) => item.decision === 'provenance_only').map((item) => item.path);
  const rejectedFiles = evaluations.filter((item) => item.decision === 'reject').map((item) => item.path);
  const unclassifiedFiles = evaluations.filter((item) => item.decision === 'unclassified').map((item) => item.path);
  const blockReasons: string[] = [];

  if (rejectedFiles.length > 0) {
    blockReasons.push(`reject list matched ${rejectedFiles.length} candidate paths`);
  }
  if (unclassifiedFiles.length > 0) {
    blockReasons.push(`policy did not classify ${unclassifiedFiles.length} candidate paths`);
  }

  const status = blockReasons.length > 0 ? 'BLOCK' : 'PASS';
  const summary = status === 'PASS'
    ? `archive import evaluation passed: ${activeSourceFiles.length} active-source, ${provenanceOnlyFiles.length} provenance-only`
    : blockReasons.join('; ');

  return {
    command: 'agenticos_archive_import_evaluate',
    status,
    summary,
    project_path: projectPath,
    candidate_count: candidatePaths.length,
    policy,
    evaluations,
    active_source_files: activeSourceFiles,
    provenance_only_files: provenanceOnlyFiles,
    rejected_files: rejectedFiles,
    unclassified_files: unclassifiedFiles,
    block_reasons: blockReasons,
  };
}
