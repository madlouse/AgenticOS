/// <reference types="vitest/globals" />
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { runCoverageCheck, runCoverageGenerate } from '../coverage-check.js';

const mockReadFile = vi.hoisted(() => vi.fn());
const mockMkdir = vi.hoisted(() => vi.fn());
const mockWriteFile = vi.hoisted(() => vi.fn());
const mockResolve = vi.hoisted(() => vi.fn());

vi.mock('fs/promises', () => ({
  mkdir: mockMkdir,
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}));
vi.mock('../../utils/project-target.js', () => ({
  resolveManagedProjectTarget: mockResolve,
}));

describe('runCoverageCheck', () => {
  beforeEach(() => {
    mockReadFile.mockReset();
    mockMkdir.mockReset();
    mockWriteFile.mockReset();
    mockResolve.mockReset();
    mockResolve.mockResolvedValue({ projectPath: '/tmp/project' });
  });
  afterEach(() => {
    mockReadFile.mockRestore();
    mockMkdir.mockRestore();
    mockWriteFile.mockRestore();
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
    expect(mockReadFile).toHaveBeenCalledWith('/tmp/project/mcp-server/coverage/coverage-evidence.json', 'utf-8');
  });

  it('returns error when evidence file is not valid JSON', async () => {
    mockReadFile.mockResolvedValue('not json{');
    const result = await runCoverageCheck({});
    expect(result).toContain('not valid JSON');
  });

  it('returns structured errors when evidence JSON is null', async () => {
    mockReadFile.mockResolvedValue('null');
    const result = await runCoverageCheck({});
    expect(result).toContain('Coverage validation failed');
    expect(result).toContain('coverage-evidence.json: root must be an object');
    expect(result).toContain('Changed files: (none)');
  });

  it('returns success for valid passing evidence', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      version: 1,
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

  it('renders fallback summary values for sparse passing evidence', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      version: 1,
      generated_at: '',
      threshold_aggregate: {},
      threshold_changed_scope: { lines: 100, functions: 100, branches: 100, statements: 100 },
      is_pr: true,
      changed_files: ['src/a.ts'],
      aggregate: {},
      files: [],
      aggregate_pass: false,
      changed_scope_pass: false,
      pass: false,
      aggregate_failures: [],
      changed_scope_failures: [],
    }));

    const result = await runCoverageCheck({});

    expect(result).toContain('Generated at: (unknown)');
    expect(result).toContain('Running in PR: yes');
    expect(result).toContain('Changed files: src/a.ts');
    expect(result).toContain('Aggregate lines: ?%');
    expect(result).toContain('Aggregate functions: ?%');
    expect(result).toContain('Aggregate branches: ?%');
    expect(result).toContain('Aggregate statements: ?%');
    expect(result).toContain('Changed-scope pass: ⚠️ (inactive)');
  });

  it('renders fallback changed files when evidence has an invalid changed_files value', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      version: 1,
      generated_at: '2026-05-11T00:00:00Z',
      threshold_aggregate: { lines: 60, functions: 60, branches: 50, statements: 60 },
      threshold_changed_scope: { lines: 100, functions: 100, branches: 100, statements: 100 },
      is_pr: true,
      changed_files: null,
      aggregate: { pct_statements: 90, pct_branches: 90, pct_functions: 90, pct_lines: 90 },
      files: [],
      aggregate_pass: true,
      changed_scope_pass: false,
      pass: false,
      aggregate_failures: [],
      changed_scope_failures: [],
    }));
    const result = await runCoverageCheck({});
    expect(result).toContain('coverage-evidence.json: missing or invalid changed_files array');
    expect(result).toContain('Changed files: (none)');
  });

  it('returns failure for failing evidence', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      version: 1,
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
      version: 1,
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
    const result = await runCoverageCheck({ evidence_path: '/tmp/project/custom/path/evidence.json' });
    expect(mockReadFile).toHaveBeenCalledWith('/tmp/project/custom/path/evidence.json', 'utf-8');
    expect(result).toContain('✅');
  });

  it('rejects custom evidence_path outside the project root', async () => {
    const result = await runCoverageCheck({ evidence_path: '/custom/path/evidence.json' });
    expect(result).toContain('path must stay inside project root');
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('passes project_path through when checking coverage evidence', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      version: 1,
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
    await runCoverageCheck({ project_path: '/worktree' });
    expect(mockResolve).toHaveBeenCalledWith(expect.objectContaining({ projectPath: '/worktree' }));
  });
});

describe('runCoverageGenerate', () => {
  beforeEach(() => {
    mockReadFile.mockReset();
    mockMkdir.mockReset();
    mockWriteFile.mockReset();
    mockResolve.mockReset();
    mockResolve.mockResolvedValue({ projectPath: '/tmp/project' });
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });
  afterEach(() => {
    mockReadFile.mockRestore();
    mockMkdir.mockRestore();
    mockWriteFile.mockRestore();
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
    expect(result).toContain('Evidence written: /tmp/project/mcp-server/coverage/coverage-evidence.json');
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/project/mcp-server/coverage/coverage-evidence.json',
      expect.stringContaining('"version": 1'),
      'utf-8',
    );
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
    const result = await runCoverageGenerate({ coverage_json_path: '/tmp/project/custom/coverage.json' });
    expect(mockReadFile).toHaveBeenCalledWith('/tmp/project/custom/coverage.json', 'utf-8');
    expect(result).toContain('Evidence file content');
  });

  it('rejects custom coverage_json_path outside the project root', async () => {
    const result = await runCoverageGenerate({ coverage_json_path: '/custom/coverage.json' });
    expect(result).toContain('path must stay inside project root');
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('uses custom evidence_path when generating evidence', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      'src/foo.ts': {
        s: { '1': 1 }, b: {}, f: { '2': 1 }, lh: [1],
      },
    }));
    const result = await runCoverageGenerate({ evidence_path: '/tmp/project/custom/evidence.json' });
    expect(mockWriteFile).toHaveBeenCalledWith('/tmp/project/custom/evidence.json', expect.any(String), 'utf-8');
    expect(result).toContain('Evidence written: /tmp/project/custom/evidence.json');
  });

  it('rejects custom generated evidence_path outside the project root', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      'src/foo.ts': {
        s: { '1': 1 }, b: {}, f: { '2': 1 }, lh: [1],
      },
    }));
    const result = await runCoverageGenerate({ evidence_path: '/custom/evidence.json' });
    expect(result).toContain('path must stay inside project root');
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('passes project_path through when generating coverage evidence', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      'src/foo.ts': {
        s: { '1': 1 }, b: {}, f: { '2': 1 }, lh: [1],
      },
    }));
    await runCoverageGenerate({ project_path: '/worktree' });
    expect(mockResolve).toHaveBeenCalledWith(expect.objectContaining({ projectPath: '/worktree' }));
  });

  it('falls back to GITHUB_EVENT_NUMBER for generated PR metadata', async () => {
    const previousPrNumber = process.env.PR_NUMBER;
    const previousEventNumber = process.env.GITHUB_EVENT_NUMBER;
    const previousHeadRef = process.env.GITHUB_HEAD_REF;
    const previousRefName = process.env.GITHUB_REF_NAME;
    try {
      delete process.env.PR_NUMBER;
      delete process.env.GITHUB_HEAD_REF;
      process.env.GITHUB_EVENT_NUMBER = '392';
      process.env.GITHUB_REF_NAME = 'fallback-branch';
      mockReadFile.mockResolvedValue(JSON.stringify({
        'src/foo.ts': {
          s: { '1': 1 }, b: {}, f: { '2': 1 }, lh: [1],
        },
      }));

      await runCoverageGenerate({});

      const writtenEvidence = JSON.parse(mockWriteFile.mock.calls.at(-1)![1]);
      expect(writtenEvidence.pr_number).toBe('392');
      expect(writtenEvidence.branch).toBe('fallback-branch');
    } finally {
      if (previousPrNumber === undefined) delete process.env.PR_NUMBER;
      else process.env.PR_NUMBER = previousPrNumber;
      if (previousEventNumber === undefined) delete process.env.GITHUB_EVENT_NUMBER;
      else process.env.GITHUB_EVENT_NUMBER = previousEventNumber;
      if (previousHeadRef === undefined) delete process.env.GITHUB_HEAD_REF;
      else process.env.GITHUB_HEAD_REF = previousHeadRef;
      if (previousRefName === undefined) delete process.env.GITHUB_REF_NAME;
      else process.env.GITHUB_REF_NAME = previousRefName;
    }
  });

  it('prefers pull request metadata from primary GitHub environment variables', async () => {
    const previousPrNumber = process.env.PR_NUMBER;
    const previousEventNumber = process.env.GITHUB_EVENT_NUMBER;
    const previousHeadRef = process.env.GITHUB_HEAD_REF;
    const previousRefName = process.env.GITHUB_REF_NAME;
    try {
      process.env.PR_NUMBER = '393';
      process.env.GITHUB_EVENT_NUMBER = '392';
      process.env.GITHUB_HEAD_REF = 'head-branch';
      process.env.GITHUB_REF_NAME = 'ignored-ref';
      mockReadFile.mockResolvedValue(JSON.stringify({
        'src/foo.ts': {
          s: { '1': 1 }, b: {}, f: { '2': 1 }, lh: [1],
        },
      }));

      await runCoverageGenerate({});

      const writtenEvidence = JSON.parse(mockWriteFile.mock.calls.at(-1)![1]);
      expect(writtenEvidence.pr_number).toBe('393');
      expect(writtenEvidence.branch).toBe('head-branch');
    } finally {
      if (previousPrNumber === undefined) delete process.env.PR_NUMBER;
      else process.env.PR_NUMBER = previousPrNumber;
      if (previousEventNumber === undefined) delete process.env.GITHUB_EVENT_NUMBER;
      else process.env.GITHUB_EVENT_NUMBER = previousEventNumber;
      if (previousHeadRef === undefined) delete process.env.GITHUB_HEAD_REF;
      else process.env.GITHUB_HEAD_REF = previousHeadRef;
      if (previousRefName === undefined) delete process.env.GITHUB_REF_NAME;
      else process.env.GITHUB_REF_NAME = previousRefName;
    }
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

  it('prints changed-scope failures when generated evidence fails the PR gate', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      'src/changed.ts': {
        s: { '1': 1, '2': 0 },
        b: {},
        f: { '4': 1 },
        lh: [1, 0],
      },
    }));
    const result = await runCoverageGenerate({
      is_pr: true,
      changed_files_json: '["src/changed.ts"]',
    });
    expect(result).toContain('Coverage check failed');
    expect(result).toContain('Changed-scope failures');
    expect(result).toContain('src/changed.ts: lines 50% < 100%');
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

  it('returns controlled errors for invalid changed_files_json input', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      'src/foo.ts': {
        s: { '1': 1 }, b: {}, f: { '2': 1 }, lh: [1],
      },
    }));

    await expect(runCoverageGenerate({ changed_files_json: 'not-json' })).resolves.toContain('changed_files_json is not valid JSON');
    await expect(runCoverageGenerate({ changed_files_json: 'null' })).resolves.toContain('changed_files_json must be an array of strings');
    await expect(runCoverageGenerate({ changed_files_json: [null] })).resolves.toContain('changed_files_json must be an array of strings');
  });
});
