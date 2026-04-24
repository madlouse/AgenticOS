/// <reference types="vitest/globals" />
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { runCoverageCheck, runCoverageGenerate } from '../coverage-check.js';

const mockReadFile = vi.hoisted(() => vi.fn());
const mockResolve = vi.hoisted(() => vi.fn());

vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
}));
vi.mock('../../utils/project-target.js', () => ({
  resolveManagedProjectTarget: mockResolve,
}));

describe('runCoverageCheck', () => {
  beforeEach(() => {
    mockReadFile.mockReset();
    mockResolve.mockReset();
    mockResolve.mockResolvedValue({ projectPath: '/tmp/project' });
  });
  afterEach(() => {
    mockReadFile.mockRestore();
    mockResolve.mockRestore();
  });

  it('returns error when project resolution fails', async () => {
    mockResolve.mockRejectedValue(new Error('Project not found'));
    const result = await runCoverageCheck({});
    expect(result).toContain('Project not found');
  });

  it('returns error when evidence file cannot be read', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const result = await runCoverageCheck({});
    expect(result).toContain('not found or unreadable');
  });

  it('returns error when evidence file is not valid JSON', async () => {
    mockReadFile.mockResolvedValue('not json{');
    const result = await runCoverageCheck({});
    expect(result).toContain('not valid JSON');
  });

  it('returns success for valid passing evidence', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      generated_at: '2026-04-24T10:00:00Z',
      threshold_aggregate: { lines: 80, functions: 80, branches: 80, statements: 80 },
      threshold_changed_scope: { lines: 100, functions: 100, branches: 100, statements: 100 },
      is_pr: false,
      changed_files: [],
      aggregate: { pct_statements: 90, pct_branches: 90, pct_functions: 95, pct_lines: 90 },
      files: [],
      aggregate_pass: true,
      changed_scope_pass: true,
      pass: true,
      aggregate_failures: [],
      changed_scope_failures: [],
    }));
    const result = await runCoverageCheck({});
    expect(result).toContain('✅');
    expect(result).toContain('Aggregate pass');
    expect(result).not.toContain('Errors (blocking)');
  });

  it('returns failure for failing evidence', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      generated_at: '2026-04-24T10:00:00Z',
      threshold_aggregate: { lines: 80, functions: 80, branches: 80, statements: 80 },
      threshold_changed_scope: { lines: 100, functions: 100, branches: 100, statements: 100 },
      is_pr: false,
      changed_files: [],
      aggregate: { pct_statements: 50, pct_branches: 50, pct_functions: 50, pct_lines: 50 },
      files: [],
      aggregate_pass: false,
      changed_scope_pass: true,
      pass: false,
      aggregate_failures: ['lines: 50% < 80%', 'statements: 50% < 80%'],
      changed_scope_failures: [],
    }));
    const result = await runCoverageCheck({});
    expect(result).toContain('❌');
    expect(result).toContain('Errors (blocking)');
    expect(result).toContain('aggregate lines 50% < floor 80%');
  });

  it('uses custom evidence_path when provided', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      generated_at: '2026-04-24T10:00:00Z',
      threshold_aggregate: { lines: 80, functions: 80, branches: 80, statements: 80 },
      threshold_changed_scope: { lines: 100, functions: 100, branches: 100, statements: 100 },
      is_pr: false,
      changed_files: [],
      aggregate: { pct_statements: 90, pct_branches: 90, pct_functions: 95, pct_lines: 90 },
      files: [],
      aggregate_pass: true,
      changed_scope_pass: true,
      pass: true,
      aggregate_failures: [],
      changed_scope_failures: [],
    }));
    const result = await runCoverageCheck({ evidence_path: '/custom/path/evidence.json' });
    expect(mockReadFile).toHaveBeenCalledWith('/custom/path/evidence.json', 'utf-8');
    expect(result).toContain('✅');
  });
});

describe('runCoverageGenerate', () => {
  beforeEach(() => {
    mockReadFile.mockReset();
    mockResolve.mockReset();
    mockResolve.mockResolvedValue({ projectPath: '/tmp/project' });
  });
  afterEach(() => {
    mockReadFile.mockRestore();
    mockResolve.mockRestore();
  });

  it('returns error when project resolution fails', async () => {
    mockResolve.mockRejectedValue(new Error('Project not found'));
    const result = await runCoverageGenerate({});
    expect(result).toContain('Project not found');
  });

  it('returns error when coverage JSON cannot be read', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const result = await runCoverageGenerate({});
    expect(result).toContain('not found');
  });

  it('returns error when coverage JSON is not valid', async () => {
    mockReadFile.mockResolvedValue('not json{');
    const result = await runCoverageGenerate({});
    expect(result).toContain('not valid JSON');
  });

  it('generates evidence and returns summary for passing coverage', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      'src/utils/foo.ts': {
        s: { '1': 1, '2': 1 },
        b: { '3': [1, 1] },
        f: { '4': 1 },
        lh: [1, 1],
      },
    }));
    const result = await runCoverageGenerate({});
    expect(result).toContain('Coverage check passed');
    expect(result).toContain('Aggregate: lines=');
    expect(result).toContain('Evidence file content');
  });

  it('reports failures when coverage is below threshold', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      'src/sparse.ts': {
        s: { '1': 1, '2': 1, '3': 1, '4': 1, '5': 1 },
        b: { '2': [1, 1] },
        f: { '3': 1 },
        lh: [1, 0, 0, 0, 0],
      },
    }));
    const result = await runCoverageGenerate({});
    expect(result).toContain('Coverage check failed');
    expect(result).toContain('Aggregate failures');
  });

  it('uses custom coverage_json_path when provided', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      'src/foo.ts': {
        s: { '1': 1 }, b: {}, f: { '2': 1 }, lh: [1],
      },
    }));
    const result = await runCoverageGenerate({ coverage_json_path: '/custom/coverage.json' });
    expect(mockReadFile).toHaveBeenCalledWith('/custom/coverage.json', 'utf-8');
    expect(result).toContain('Evidence file content');
  });

  it('uses is_pr and changed_files_json args when provided', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      'src/changed.ts': {
        s: { '1': 1, '2': 1 },
        b: { '3': [1, 1] },
        f: { '4': 1 },
        lh: [1, 1],
      },
    }));
    const result = await runCoverageGenerate({
      is_pr: true,
      changed_files_json: '["src/changed.ts"]',
    });
    expect(result).toContain('Coverage check passed');
    expect(result).toContain('Changed-scope pass: true');
  });

  it('accepts changed_files_json as array', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      'src/foo.ts': {
        s: { '1': 1 }, b: {}, f: { '2': 1 }, lh: [1],
      },
    }));
    const result = await runCoverageGenerate({
      is_pr: false,
      changed_files_json: ['src/foo.ts'],
    });
    expect(result).toContain('Evidence file content');
  });
});
