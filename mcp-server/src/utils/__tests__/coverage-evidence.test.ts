import { describe, expect, it } from 'vitest';
import { generateCoverageEvidence, validateCoverageEvidence } from '../coverage-evidence.js';

describe('generateCoverageEvidence', () => {
  it('flags changed-scope failures using direct path lookup', () => {
    const evidence = generateCoverageEvidence(
      {
        'src/foo.ts': {
          s: { '1': 1, '2': 0 },
          b: { '3': [1, 0] },
          f: { '4': 1 },
          lh: [1, 0],
        },
      },
      true,
      ['src/foo.ts'],
    );

    expect(evidence.changed_scope_pass).toBe(false);
    expect(evidence.changed_scope_failures).toContain('src/foo.ts: lines 50% < 100%');
  });

  it('matches changed files by suffix when coverage paths are absolute', () => {
    const evidence = generateCoverageEvidence(
      {
        '/tmp/worktree/mcp-server/src/bar.ts': {
          s: { '1': 1, '2': 1, '3': 0, '4': 0 },
          b: {},
          f: { '5': 1 },
          lh: [1, 1, 0, 0],
        },
      },
      true,
      ['src/bar.ts'],
    );

    expect(evidence.changed_scope_pass).toBe(false);
    expect(evidence.changed_scope_failures).toContain('/tmp/worktree/mcp-server/src/bar.ts: lines 50% < 100%');
  });

  it('fails changed-scope validation when a changed file is absent from coverage', () => {
    const evidence = generateCoverageEvidence(
      {
        'src/foo.ts': {
          s: { '1': 1 },
          b: {},
          f: { '2': 1 },
          lh: [1],
        },
      },
      true,
      ['src/missing.ts'],
    );

    expect(evidence.changed_scope_pass).toBe(false);
    expect(evidence.changed_scope_failures).toContain('src/missing.ts: file missing from coverage report');
  });

  it('derives line coverage from Istanbul statement maps when line hits are absent', () => {
    const evidence = generateCoverageEvidence(
      {
        'src/statement-map.ts': {
          statementMap: {
            '1': { start: { line: 10 }, end: { line: 10 } },
            '2': { start: { line: 11 }, end: { line: 12 } },
          },
          s: { '1': 1, '2': 0 },
          b: {},
          f: { '1': 1 },
        },
      },
      false,
      [],
    );

    expect(evidence.version).toBe(1);
    expect(evidence.files[0].pct_lines).toBe(33);
    expect(evidence.threshold_aggregate).toEqual({ lines: 60, functions: 60, branches: 50, statements: 60 });
  });

  it('checks changed-scope function coverage independently from line coverage', () => {
    const evidence = generateCoverageEvidence(
      {
        'src/functions.ts': {
          s: { '1': 1, '2': 1 },
          b: {},
          f: { '1': 1, '2': 0 },
          lh: [1, 1],
        },
      },
      true,
      ['src/functions.ts'],
    );

    expect(evidence.changed_scope_pass).toBe(false);
    expect(evidence.changed_scope_failures).toContain('src/functions.ts: functions 50% < 100%');
  });

  it('checks changed-scope branch and statement coverage', () => {
    const evidence = generateCoverageEvidence(
      {
        'src/branches.ts': {
          s: { '1': 1, '2': 0 },
          b: { '1': [1, 0] },
          f: { '1': 1 },
          lh: [1, 1],
        },
      },
      true,
      ['src/branches.ts'],
    );

    expect(evidence.changed_scope_pass).toBe(false);
    expect(evidence.changed_scope_failures).toContain('src/branches.ts: branches 50% < 100%');
    expect(evidence.changed_scope_failures).toContain('src/branches.ts: statements 50% < 100%');
  });

  it('skips synthetic entries and carries metadata plus threshold overrides', () => {
    const evidence = generateCoverageEvidence(
      {
        '<total>': {
          s: { '1': 0 },
          b: {},
          f: {},
          lh: [0],
        },
        'node_modules/pkg/index.ts': {
          s: { '1': 0 },
          b: {},
          f: {},
          lh: [0],
        },
      },
      true,
      [],
      {
        aggregateFloor: { lines: 10 },
        metadata: { branch: 'feature', commit: 'abc123', base_branch: 'main', pr_number: '12' },
      },
    );

    expect(evidence.files).toEqual([]);
    expect(evidence.aggregate.pct_lines).toBe(100);
    expect(evidence.threshold_aggregate.lines).toBe(10);
    expect(evidence.branch).toBe('feature');
    expect(evidence.commit).toBe('abc123');
    expect(evidence.base_branch).toBe('main');
    expect(evidence.pr_number).toBe('12');
  });

  it('ignores statement map entries without numeric line locations', () => {
    const evidence = generateCoverageEvidence(
      {
        'src/no-line.ts': {
          statementMap: {
            '1': { start: {}, end: {} },
          },
          s: { '1': 1 },
          b: {},
          f: {},
        },
      },
      false,
      [],
    );

    expect(evidence.files[0].pct_lines).toBe(100);
  });

  it('validates malformed and changed-scope failing evidence', () => {
    const result = validateCoverageEvidence({
      version: 0 as any,
      generated_at: '',
      threshold_aggregate: { lines: 60, functions: 60, branches: 50, statements: 60 },
      threshold_changed_scope: { lines: 100, functions: 100, branches: 100, statements: 100 },
      is_pr: true,
      changed_files: ['src/failing.ts'],
      aggregate: { pct_statements: 70, pct_branches: 70, pct_functions: 70, pct_lines: 70 },
      files: undefined as any,
      aggregate_pass: true,
      changed_scope_pass: false,
      pass: false,
      aggregate_failures: [],
      changed_scope_failures: ['src/failing.ts: lines 90% < 100%'],
    });

    expect(result.pass).toBe(false);
    expect(result.errors).toContain('coverage-evidence.json: missing generated_at field');
    expect(result.errors).toContain('coverage-evidence.json: unsupported or missing version');
    expect(result.errors).toContain('coverage-evidence.json: missing or invalid files array');
    expect(result.errors).toContain('changed-scope: src/failing.ts: lines 90% < 100%');
  });

  it('reports non-object evidence roots without throwing', () => {
    const result = validateCoverageEvidence(null);

    expect(result.pass).toBe(false);
    expect(result.errors).toContain('coverage-evidence.json: root must be an object');
  });

  it('reports missing aggregate thresholds and invalid changed files without throwing', () => {
    const result = validateCoverageEvidence({
      version: 1,
      generated_at: '2026-05-11T00:00:00Z',
      threshold_aggregate: undefined as any,
      threshold_changed_scope: { lines: 100, functions: 100, branches: 100, statements: 100 },
      is_pr: true,
      changed_files: undefined as any,
      aggregate: { pct_statements: 70, pct_branches: 70, pct_functions: 70, pct_lines: 70 },
      files: [],
      aggregate_pass: false,
      changed_scope_pass: false,
      pass: false,
      aggregate_failures: [],
      changed_scope_failures: [],
    });

    expect(result.pass).toBe(false);
    expect(result.errors).toContain('coverage-evidence.json: missing threshold_aggregate section');
    expect(result.errors).toContain('coverage-evidence.json: missing or invalid changed_files array');
  });

  it('rejects evidence that lowers canonical thresholds', () => {
    const result = validateCoverageEvidence({
      version: 1,
      generated_at: '2026-05-11T00:00:00Z',
      threshold_aggregate: { lines: 1, functions: 1, branches: 1, statements: 1 },
      threshold_changed_scope: { lines: 1, functions: 1, branches: 1, statements: 1 },
      is_pr: true,
      changed_files: ['src/foo.ts'],
      aggregate: { pct_statements: 90, pct_branches: 90, pct_functions: 90, pct_lines: 90 },
      files: [{ path: 'src/foo.ts', pct_statements: 100, pct_branches: 100, pct_functions: 100, pct_lines: 100 }],
      aggregate_pass: true,
      changed_scope_pass: true,
      pass: true,
      aggregate_failures: [],
      changed_scope_failures: [],
    });

    expect(result.pass).toBe(false);
    expect(result.errors).toContain('coverage-evidence.json: threshold_aggregate.lines 1% is below canonical floor 60%');
    expect(result.errors).toContain('coverage-evidence.json: threshold_changed_scope.lines 1% is below canonical floor 100%');
  });

  it('recomputes changed-scope failures instead of trusting evidence flags', () => {
    const result = validateCoverageEvidence({
      version: 1,
      generated_at: '2026-05-11T00:00:00Z',
      threshold_aggregate: { lines: 60, functions: 60, branches: 50, statements: 60 },
      threshold_changed_scope: { lines: 100, functions: 100, branches: 100, statements: 100 },
      is_pr: true,
      changed_files: ['src/foo.ts'],
      aggregate: { pct_statements: 90, pct_branches: 90, pct_functions: 90, pct_lines: 90 },
      files: [{ path: 'src/foo.ts', pct_statements: 100, pct_branches: 100, pct_functions: 100, pct_lines: 50 }],
      aggregate_pass: true,
      changed_scope_pass: true,
      pass: true,
      aggregate_failures: [],
      changed_scope_failures: [],
    });

    expect(result.pass).toBe(false);
    expect(result.errors).toContain('changed-scope: src/foo.ts: lines 50% < 100%');
  });

  it('reports missing aggregate evidence', () => {
    const result = validateCoverageEvidence({
      version: 1,
      generated_at: '2026-05-11T00:00:00Z',
      threshold_aggregate: { lines: 60, functions: 60, branches: 50, statements: 60 },
      threshold_changed_scope: { lines: 100, functions: 100, branches: 100, statements: 100 },
      is_pr: false,
      changed_files: [],
      aggregate: undefined as any,
      files: [],
      aggregate_pass: false,
      changed_scope_pass: true,
      pass: false,
      aggregate_failures: [],
      changed_scope_failures: [],
    });

    expect(result.pass).toBe(false);
    expect(result.errors).toContain('coverage-evidence.json: missing aggregate section');
  });

  it('reports invalid coverage file entries', () => {
    const result = validateCoverageEvidence({
      version: 1,
      generated_at: '2026-05-11T00:00:00Z',
      threshold_aggregate: { lines: 60, functions: 60, branches: 50, statements: 60 },
      threshold_changed_scope: { lines: 100, functions: 100, branches: 100, statements: 100 },
      is_pr: false,
      changed_files: [],
      aggregate: { pct_statements: 90, pct_branches: 90, pct_functions: 90, pct_lines: 90 },
      files: [null],
      aggregate_pass: true,
      changed_scope_pass: true,
      pass: true,
      aggregate_failures: [],
      changed_scope_failures: [],
    });

    expect(result.pass).toBe(false);
    expect(result.errors).toContain('coverage-evidence.json: missing or invalid files array');
  });

  it('handles empty coverage entries and missing statement hits', () => {
    const evidence = generateCoverageEvidence(
      {
        'src/empty.ts': {},
        'src/missing-hit.ts': {
          statementMap: {
            '1': { start: { line: 1 }, end: { line: 1 } },
          },
          s: {},
          b: {},
          f: {},
        },
      },
      false,
      [],
      { aggregateFloor: { lines: 100, functions: 100, branches: 101, statements: 100 } },
    );

    expect(evidence.files.find((file) => file.path === 'src/empty.ts')?.pct_lines).toBe(100);
    expect(evidence.files.find((file) => file.path === 'src/missing-hit.ts')?.pct_lines).toBe(0);
    expect(evidence.aggregate_failures).toContain('branches: 100% < 101%');
  });

  it('reports missing changed-scope thresholds and failure arrays', () => {
    const result = validateCoverageEvidence({
      version: 1,
      generated_at: '2026-05-11T00:00:00Z',
      threshold_aggregate: { lines: 60, functions: 60, branches: 50, statements: 60 },
      threshold_changed_scope: undefined as any,
      is_pr: true,
      changed_files: ['src/failing.ts'],
      aggregate: { pct_statements: 70, pct_branches: 70, pct_functions: 70, pct_lines: 70 },
      files: [],
      aggregate_pass: true,
      changed_scope_pass: false,
      pass: false,
      aggregate_failures: [],
      changed_scope_failures: undefined as any,
    });

    expect(result.pass).toBe(false);
    expect(result.errors).toContain('coverage-evidence.json: missing threshold_changed_scope section');
    expect(result.errors).toContain('coverage-evidence.json: missing or invalid changed_scope_failures array');
  });
});
