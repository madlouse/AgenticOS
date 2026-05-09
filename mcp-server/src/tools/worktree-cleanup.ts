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

async function isBranchMerged(repoPath: string, branchName: string | null, baseBranch: string): Promise<boolean> {
  if (!branchName) return false;
  try {
    await runGit(repoPath, ['merge-base', '--is-ancestor', branchName, baseBranch]);
    return true;
  } catch {
    return false;
  }
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

    // Determine base branch for merge detection
    const baseBranch = await runGit(repo_path, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'main');

    // Find worktrees to remove
    for (const wt of worktrees) {
      // Skip canonical checkout
      if (wt.path === canonicalRoot) {
        result.remaining_worktrees.push(wt.path);
        continue;
      }

      // If branch_name is specified, only remove that one
      if (branch_name && wt.branch !== branch_name) {
        result.remaining_worktrees.push(wt.path);
        continue;
      }

      // Check if worktree branch is merged into base branch
      const isMerged = await isBranchMerged(repo_path, wt.branch, baseBranch);

      if (isMerged) {
        if (dry_run) {
          result.notes.push(`[DRY_RUN] Would remove: ${wt.path} (branch: ${wt.branch})`);
        } else {
          try {
            await runGit(repo_path, ['worktree', 'remove', wt.path]);
            result.removed_worktrees.push(wt.path);
            result.notes.push(`Removed worktree: ${wt.path}`);
          } catch (error) {
            result.errors.push(`Failed to remove ${wt.path}: ${error instanceof Error ? error.message : 'unknown error'}`);
            result.remaining_worktrees.push(wt.path);
          }
        }
      } else {
        result.remaining_worktrees.push(wt.path);
        result.notes.push(`Skipped (not merged): ${wt.path} (branch: ${wt.branch})`);
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
