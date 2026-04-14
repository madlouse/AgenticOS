export type CanonicalBranchStatus =
  | 'aligned'
  | 'behind'
  | 'ahead'
  | 'diverged'
  | 'not_on_main'
  | 'unknown';

export interface CanonicalRepoSyncDetails {
  branch_line: string;
  branch_status: CanonicalBranchStatus;
  dirty_paths: string[];
  runtime_dirty_paths: string[];
  source_dirty_paths: string[];
}

export interface CanonicalRepoSyncAnalysis {
  status: 'PASS' | 'BLOCK';
  summary: string;
  details: CanonicalRepoSyncDetails;
  recovery_actions: string[];
}

function classifyBranchStatus(branchLine: string, remoteBaseBranch: string): CanonicalBranchStatus {
  const expectedBranchLine = `## main...${remoteBaseBranch}`;
  if (branchLine === expectedBranchLine) {
    return 'aligned';
  }

  if (branchLine.startsWith(`${expectedBranchLine} `)) {
    const normalized = branchLine.toLowerCase();
    const hasAhead = normalized.includes('ahead');
    const hasBehind = normalized.includes('behind');
    if (hasAhead && hasBehind) return 'diverged';
    if (hasBehind) return 'behind';
    if (hasAhead) return 'ahead';
    return 'unknown';
  }

  if (branchLine.startsWith('## main')) {
    return 'unknown';
  }

  if (branchLine.startsWith('## ')) {
    return 'not_on_main';
  }

  return 'unknown';
}

function parseDirtyPaths(statusOutput: string): string[] {
  return statusOutput
    .trimEnd()
    .split('\n')
    .slice(1)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => line.slice(3).trim())
    .map((path) => {
      const renameParts = path.split(' -> ');
      return renameParts[renameParts.length - 1].replace(/\\/g, '/');
    });
}

function pathMatchesRuntimeEntry(path: string, runtimeManagedEntries: string[]): boolean {
  return runtimeManagedEntries.some((entry) => {
    if (entry.endsWith('/')) {
      return path.startsWith(entry);
    }
    return path === entry;
  });
}

function formatPathList(paths: string[], limit = 5): string {
  const visible = paths.slice(0, limit);
  const suffix = paths.length > limit ? ` (+${paths.length - limit} more)` : '';
  return `${visible.join(', ')}${suffix}`;
}

function buildRecoveryActions(args: {
  branchStatus: CanonicalBranchStatus;
  branchLine: string;
  remoteBaseBranch: string;
  runtimeDirtyPaths: string[];
  sourceDirtyPaths: string[];
}): string[] {
  const actions: string[] = [];
  const { branchStatus, branchLine, remoteBaseBranch, runtimeDirtyPaths, sourceDirtyPaths } = args;

  switch (branchStatus) {
    case 'behind':
      actions.push(`fast-forward canonical main to ${remoteBaseBranch} before treating it as a trusted base checkout`);
      break;
    case 'ahead':
    case 'diverged':
      actions.push(`realign canonical main with ${remoteBaseBranch}; do not cut new issue work from branch state "${branchLine}"`);
      break;
    case 'not_on_main':
      actions.push(`return the canonical checkout to main tracking ${remoteBaseBranch} before using it as the trusted base`);
      break;
    case 'unknown':
      actions.push(`inspect canonical branch status "${branchLine || 'missing branch status'}" and restore exact main...${remoteBaseBranch} alignment`);
      break;
    case 'aligned':
      break;
  }

  if (runtimeDirtyPaths.length > 0) {
    actions.push(`discard or isolate runtime-managed drift from the canonical checkout: ${formatPathList(runtimeDirtyPaths)}`);
  }

  if (sourceDirtyPaths.length > 0) {
    actions.push(`review, move, or revert source-tree edits before trusting the canonical checkout: ${formatPathList(sourceDirtyPaths)}`);
  }

  if (runtimeDirtyPaths.length > 0 || sourceDirtyPaths.length > 0) {
    actions.push('keep new implementation work inside isolated issue worktrees rather than the canonical main checkout');
  }

  return actions;
}

export function analyzeCanonicalRepoSync(args: {
  statusOutput: string;
  remoteBaseBranch: string;
  runtimeManagedEntries?: string[];
}): CanonicalRepoSyncAnalysis {
  const lines = args.statusOutput.trimEnd().split('\n');
  const branchLine = lines[0] || '';
  const branchStatus = classifyBranchStatus(branchLine, args.remoteBaseBranch);
  const dirtyPaths = parseDirtyPaths(args.statusOutput);
  const runtimeManagedEntries = args.runtimeManagedEntries || [];
  const runtimeDirtyPaths = dirtyPaths.filter((path) => pathMatchesRuntimeEntry(path, runtimeManagedEntries));
  const sourceDirtyPaths = dirtyPaths.filter((path) => !pathMatchesRuntimeEntry(path, runtimeManagedEntries));

  const details: CanonicalRepoSyncDetails = {
    branch_line: branchLine,
    branch_status: branchStatus,
    dirty_paths: dirtyPaths,
    runtime_dirty_paths: runtimeDirtyPaths,
    source_dirty_paths: sourceDirtyPaths,
  };

  if (branchStatus === 'aligned' && dirtyPaths.length === 0) {
    return {
      status: 'PASS',
      summary: `Canonical checkout is clean and aligned with ${args.remoteBaseBranch}.`,
      details,
      recovery_actions: [],
    };
  }

  const summaryParts: string[] = [];
  if (branchStatus !== 'aligned') {
    summaryParts.push(`branch misalignment: ${branchLine || 'missing branch status'}`);
  }
  if (runtimeDirtyPaths.length > 0) {
    summaryParts.push(`runtime-managed drift: ${runtimeDirtyPaths.length} path(s)`);
  }
  if (sourceDirtyPaths.length > 0) {
    summaryParts.push(`source-tree edits: ${sourceDirtyPaths.length} path(s)`);
  }

  return {
    status: 'BLOCK',
    summary: `Canonical checkout is blocked by ${summaryParts.join('; ')}.`,
    details,
    recovery_actions: buildRecoveryActions({
      branchStatus,
      branchLine,
      remoteBaseBranch: args.remoteBaseBranch,
      runtimeDirtyPaths,
      sourceDirtyPaths,
    }),
  };
}
