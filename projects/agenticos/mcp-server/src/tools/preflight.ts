import { exec } from 'child_process';
import { dirname, resolve } from 'path';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import yaml from 'yaml';
import { extractLatestIssueBootstrap, persistGuardrailEvidence, type GuardrailPersistenceResult } from '../utils/guardrail-evidence.js';
import {
  isImplementationAffectingTask,
  resolveGuardrailProjectTarget,
  type GuardrailTaskType,
} from '../utils/repo-boundary.js';

const execAsync = promisify(exec);

type WorkspaceType = 'main' | 'isolated_worktree';
type GuardrailStatus = 'PASS' | 'BLOCK' | 'REDIRECT';

interface PreflightArgs {
  issue_id?: string;
  task_type?: GuardrailTaskType;
  repo_path?: string;
  project_path?: string;
  remote_base_branch?: string;
  declared_target_files?: string[];
  structural_move?: boolean;
  worktree_required?: boolean;
  root_scoped_exceptions?: string[];
  clean_reproducibility_gate?: string[];
}

interface PreflightResult {
  status: GuardrailStatus;
  summary: string;
  repo_identity_confirmed: boolean;
  branch_ancestry_verified: boolean;
  branch_based_on_intended_remote: boolean;
  worktree_ok: boolean;
  scope_ok: boolean;
  reproducibility_gate_defined: boolean;
  block_reasons: string[];
  redirect_actions: string[];
  evidence: {
    active_project: string | null;
    target_project_id: string | null;
    target_project_path: string | null;
    target_project_yaml_path: string | null;
    declared_source_repo_roots: string[];
    git_worktree_root: string;
    git_common_dir: string;
    git_common_repo_root: string;
    git_remote_origin: string | null;
    current_branch: string;
    current_head: string;
    remote_base_branch: string;
    remote_base_head: string;
    branch_fork_point: string;
    workspace_type: WorkspaceType;
    commit_subjects_since_base: string[];
    issue_bootstrap: {
      recorded_at: string | null;
      issue_id: string | null;
      repo_path: string | null;
      current_branch: string | null;
    } | null;
  };
  persistence?: GuardrailPersistenceResult;
}

async function runGit(repoPath: string, args: string): Promise<string> {
  const { stdout } = await execAsync(`git -C "${repoPath}" ${args}`);
  return stdout.trim();
}

function normalizeLines(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function detectWorkspaceType(repoPath: string): Promise<WorkspaceType> {
  try {
    const output = await runGit(repoPath, 'worktree list --porcelain');
    const worktreeLines = output
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.replace(/^worktree\s+/, '').trim());

    if (worktreeLines.length > 0 && worktreeLines[0] === repoPath) {
      return 'main';
    }
    return 'isolated_worktree';
  } catch {
    return 'main';
  }
}

function finalizeResult(result: PreflightResult): PreflightResult {
  if (result.block_reasons.length > 0) {
    result.status = 'BLOCK';
    result.summary = result.block_reasons.join('; ');
    return result;
  }

  if (result.redirect_actions.length > 0) {
    result.status = 'REDIRECT';
    result.summary = result.redirect_actions.join('; ');
    return result;
  }

  result.status = 'PASS';
  result.summary = 'preflight passed';
  return result;
}

function makeBaseResult(remoteBaseBranch: string): PreflightResult {
  return {
    status: 'BLOCK',
    summary: '',
    repo_identity_confirmed: false,
    branch_ancestry_verified: false,
    branch_based_on_intended_remote: false,
    worktree_ok: false,
    scope_ok: false,
    reproducibility_gate_defined: false,
    block_reasons: [],
    redirect_actions: [],
    evidence: {
      current_branch: '',
      active_project: null,
      target_project_id: null,
      target_project_path: null,
      target_project_yaml_path: null,
      declared_source_repo_roots: [],
      git_worktree_root: '',
      git_common_dir: '',
      git_common_repo_root: '',
      git_remote_origin: null,
      current_head: '',
      remote_base_branch: remoteBaseBranch,
      remote_base_head: '',
      branch_fork_point: '',
      workspace_type: 'main',
      commit_subjects_since_base: [],
      issue_bootstrap: null,
    },
  };
}

export async function runPreflight(args: PreflightArgs): Promise<string> {
  const {
    issue_id,
    task_type = 'discussion_only',
    repo_path,
    project_path,
    remote_base_branch = 'origin/main',
    declared_target_files = [],
    structural_move = false,
    worktree_required = isImplementationAffectingTask(task_type),
    root_scoped_exceptions = ['.github/'],
    clean_reproducibility_gate = [],
  } = args;

  const result = makeBaseResult(remote_base_branch);

  if (!repo_path) {
    result.block_reasons.push('repo_path is required');
    return JSON.stringify(finalizeResult(result), null, 2);
  }

  if (isImplementationAffectingTask(task_type) && !issue_id) {
    result.block_reasons.push(`issue_id is required for ${task_type} work`);
  }

  if (isImplementationAffectingTask(task_type) && declared_target_files.length === 0) {
    result.block_reasons.push(`declared_target_files is required for ${task_type} work`);
  }

  const projectResolution = await resolveGuardrailProjectTarget({
    commandName: 'agenticos_preflight',
    repoPath: repo_path,
    projectPath: project_path,
  });
  result.evidence.active_project = projectResolution.activeProjectId;
  result.evidence.target_project_id = projectResolution.targetProject?.id || null;
  result.evidence.target_project_path = projectResolution.targetProject?.path || null;
  result.evidence.target_project_yaml_path = projectResolution.targetProject?.projectYamlPath || null;
  result.evidence.declared_source_repo_roots = projectResolution.targetProject?.sourceRepoRoots || [];

  if (!projectResolution.targetProject) {
    result.block_reasons.push(...projectResolution.resolutionErrors);
    if (!projectResolution.activeProjectId) {
      result.redirect_actions.push('call agenticos_switch or pass project_path before implementation-affecting work');
    } else {
      result.redirect_actions.push('pass project_path explicitly if the active project is not the intended target');
    }
  }

  try {
    const gitWorktreeRoot = await runGit(repo_path, 'rev-parse --show-toplevel');
    const gitCommonDirRaw = await runGit(repo_path, 'rev-parse --git-common-dir');
    const gitCommonDir = resolve(gitWorktreeRoot, gitCommonDirRaw);
    const gitCommonRepoRoot = dirname(gitCommonDir);

    result.evidence.git_worktree_root = gitWorktreeRoot;
    result.evidence.git_common_dir = gitCommonDir;
    result.evidence.git_common_repo_root = gitCommonRepoRoot;
    result.evidence.git_remote_origin = await runGit(repo_path, 'config --get remote.origin.url').catch(() => null);
    result.evidence.current_branch = await runGit(repo_path, 'rev-parse --abbrev-ref HEAD');
    result.evidence.current_head = await runGit(repo_path, 'rev-parse HEAD');
    result.evidence.remote_base_head = await runGit(repo_path, `rev-parse ${remote_base_branch}`);
    result.evidence.branch_fork_point = await runGit(repo_path, `merge-base HEAD ${remote_base_branch}`);
    result.branch_ancestry_verified = true;
    result.evidence.workspace_type = await detectWorkspaceType(repo_path);

    if (projectResolution.targetProject) {
      if (!projectResolution.targetProject.sourceRepoRootsDeclared || projectResolution.targetProject.sourceRepoRoots.length === 0) {
        result.block_reasons.push(
          `target project "${projectResolution.targetProject.id}" is missing execution.source_repo_roots in ${projectResolution.targetProject.projectYamlPath}`,
        );
        result.redirect_actions.push(
          `declare execution.source_repo_roots in ${projectResolution.targetProject.projectYamlPath} before ${task_type} work`,
        );
      } else if (!projectResolution.targetProject.sourceRepoRoots.includes(gitCommonRepoRoot)) {
        result.block_reasons.push(
          `git common repo root "${gitCommonRepoRoot}" is not declared for target project "${projectResolution.targetProject.id}"`,
        );
        result.redirect_actions.push(
          `rerun in a declared source repo root: ${projectResolution.targetProject.sourceRepoRoots.join(', ')}`,
        );
      } else {
        result.repo_identity_confirmed = true;
      }
    }
  } catch {
    result.block_reasons.push('failed to resolve git repository identity or remote base');
    const finalized = finalizeResult(result);
    finalized.persistence = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path,
      project_path: projectResolution.targetProject?.path || project_path,
      payload: {
        issue_id: issue_id || null,
        project_path: projectResolution.targetProject?.path || project_path || null,
        task_type,
        declared_target_files,
        structural_move,
        worktree_required,
        root_scoped_exceptions,
        clean_reproducibility_gate,
        result: finalized,
      },
    });
    return JSON.stringify(finalized, null, 2);
  }

  if (worktree_required) {
    const branchIsProtected = result.evidence.current_branch === 'main' || result.evidence.current_branch === remote_base_branch;
    if (branchIsProtected || result.evidence.workspace_type === 'main') {
      result.redirect_actions.push('create an isolated issue branch/worktree before implementation');
    } else {
      result.worktree_ok = true;
    }
  } else {
    result.worktree_ok = true;
  }

  if (isImplementationAffectingTask(task_type)) {
    const subjectsRaw = await runGit(repo_path, `log --format=%s ${remote_base_branch}..HEAD`).catch(() => '');
    const subjects = normalizeLines(subjectsRaw);
    result.evidence.commit_subjects_since_base = subjects;

    if (subjects.length > 0) {
      const issueMarker = issue_id ? `#${issue_id}` : '';
      const unrelatedSubjects = subjects.filter((subject) => !issueMarker || !subject.includes(issueMarker));
      if (unrelatedSubjects.length > 0) {
        result.block_reasons.push(`branch includes unrelated commits relative to ${remote_base_branch}`);
      } else {
        result.branch_based_on_intended_remote = true;
      }
    } else {
      result.branch_based_on_intended_remote = true;
    }

    if (structural_move) {
      const hasGithubException = root_scoped_exceptions.includes('.github/');
      if (!hasGithubException) {
        result.block_reasons.push('structural_move requires a root-scoped exception entry for .github/');
      }

      if (clean_reproducibility_gate.length === 0) {
        result.block_reasons.push('structural_move requires a clean_reproducibility_gate');
      } else {
        result.reproducibility_gate_defined = true;
      }
    } else {
      result.reproducibility_gate_defined = clean_reproducibility_gate.length > 0 || !structural_move;
    }

    result.scope_ok = declared_target_files.length > 0;

    if (projectResolution.targetProject && result.worktree_ok) {
      try {
        const state = yaml.parse(await readFile(projectResolution.targetProject.statePath, 'utf-8')) || {};
        const latestBootstrap = extractLatestIssueBootstrap(state);
        result.evidence.issue_bootstrap = latestBootstrap
          ? {
              recorded_at: latestBootstrap.recorded_at || null,
              issue_id: latestBootstrap.issue_id || null,
              repo_path: latestBootstrap.repo_path || null,
              current_branch: latestBootstrap.current_branch || null,
            }
          : null;

        if (!latestBootstrap) {
          result.block_reasons.push('no issue bootstrap evidence is recorded for the target project');
        } else {
          if (issue_id && latestBootstrap.issue_id !== issue_id) {
            result.block_reasons.push(
              `latest issue bootstrap issue "${latestBootstrap.issue_id || 'unknown'}" does not match requested issue "${issue_id}"`,
            );
          }

          if (repo_path && resolve(latestBootstrap.repo_path || '') !== resolve(repo_path)) {
            result.block_reasons.push('latest issue bootstrap was recorded for a different repo_path');
          }

          if (latestBootstrap.current_branch && latestBootstrap.current_branch !== result.evidence.current_branch) {
            result.block_reasons.push(
              `latest issue bootstrap branch "${latestBootstrap.current_branch}" does not match current branch "${result.evidence.current_branch}"`,
            );
          }

          if (!latestBootstrap.stages?.context_reset_performed) {
            result.block_reasons.push('latest issue bootstrap does not prove a clear-equivalent context reset');
          }
          if (!latestBootstrap.stages?.project_hot_load_performed) {
            result.block_reasons.push('latest issue bootstrap does not prove project hot-load occurred');
          }
          if (!latestBootstrap.stages?.issue_payload_attached) {
            result.block_reasons.push('latest issue bootstrap does not prove issue payload attachment');
          }
          if (!Array.isArray(latestBootstrap.startup_context_paths) || latestBootstrap.startup_context_paths.length === 0) {
            result.block_reasons.push('latest issue bootstrap is missing startup context evidence');
          }
        }
      } catch {
        result.block_reasons.push(`managed project state is missing or unreadable: ${projectResolution.targetProject.statePath}`);
      }
    }
  } else {
    result.branch_based_on_intended_remote = true;
    result.scope_ok = true;
    result.reproducibility_gate_defined = true;
  }

  const finalized = finalizeResult(result);
  finalized.persistence = await persistGuardrailEvidence({
    command: 'agenticos_preflight',
    repo_path,
    project_path: projectResolution.targetProject?.path || project_path,
    payload: {
      issue_id: issue_id || null,
      project_path: projectResolution.targetProject?.path || project_path || null,
      task_type,
      declared_target_files,
      structural_move,
      worktree_required,
      root_scoped_exceptions,
      clean_reproducibility_gate,
      result: {
        status: finalized.status,
        summary: finalized.summary,
        repo_identity_confirmed: finalized.repo_identity_confirmed,
        branch_ancestry_verified: finalized.branch_ancestry_verified,
        branch_based_on_intended_remote: finalized.branch_based_on_intended_remote,
        worktree_ok: finalized.worktree_ok,
        scope_ok: finalized.scope_ok,
        reproducibility_gate_defined: finalized.reproducibility_gate_defined,
        block_reasons: finalized.block_reasons,
        redirect_actions: finalized.redirect_actions,
        evidence: finalized.evidence,
      },
    },
  });
  return JSON.stringify(finalized, null, 2);
}
