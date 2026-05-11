/**
 * Coverage evidence generation and validation for the AgenticOS test coverage toolchain.
 *
 * Pure functions — zero I/O, zero side effects. Suitable for use in both
 * the CI layer (generate) and the `agenticos_coverage_check` MCP tool (validate).
 *
 * The two-tier threshold system:
 * - Aggregate floor: 60% lines, 60% functions, 50% branches, 60% statements
 * - Changed-scope gate: 100% for files modified in this PR
 */

export interface CoverageFileEntry {
  path: string;
  pct_statements: number;
  pct_branches: number;
  pct_functions: number;
  pct_lines: number;
  uncovered_lines?: number[];
}

export interface CoverageSummary {
  pct_statements: number;
  pct_branches: number;
  pct_functions: number;
  pct_lines: number;
}

export interface CoverageEvidence {
  version: 1;
  generated_at: string;
  branch?: string;
  commit?: string;
  base_branch?: string;
  pr_number?: string;
  threshold_aggregate: { lines: number; functions: number; branches: number; statements: number };
  threshold_changed_scope: { lines: number; functions: number; branches: number; statements: number };
  is_pr: boolean;
  changed_files: string[];
  aggregate: CoverageSummary;
  files: CoverageFileEntry[];
  aggregate_pass: boolean;
  changed_scope_pass: boolean;
  pass: boolean;
  aggregate_failures: string[];
  changed_scope_failures: string[];
}

export interface CoverageEvidenceOptions {
  aggregateFloor?: Partial<CoverageEvidence['threshold_aggregate']>;
  changedScopeTarget?: Partial<CoverageEvidence['threshold_changed_scope']>;
  metadata?: {
    branch?: string;
    commit?: string;
    base_branch?: string;
    pr_number?: string;
  };
}

const DEFAULT_AGGREGATE_FLOOR = { lines: 60, functions: 60, branches: 50, statements: 60 };
const DEFAULT_CHANGED_SCOPE_TARGET = { lines: 100, functions: 100, branches: 100, statements: 100 };

type CoverageThresholds = CoverageEvidence['threshold_aggregate'];
type CoverageMetric = keyof CoverageThresholds;

const COVERAGE_METRICS: CoverageMetric[] = ['lines', 'functions', 'branches', 'statements'];

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isThresholdSet(value: unknown): value is CoverageThresholds {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CoverageThresholds>;
  return COVERAGE_METRICS.every((metric) => isNumber(candidate[metric]));
}

function isCoverageSummary(value: unknown): value is CoverageSummary {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CoverageSummary>;
  return isNumber(candidate.pct_lines)
    && isNumber(candidate.pct_functions)
    && isNumber(candidate.pct_branches)
    && isNumber(candidate.pct_statements);
}

function isCoverageFileEntry(value: unknown): value is CoverageFileEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CoverageFileEntry>;
  return typeof candidate.path === 'string'
    && isNumber(candidate.pct_lines)
    && isNumber(candidate.pct_functions)
    && isNumber(candidate.pct_branches)
    && isNumber(candidate.pct_statements);
}

function mergeCanonicalThresholds(
  candidate: CoverageThresholds,
  canonical: CoverageThresholds,
): CoverageThresholds {
  return {
    lines: Math.max(candidate.lines, canonical.lines),
    functions: Math.max(candidate.functions, canonical.functions),
    branches: Math.max(candidate.branches, canonical.branches),
    statements: Math.max(candidate.statements, canonical.statements),
  };
}

function validateCanonicalThresholds(
  label: string,
  candidate: CoverageThresholds,
  canonical: CoverageThresholds,
  errors: string[],
): void {
  for (const metric of COVERAGE_METRICS) {
    if (candidate[metric] < canonical[metric]) {
      errors.push(`coverage-evidence.json: ${label}.${metric} ${candidate[metric]}% is below canonical floor ${canonical[metric]}%`);
    }
  }
}

function findCoverageEntry(files: CoverageFileEntry[], changedFile: string): CoverageFileEntry | undefined {
  return files.find((file) => file.path === changedFile || changedFile.endsWith(file.path) || file.path.endsWith(changedFile));
}

function collectChangedScopeFailures(
  files: CoverageFileEntry[],
  changedFiles: string[],
  changedScopeTarget: CoverageEvidence['threshold_changed_scope'],
): string[] {
  const failures: string[] = [];
  for (const changedFile of changedFiles) {
    const entry = findCoverageEntry(files, changedFile);
    if (!entry) {
      failures.push(`${changedFile}: file missing from coverage report`);
      continue;
    }
    if (entry.pct_lines < changedScopeTarget.lines) {
      failures.push(`${entry.path}: lines ${entry.pct_lines}% < ${changedScopeTarget.lines}%`);
    }
    if (entry.pct_functions < changedScopeTarget.functions) {
      failures.push(`${entry.path}: functions ${entry.pct_functions}% < ${changedScopeTarget.functions}%`);
    }
    if (entry.pct_branches < changedScopeTarget.branches) {
      failures.push(`${entry.path}: branches ${entry.pct_branches}% < ${changedScopeTarget.branches}%`);
    }
    if (entry.pct_statements < changedScopeTarget.statements) {
      failures.push(`${entry.path}: statements ${entry.pct_statements}% < ${changedScopeTarget.statements}%`);
    }
  }
  return failures;
}

/**
 * Parse a Vitest v8 coverage JSON report into a CoverageEvidence object.
 *
 * @param coverageJson  Parsed Vitest v8 JSON coverage output (from /build/coverage/coverage-final.json)
 * @param isPr          True if running in a pull request context
 * @param changedFiles  List of files changed in this PR (for changed-scope gate)
 * @param options       Optional threshold overrides and CI metadata
 * @returns             Structured evidence suitable for CI gate and MCP tool response
 */
export function generateCoverageEvidence(
  coverageJson: Record<string, unknown>,
  isPr: boolean,
  changedFiles: string[],
  options: CoverageEvidenceOptions = {},
): CoverageEvidence {
  const aggregateFloor = { ...DEFAULT_AGGREGATE_FLOOR, ...options.aggregateFloor };
  const changedScopeTarget = { ...DEFAULT_CHANGED_SCOPE_TARGET, ...options.changedScopeTarget };

  const generatedAt = new Date().toISOString();

  const data = coverageJson as Record<string, Record<string, unknown>>;

  // Collect per-file data
  const files: CoverageFileEntry[] = [];
  const filesByPath = new Map<string, CoverageFileEntry>();
  let totalLines = 0;
  let totalCoveredLines = 0;
  let totalBranches = 0;
  let totalCoveredBranches = 0;
  let totalFunctions = 0;
  let totalCoveredFunctions = 0;
  let totalStatements = 0;
  let totalCoveredStatements = 0;

  for (const [path, fileData] of Object.entries(data)) {
    // Skip node_modules and synthetic entries
    if (path.includes('node_modules') || path === '<total>') continue;

    const statementMap = (fileData.statementMap as Record<string, { start?: { line?: number }; end?: { line?: number } }>) || {};
    const s = (fileData.s as Record<string, number>) || {};
    const b = (fileData.b as Record<string, number[]>) || {};
    const f = (fileData.f as Record<string, number>) || {};
    const lh = (fileData.lh as number[]) || [];

    let fileStatements = 0;
    let fileCoveredStatements = 0;
    for (const hits of Object.values(s)) {
      fileStatements += 1;
      if (hits > 0) fileCoveredStatements += 1;
    }

    let fileBranches = 0;
    let fileCoveredBranches = 0;
    for (const branchHits of Object.values(b)) {
      fileBranches += branchHits.length;
      for (const hits of branchHits) {
        if (hits > 0) fileCoveredBranches += 1;
      }
    }

    let fileFunctions = 0;
    let fileCoveredFunctions = 0;
    for (const hits of Object.values(f)) {
      fileFunctions += 1;
      if (hits > 0) fileCoveredFunctions += 1;
    }

    let fileLines = 0;
    let fileCoveredLines = 0;
    if (lh.length > 0) {
      for (const hits of lh) {
        fileLines += 1;
        if (hits > 0) fileCoveredLines += 1;
      }
    } else {
      const lineHits = new Map<number, number>();
      for (const [statementId, location] of Object.entries(statementMap)) {
        const startLine = location.start?.line;
        const endLine = location.end?.line ?? startLine;
        if (typeof startLine !== 'number' || typeof endLine !== 'number') continue;
        const hits = s[statementId] ?? 0;
        for (let line = startLine; line <= endLine; line += 1) {
          lineHits.set(line, Math.max(lineHits.get(line) ?? 0, hits));
        }
      }
      fileLines = lineHits.size;
      fileCoveredLines = [...lineHits.values()].filter((hits) => hits > 0).length;
    }

    const pctStatements = fileStatements > 0 ? Math.round((fileCoveredStatements / fileStatements) * 100) : 100;
    const pctBranches = fileBranches > 0 ? Math.round((fileCoveredBranches / fileBranches) * 100) : 100;
    const pctFunctions = fileFunctions > 0 ? Math.round((fileCoveredFunctions / fileFunctions) * 100) : 100;
    const pctLines = fileLines > 0 ? Math.round((fileCoveredLines / fileLines) * 100) : 100;

    const entry = {
      path,
      pct_statements: pctStatements,
      pct_branches: pctBranches,
      pct_functions: pctFunctions,
      pct_lines: pctLines,
    };
    files.push(entry);
    filesByPath.set(path, entry);

    totalLines += fileLines;
    totalCoveredLines += fileCoveredLines;
    totalBranches += fileBranches;
    totalCoveredBranches += fileCoveredBranches;
    totalFunctions += fileFunctions;
    totalCoveredFunctions += fileCoveredFunctions;
    totalStatements += fileStatements;
    totalCoveredStatements += fileCoveredStatements;
  }

  const pctLinesAgg = totalLines > 0 ? Math.round((totalCoveredLines / totalLines) * 100) : 100;
  const pctBranchesAgg = totalBranches > 0 ? Math.round((totalCoveredBranches / totalBranches) * 100) : 100;
  const pctFunctionsAgg = totalFunctions > 0 ? Math.round((totalCoveredFunctions / totalFunctions) * 100) : 100;
  const pctStatementsAgg = totalStatements > 0 ? Math.round((totalCoveredStatements / totalStatements) * 100) : 100;

  const aggregate: CoverageSummary = {
    pct_statements: pctStatementsAgg,
    pct_branches: pctBranchesAgg,
    pct_functions: pctFunctionsAgg,
    pct_lines: pctLinesAgg,
  };

  const aggregateFailures: string[] = [];
  if (pctLinesAgg < aggregateFloor.lines) aggregateFailures.push(`lines: ${pctLinesAgg}% < ${aggregateFloor.lines}%`);
  if (pctFunctionsAgg < aggregateFloor.functions) aggregateFailures.push(`functions: ${pctFunctionsAgg}% < ${aggregateFloor.functions}%`);
  if (pctBranchesAgg < aggregateFloor.branches) aggregateFailures.push(`branches: ${pctBranchesAgg}% < ${aggregateFloor.branches}%`);
  if (pctStatementsAgg < aggregateFloor.statements) aggregateFailures.push(`statements: ${pctStatementsAgg}% < ${aggregateFloor.statements}%`);

  const aggregatePass = aggregateFailures.length === 0;

  const changedScopeFailures = isPr && changedFiles.length > 0
    ? collectChangedScopeFailures([...filesByPath.values()], changedFiles, changedScopeTarget)
    : [];

  const changedScopePass = changedScopeFailures.length === 0;

  return {
    version: 1,
    generated_at: generatedAt,
    ...options.metadata,
    threshold_aggregate: aggregateFloor,
    threshold_changed_scope: changedScopeTarget,
    is_pr: isPr,
    changed_files: changedFiles,
    aggregate,
    files,
    aggregate_pass: aggregatePass,
    changed_scope_pass: changedScopePass,
    pass: aggregatePass && (!isPr || changedScopePass),
    aggregate_failures: aggregateFailures,
    changed_scope_failures: changedScopeFailures,
  };
}

/**
 * Validate a previously-generated coverage evidence file.
 *
 * @param evidence  CoverageEvidence JSON object (already read from coverage-evidence.json)
 * @returns         Validation result with pass/fail and error/warning details
 */
export function validateCoverageEvidence(evidence: unknown): {
  pass: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!evidence || typeof evidence !== 'object') {
    return {
      pass: false,
      errors: ['coverage-evidence.json: root must be an object'],
      warnings,
    };
  }
  const candidate = evidence as Partial<CoverageEvidence>;

  if (!candidate.generated_at) {
    errors.push('coverage-evidence.json: missing generated_at field');
  }
  if (candidate.version !== 1) {
    errors.push('coverage-evidence.json: unsupported or missing version');
  }
  if (!isCoverageSummary(candidate.aggregate)) {
    errors.push('coverage-evidence.json: missing aggregate section');
  }
  const files = Array.isArray(candidate.files) && candidate.files.every(isCoverageFileEntry)
    ? candidate.files
    : null;
  if (!files) {
    errors.push('coverage-evidence.json: missing or invalid files array');
  }
  if (!isThresholdSet(candidate.threshold_changed_scope)) {
    errors.push('coverage-evidence.json: missing threshold_changed_scope section');
  }

  if (isCoverageSummary(candidate.aggregate)) {
    const t = candidate.threshold_aggregate;
    if (!isThresholdSet(t)) {
      errors.push('coverage-evidence.json: missing threshold_aggregate section');
    } else {
      validateCanonicalThresholds('threshold_aggregate', t, DEFAULT_AGGREGATE_FLOOR, errors);
      const aggregateFloor = mergeCanonicalThresholds(t, DEFAULT_AGGREGATE_FLOOR);
      if (candidate.aggregate.pct_lines < aggregateFloor.lines) errors.push(`aggregate lines ${candidate.aggregate.pct_lines}% < floor ${aggregateFloor.lines}%`);
      if (candidate.aggregate.pct_functions < aggregateFloor.functions) errors.push(`aggregate functions ${candidate.aggregate.pct_functions}% < floor ${aggregateFloor.functions}%`);
      if (candidate.aggregate.pct_branches < aggregateFloor.branches) errors.push(`aggregate branches ${candidate.aggregate.pct_branches}% < floor ${aggregateFloor.branches}%`);
      if (candidate.aggregate.pct_statements < aggregateFloor.statements) errors.push(`aggregate statements ${candidate.aggregate.pct_statements}% < floor ${aggregateFloor.statements}%`);
    }
  }

  const changedFiles = Array.isArray(candidate.changed_files) && candidate.changed_files.every((file) => typeof file === 'string')
    ? candidate.changed_files
    : null;
  if (candidate.is_pr && !changedFiles) {
    errors.push('coverage-evidence.json: missing or invalid changed_files array');
  }
  if (candidate.is_pr && changedFiles && changedFiles.length > 0) {
    if (!Array.isArray(candidate.changed_scope_failures)) {
      errors.push('coverage-evidence.json: missing or invalid changed_scope_failures array');
    } else if (!files || !isThresholdSet(candidate.threshold_changed_scope)) {
      for (const f of candidate.changed_scope_failures) {
        errors.push(`changed-scope: ${f}`);
      }
    } else {
      validateCanonicalThresholds('threshold_changed_scope', candidate.threshold_changed_scope, DEFAULT_CHANGED_SCOPE_TARGET, errors);
      const changedScopeTarget = mergeCanonicalThresholds(candidate.threshold_changed_scope, DEFAULT_CHANGED_SCOPE_TARGET);
      for (const f of collectChangedScopeFailures(files, changedFiles, changedScopeTarget)) {
        errors.push(`changed-scope: ${f}`);
      }
    }
  }

  // Soft warnings
  if (!candidate.generated_at || !candidate.is_pr) {
    warnings.push('Coverage evidence is not PR-scoped; changed-scope gate is inactive');
  }

  return {
    pass: errors.length === 0,
    errors,
    warnings,
  };
}
