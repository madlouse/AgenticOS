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
  generated_at: string;
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

/**
 * Parse a Vitest v8 coverage JSON report into a CoverageEvidence object.
 *
 * @param coverageJson  Parsed Vitest v8 JSON coverage output (from /build/coverage/coverage-final.json)
 * @param isPr          True if running in a pull request context
 * @param changedFiles  List of files changed in this PR (for changed-scope gate)
 * @returns             Structured evidence suitable for CI gate and MCP tool response
 */
export function generateCoverageEvidence(
  coverageJson: Record<string, unknown>,
  isPr: boolean,
  changedFiles: string[],
): CoverageEvidence {
  const AGGREGATE_FLOOR = { lines: 80, functions: 80, branches: 80, statements: 80 };
  const CHANGED_SCOPE_TARGET = { lines: 100, functions: 100, branches: 100, statements: 100 };

  const generatedAt = new Date().toISOString();

  const data = coverageJson as Record<string, Record<string, unknown>>;

  // Collect per-file data
  const files: CoverageFileEntry[] = [];
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

    const s = (fileData.s as Record<string, number>) || {};
    const b = (fileData.b as Record<string, number[]>) || {};
    const f = (fileData.f as Record<string, number>) || {};
    const lh = (fileData.lh as number[]) || [];

    // Statement: count unique statements hit (v > 0)
    const fileStatements = Object.keys(s).length;
    const fileCoveredStatements = Object.values(s).filter((v) => v > 0).length;
    // Branch: each branch sub-entry has length = total branches, filter > 0 = hit branches
    const fileBranches = Object.values(b).reduce((a, arr) => a + arr.length, 0);
    const fileCoveredBranches = Object.values(b).reduce((a, arr) => a + arr.filter((v) => v > 0).length, 0);
    // Function: each entry in f map = one function
    const fileFunctions = Object.keys(f).length;
    const fileCoveredFunctions = Object.values(f).filter((v) => v > 0).length;
    // Line: lh is per-line hit count array; count lines with hit > 0
    const fileLines = lh.length;
    const fileCoveredLines = lh.filter((v) => v > 0).length;

    const pctStatements = fileStatements > 0 ? Math.round((fileCoveredStatements / fileStatements) * 100) : 0;
    const pctBranches = fileBranches > 0 ? Math.round((fileCoveredBranches / fileBranches) * 100) : 0;
    const pctFunctions = fileFunctions > 0 ? Math.round((fileCoveredFunctions / fileFunctions) * 100) : 0;
    const pctLines = fileLines > 0 ? Math.round((fileCoveredLines / fileLines) * 100) : 0;

    files.push({
      path,
      pct_statements: pctStatements,
      pct_branches: pctBranches,
      pct_functions: pctFunctions,
      pct_lines: pctLines,
    });

    totalLines += fileLines;
    totalCoveredLines += fileCoveredLines;
    totalBranches += fileBranches;
    totalCoveredBranches += fileCoveredBranches;
    totalFunctions += fileFunctions;
    totalCoveredFunctions += fileCoveredFunctions;
    totalStatements += fileStatements;
    totalCoveredStatements += fileCoveredStatements;
  }

  const pctLinesAgg = totalLines > 0 ? Math.round((totalCoveredLines / totalLines) * 100) : 0;
  const pctBranchesAgg = totalBranches > 0 ? Math.round((totalCoveredBranches / totalBranches) * 100) : 0;
  const pctFunctionsAgg = totalFunctions > 0 ? Math.round((totalCoveredFunctions / totalFunctions) * 100) : 0;
  const pctStatementsAgg = totalStatements > 0 ? Math.round((totalCoveredStatements / totalStatements) * 100) : 0;

  const aggregate: CoverageSummary = {
    pct_statements: pctStatementsAgg,
    pct_branches: pctBranchesAgg,
    pct_functions: pctFunctionsAgg,
    pct_lines: pctLinesAgg,
  };

  const aggregateFailures: string[] = [];
  if (pctLinesAgg < AGGREGATE_FLOOR.lines) aggregateFailures.push(`lines: ${pctLinesAgg}% < ${AGGREGATE_FLOOR.lines}%`);
  if (pctFunctionsAgg < AGGREGATE_FLOOR.functions) aggregateFailures.push(`functions: ${pctFunctionsAgg}% < ${AGGREGATE_FLOOR.functions}%`);
  if (pctBranchesAgg < AGGREGATE_FLOOR.branches) aggregateFailures.push(`branches: ${pctBranchesAgg}% < ${AGGREGATE_FLOOR.branches}%`);
  if (pctStatementsAgg < AGGREGATE_FLOOR.statements) aggregateFailures.push(`statements: ${pctStatementsAgg}% < ${AGGREGATE_FLOOR.statements}%`);

  const aggregatePass = aggregateFailures.length === 0;

  const changedScopeFailures: string[] = [];
  if (isPr && changedFiles.length > 0) {
    for (const changedFile of changedFiles) {
      const entry = files.find((f) => f.path === changedFile || changedFile.endsWith(f.path) || f.path.endsWith(changedFile));
      if (!entry) {
        // File not in coverage report — cannot verify
        continue;
      }
      if (entry.pct_lines < CHANGED_SCOPE_TARGET.lines) {
        changedScopeFailures.push(`${entry.path}: lines ${entry.pct_lines}% < 100%`);
      }
    }
  }

  const changedScopePass = changedScopeFailures.length === 0;

  return {
    generated_at: generatedAt,
    threshold_aggregate: AGGREGATE_FLOOR,
    threshold_changed_scope: CHANGED_SCOPE_TARGET,
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
export function validateCoverageEvidence(evidence: CoverageEvidence): {
  pass: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!evidence.generated_at) {
    errors.push('coverage-evidence.json: missing generated_at field');
  }
  if (!evidence.aggregate) {
    errors.push('coverage-evidence.json: missing aggregate section');
  }
  if (!Array.isArray(evidence.files)) {
    errors.push('coverage-evidence.json: missing or invalid files array');
  }

  if (evidence.aggregate) {
    const t = evidence.threshold_aggregate;
    if (evidence.aggregate.pct_lines < t.lines) errors.push(`aggregate lines ${evidence.aggregate.pct_lines}% < floor ${t.lines}%`);
    if (evidence.aggregate.pct_functions < t.functions) errors.push(`aggregate functions ${evidence.aggregate.pct_functions}% < floor ${t.functions}%`);
    if (evidence.aggregate.pct_branches < t.branches) errors.push(`aggregate branches ${evidence.aggregate.pct_branches}% < floor ${t.branches}%`);
    if (evidence.aggregate.pct_statements < t.statements) errors.push(`aggregate statements ${evidence.aggregate.pct_statements}% < floor ${t.statements}%`);
  }

  if (evidence.is_pr && evidence.changed_files.length > 0) {
    for (const f of evidence.changed_scope_failures) {
      errors.push(`changed-scope: ${f}`);
    }
  }

  // Soft warnings
  if (!evidence.generated_at || !evidence.is_pr) {
    warnings.push('Coverage evidence is not PR-scoped; changed-scope gate is inactive');
  }

  return {
    pass: errors.length === 0,
    errors,
    warnings,
  };
}
