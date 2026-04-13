import { exec } from 'child_process';
import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { promisify } from 'util';
import yaml from 'yaml';
import { persistGuardrailEvidence, type GuardrailPersistenceResult } from '../utils/guardrail-evidence.js';
import { resolveGuardrailProjectTarget } from '../utils/repo-boundary.js';
import { matchesRuntimeReviewExcludedPath, resolveRuntimeReviewSurfacePaths } from '../utils/runtime-review-surface.js';

const execAsync = promisify(exec);

interface PrScopeCheckArgs {
  issue_id?: string;
  repo_path?: string;
  project_path?: string;
  remote_base_branch?: string;
  declared_target_files?: string[];
  expected_issue_scope?: string;
}

interface PrScopeCheckResult {
  status: 'PASS' | 'BLOCK';
  summary: string;
  commit_count: number;
  changed_files: string[];
  runtime_managed_files: string[];
  private_raw_transcript_files: string[];
  unexpected_files: string[];
  unrelated_commit_subjects: string[];
  branch_ancestry_verified: boolean;
  remote_base_branch: string;
  branch_fork_point: string;
  expected_issue_scope: string;
  block_reasons: string[];
  persistence?: GuardrailPersistenceResult;
}

async function runGit(repoPath: string, args: string): Promise<string> {
  const { stdout } = await execAsync(`git -C "${repoPath}" ${args}`);
  return stdout.trim();
}

async function loadProjectYaml(projectYamlPath: string): Promise<any> {
  return yaml.parse(await readFile(projectYamlPath, 'utf-8')) || {};
}

function normalizeLines(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternToRegex(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/');
  let source = '^';

  for (let index = 0; index < normalized.length; ) {
    if (normalized.startsWith('**', index)) {
      source += '.*';
      index += 2;
      continue;
    }

    if (normalized.startsWith('...', index)) {
      source += '.*';
      index += 3;
      continue;
    }

    if (normalized[index] === '*') {
      source += '[^/]*';
      index += 1;
      continue;
    }

    source += escapeRegex(normalized[index]);
    index += 1;
  }

  return new RegExp(`${source}$`);
}

function fileMatchesDeclaredScope(file: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const normalizedPattern = pattern.endsWith('/') ? `${pattern}**` : pattern;
    return patternToRegex(normalizedPattern).test(file);
  });
}

function makeBaseResult(remoteBaseBranch: string, expectedIssueScope: string): PrScopeCheckResult {
  return {
    status: 'BLOCK',
    summary: '',
    commit_count: 0,
    changed_files: [],
    runtime_managed_files: [],
    private_raw_transcript_files: [],
    unexpected_files: [],
    unrelated_commit_subjects: [],
    branch_ancestry_verified: false,
    remote_base_branch: remoteBaseBranch,
    branch_fork_point: '',
    expected_issue_scope: expectedIssueScope,
    block_reasons: [],
  };
}

export async function runPrScopeCheck(args: PrScopeCheckArgs): Promise<string> {
  const {
    issue_id,
    repo_path,
    project_path,
    remote_base_branch = 'origin/main',
    declared_target_files = [],
    expected_issue_scope = 'unspecified',
  } = args;

  const result = makeBaseResult(remote_base_branch, expected_issue_scope);
  const projectResolution = await resolveGuardrailProjectTarget({
    commandName: 'agenticos_pr_scope_check',
    repoPath: repo_path,
    projectPath: project_path,
  });

  if (!issue_id) {
    result.block_reasons.push('issue_id is required');
  }
  if (!repo_path) {
    result.block_reasons.push('repo_path is required');
  }
  if (declared_target_files.length === 0) {
    result.block_reasons.push('declared_target_files is required');
  }
  if (!projectResolution.targetProject) {
    result.block_reasons.push(...projectResolution.resolutionErrors);
  }

  if (result.block_reasons.length > 0 || !repo_path || !issue_id || declared_target_files.length === 0) {
    result.summary = result.block_reasons.join('; ');
    result.persistence = await persistGuardrailEvidence({
      command: 'agenticos_pr_scope_check',
      repo_path,
      project_path: projectResolution.targetProject?.path || project_path,
      payload: {
        issue_id: issue_id || null,
        target_project_id: projectResolution.targetProject?.id || null,
        remote_base_branch,
        declared_target_files,
        expected_issue_scope,
        result: {
          status: result.status,
          summary: result.summary,
          commit_count: result.commit_count,
          changed_files: result.changed_files,
          runtime_managed_files: result.runtime_managed_files,
          private_raw_transcript_files: result.private_raw_transcript_files,
          unexpected_files: result.unexpected_files,
          unrelated_commit_subjects: result.unrelated_commit_subjects,
          branch_ancestry_verified: result.branch_ancestry_verified,
          remote_base_branch: result.remote_base_branch,
          branch_fork_point: result.branch_fork_point,
          expected_issue_scope: result.expected_issue_scope,
          block_reasons: result.block_reasons,
        },
      },
    });
    return JSON.stringify(result, null, 2);
  }

  let gitCommonRepoRoot: string | null = null;
  let gitRemoteOrigin: string | null = null;
  let gitWorktreeRoot: string | null = null;

  try {
    gitWorktreeRoot = await runGit(repo_path, 'rev-parse --show-toplevel');
    const gitCommonDir = resolve(gitWorktreeRoot, await runGit(repo_path, 'rev-parse --git-common-dir'));
    gitCommonRepoRoot = dirname(gitCommonDir);
    gitRemoteOrigin = await runGit(repo_path, 'config --get remote.origin.url').catch(() => null);

    if (!projectResolution.targetProject?.sourceRepoRootsDeclared || projectResolution.targetProject.sourceRepoRoots.length === 0) {
      result.block_reasons.push(
        `target project "${projectResolution.targetProject?.id || 'unknown'}" is missing execution.source_repo_roots in ${projectResolution.targetProject?.projectYamlPath || 'unknown project metadata'}`,
      );
    } else if (!projectResolution.targetProject.sourceRepoRoots.includes(gitCommonRepoRoot)) {
      result.block_reasons.push(
        `git common repo root "${gitCommonRepoRoot}" is not declared for target project "${projectResolution.targetProject.id}"`,
      );
    }

    await runGit(repo_path, `rev-parse ${remote_base_branch}`);
    result.branch_fork_point = await runGit(repo_path, `merge-base HEAD ${remote_base_branch}`);
    result.branch_ancestry_verified = true;
  } catch {
    result.block_reasons.push(`current branch is not comparable to ${remote_base_branch}`);
    result.summary = result.block_reasons.join('; ');
    result.persistence = await persistGuardrailEvidence({
      command: 'agenticos_pr_scope_check',
      repo_path,
      project_path: projectResolution.targetProject?.path || project_path,
      payload: {
        issue_id,
        target_project_id: projectResolution.targetProject?.id || null,
        active_project: projectResolution.activeProjectId,
        git_common_repo_root: gitCommonRepoRoot,
        git_remote_origin: gitRemoteOrigin,
        remote_base_branch,
        declared_target_files,
        expected_issue_scope,
        result: {
          status: result.status,
          summary: result.summary,
          commit_count: result.commit_count,
          changed_files: result.changed_files,
          runtime_managed_files: result.runtime_managed_files,
          private_raw_transcript_files: result.private_raw_transcript_files,
          unexpected_files: result.unexpected_files,
          unrelated_commit_subjects: result.unrelated_commit_subjects,
          branch_ancestry_verified: result.branch_ancestry_verified,
          remote_base_branch: result.remote_base_branch,
          branch_fork_point: result.branch_fork_point,
          expected_issue_scope: result.expected_issue_scope,
          block_reasons: result.block_reasons,
        },
      },
    });
    return JSON.stringify(result, null, 2);
  }

  const subjects = normalizeLines(
    await runGit(repo_path, `log --format=%s ${remote_base_branch}..HEAD`).catch(() => ''),
  );
  const changedFiles = normalizeLines(
    await runGit(repo_path, `diff --name-only ${remote_base_branch}...HEAD`).catch(() => ''),
  );
  const projectYaml = await loadProjectYaml(projectResolution.targetProject!.projectYamlPath);
  let runtimeSurfacePaths;
  try {
    runtimeSurfacePaths = resolveRuntimeReviewSurfacePaths(
      projectResolution.targetProject!.path,
      projectYaml,
      {
        include_claude_state_mirror: true,
        repo_root: gitWorktreeRoot,
        fail_closed_on_context_policy_error: true,
      },
    );
  } catch (error: any) {
    result.block_reasons.push(error?.message || 'failed to resolve runtime review surface paths');
    result.summary = result.block_reasons.join('; ');
    result.persistence = await persistGuardrailEvidence({
      command: 'agenticos_pr_scope_check',
      repo_path,
      project_path: projectResolution.targetProject?.path || project_path,
      payload: {
        issue_id,
        target_project_id: projectResolution.targetProject?.id || null,
        active_project: projectResolution.activeProjectId,
        git_common_repo_root: gitCommonRepoRoot,
        git_remote_origin: gitRemoteOrigin,
        remote_base_branch,
        declared_target_files,
        expected_issue_scope,
        result: {
          status: result.status,
          summary: result.summary,
          commit_count: result.commit_count,
          changed_files: result.changed_files,
          runtime_managed_files: result.runtime_managed_files,
          private_raw_transcript_files: result.private_raw_transcript_files,
          unexpected_files: result.unexpected_files,
          unrelated_commit_subjects: result.unrelated_commit_subjects,
          branch_ancestry_verified: result.branch_ancestry_verified,
          remote_base_branch: result.remote_base_branch,
          branch_fork_point: result.branch_fork_point,
          expected_issue_scope: result.expected_issue_scope,
          block_reasons: result.block_reasons,
        },
      },
    });
    return JSON.stringify(result, null, 2);
  }
  const runtimeTrackedPaths = runtimeSurfacePaths.tracked_review_excluded_paths;
  const privateTranscriptPaths = runtimeSurfacePaths.private_transcript_blocked_paths;

  result.commit_count = subjects.length;
  result.changed_files = changedFiles;
  result.runtime_managed_files = changedFiles.filter((file) => matchesRuntimeReviewExcludedPath(file, runtimeTrackedPaths));
  result.private_raw_transcript_files = changedFiles.filter((file) => matchesRuntimeReviewExcludedPath(file, privateTranscriptPaths));
  result.unrelated_commit_subjects = subjects.filter((subject) => !subject.includes(`#${issue_id}`));
  const productReviewFiles = changedFiles.filter((file) =>
    !matchesRuntimeReviewExcludedPath(file, runtimeTrackedPaths)
    && !matchesRuntimeReviewExcludedPath(file, privateTranscriptPaths));
  result.unexpected_files = productReviewFiles.filter((file) => !fileMatchesDeclaredScope(file, declared_target_files));

  if (result.unrelated_commit_subjects.length > 0) {
    result.block_reasons.push(`branch includes unrelated commits relative to ${remote_base_branch}`);
  }

  if (result.runtime_managed_files.length > 0 && productReviewFiles.length > 0) {
    result.block_reasons.push('runtime-managed files are mixed into a normal product review slice');
  }

  if (result.private_raw_transcript_files.length > 0) {
    result.block_reasons.push('private raw transcript paths appear in tracked review scope');
  }

  if (result.unexpected_files.length > 0) {
    result.block_reasons.push('changed files escape the declared target scope');
  }

  if (result.block_reasons.length > 0) {
    result.status = 'BLOCK';
    result.summary = result.block_reasons.join('; ');
    result.persistence = await persistGuardrailEvidence({
      command: 'agenticos_pr_scope_check',
      repo_path,
      project_path: projectResolution.targetProject?.path || project_path,
      payload: {
        issue_id,
        target_project_id: projectResolution.targetProject?.id || null,
        active_project: projectResolution.activeProjectId,
        git_common_repo_root: gitCommonRepoRoot,
        git_remote_origin: gitRemoteOrigin,
        remote_base_branch,
        declared_target_files,
        expected_issue_scope,
        result: {
          status: result.status,
          summary: result.summary,
          commit_count: result.commit_count,
          changed_files: result.changed_files,
          runtime_managed_files: result.runtime_managed_files,
          private_raw_transcript_files: result.private_raw_transcript_files,
          unexpected_files: result.unexpected_files,
          unrelated_commit_subjects: result.unrelated_commit_subjects,
          branch_ancestry_verified: result.branch_ancestry_verified,
          remote_base_branch: result.remote_base_branch,
          branch_fork_point: result.branch_fork_point,
          expected_issue_scope: result.expected_issue_scope,
          block_reasons: result.block_reasons,
        },
      },
    });
    return JSON.stringify(result, null, 2);
  }

  result.status = 'PASS';
  result.summary = 'pr scope check passed';
  result.persistence = await persistGuardrailEvidence({
    command: 'agenticos_pr_scope_check',
    repo_path,
    project_path: projectResolution.targetProject?.path || project_path,
    payload: {
      issue_id,
      target_project_id: projectResolution.targetProject?.id || null,
      active_project: projectResolution.activeProjectId,
      git_common_repo_root: gitCommonRepoRoot,
      git_remote_origin: gitRemoteOrigin,
      remote_base_branch,
      declared_target_files,
      expected_issue_scope,
      result: {
        status: result.status,
        summary: result.summary,
        commit_count: result.commit_count,
        changed_files: result.changed_files,
        runtime_managed_files: result.runtime_managed_files,
        private_raw_transcript_files: result.private_raw_transcript_files,
        unexpected_files: result.unexpected_files,
        unrelated_commit_subjects: result.unrelated_commit_subjects,
        branch_ancestry_verified: result.branch_ancestry_verified,
        remote_base_branch: result.remote_base_branch,
        branch_fork_point: result.branch_fork_point,
        expected_issue_scope: result.expected_issue_scope,
        block_reasons: result.block_reasons,
      },
    },
  });
  return JSON.stringify(result, null, 2);
}
