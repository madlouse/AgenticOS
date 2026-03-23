import { exec } from 'child_process';
import { access, mkdir } from 'fs/promises';
import { basename, join } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface BranchBootstrapArgs {
  issue_id?: string;
  branch_type?: string;
  slug?: string;
  repo_path?: string;
  remote_base_branch?: string;
  worktree_root?: string;
}

interface BranchBootstrapResult {
  status: 'CREATED' | 'BLOCK';
  branch_name: string;
  base_commit: string;
  worktree_path: string;
  notes: string[];
  block_reasons: string[];
}

async function runGit(repoPath: string, args: string): Promise<string> {
  const { stdout } = await execAsync(`git -C "${repoPath}" ${args}`);
  return stdout.trim();
}

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function makeBaseResult(): BranchBootstrapResult {
  return {
    status: 'BLOCK',
    branch_name: '',
    base_commit: '',
    worktree_path: '',
    notes: [],
    block_reasons: [],
  };
}

export async function runBranchBootstrap(args: BranchBootstrapArgs): Promise<string> {
  const {
    issue_id,
    branch_type = 'feat',
    slug,
    repo_path,
    remote_base_branch = 'origin/main',
    worktree_root,
  } = args;

  const result = makeBaseResult();

  if (!issue_id) {
    result.block_reasons.push('issue_id is required');
  }
  if (!slug) {
    result.block_reasons.push('slug is required');
  }
  if (!repo_path) {
    result.block_reasons.push('repo_path is required');
  }
  if (!worktree_root) {
    result.block_reasons.push('worktree_root is required');
  }

  if (result.block_reasons.length > 0 || !slug || !repo_path || !worktree_root || !issue_id) {
    return JSON.stringify(result, null, 2);
  }

  const sanitizedSlug = sanitizeSegment(slug);
  if (!sanitizedSlug) {
    result.block_reasons.push('slug must contain at least one alphanumeric character');
    return JSON.stringify(result, null, 2);
  }

  const repoName = sanitizeSegment(basename(repo_path)) || 'repo';
  result.branch_name = `${branch_type}/${issue_id}-${sanitizedSlug}`;
  result.worktree_path = join(worktree_root, `${repoName}-${issue_id}-${sanitizedSlug}`);

  try {
    result.base_commit = await runGit(repo_path, `rev-parse ${remote_base_branch}`);
  } catch {
    result.block_reasons.push(`failed to resolve remote base ${remote_base_branch}`);
    return JSON.stringify(result, null, 2);
  }

  try {
    await runGit(repo_path, `show-ref --verify --quiet refs/heads/${result.branch_name}`);
    result.block_reasons.push(`branch already exists: ${result.branch_name}`);
  } catch {
    // Expected when the branch does not yet exist.
  }

  if (await pathExists(result.worktree_path)) {
    result.block_reasons.push(`worktree path already exists: ${result.worktree_path}`);
  }

  if (result.block_reasons.length > 0) {
    return JSON.stringify(result, null, 2);
  }

  await mkdir(worktree_root, { recursive: true });
  await runGit(
    repo_path,
    `worktree add "${result.worktree_path}" -b ${result.branch_name} ${result.base_commit}`
  );

  result.status = 'CREATED';
  result.notes.push(`created branch ${result.branch_name} from ${remote_base_branch}`);
  result.notes.push(`created isolated worktree at ${result.worktree_path}`);
  return JSON.stringify(result, null, 2);
}
