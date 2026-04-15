import { resolve } from 'path';

export type VersionedEntrySurfaceFreshness = 'fresh' | 'stale' | 'unproven' | 'not_applicable';

export interface VersionedEntrySurfaceAssessment {
  applies: boolean;
  freshness: VersionedEntrySurfaceFreshness;
  status: 'PASS' | 'WARN';
  summary: string;
  reasons: string[];
  details: {
    topology: string | null;
    refresh_status: string | null;
    has_refresh_metadata: boolean;
    current_task_status: string | null;
    issue_bootstrap_branch: string | null;
    issue_bootstrap_workspace_type: string | null;
    issue_bootstrap_repo_path: string | null;
  };
}

function normalizedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function assessVersionedEntrySurfaceState(args: {
  projectYaml?: any;
  state?: any;
  projectPath?: string;
}): VersionedEntrySurfaceAssessment {
  const topology = normalizedString(args.projectYaml?.source_control?.topology);
  const state = args.state && typeof args.state === 'object' ? args.state : {};
  const refreshStatus = normalizedString(state.entry_surface_refresh?.status);
  const currentTaskStatus = normalizedString(state.current_task?.status);
  const issueBootstrapBranch = normalizedString(state.issue_bootstrap?.latest?.current_branch);
  const issueBootstrapWorkspaceType = normalizedString(state.issue_bootstrap?.latest?.workspace_type);
  const issueBootstrapRepoPath = normalizedString(state.issue_bootstrap?.latest?.repo_path);
  const hasRefreshMetadata = Boolean(
    normalizedString(state.entry_surface_refresh?.refreshed_at) ||
    normalizedString(state.session?.last_entry_surface_refresh),
  );

  const details = {
    topology,
    refresh_status: refreshStatus,
    has_refresh_metadata: hasRefreshMetadata,
    current_task_status: currentTaskStatus,
    issue_bootstrap_branch: issueBootstrapBranch,
    issue_bootstrap_workspace_type: issueBootstrapWorkspaceType,
    issue_bootstrap_repo_path: issueBootstrapRepoPath,
  };

  if (topology !== 'github_versioned') {
    return {
      applies: false,
      freshness: 'not_applicable',
      status: 'PASS',
      summary: 'Committed versioned snapshot freshness is only evaluated for github_versioned projects.',
      reasons: [],
      details,
    };
  }

  const reasons: string[] = [];

  if (currentTaskStatus === 'in_progress') {
    reasons.push('current_task is still marked in_progress in committed state');
  }

  if (refreshStatus === 'in_progress') {
    reasons.push('entry_surface_refresh still reports in_progress in committed state');
  }

  if (issueBootstrapBranch && issueBootstrapBranch !== 'main') {
    reasons.push(`issue bootstrap still points at non-main branch "${issueBootstrapBranch}"`);
  }

  if (issueBootstrapWorkspaceType === 'isolated_worktree') {
    reasons.push('issue bootstrap still points at an isolated worktree snapshot');
  }

  if (args.projectPath && issueBootstrapRepoPath && resolve(issueBootstrapRepoPath) !== resolve(args.projectPath)) {
    reasons.push(`issue bootstrap repo_path still points at "${issueBootstrapRepoPath}" instead of the canonical project root`);
  }

  if (reasons.length > 0) {
    return {
      applies: true,
      freshness: 'stale',
      status: 'WARN',
      summary: 'Committed versioned entry surfaces look stale for canonical mainline use.',
      reasons,
      details,
    };
  }

  if (!hasRefreshMetadata) {
    return {
      applies: true,
      freshness: 'unproven',
      status: 'WARN',
      summary: 'Committed versioned entry surface freshness is not proven.',
      reasons: ['entry surfaces do not yet have explicit refresh metadata'],
      details,
    };
  }

  return {
    applies: true,
    freshness: 'fresh',
    status: 'PASS',
    summary: 'Committed versioned entry surfaces look fresh for canonical mainline use.',
    reasons: [],
    details,
  };
}
