# Coverage Toolchain Design for AgenticOS

## Context

- **Vitest version**: ^3.0.0 with `@vitest/coverage-v8` ^3.2.4 already in `devDependencies`
- **Test glob**: `src/**/__tests__/**/*.test.ts`
- **CI**: GitHub Actions with a matrix job (`build`) running install/build/lint/test, plus a downstream `mcp-symlink-integration` job
- **Coverage**: Currently **not configured** — the coverage toolchain is a greenfield add

---

## 1. Vitest Coverage Configuration

### 1.1 Base Configuration

Replace `mcp-server/vitest.config.ts` with:

```ts
import { defineConfig } from 'vitest/config';
import { coverageConfigDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
  },
  coverage: {
    // Provider
    provider: 'v8',
    // Report on all source files under src/
    include: ['src/**/*.ts'],
    exclude: [
      'src/**/*.d.ts',
      'src/**/__tests__/**',
      'src/**/types.ts',
      'src/index.ts',          // entry point, tested via integration
      ...coverageConfigDefaults.exclude,
    ],
    // Reporters: text (human), lcov (GitHubAnnotations + codecov), json (evidence)
    reporter: ['text', 'lcov', 'json', 'html'],
    // Output directory — relative to vitest.workspace or project root
    reportsDirectory: '../coverage',
    // Per-file thresholds: aspirational 100% for any file that is tested
    // Individual file coverage is informational; enforcement is at aggregate + changed-scope
    thresholds: {
      // --- Aggregate thresholds (what CI enforces) ---
      lines: 60,           // realistic current baseline; 100% is a stretch goal
      functions: 60,
      branches: 50,
      statements: 60,
      // --- Per-file thresholds ---
      // Disabled by default; enable per-module via overrides below
      perFile: false,
      // --- Auto-thresholding ---
      // 100% coverage for any file that has at least one test touching it
      // but only if the file was CHANGED in this PR (enforced by ci step)
      100AsMax: false,
    },
    // Carry over default include/exclude from vitest built-ins
    ...coverageConfigDefaults,
  },
});
```

### 1.2 Threshold Philosophy: Two Tiers

| Tier | Lines | Functions | Branches | Statements | Purpose |
|------|-------|-----------|----------|------------|--------|
| **CI gate** (enforced) | 60% | 60% | 50% | 60% | Realistic baseline; new code must not regress below this |
| **Aspirational** (warning) | 100% | 100% | 100% | 100% | "100% coverage for changed logic surface" — enforced only for changed files via the changed-scope step |

**Why these numbers?**
- The MCP server is small enough that 60% covers all exported public functions
- Branches at 50% is honest — early-stage projects rarely hit 80%+ branch coverage without intentional design
- These are **floors**, not ceilings; teams are encouraged to exceed them
- The `changed_scope_100` rule (see CI section) provides the aspirational enforcement without blocking normal development on legacy code

### 1.3 Per-Module Overrides

If specific modules warrant higher baseline thresholds, use Vitest's `coverageThreshold` overrides:

```ts
coverage: {
  thresholds: {
    // Global floor
    lines: 60,
    functions: 60,
    branches: 50,
    statements: 60,
    // Stricter bar for critical modules
    overrides: {
      'src/guardrail/**/*.ts': {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
      'src/mcp/handlers/**/*.ts': {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
},
```

---

## 2. CI Integration

### 2.1 Updated `build` Job — Merge Coverage In

Coverage runs in the same `build` job as tests (no separate job needed at this scale). The coverage report is uploaded as an artifact and consumed by the changed-scope step.

```yaml
# .github/workflows/ci.yml — relevant section of the `build` job

      - name: Run tests with coverage
        run: npm test -- --coverage
        working-directory: mcp-server
        env:
          # UPDATE_BASELINE=1 skips threshold enforcement (use for intentional coverage drops)
          UPDATE_BASELINE: ${{ vars.COVERAGE_UPDATE_BASELINE || '0' }}

      # Upload coverage report as artifact (persists for changed-scope analysis)
      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        if: always()  # upload even if tests fail, for diagnosis
        with:
          name: coverage-report
          path: mcp-server/coverage/
          retention-days: 7

      # GitHub Annotations for PR files — converts lcov to inline comments
      - name: Post coverage annotations
        if: github.event_name == 'pull_request'
        run: |
          npx vitest run --coverage --coverage.reporter=lcov
          # lcov file is at mcp-server/coverage/lcov.info
          echo "::notice ::Coverage report available at coverage/lcov.info"
        working-directory: mcp-server
```

### 2.2 Changed-Scope Step — "100% for Changed Logic Surface"

This is the aspirational enforcement. It runs **after** the test job succeeds, analyzes only the files changed in this PR, and enforces 100% on those files. It **fails the build** if a changed file drops below 100%.

```yaml
  # .github/workflows/ci.yml

  coverage-changed-scope:
    runs-on: ubuntu-latest
    needs: build  # depends on test job passing
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
        with:
          # Fetch full history so git diff can work reliably
          fetch-depth: 0

      - name: Use Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm install
        working-directory: mcp-server

      - name: Download coverage report
        uses: actions/download-artifact@v4
        with:
          name: coverage-report
          path: mcp-server/coverage/

      - name: Enforce 100% on changed files
        run: |
          node -e "
            const fs = require('fs');
            const path = require('path');
            const execSync = require('child_process').execSync;

            // 1. Find changed files vs main branch
            const baseBranch = '${{ github.base_ref }}';
            const changedFiles = execSync(
              'git diff --name-only origin/' + baseBranch + '..HEAD -- src/',
              { encoding: 'utf-8' }
            ).trim().split('\n').filter(Boolean);

            if (changedFiles.length === 0) {
              console.log('No source files changed — skipping changed-scope check');
              process.exit(0);
            }
            console.log('Changed files:', changedFiles.join(', '));

            // 2. Load per-file coverage from JSON report
            const report = JSON.parse(
              fs.readFileSync('mcp-server/coverage/coverage-final.json', 'utf-8')
            );

            const NOT_100 = [];
            for (const file of changedFiles) {
              const key = Object.keys(report).find(k => k.endsWith(file));
              if (!key) {
                // File not in coverage report — it may not be testable (e.g. pure type re-export)
                console.warn('WARN: Changed file not in coverage report:', file);
                continue;
              }
              const cov = report[key];
              if (cov.lines.pct < 100 || cov.functions.pct < 100 || cov.branches.pct < 100) {
                NOT_100.push({
                  file,
                  lines: cov.lines.pct.toFixed(1) + '%',
                  functions: cov.functions.pct.toFixed(1) + '%',
                  branches: cov.branches.pct.toFixed(1) + '%',
                });
              }
            }

            if (NOT_100.length > 0) {
              console.error('FAIL: Changed files below 100% coverage:');
              NOT_100.forEach(f => {
                console.error('  ' + f.file + ': lines=' + f.lines + ' functions=' + f.functions + ' branches=' + f.branches);
              });
              console.error('::error::Coverage enforcement: all changed source files must reach 100% coverage. See above for details.');
              process.exit(1);
            }

            console.log('PASS: All changed files have 100% coverage');
          "
```

### 2.3 UPDATE_BASELINE Mechanism

For intentional coverage regressions (e.g., adding a new file with no tests yet, or intentionally skipping coverage on a test-only stub), set the `COVERAGE_UPDATE_BASELINE` repository variable to `1` for that PR only, or merge the PR with the `UPDATE_BASELINE=1` env var:

```bash
# In the PR, temporarily bypass thresholds (CI will warn but not block)
UPDATE_BASELINE=1 npm test -- --coverage
```

In practice this should be rare. A better pattern is to mark the coverage gap explicitly in a comment, so the next PR can address it:

```yaml
# In the coverage-changed-scope step, add a comment on the PR:
- name: Post coverage gap comment
  if: failure() && github.event_name == 'pull_request'
  uses: actions/github-script@v7
  with:
    script: |
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: '## Coverage Gap\n\nSome changed files do not have 100% coverage. ' +
              'If this is intentional, add `coverage-skip` annotations or set `UPDATE_BASELINE=1` in this job.\n\n' +
              '**Action required**: Add tests for uncovered lines before merging.',
      });
```

---

## 3. Coverage Evidence Mechanism

### 3.1 Evidence File Structure

After each test run, write a machine-readable evidence file to `standards/.context/`. This is the "coverage report as evidence" — it mirrors the unit test result contract.

```typescript
// mcp-server/src/utils/coverage-evidence.ts

export interface CoverageFileEvidence {
  file: string;                    // relative path from project root
  linesPct: number;
  functionsPct: number;
  branchesPct: number;
  statementsPct: number;
  coveredLines: number;
  totalLines: number;
  coveredFunctions: number;
  totalFunctions: number;
}

export interface CoverageEvidence {
  version: '1.0';
  generatedAt: string;             // ISO-8601
  branch: string;
  commit: string;
  isPr: boolean;
  prNumber?: number;
  baseBranch?: string;
  changedFiles: string[];          // files changed in this PR (empty if not a PR)
  aggregate: {
    linesPct: number;
    functionsPct: number;
    branchesPct: number;
    statementsPct: number;
  };
  thresholds: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
    changedScopeRequired: boolean; // true when isPr && changedFiles.length > 0
  };
  passed: boolean;                 // overall pass/fail
  passReason?: string;              // 'all_thresholds_met' | 'changed_scope_100' | 'update_baseline'
  failReason?: string;             // 'aggregate_below_threshold' | 'changed_scope_below_100'
  perFile: CoverageFileEvidence[];
}
```

### 3.2 Evidence Generator

```typescript
// mcp-server/src/utils/coverage-evidence.ts

import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { CoverageEvidence, CoverageFileEvidence } from './coverage-evidence';

interface V8CoverageJson {
  [filepath: string]: {
    lines: { total: number; covered: number; pct?: number };
    functions: { total: number; covered: number; pct?: number };
    branches: { total: number; covered: number; pct?: number };
    statements: { total: number; covered: number; pct?: number };
  };
}

export function generateCoverageEvidence(
  coverageFinalPath: string,
  options: {
    branch: string;
    commit: string;
    isPr: boolean;
    prNumber?: number;
    baseBranch?: string;
    changedFiles: string[];
    thresholds: { lines: number; functions: number; branches: number; statements: number };
  },
): CoverageEvidence {
  const raw: V8CoverageJson = JSON.parse(readFileSync(coverageFinalPath, 'utf-8'));

  const perFile: CoverageFileEvidence[] = Object.entries(raw).map(([filepath, cov]) => ({
    file: filepath,
    linesPct: cov.lines.pct ?? (cov.lines.total > 0 ? (cov.lines.covered / cov.lines.total) * 100 : 100),
    functionsPct: cov.functions.pct ?? (cov.functions.total > 0 ? (cov.functions.covered / cov.functions.total) * 100 : 100),
    branchesPct: cov.branches.pct ?? (cov.branches.total > 0 ? (cov.branches.covered / cov.branches.total) * 100 : 100),
    statementsPct: cov.statements.pct ?? (cov.statements.total > 0 ? (cov.statements.covered / cov.statements.total) * 100 : 100),
    coveredLines: cov.lines.covered,
    totalLines: cov.lines.total,
    coveredFunctions: cov.functions.covered,
    totalFunctions: cov.functions.total,
  }));

  // Aggregate = total-covered / total-lines (weighted by actual counts, NOT average of percentages)
  const totals = perFile.reduce(
    (acc, f) => ({
      linesCovered: acc.linesCovered + f.coveredLines,
      linesTotal: acc.linesTotal + f.totalLines,
      fnsCovered: acc.fnsCovered + f.coveredFunctions,
      fnsTotal: acc.fnsTotal + f.totalFunctions,
      branchesCovered: acc.branchesCovered + (cov.branches.covered as number),
      branchesTotal: acc.branchesTotal + (cov.branches.total as number),
      stmtsCovered: acc.stmtsCovered + (cov.statements.covered as number),
      stmtsTotal: acc.stmtsTotal + (cov.statements.total as number),
    }),
    { linesCovered: 0, linesTotal: 0, fnsCovered: 0, fnsTotal: 0, branchesCovered: 0, branchesTotal: 0, stmtsCovered: 0, stmtsTotal: 0 },
  );
  const aggAggregate = {
    linesPct: totals.linesTotal > 0 ? (totals.linesCovered / totals.linesTotal) * 100 : 100,
    functionsPct: totals.fnsTotal > 0 ? (totals.fnsCovered / totals.fnsTotal) * 100 : 100,
    branchesPct: totals.branchesTotal > 0 ? (totals.branchesCovered / totals.branchesTotal) * 100 : 100,
    statementsPct: totals.stmtsTotal > 0 ? (totals.stmtsCovered / totals.stmtsTotal) * 100 : 100,
  };

  const changedScopeRequired = options.isPr && options.changedFiles.length > 0;
  let passed = false;
  let passReason: string | undefined;
  let failReason: string | undefined;

  const aggregatePasses =
    aggAggregate.linesPct >= options.thresholds.lines &&
    aggAggregate.functionsPct >= options.thresholds.functions &&
    aggAggregate.branchesPct >= options.thresholds.branches &&
    aggAggregate.statementsPct >= options.thresholds.statements;

  if (!changedScopeRequired) {
    // Not a PR — only enforce aggregate thresholds
    passed = aggregatePasses;
    passReason = passed ? 'all_thresholds_met' : undefined;
    failReason = passed ? undefined : 'aggregate_below_threshold';
  } else {
    // PR — aggregate must pass AND changed files must be 100%
    const changedFilesInReport = perFile.filter(f =>
      options.changedFiles.some(cf => f.file.includes(cf)),
    );
    const allChanged100 =
      changedFilesInReport.every(f => f.linesPct === 100 && f.functionsPct === 100);
    passed = aggregatePasses && allChanged100;
    if (passed) {
      passReason = 'changed_scope_100';
    } else if (!aggregatePasses) {
      failReason = 'aggregate_below_threshold';
    } else {
      failReason = 'changed_scope_below_100';
    }
  }

  const evidence: CoverageEvidence = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    branch: options.branch,
    commit: options.commit,
    isPr: options.isPr,
    prNumber: options.prNumber,
    baseBranch: options.baseBranch,
    changedFiles: options.changedFiles,
    aggregate: aggAggregate,
    thresholds: { ...options.thresholds, changedScopeRequired },
    passed,
    passReason,
    failReason,
    perFile,
  };

  return evidence;
}
```

### 3.3 Guardrail Validation Function

```typescript
// mcp-server/src/guardrail/validate-coverage.ts

import { readFileSync } from 'fs';
import { generateCoverageEvidence, type CoverageEvidence } from '../utils/coverage-evidence';

export interface CoverageValidationResult {
  pass: boolean;
  evidence: CoverageEvidence;
  blocking: boolean;    // true if coverage should block the operation
  message: string;     // human-readable summary for the guardrail response
}

/**
 * validateCoverageEvidence — called by the preflight guardrail chain.
 *
 * @param coverageReportPath  Path to coverage-final.json
 * @param options             Git/PR context
 */
export function validateCoverageEvidence(
  coverageReportPath: string,
  options: {
    branch: string;
    commit: string;
    isPr: boolean;
    prNumber?: number;
    baseBranch?: string;
    changedFiles: string[];
    thresholds?: { lines: number; functions: number; branches: number; statements: number };
    // What counts as "blocking" — default true for PR, false for dev
    enforce?: 'strict' | 'advisory' | 'off';
  },
): CoverageValidationResult {
  const thresholds = options.thresholds ?? { lines: 60, functions: 60, branches: 50, statements: 60 };
  const enforce = options.enforce ?? (options.isPr ? 'strict' : 'advisory');

  let evidence: CoverageEvidence;
  try {
    evidence = generateCoverageEvidence(coverageReportPath, { ...options, thresholds });
  } catch (err) {
    return {
      pass: false,
      evidence: {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        branch: options.branch,
        commit: options.commit,
        isPr: options.isPr,
        aggregate: { linesPct: 0, functionsPct: 0, branchesPct: 0, statementsPct: 0 },
        thresholds: { ...thresholds, changedScopeRequired: false },
        passed: false,
        failReason: 'coverage_report_unreadable',
        perFile: [],
      },
      blocking: enforce === 'strict',
      message: `Coverage report unreadable at ${coverageReportPath}: ${err instanceof Error ? err.message : String(err)}. Blocking in ${enforce} mode.`,
    };
  }

  // NOTE: file I/O is intentionally NOT inside this function.
  // The caller (or a thin wrapper) writes the evidence file.
  // This keeps validateCoverageEvidence() pure and testable.
  // Caller pattern:
  //   const result = validateCoverageEvidence(...);
  //   if (result.evidence) {
  //     writeFileSync(evidencePath, JSON.stringify(result.evidence, null, 2));
  //   }
  //   return result;

  const linesStr = `${evidence.aggregate.linesPct.toFixed(1)}%`;
  const changedStr = evidence.changedFiles.length > 0
    ? ` | changed scope: ${evidence.changedFiles.join(', ')}`
    : '';

  if (!evidence.passed) {
    const message = [
      `Coverage FAILED: lines=${linesStr} (threshold: ${thresholds.lines}%)`,
      `Fail reason: ${evidence.failReason}`,
      changedStr,
    ].join(' | ');

    return {
      pass: false,
      evidence,
      blocking: enforce === 'strict',
      message,
    };
  }

  return {
    pass: true,
    evidence,
    blocking: false,
    message: [
      `Coverage PASSED: lines=${linesStr} (threshold: ${thresholds.lines}%)`,
      `Pass reason: ${evidence.passReason}`,
      changedStr,
    ].join(' | '),
  };
}
```

### 3.4 Evidence Artifact Paths

| Path | Purpose |
|------|---------|
| `mcp-server/coverage/coverage-evidence.json` | Written after each test run; consumed by guardrail |
| `mcp-server/coverage/coverage-final.json` | Raw V8 per-file data; consumed by CI changed-scope step |
| `mcp-server/coverage/lcov.info` | LCOV format; consumed by GitHub code coverage annotations |
| `mcp-server/coverage/coverage-summary.json` | Human-readable summary; for Slack/GitHub comment bots |

---

## 4. Integration with Preflight

### 4.1 Guardrail Chain Position

Coverage validation is inserted into `agenticos_preflight` as the **final step before scope validation**:

```
agenticos_preflight
  ├── 1. Session/project alignment check     (existing)
  ├── 2. Worktree branch check               (existing)
  ├── 3. [NEW] Coverage evidence check      ← inserted here
  │       ├── On PR:      BLOCK if not passed (strict mode)
  │       ├── On preflight: ADVISORY if not passed (warn, don't block)
  │       └── On demand:  read coverage-evidence.json if exists
  └── 4. Scope validation                   (existing)
```

### 4.2 MCP Tool: `agenticos_coverage_check`

```typescript
// mcp-server/src/tools/coverage-check.ts

import { validateCoverageEvidence, type CoverageValidationResult } from '../guardrail/validate-coverage';
import { existsSync } from 'fs';
import { resolve } from 'path';

export const agenticosCoverageCheckTool = {
  name: 'agenticos_coverage_check',
  description: 'Validate test coverage evidence. BLOCKs on PR if coverage thresholds are not met.',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['strict', 'advisory', 'off'],
        description: 'strict=enforce and block, advisory=warn only, off=skip',
      },
      changedFiles: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of files changed in this session (for changed-scope check)',
      },
    },
  },

  async handler(params: { mode?: string; changedFiles?: string[] }): Promise<CoverageValidationResult> {
    const mode = (params.mode ?? 'advisory') as 'strict' | 'advisory' | 'off';
    if (mode === 'off') {
      return { pass: true, evidence: null as any, blocking: false, message: 'Coverage check disabled' };
    }

    const coverageReportPath = resolve(__dirname, '../../coverage/coverage-final.json');
    if (!existsSync(coverageReportPath)) {
      return {
        pass: false,
        evidence: null as any,
        blocking: mode === 'strict',
        message: 'No coverage report found. Run `npm test -- --coverage` first.',
      };
    }

    // In a real MCP invocation, these would come from git context
    const result = validateCoverageEvidence(coverageReportPath, {
      branch: process.env.GITHUB_REF_NAME ?? 'local',
      commit: process.env.GITHUB_SHA ?? 'local',
      isPr: process.env.GITHUB_EVENT_NAME === 'pull_request',
      prNumber: parseInt(process.env.GITHUB_PR_NUMBER ?? '0') || undefined,
      baseBranch: process.env.GITHUB_BASE_REF ?? undefined,
      changedFiles: params.changedFiles ?? [],
      enforce: mode,
    });

    return result;
  },
};
```

### 4.3 Preflight Guardrail Script

```bash
# tools/coverage-preflight.sh — called by agenticos_preflight

#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-advisory}"           # strict | advisory | off
CHANGED_FILES="${2:-}"           # comma-separated list of changed files

if [ "$MODE" = "off" ]; then
  echo "COVERAGE: disabled"
  exit 0
fi

COVERAGE_REPORT="$(pwd)/mcp-server/coverage/coverage-evidence.json"

if [ ! -f "$COVERAGE_REPORT" ]; then
  echo "COVERAGE: no evidence found (run npm test -- --coverage first)"
  [ "$MODE" = "strict" ] && exit 1 || exit 0
fi

PASSED=$(node -e "
  const ev = require('$COVERAGE_REPORT');
  const result = { pass: ev.passed, reason: ev.failReason ?? ev.passReason };
  console.log(JSON.stringify(result));
")

PASS=$(echo "$PASSED" | node -e "const d=require('fs').readFileSync(0,'utf-8');console.log(JSON.parse(d).pass)")
REASON=$(echo "$PASSED" | node -e "const d=require('fs').readFileSync(0,'utf-8');console.log(JSON.parse(d).reason)")

if [ "$PASS" = "true" ]; then
  echo "COVERAGE: PASS ($REASON)"
  exit 0
else
  echo "COVERAGE: FAIL ($REASON)"
  [ "$MODE" = "strict" ] && exit 1 || exit 0
fi
```

### 4.4 Behavior Summary

| Context | Mode | Coverage not found | Coverage below threshold | Coverage at 100% changed scope |
|---------|------|--------------------|--------------------------|-------------------------------|
| PR push | strict | BLOCK | BLOCK | PASS, merge allowed |
| `agenticos preflight` | strict | WARN | BLOCK | PASS |
| `agenticos preflight` | advisory | WARN | WARN (no block) | PASS |
| `agenticos coverage-check` (tool) | strict | FAIL | FAIL | PASS |
| Local dev (`npm test -- --coverage`) | off | N/A | WARN | WARN |

---

## 5. Implementation Phases

### Phase 1: Foundation (this session)
- Add `coverage` block to `vitest.config.ts` with 60/60/50/60 thresholds
- Add `npm run test:coverage` script to `package.json`
- Add coverage upload step to CI `build` job
- Add `tools/coverage-preflight.sh`

### Phase 2: Changed-Scope Enforcement (follow-up PR)
- Add `coverage-changed-scope` job to CI
- Add `generateCoverageEvidence()` and `validateCoverageEvidence()` to source
- Wire evidence file to `standards/.context/coverage-evidence.json`
- Add `agenticos_coverage_check` MCP tool

### Phase 3: Guardrail Integration (follow-up PR)
- Insert `coverage-preflight.sh` call into `agenticos_preflight` chain
- Add `enforce` parameter to `agenticos_preflight` MCP call
- Add per-module overrides for guardrail/ and mcp/ handlers
- Add PR comment automation for coverage gaps

---

## 6. Configuration Summary

### package.json additions

```json
{
  "scripts": {
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:coverage:changed": "vitest run --coverage --changed",
    "coverage:evidence": "node scripts/generate-evidence.js"
  }
}
```

### Repository Variables (GitHub Settings)

| Variable | Default | Purpose |
|----------|---------|---------|
| `COVERAGE_UPDATE_BASELINE` | `0` | Set to `1` to skip threshold enforcement for a specific run |
| `COVERAGE_THRESHOLD_LINES` | `60` | Adjustable without code changes |
| `COVERAGE_THRESHOLD_FUNCTIONS` | `60` | Adjustable without code changes |
| `COVERAGE_THRESHOLD_BRANCHES` | `50` | Adjustable without code changes |

---

## 7. Key Design Decisions

1. **Coverage is per-file, enforcement is on aggregate + changed-scope.** Global 60% floor prevents regression. Per-file 100% for changed files provides the aspirational goal without blocking PRs that touch legacy code.

2. **Evidence file IS the coverage report.** Writing `coverage-evidence.json` to the same directory as `coverage-final.json` keeps it alongside the raw data. The guardrail reads evidence, not raw coverage.

3. **Two enforcement modes.** `strict` (PR gate) and `advisory` (preflight warning) let teams move fast in development while maintaining quality at merge time.

4. **UPDATE_BASELINE is a CI variable, not a code change.** No commit needed to acknowledge a coverage gap. The PR author sets the variable, reviews the gap, and fixes it in the next PR.

5. **Changed-scope is computed in CI, not in Vitest.** Computing changed files requires git history. Doing this in the test runner would require the runner to have full repo history. The CI step (which already has the repo checked out) does this computation and writes the evidence file.

6. **No separate coverage job.** Coverage runs in the existing `build` job. Uploading artifacts is cheap; an extra job would add ~1 minute of orchestration overhead for no benefit at this project scale.

7. **Thresholds are configurable via GitHub variables.** This allows threshold bumps without a code change and without a PR — useful for gradual improvement (60 → 65 → 70 over quarters).
