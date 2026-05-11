import { describe, expect, it } from 'vitest';
import { generateCoverageEvidence } from '../coverage-evidence.js';

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
});
