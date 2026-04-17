import { access } from 'fs/promises';
import { isAbsolute, resolve } from 'path';
import type { IssueBootstrapRecord } from './guardrail-evidence.js';

export type IssueBootstrapContinuityStatus =
  | 'current'
  | 'historical_for_current_checkout'
  | 'missing_or_invalid';

export interface IssueBootstrapContinuityAssessment {
  status: IssueBootstrapContinuityStatus;
  summary: string;
  reasons: string[];
  recovery_actions: string[];
  details: {
    recorded_repo_path: string | null;
    current_repo_path: string | null;
    repo_path_exists: boolean | null;
    startup_context_paths_checked: number;
    missing_startup_context_paths: string[];
  };
}

function normalizedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function resolveStartupContextPath(path: string, projectPath?: string | null): string | null {
  if (isAbsolute(path)) {
    return resolve(path);
  }

  const normalizedProjectPath = normalizedString(projectPath);
  if (!normalizedProjectPath) {
    return null;
  }

  return resolve(normalizedProjectPath, path);
}

export async function assessIssueBootstrapContinuity(args: {
  bootstrap?: IssueBootstrapRecord | null;
  currentRepoPath?: string | null;
  projectPath?: string | null;
  checkStartupContextPaths?: boolean;
}): Promise<IssueBootstrapContinuityAssessment> {
  const bootstrap = args.bootstrap || null;
  const currentRepoPath = normalizedString(args.currentRepoPath);

  if (!bootstrap) {
    return {
      status: 'missing_or_invalid',
      summary: 'No issue bootstrap evidence is recorded for the current checkout.',
      reasons: ['no issue bootstrap evidence is recorded'],
      recovery_actions: ['run agenticos_issue_bootstrap in the current checkout'],
      details: {
        recorded_repo_path: null,
        current_repo_path: currentRepoPath,
        repo_path_exists: null,
        startup_context_paths_checked: 0,
        missing_startup_context_paths: [],
      },
    };
  }

  const recordedRepoPath = normalizedString(bootstrap.repo_path);
  if (!recordedRepoPath) {
    return {
      status: 'missing_or_invalid',
      summary: 'Latest issue bootstrap evidence is missing repo_path for the current checkout.',
      reasons: ['latest issue bootstrap is missing repo_path evidence'],
      recovery_actions: ['rerun agenticos_issue_bootstrap in the current checkout'],
      details: {
        recorded_repo_path: null,
        current_repo_path: currentRepoPath,
        repo_path_exists: null,
        startup_context_paths_checked: 0,
        missing_startup_context_paths: [],
      },
    };
  }

  const normalizedRecordedRepoPath = resolve(recordedRepoPath);
  const normalizedCurrentRepoPath = currentRepoPath ? resolve(currentRepoPath) : null;
  const repoPathMatchesCurrentCheckout = normalizedCurrentRepoPath !== null
    && normalizedRecordedRepoPath === normalizedCurrentRepoPath;
  const repoPathExists = repoPathMatchesCurrentCheckout
    ? true
    : await pathExists(normalizedRecordedRepoPath);
  const missingStartupContextPaths: string[] = [];
  let startupContextPathsChecked = 0;

  if (args.checkStartupContextPaths !== false) {
    const startupContextPaths = Array.isArray(bootstrap.startup_context_paths)
      ? bootstrap.startup_context_paths
          .map((path) => normalizedString(path))
          .filter((path): path is string => path !== null)
      : [];
    const resolvedStartupContextPaths = startupContextPaths
      .map((path) => resolveStartupContextPath(path, args.projectPath))
      .filter((path): path is string => path !== null);

    startupContextPathsChecked = resolvedStartupContextPaths.length;
    for (const path of resolvedStartupContextPaths) {
      if (!(await pathExists(path))) {
        missingStartupContextPaths.push(path);
      }
    }
  }

  const reasons: string[] = [];
  if (normalizedCurrentRepoPath && normalizedRecordedRepoPath !== normalizedCurrentRepoPath) {
    reasons.push(`recorded repo_path points at "${normalizedRecordedRepoPath}" instead of the current checkout "${normalizedCurrentRepoPath}"`);
  }

  if (!repoPathExists) {
    reasons.push(`recorded repo_path "${normalizedRecordedRepoPath}" no longer exists`);
  }

  if (missingStartupContextPaths.length > 0) {
    reasons.push(`startup context paths include ${missingStartupContextPaths.length} missing historical path(s)`);
  }

  if (reasons.length === 0) {
    return {
      status: 'current',
      summary: 'Latest issue bootstrap evidence is current for this checkout.',
      reasons: [],
      recovery_actions: [],
      details: {
        recorded_repo_path: normalizedRecordedRepoPath,
        current_repo_path: normalizedCurrentRepoPath,
        repo_path_exists: repoPathExists,
        startup_context_paths_checked: startupContextPathsChecked,
        missing_startup_context_paths: [],
      },
    };
  }

  return {
    status: 'historical_for_current_checkout',
    summary: 'Latest issue bootstrap evidence is historical for the current checkout.',
    reasons,
    recovery_actions: ['rerun agenticos_issue_bootstrap in the current checkout'],
    details: {
      recorded_repo_path: normalizedRecordedRepoPath,
      current_repo_path: normalizedCurrentRepoPath,
      repo_path_exists: repoPathExists,
      startup_context_paths_checked: startupContextPathsChecked,
      missing_startup_context_paths: missingStartupContextPaths,
    },
  };
}
