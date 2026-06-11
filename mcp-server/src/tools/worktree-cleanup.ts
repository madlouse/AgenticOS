import { execFile } from 'child_process';
import { join, resolve } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface WorktreeCleanupArgs {
  repo_path?: string;
  project_path?: string;
  branch_name?: string;
  dry_run?: boolean;
}

interface WorktreeCleanupResult {
  status: 'CLEANED' | 'BLOCKED' | 'DRY_RUN';
  removed_worktrees: string[];
  remaining_worktrees: string[];
  notes: string[];
  errors: string[];
}

const ALLOWED_BASE_PATHS = [
  process.env.AGENTICOS_HOME,
  process.env.HOME,
].filter((p): p is string => typeof p === 'string');

function validateRepoPath(repoPath: string): string | null {
  // Must be absolute path (reject relative paths)
  if (!repoPath.startsWith('/')) {
    return 'repo_path must be an absolute path';
  }
  const normalized = resolve(repoPath);
  const allowed = ALLOWED_BASE_PATHS.some((base) => normalized.startsWith(`${base}/`));
  if (!allowed) {
    return `repo_path must be within allowed base paths: ${ALLOWED_BASE_PATHS.join(', ')}`;
  }
  return null;
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, timeout: 30000 });
  return stdout.trim();
}

function normalizePath(path: string): string {
  return resolve(path);
}

interface ParsedWorktreeRecord {
  path: string;
  branch: string | null;
}

function parseWorktreeListPorcelain(output: string): ParsedWorktreeRecord[] {
  const records: ParsedWorktreeRecord[] = [];
  const blocks = output
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  for (const block of blocks) {
    let path: string | null = null;
    let branch: string | null = null;
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) {
        path = line.replace(/^worktree\s+/, '').trim();
      } else if (line.startsWith('branch ')) {
        branch = line.replace(/^branch\s+/, '').trim().replace(/^refs\/heads\//, '');
      }
    }
    if (path) {
      records.push({
        path: normalizePath(path),
        branch,
      });
    }
  }
  return records;
}

async function isBranchMerged(repoPath: string, branchName: string | null, compareRef: string): Promise<boolean> {
  if (!branchName) return false;
  try {
    await runGit(repoPath, ['merge-base', '--is-ancestor', branchName, compareRef]);
    return true;
  } catch {
    return false;
  }
}

/** OWNER/REPO from the origin remote, or null if it cannot be determined. */
async function detectRepoSlug(repoPath: string): Promise<string | null> {
  try {
    const url = await runGit(repoPath, ['remote', 'get-url', 'origin']);
    const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Whether the branch's PR is merged. Returns true/false, or null when the PR
 * state cannot be determined (gh missing/unauthed/offline) — callers fall back
 * to the ancestor-merge check. This is what makes squash-merged worktrees (whose
 * tips are not ancestors of main) detectable as done.
 */
async function isBranchMergedViaPr(slug: string | null, branchName: string | null): Promise<boolean | null> {
  if (!slug || !branchName) return null;
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'list', '-R', slug, '--head', branchName, '--state', 'merged', '--json', 'number', '--limit', '1'],
      { timeout: 15000 },
    );
    const parsed = JSON.parse(stdout || '[]');
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return null;
  }
}

function isDirtyWorktreeRemovalError(message: string): boolean {
  return /contains modified or untracked files|use .*--force|is dirty/i.test(message);
}

export async function runWorktreeCleanup(args: WorktreeCleanupArgs): Promise<string> {
  const {
    repo_path,
    branch_name,
    dry_run = false,
  } = args;

  const result: WorktreeCleanupResult = {
    status: dry_run ? 'DRY_RUN' : 'BLOCKED',
    removed_worktrees: [],
    remaining_worktrees: [],
    notes: [],
    errors: [],
  };

  // Validate inputs
  if (!repo_path) {
    result.errors.push('repo_path is required');
    return JSON.stringify(result, null, 2);
  }

  const validationError = validateRepoPath(repo_path);
  if (validationError) {
    result.errors.push(validationError);
    return JSON.stringify(result, null, 2);
  }

  try {
    // Get all worktrees
    const worktreeOutput = await runGit(repo_path, ['worktree', 'list', '--porcelain']);
    const worktrees = parseWorktreeListPorcelain(worktreeOutput);
    const canonicalRoot = normalizePath(await runGit(repo_path, ['rev-parse', '--show-toplevel']));

    // Determine base branch for merge detection and compare against origin so
    // detection is not fooled by a stale local main.
    const baseBranch = await runGit(repo_path, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'main');
    await runGit(repo_path, ['fetch', 'origin', baseBranch]).catch(() => {});
    const compareRef = await runGit(repo_path, ['rev-parse', '--verify', '--quiet', `origin/${baseBranch}`])
      .then(() => `origin/${baseBranch}`)
      .catch(() => baseBranch);
    const repoSlug = await detectRepoSlug(repo_path);

    // Find worktrees to remove
    for (const wt of worktrees) {
      // Skip canonical checkout
      if (wt.path === canonicalRoot) {
        result.remaining_worktrees.push(wt.path);
        continue;
      }

      // If branch_name is specified, only remove that one
      // Normalize branch_name by stripping refs/heads/ prefix to match porcelain parser
      const normalizedFilterBranch = branch_name?.replace(/^refs\/heads\//, '');
      if (normalizedFilterBranch && wt.branch !== normalizedFilterBranch) {
        result.remaining_worktrees.push(wt.path);
        continue;
      }

      // A worktree is "done" when its branch is an ancestor of origin/base
      // (regular merge) OR its PR is merged (squash merge, where the tip is not
      // an ancestor). The PR check is what unblocks squash-merge workflows.
      const ancestorMerged = await isBranchMerged(repo_path, wt.branch, compareRef);
      const prMerged = ancestorMerged ? false : await isBranchMergedViaPr(repoSlug, wt.branch);
      const done = ancestorMerged || prMerged === true;

      if (!done) {
        result.remaining_worktrees.push(wt.path);
        const reason = prMerged === null
          ? 'not merged (PR state unknown — gh unavailable)'
          : 'not merged';
        result.notes.push(`Skipped (${reason}): ${wt.path} (branch: ${wt.branch})`);
        continue;
      }

      const doneVia = ancestorMerged ? 'merged' : 'PR merged (squash)';
      if (dry_run) {
        result.notes.push(`[DRY_RUN] Would remove: ${wt.path} (branch: ${wt.branch}, ${doneVia})`);
        continue;
      }

      try {
        // No --force: git refuses to remove a worktree with uncommitted or
        // untracked changes, which is the safety floor we want.
        await runGit(repo_path, ['worktree', 'remove', wt.path]);
        result.removed_worktrees.push(wt.path);
        result.notes.push(`Removed worktree (${doneVia}): ${wt.path}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        result.remaining_worktrees.push(wt.path);
        if (isDirtyWorktreeRemovalError(message)) {
          // Done-but-dirty: never auto-remove; surface for manual review.
          result.notes.push(`Skipped (dirty — has uncommitted/untracked changes): ${wt.path} (branch: ${wt.branch})`);
        } else {
          result.errors.push(`Failed to remove ${wt.path}: ${message}`);
        }
      }
    }

    if (result.errors.length > 0) {
      result.status = 'BLOCKED';
    } else if (!dry_run) {
      result.status = 'CLEANED';
    }
  } catch (error) {
    result.errors.push(`Cleanup failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  return JSON.stringify(result, null, 2);
}
