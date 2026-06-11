/// <reference types="vitest/globals" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// worktree-cleanup runs git/gh through promisify(execFile). The shim lets tests
// drive the worktree list, merge/ancestor checks, PR state, and removal results.
const execFileAsyncMock = vi.hoisted(() => vi.fn());
vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('util')>();
  return { ...actual, promisify: () => execFileAsyncMock };
});

import { runWorktreeCleanup } from '../worktree-cleanup.js';

const HOME = process.env.AGENTICOS_HOME || process.env.HOME || '/tmp';
const REPO = `${HOME}/repo`;

interface GitScenario {
  worktrees: Array<{ path: string; branch: string }>;
  canonicalRoot?: string;
  ancestorMergedBranches?: string[];
  prMergedBranches?: string[];
  ghUnavailable?: boolean;
  dirtyBranches?: string[];
  noRemote?: boolean;       // `git remote get-url origin` fails → slug undeterminable
  removeFailBranches?: string[]; // worktree remove fails with a non-dirty error
}

function setupGit(s: GitScenario): void {
  const canonical = s.canonicalRoot ?? REPO;
  const porcelain = s.worktrees
    .map((w) => `worktree ${w.path}\nHEAD deadbeef\nbranch refs/heads/${w.branch}\n`)
    .join('\n');
  execFileAsyncMock.mockImplementation(async (file: string, args: string[]) => {
    if (file === 'git') {
      if (args[0] === 'worktree' && args[1] === 'list') return { stdout: porcelain };
      if (args[0] === 'rev-parse' && args.includes('--show-toplevel')) return { stdout: `${canonical}\n` };
      if (args[0] === 'rev-parse' && args.includes('--abbrev-ref')) return { stdout: 'main\n' };
      if (args[0] === 'fetch') return { stdout: '' };
      if (args[0] === 'rev-parse' && args.includes('--verify')) return { stdout: 'origin-main-sha\n' };
      if (args[0] === 'remote' && args[1] === 'get-url') {
        if (s.noRemote) throw new Error('fatal: No such remote');
        return { stdout: 'https://github.com/madlouse/sample.git\n' };
      }
      if (args[0] === 'merge-base' && args[1] === '--is-ancestor') {
        if ((s.ancestorMergedBranches ?? []).includes(args[2])) return { stdout: '' };
        throw new Error('not an ancestor');
      }
      if (args[0] === 'worktree' && args[1] === 'remove') {
        const wt = s.worktrees.find((w) => w.path === args[2]);
        if (wt && (s.dirtyBranches ?? []).includes(wt.branch)) {
          throw new Error(`fatal: '${args[2]}' contains modified or untracked files, use --force to delete it`);
        }
        if (wt && (s.removeFailBranches ?? []).includes(wt.branch)) {
          throw new Error('fatal: a lock file already exists');
        }
        return { stdout: '' };
      }
      return { stdout: '' };
    }
    if (file === 'gh') {
      if (s.ghUnavailable) throw new Error('gh: command not found');
      const headIdx = args.indexOf('--head');
      const branch = headIdx >= 0 ? args[headIdx + 1] : '';
      return { stdout: (s.prMergedBranches ?? []).includes(branch) ? JSON.stringify([{ number: 1 }]) : '[]' };
    }
    throw new Error(`unexpected exec: ${file}`);
  });
}


describe('runWorktreeCleanup', () => {
  it('returns error when repo_path is missing', async () => {
    const result = await runWorktreeCleanup({});
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('BLOCKED');
    expect(parsed.errors).toContain('repo_path is required');
  });

  it('rejects repo_path outside allowed base paths', async () => {
    const result = await runWorktreeCleanup({ repo_path: '/etc' });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('BLOCKED');
    expect(parsed.errors[0]).toMatch(/must be within allowed base paths/);
  });

  it('rejects relative repo_path', async () => {
    const result = await runWorktreeCleanup({ repo_path: '../etc' });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('BLOCKED');
    expect(parsed.errors[0]).toMatch(/must be an absolute path/);
  });

  it('rejects repo_path equal to base directory itself', async () => {
    const result = await runWorktreeCleanup({ repo_path: process.env.HOME || '/' });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('BLOCKED');
    expect(parsed.errors[0]).toMatch(/must be within allowed base paths/);
  });

  it('returns DRY_RUN status when dry_run is true', async () => {
    const result = await runWorktreeCleanup({ repo_path: '/fake/path', dry_run: true });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('DRY_RUN');
  });

  it('initializes with empty arrays when called with valid path', async () => {
    const result = await runWorktreeCleanup({ repo_path: '/nonexistent' });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('status');
    expect(parsed).toHaveProperty('removed_worktrees');
    expect(parsed).toHaveProperty('remaining_worktrees');
    expect(parsed).toHaveProperty('notes');
    expect(parsed).toHaveProperty('errors');
  });
});

describe('WorktreeCleanupArgs interface', () => {
  it('accepts optional project_path', async () => {
    const result = await runWorktreeCleanup({ repo_path: '/repo', project_path: '/project' });
    const parsed = JSON.parse(result);
    expect(parsed).toBeDefined();
  });

  it('accepts optional branch_name', async () => {
    const result = await runWorktreeCleanup({ repo_path: '/repo', branch_name: 'feat-123' });
    const parsed = JSON.parse(result);
    expect(parsed).toBeDefined();
  });

  it('normalizes refs/heads/ prefix in branch_name', async () => {
    const result = await runWorktreeCleanup({ repo_path: '/repo', branch_name: 'refs/heads/feat-123' });
    const parsed = JSON.parse(result);
    expect(parsed).toBeDefined();
  });

  it('accepts dry_run boolean', async () => {
    const result = await runWorktreeCleanup({ repo_path: '/repo', dry_run: true });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('DRY_RUN');
  });
});

describe('runWorktreeCleanup squash-aware merge detection', () => {
  const FEATURE = `${HOME}/worktrees/feature-x`;

  afterEach(() => {
    execFileAsyncMock.mockReset();
  });

  it('removes a worktree whose branch is an ancestor of origin/base (regular merge)', async () => {
    setupGit({
      worktrees: [
        { path: REPO, branch: 'main' },
        { path: FEATURE, branch: 'feature/x' },
      ],
      ancestorMergedBranches: ['feature/x'],
    });

    const parsed = JSON.parse(await runWorktreeCleanup({ repo_path: REPO }));
    expect(parsed.status).toBe('CLEANED');
    expect(parsed.removed_worktrees).toContain(FEATURE);
    expect(parsed.notes.some((n: string) => n.includes('Removed worktree (merged)'))).toBe(true);
    expect(parsed.remaining_worktrees).toContain(REPO);
  });

  it('removes a squash-merged worktree detected via merged PR (tip not an ancestor)', async () => {
    setupGit({
      worktrees: [
        { path: REPO, branch: 'main' },
        { path: FEATURE, branch: 'feature/x' },
      ],
      ancestorMergedBranches: [], // squash: tip is not an ancestor of origin/main
      prMergedBranches: ['feature/x'],
    });

    const parsed = JSON.parse(await runWorktreeCleanup({ repo_path: REPO }));
    expect(parsed.status).toBe('CLEANED');
    expect(parsed.removed_worktrees).toContain(FEATURE);
    expect(parsed.notes.some((n: string) => n.includes('PR merged (squash)'))).toBe(true);
  });

  it('keeps a worktree that is neither ancestor-merged nor PR-merged', async () => {
    setupGit({
      worktrees: [
        { path: REPO, branch: 'main' },
        { path: FEATURE, branch: 'feature/x' },
      ],
    });

    const parsed = JSON.parse(await runWorktreeCleanup({ repo_path: REPO }));
    expect(parsed.removed_worktrees).toEqual([]);
    expect(parsed.remaining_worktrees).toContain(FEATURE);
    expect(parsed.notes.some((n: string) => n.includes('Skipped (not merged)'))).toBe(true);
  });

  it('flags unknown PR state when gh is unavailable rather than removing', async () => {
    setupGit({
      worktrees: [
        { path: REPO, branch: 'main' },
        { path: FEATURE, branch: 'feature/x' },
      ],
      ghUnavailable: true,
    });

    const parsed = JSON.parse(await runWorktreeCleanup({ repo_path: REPO }));
    expect(parsed.removed_worktrees).toEqual([]);
    expect(parsed.notes.some((n: string) => n.includes('PR state unknown'))).toBe(true);
  });

  it('never auto-removes a done-but-dirty worktree; surfaces it as skipped not error', async () => {
    setupGit({
      worktrees: [
        { path: REPO, branch: 'main' },
        { path: FEATURE, branch: 'feature/x' },
      ],
      ancestorMergedBranches: ['feature/x'],
      dirtyBranches: ['feature/x'],
    });

    const parsed = JSON.parse(await runWorktreeCleanup({ repo_path: REPO }));
    expect(parsed.status).toBe('CLEANED'); // dirty-skip is not an error
    expect(parsed.errors).toEqual([]);
    expect(parsed.removed_worktrees).toEqual([]);
    expect(parsed.remaining_worktrees).toContain(FEATURE);
    expect(parsed.notes.some((n: string) => n.includes('Skipped (dirty'))).toBe(true);
  });

  it('reports would-remove in dry_run without removing', async () => {
    setupGit({
      worktrees: [
        { path: REPO, branch: 'main' },
        { path: FEATURE, branch: 'feature/x' },
      ],
      prMergedBranches: ['feature/x'],
    });

    const parsed = JSON.parse(await runWorktreeCleanup({ repo_path: REPO, dry_run: true }));
    expect(parsed.status).toBe('DRY_RUN');
    expect(parsed.removed_worktrees).toEqual([]);
    expect(parsed.notes.some((n: string) => n.includes('[DRY_RUN] Would remove'))).toBe(true);
  });

  it('falls back to PR-state-unknown when the origin remote cannot be resolved', async () => {
    setupGit({
      worktrees: [
        { path: REPO, branch: 'main' },
        { path: FEATURE, branch: 'feature/x' },
      ],
      noRemote: true, // detectRepoSlug returns null → isBranchMergedViaPr returns null
    });

    const parsed = JSON.parse(await runWorktreeCleanup({ repo_path: REPO }));
    expect(parsed.removed_worktrees).toEqual([]);
    expect(parsed.notes.some((n: string) => n.includes('PR state unknown'))).toBe(true);
  });

  it('records a non-dirty removal failure as an error and BLOCKS', async () => {
    setupGit({
      worktrees: [
        { path: REPO, branch: 'main' },
        { path: FEATURE, branch: 'feature/x' },
      ],
      ancestorMergedBranches: ['feature/x'],
      removeFailBranches: ['feature/x'],
    });

    const parsed = JSON.parse(await runWorktreeCleanup({ repo_path: REPO }));
    expect(parsed.status).toBe('BLOCKED');
    expect(parsed.removed_worktrees).toEqual([]);
    expect(parsed.errors.some((e: string) => e.includes('Failed to remove'))).toBe(true);
  });

  it('only targets the named branch when branch_name is given', async () => {
    setupGit({
      worktrees: [
        { path: REPO, branch: 'main' },
        { path: FEATURE, branch: 'feature/x' },
        { path: `${HOME}/worktrees/feature-y`, branch: 'feature/y' },
      ],
      ancestorMergedBranches: ['feature/x', 'feature/y'],
    });

    const parsed = JSON.parse(await runWorktreeCleanup({ repo_path: REPO, branch_name: 'feature/x' }));
    expect(parsed.removed_worktrees).toEqual([FEATURE]);
    expect(parsed.remaining_worktrees).toContain(`${HOME}/worktrees/feature-y`);
  });
});
