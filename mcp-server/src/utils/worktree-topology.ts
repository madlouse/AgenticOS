import { exec } from 'child_process';
import { join, resolve, sep } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type WorktreeTopologyStatus = 'PASS' | 'WARN' | 'BLOCK';
export type WorktreePlacement = 'canonical_main' | 'project_scoped' | 'misplaced';

export interface WorktreeRootResolution {
  requestedWorktreeRoot: string | null;
  expectedWorktreeRoot: string;
  effectiveWorktreeRoot: string;
  deprecatedOverrideUsed: boolean;
  mismatchReason: string | null;
}

export interface WorktreeTopologyEntry {
  path: string;
  branch: string | null;
  upstream: string | null;
  dirty: boolean;
  placement: WorktreePlacement;
  suggested_action: string | null;
}

export interface WorktreeTopologyInspection {
  applies: boolean;
  status: WorktreeTopologyStatus;
  summary: string;
  expected_worktree_root: string | null;
  worktrees: WorktreeTopologyEntry[];
  counts: {
    canonical_main: number;
    project_scoped: number;
    misplaced_clean: number;
    misplaced_dirty: number;
  };
  inspection_errors: string[];
}

interface InspectProjectWorktreeTopologyArgs {
  repoPath: string;
  canonicalProjectPath: string;
  expectedWorktreeRoot: string | null;
}

interface ParsedWorktreeRecord {
  path: string;
  branch: string | null;
}

function normalizePath(path: string): string {
  return resolve(path);
}

export function isPathWithinRoot(candidatePath: string, rootPath: string): boolean {
  const normalizedCandidate = normalizePath(candidatePath);
  const normalizedRoot = normalizePath(rootPath);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}

export function deriveExpectedWorktreeRoot(agenticosHome: string, projectId: string): string {
  return normalizePath(join(agenticosHome, 'worktrees', projectId.trim()));
}

export function resolveProjectWorktreeRoot(args: {
  agenticosHome: string;
  projectId: string;
  requestedWorktreeRoot?: string | null;
}): WorktreeRootResolution {
  const requested = typeof args.requestedWorktreeRoot === 'string' && args.requestedWorktreeRoot.trim().length > 0
    ? normalizePath(args.requestedWorktreeRoot.trim())
    : null;
  const expected = deriveExpectedWorktreeRoot(args.agenticosHome, args.projectId);

  if (requested && requested !== expected) {
    return {
      requestedWorktreeRoot: requested,
      expectedWorktreeRoot: expected,
      effectiveWorktreeRoot: expected,
      deprecatedOverrideUsed: false,
      mismatchReason: `requested worktree_root "${requested}" does not match derived project-scoped root "${expected}" for project "${args.projectId}"`,
    };
  }

  return {
    requestedWorktreeRoot: requested,
    expectedWorktreeRoot: expected,
    effectiveWorktreeRoot: expected,
    deprecatedOverrideUsed: requested !== null,
    mismatchReason: null,
  };
}

function summarizeTopology(counts: WorktreeTopologyInspection['counts'], inspectionErrors: string[]): { status: WorktreeTopologyStatus; summary: string } {
  if (inspectionErrors.length > 0) {
    return {
      status: 'BLOCK',
      summary: `Worktree topology inspection failed: ${inspectionErrors[0]}`,
    };
  }

  if (counts.misplaced_dirty > 0) {
    return {
      status: 'BLOCK',
      summary: `Worktree topology is blocked by ${counts.misplaced_dirty} misplaced dirty worktree(s).`,
    };
  }

  if (counts.misplaced_clean > 0) {
    return {
      status: 'WARN',
      summary: `Worktree topology has ${counts.misplaced_clean} misplaced clean worktree(s).`,
    };
  }

  return {
    status: 'PASS',
    summary: 'Worktree topology matches the derived project-scoped root.',
  };
}

async function runGit(repoPath: string, args: string): Promise<string> {
  const { stdout } = await execAsync(`git -C "${repoPath}" ${args}`);
  return stdout.trim();
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

async function readUpstream(path: string): Promise<string | null> {
  try {
    const upstream = await runGit(path, 'rev-parse --abbrev-ref --symbolic-full-name @{upstream}');
    return upstream || null;
  } catch {
    return null;
  }
}

async function isDirtyWorktree(path: string): Promise<boolean> {
  const output = await runGit(path, 'status --porcelain --untracked-files=all');
  return output.length > 0;
}

export async function inspectProjectWorktreeTopology(args: InspectProjectWorktreeTopologyArgs): Promise<WorktreeTopologyInspection> {
  if (!args.expectedWorktreeRoot) {
    return {
      applies: false,
      status: 'PASS',
      summary: 'Worktree topology does not apply to this project.',
      expected_worktree_root: null,
      worktrees: [],
      counts: {
        canonical_main: 0,
        project_scoped: 0,
        misplaced_clean: 0,
        misplaced_dirty: 0,
      },
      inspection_errors: [],
    };
  }

  const expectedWorktreeRoot = normalizePath(args.expectedWorktreeRoot);
  const inspectionErrors: string[] = [];
  let parsedWorktrees: ParsedWorktreeRecord[] = [];
  let canonicalWorktreeRoot: string | null = null;

  try {
    canonicalWorktreeRoot = normalizePath(await runGit(args.repoPath, 'rev-parse --show-toplevel'));
    parsedWorktrees = parseWorktreeListPorcelain(await runGit(args.repoPath, 'worktree list --porcelain'));
  } catch (error) {
    inspectionErrors.push(error instanceof Error ? error.message : 'failed to list git worktrees');
  }

  const worktrees: WorktreeTopologyEntry[] = [];
  const counts = {
    canonical_main: 0,
    project_scoped: 0,
    misplaced_clean: 0,
    misplaced_dirty: 0,
  };

  for (const record of parsedWorktrees) {
    const canonical = record.path === (canonicalWorktreeRoot as string);
    const placement: WorktreePlacement = canonical
      ? 'canonical_main'
      : isPathWithinRoot(record.path, expectedWorktreeRoot)
        ? 'project_scoped'
        : 'misplaced';

    let dirty = false;
    let upstream: string | null = null;

    try {
      upstream = await readUpstream(record.path);
      dirty = await isDirtyWorktree(record.path);
    } catch (error) {
      inspectionErrors.push(error instanceof Error ? error.message : `failed to inspect worktree ${record.path}`);
      dirty = true;
    }

    const suggestedAction = placement !== 'misplaced'
      ? null
      : dirty
        ? 'stash or commit changes, recreate under the expected worktree root, restore changes, then remove the misplaced worktree'
        : 'recreate under the expected worktree root, verify branch and HEAD, then remove the misplaced worktree';

    worktrees.push({
      path: record.path,
      branch: record.branch,
      upstream,
      dirty,
      placement,
      suggested_action: suggestedAction,
    });

    if (placement === 'canonical_main') {
      counts.canonical_main += 1;
    } else if (placement === 'project_scoped') {
      counts.project_scoped += 1;
    } else if (dirty) {
      counts.misplaced_dirty += 1;
    } else {
      counts.misplaced_clean += 1;
    }
  }

  const { status, summary } = summarizeTopology(counts, inspectionErrors);
  return {
    applies: true,
    status,
    summary,
    expected_worktree_root: expectedWorktreeRoot,
    worktrees,
    counts,
    inspection_errors: inspectionErrors,
  };
}
