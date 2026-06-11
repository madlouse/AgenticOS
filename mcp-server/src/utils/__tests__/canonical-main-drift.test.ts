import { afterEach, describe, expect, it, vi } from 'vitest';

const execGitMock = vi.hoisted(() => vi.fn());
const detectGuardMock = vi.hoisted(() => vi.fn());
const resolveSurfacesMock = vi.hoisted(() => vi.fn());

vi.mock('../exec-git.js', () => ({
  execGit: execGitMock,
}));
vi.mock('../canonical-main-guard.js', () => ({
  detectCanonicalMainWriteProtection: detectGuardMock,
}));
vi.mock('../runtime-review-surface.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../runtime-review-surface.js')>();
  return { ...actual, resolveRuntimeReviewSurfacePaths: resolveSurfacesMock };
});

import {
  assessCanonicalMainDrift,
  buildCanonicalMainDriftStatusLines,
} from '../canonical-main-drift.js';

const PARAMS = { repoPath: '/canon', projectPath: '/canon', projectYaml: { meta: { name: 'AgenticOS' } } };

function onCanonicalMain(): void {
  detectGuardMock.mockResolvedValue({
    blocked: true,
    current_branch: 'main',
    workspace_type: 'main',
    git_worktree_root: '/canon',
  });
  // Default: continuity surfaces classifier returns the known tracked paths.
  resolveSurfacesMock.mockReturnValue({
    tracked_review_excluded_paths: ['standards/.context/state.yaml', 'CLAUDE.md'],
    sidecar_only_paths: ['.private/conversations/'],
    private_transcript_blocked_paths: [],
  });
}

/** Route execGit by subcommand: fetch, rev-list (behind), status (porcelain). */
function routeGit(opts: { behind?: string; behindOk?: boolean; status?: string; statusOk?: boolean }): void {
  execGitMock.mockImplementation(async (_repo: string, args: string[]) => {
    if (args[0] === 'fetch') return { ok: true, stdout: '', stderr: '' };
    if (args[0] === 'rev-list') {
      return { ok: opts.behindOk ?? true, stdout: opts.behind ?? '0', stderr: '' };
    }
    if (args[0] === 'status') {
      return { ok: opts.statusOk ?? true, stdout: opts.status ?? '', stderr: '' };
    }
    return { ok: true, stdout: '', stderr: '' };
  });
}

describe('assessCanonicalMainDrift', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not apply on an isolated worktree / feature branch', async () => {
    detectGuardMock.mockResolvedValue({ current_branch: 'feat/x', workspace_type: 'isolated_worktree' });

    const result = await assessCanonicalMainDrift(PARAMS);
    expect(result.applies).toBe(false);
    expect(execGitMock).not.toHaveBeenCalled();
  });

  it('does not apply on main when it is not the primary worktree', async () => {
    detectGuardMock.mockResolvedValue({ current_branch: 'main', workspace_type: 'isolated_worktree' });

    const result = await assessCanonicalMainDrift(PARAMS);
    expect(result.applies).toBe(false);
  });

  it('reports behind-origin count on the canonical main checkout', async () => {
    onCanonicalMain();
    routeGit({ behind: '7\n', status: '' });

    const result = await assessCanonicalMainDrift(PARAMS);
    expect(result.applies).toBe(true);
    expect(result.behind_count).toBe(7);
    expect(result.compared_against_origin).toBe(true);
    expect(result.real_change_paths).toEqual([]);
    // Best-effort fetch is attempted before comparing.
    expect(execGitMock.mock.calls.some((c) => c[1][0] === 'fetch')).toBe(true);
  });

  it('flags real changes but excludes runtime/continuity surfaces', async () => {
    onCanonicalMain();
    routeGit({
      behind: '0',
      status: [
        ' M src/server.ts',
        '?? docs/new-design.md',
        ' M standards/.context/state.yaml', // runtime continuity — excluded
        ' M CLAUDE.md',                       // mirror — excluded
        ' M .private/conversations/2026-06-11.md', // sidecar — excluded
      ].join('\n'),
    });

    const result = await assessCanonicalMainDrift(PARAMS);
    expect(result.real_change_paths).toEqual(['src/server.ts', 'docs/new-design.md']);
    expect(result.behind_count).toBe(0);
  });

  it('parses rename entries to the new path', async () => {
    onCanonicalMain();
    routeGit({ behind: '0', status: 'R  src/old.ts -> src/new.ts' });

    const result = await assessCanonicalMainDrift(PARAMS);
    expect(result.real_change_paths).toEqual(['src/new.ts']);
  });

  it('is clean (no drift) when in sync with no real changes', async () => {
    onCanonicalMain();
    routeGit({ behind: '0', status: '' });

    const result = await assessCanonicalMainDrift(PARAMS);
    expect(result.applies).toBe(true);
    expect(result.behind_count).toBe(0);
    expect(result.real_change_paths).toEqual([]);
  });

  it('marks comparison unproven when rev-list fails (offline / no origin ref)', async () => {
    onCanonicalMain();
    routeGit({ behindOk: false, status: '' });

    const result = await assessCanonicalMainDrift(PARAMS);
    expect(result.compared_against_origin).toBe(false);
    expect(result.behind_count).toBe(0);
  });

  it('returns not-applicable when the guard detector throws', async () => {
    detectGuardMock.mockRejectedValue(new Error('boom'));
    const result = await assessCanonicalMainDrift(PARAMS);
    expect(result.applies).toBe(false);
  });

  it('still reports drift if the surface classifier throws (no exclusions)', async () => {
    onCanonicalMain();
    resolveSurfacesMock.mockImplementation(() => { throw new Error('policy error'); });
    routeGit({ behind: '0', status: ' M src/a.ts\n M CLAUDE.md' });

    const result = await assessCanonicalMainDrift(PARAMS);
    // Without exclusions everything dirty counts as a real change.
    expect(result.real_change_paths).toEqual(['src/a.ts', 'CLAUDE.md']);
  });
});

describe('buildCanonicalMainDriftStatusLines', () => {
  it('returns nothing when not applicable', () => {
    expect(buildCanonicalMainDriftStatusLines({
      applies: false, behind_count: 5, compared_against_origin: true, real_change_paths: ['x'],
    })).toEqual([]);
  });

  it('renders a behind-origin warning', () => {
    const lines = buildCanonicalMainDriftStatusLines({
      applies: true, behind_count: 3, compared_against_origin: true, real_change_paths: [],
    });
    expect(lines.join('\n')).toContain('3 commit(s) behind origin/main');
    expect(lines.join('\n')).toContain('pull before relying on it');
  });

  it('renders a real-changes warning and truncates after 5 paths', () => {
    const paths = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const lines = buildCanonicalMainDriftStatusLines({
      applies: true, behind_count: 0, compared_against_origin: true, real_change_paths: paths,
    });
    expect(lines.join('\n')).toContain('Real changes on canonical main (7)');
    expect(lines.join('\n')).toContain('   - a');
    expect(lines.join('\n')).toContain('   - e');
    expect(lines.join('\n')).not.toContain('   - f');
    expect(lines.join('\n')).toContain('…and 2 more');
  });

  it('renders nothing actionable when clean', () => {
    expect(buildCanonicalMainDriftStatusLines({
      applies: true, behind_count: 0, compared_against_origin: true, real_change_paths: [],
    })).toEqual([]);
  });
});
