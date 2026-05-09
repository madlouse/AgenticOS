import { exec } from 'child_process';
import { join, resolve } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

async function runGit(repoPath: string, args: string): Promise<string> {
  const { stdout } = await execAsync(`git -C "${repoPath}" ${args}`);
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

export async function runWorktreeCleanup(args: WorktreeCleanupArgs): Promise<string> {
  const {
    repo_path,
    project_path,
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

  try {
    // Get all worktrees
    const worktreeOutput = await runGit(repo_path, 'worktree list --porcelain');
    const worktrees = parseWorktreeListPorcelain(worktreeOutput);
    const canonicalRoot = normalizePath(await runGit(repo_path, 'rev-parse --show-toplevel'));

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

      // Check if worktree is merged (no upstream or upstream is main/master)
      let isMerged = false;
      try {
        const upstream = await runGit(wt.path, 'rev-parse --abbrev-ref --symbolic-full-name @{upstream}');
        if (!upstream || upstream.includes('/main') || upstream.includes('/master')) {
          isMerged = true;
        }
      } catch {
        // No upstream means it's a feature branch
        isMerged = true;
      }

      if (isMerged) {
        if (dry_run) {
          result.notes.push(`[DRY_RUN] Would remove: ${wt.path} (branch: ${wt.branch})`);
        } else {
          try {
            await runGit(repo_path, `worktree remove "${wt.path}"`);
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

    if (result.removed_worktrees.length > 0 || result.errors.length > 0) {
      result.status = result.errors.length > 0 ? 'BLOCKED' : 'CLEANED';
    }
  } catch (error) {
    result.errors.push(`Cleanup failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  return JSON.stringify(result, null, 2);
}
