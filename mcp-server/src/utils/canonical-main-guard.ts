import { exec } from 'child_process';
import { resolve } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CanonicalMainGuardResult {
  blocked: boolean;
  reason?: string;
  git_worktree_root?: string;
  current_branch?: string;
  workspace_type?: 'main' | 'isolated_worktree';
}

async function runGit(repoPath: string, args: string): Promise<string> {
  const { stdout } = await execAsync(`git -C "${repoPath}" ${args}`);
  return stdout.trim();
}

function detectWorkspaceTypeFromPorcelain(output: string, gitWorktreeRoot: string): 'main' | 'isolated_worktree' {
  const worktreeLines = output
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.replace(/^worktree\s+/, '').trim());

  if (worktreeLines.length > 0 && resolve(worktreeLines[0]) === resolve(gitWorktreeRoot)) {
    return 'main';
  }
  return 'isolated_worktree';
}

export async function detectCanonicalMainWriteProtection(repoPath: string): Promise<CanonicalMainGuardResult> {
  try {
    const gitWorktreeRoot = await runGit(repoPath, 'rev-parse --show-toplevel');
    const currentBranch = await runGit(repoPath, 'rev-parse --abbrev-ref HEAD');
    const worktreeList = await runGit(repoPath, 'worktree list --porcelain');
    const workspaceType = detectWorkspaceTypeFromPorcelain(worktreeList, gitWorktreeRoot);

    if (currentBranch === 'main' && workspaceType === 'main') {
      return {
        blocked: true,
        reason: `canonical main checkout is not a supported runtime workspace — runtime persistence writes must happen inside isolated issue worktrees`,
        git_worktree_root: gitWorktreeRoot,
        current_branch: currentBranch,
        workspace_type: workspaceType,
      };
    }

    return {
      blocked: false,
      git_worktree_root: gitWorktreeRoot,
      current_branch: currentBranch,
      workspace_type: workspaceType,
    };
  } catch (error) {
    if (error instanceof Error && /not a git repository/i.test(error.message)) {
      return { blocked: false };
    }
    return {
      blocked: true,
      reason: error instanceof Error
        ? `failed to verify canonical main write protection: ${error.message}`
        : 'failed to verify canonical main write protection',
    };
  }
}
