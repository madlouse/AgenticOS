import { describe, expect, it } from 'vitest';
import { analyzeCanonicalRepoSync } from '../canonical-checkout-sync.js';

describe('analyzeCanonicalRepoSync', () => {
  it('returns PASS for a clean canonical checkout aligned to origin/main', () => {
    const result = analyzeCanonicalRepoSync({
      statusOutput: '## main...origin/main\n',
      remoteBaseBranch: 'origin/main',
      runtimeManagedEntries: ['standards/.context/state.yaml', 'standards/.context/conversations/', 'CLAUDE.md'],
    });

    expect(result.status).toBe('PASS');
    expect(result.summary).toBe('Canonical checkout is clean and aligned with origin/main.');
    expect(result.details).toEqual({
      branch_line: '## main...origin/main',
      branch_status: 'aligned',
      dirty_paths: [],
      runtime_dirty_paths: [],
      source_dirty_paths: [],
    });
    expect(result.recovery_actions).toEqual([]);
  });

  it('classifies runtime-only drift and rename paths', () => {
    const result = analyzeCanonicalRepoSync({
      statusOutput: '## main...origin/main\n M standards/.context/state.yaml\nR  old/path.txt -> CLAUDE.md\n?? standards/.context/conversations/2026-04-14.md\n',
      remoteBaseBranch: 'origin/main',
      runtimeManagedEntries: ['standards/.context/state.yaml', 'standards/.context/conversations/', 'CLAUDE.md'],
    });

    expect(result.status).toBe('BLOCK');
    expect(result.summary).toContain('runtime-managed drift: 3 path(s)');
    expect(result.details.runtime_dirty_paths).toEqual([
      'standards/.context/state.yaml',
      'CLAUDE.md',
      'standards/.context/conversations/2026-04-14.md',
    ]);
    expect(result.details.source_dirty_paths).toEqual([]);
    expect(result.recovery_actions[0]).toContain('discard or isolate runtime-managed drift');
    expect(result.recovery_actions[1]).toContain('isolated issue worktrees');
  });

  it('classifies source-tree edits and behind canonical main separately', () => {
    const result = analyzeCanonicalRepoSync({
      statusOutput: '## main...origin/main [behind 6]\n M standards/.context/state.yaml\n M README.md\n',
      remoteBaseBranch: 'origin/main',
      runtimeManagedEntries: ['standards/.context/state.yaml', 'standards/.context/conversations/', 'CLAUDE.md'],
    });

    expect(result.status).toBe('BLOCK');
    expect(result.summary).toContain('branch misalignment: ## main...origin/main [behind 6]');
    expect(result.summary).toContain('runtime-managed drift: 1 path(s)');
    expect(result.summary).toContain('source-tree edits: 1 path(s)');
    expect(result.details.branch_status).toBe('behind');
    expect(result.details.runtime_dirty_paths).toEqual(['standards/.context/state.yaml']);
    expect(result.details.source_dirty_paths).toEqual(['README.md']);
    expect(result.recovery_actions).toEqual([
      'fast-forward canonical main to origin/main before treating it as a trusted base checkout',
      'discard or isolate runtime-managed drift from the canonical checkout: standards/.context/state.yaml',
      'review, move, or revert source-tree edits before trusting the canonical checkout: README.md',
      'keep new implementation work inside isolated issue worktrees rather than the canonical main checkout',
    ]);
  });

  it('truncates long recovery path lists with a +N suffix', () => {
    const result = analyzeCanonicalRepoSync({
      statusOutput: '## main...origin/main\n M a\n M b\n M c\n M d\n M e\n M f\n',
      remoteBaseBranch: 'origin/main',
      runtimeManagedEntries: [],
    });

    expect(result.recovery_actions[0]).toContain('a, b, c, d, e (+1 more)');
  });

  it('covers ahead, diverged, non-main, and missing branch states', () => {
    const ahead = analyzeCanonicalRepoSync({
      statusOutput: '## main...origin/main [ahead 2]\n',
      remoteBaseBranch: 'origin/main',
    });
    expect(ahead.details.branch_status).toBe('ahead');
    expect(ahead.recovery_actions[0]).toContain('realign canonical main with origin/main');

    const diverged = analyzeCanonicalRepoSync({
      statusOutput: '## main...origin/main [ahead 1, behind 2]\n',
      remoteBaseBranch: 'origin/main',
    });
    expect(diverged.details.branch_status).toBe('diverged');
    expect(diverged.recovery_actions[0]).toContain('realign canonical main with origin/main');

    const notOnMain = analyzeCanonicalRepoSync({
      statusOutput: '## fix/284-canonical-checkout-sync-runtime-write-protection\n',
      remoteBaseBranch: 'origin/main',
    });
    expect(notOnMain.details.branch_status).toBe('not_on_main');
    expect(notOnMain.recovery_actions[0]).toContain('return the canonical checkout to main');

    const unknownMain = analyzeCanonicalRepoSync({
      statusOutput: '## main\n',
      remoteBaseBranch: 'origin/main',
    });
    expect(unknownMain.details.branch_status).toBe('unknown');
    expect(unknownMain.recovery_actions[0]).toContain('restore exact main...origin/main alignment');

    const unknownDecoratedMain = analyzeCanonicalRepoSync({
      statusOutput: '## main...origin/main [gone]\n',
      remoteBaseBranch: 'origin/main',
    });
    expect(unknownDecoratedMain.details.branch_status).toBe('unknown');

    const missing = analyzeCanonicalRepoSync({
      statusOutput: '\n',
      remoteBaseBranch: 'origin/main',
    });
    expect(missing.details.branch_status).toBe('unknown');
    expect(missing.summary).toContain('missing branch status');
    expect(missing.recovery_actions[0]).toContain('missing branch status');
  });
});
