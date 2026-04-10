import { readFile } from 'fs/promises';
import { exec } from 'child_process';
import { dirname, resolve } from 'path';
import { promisify } from 'util';
import yaml from 'yaml';
import { extractLatestIssueBootstrap } from '../utils/guardrail-evidence.js';
import {
  isImplementationAffectingTask,
  resolveGuardrailProjectTarget,
  type GuardrailTaskType,
} from '../utils/repo-boundary.js';
type GuardStatus = 'PASS' | 'BLOCK';
const execAsync = promisify(exec);

interface EditGuardArgs {
  issue_id?: string;
  task_type?: GuardrailTaskType;
  repo_path?: string;
  project_path?: string;
  declared_target_files?: string[];
}

interface EditGuardResult {
  status: GuardStatus;
  summary: string;
  active_project: string | null;
  target_project: {
    id: string;
    name: string;
    path: string;
    state_path: string;
    project_yaml_path: string;
    declared_source_repo_roots: string[];
  } | null;
  preflight_ok: boolean;
  scope_ok: boolean;
  block_reasons: string[];
  recovery_actions: string[];
  evidence: {
    repo_path: string | null;
    project_path: string | null;
    active_project: string | null;
    git_worktree_root: string | null;
    git_common_repo_root: string | null;
    current_branch: string | null;
    issue_bootstrap_issue_id: string | null;
    issue_bootstrap_repo_path: string | null;
    issue_bootstrap_branch: string | null;
    preflight_issue_id: string | null;
    preflight_repo_path: string | null;
    preflight_status: string | null;
    preflight_declared_target_files: string[];
  };
}

async function runGit(repoPath: string, args: string): Promise<string> {
  const { stdout } = await execAsync(`git -C "${repoPath}" ${args}`);
  return stdout.trim();
}

function normalizeDeclaredTargets(targets: string[]): string[] {
  return targets
    .map((target) => String(target || '').trim())
    .filter((target) => target.length > 0);
}

export async function runEditGuard(args: EditGuardArgs): Promise<string> {
  const {
    issue_id,
    task_type = 'implementation',
    repo_path,
    project_path,
    declared_target_files = [],
  } = args ?? {};

  const result: EditGuardResult = {
    status: 'BLOCK',
    summary: '',
    active_project: null,
    target_project: null,
    preflight_ok: false,
    scope_ok: false,
    block_reasons: [],
    recovery_actions: [],
    evidence: {
      repo_path: repo_path || null,
      project_path: project_path || null,
      active_project: null,
      git_worktree_root: null,
      git_common_repo_root: null,
      current_branch: null,
      issue_bootstrap_issue_id: null,
      issue_bootstrap_repo_path: null,
      issue_bootstrap_branch: null,
      preflight_issue_id: null,
      preflight_repo_path: null,
      preflight_status: null,
      preflight_declared_target_files: [],
    },
  };

  if (!isImplementationAffectingTask(task_type)) {
    result.status = 'PASS';
    result.summary = `edit guard not required for task_type=${task_type}`;
    return JSON.stringify(result, null, 2);
  }

  if (!repo_path) {
    result.block_reasons.push('repo_path is required');
  }

  if (!issue_id) {
    result.block_reasons.push(`issue_id is required for ${task_type} edits`);
  }

  const attemptedTargets = normalizeDeclaredTargets(declared_target_files);
  if (attemptedTargets.length === 0) {
    result.block_reasons.push(`declared_target_files is required for ${task_type} edits`);
  }

  const projectResolution = await resolveGuardrailProjectTarget({
    commandName: 'agenticos_edit_guard',
    repoPath: repo_path,
    projectPath: project_path,
  });
  result.active_project = projectResolution.activeProjectId;
  result.evidence.active_project = projectResolution.activeProjectId;

  if (projectResolution.targetProject) {
    result.target_project = {
      id: projectResolution.targetProject.id,
      name: projectResolution.targetProject.name,
      path: projectResolution.targetProject.path,
      state_path: projectResolution.targetProject.statePath,
      project_yaml_path: projectResolution.targetProject.projectYamlPath,
      declared_source_repo_roots: projectResolution.targetProject.sourceRepoRoots,
    };
  } else {
    result.block_reasons.push(...projectResolution.resolutionErrors);
    if (!projectResolution.activeProjectId) {
      result.recovery_actions.push('call agenticos_switch before attempting implementation-affecting edits');
    }
    result.recovery_actions.push('pass project_path pointing at the managed project root when needed');
  }

  if (repo_path) {
    try {
      const gitWorktreeRoot = await runGit(repo_path, 'rev-parse --show-toplevel');
      const gitCommonDir = resolve(gitWorktreeRoot, await runGit(repo_path, 'rev-parse --git-common-dir'));
      const gitCommonRepoRoot = dirname(gitCommonDir);
      result.evidence.current_branch = await runGit(repo_path, 'rev-parse --abbrev-ref HEAD');
      result.evidence.git_worktree_root = gitWorktreeRoot;
      result.evidence.git_common_repo_root = gitCommonRepoRoot;

      if (result.target_project) {
        if (result.target_project.declared_source_repo_roots.length === 0) {
          result.block_reasons.push(
            `target project "${result.target_project.id}" is missing execution.source_repo_roots in ${result.target_project.project_yaml_path}`,
          );
          result.recovery_actions.push(
            `declare execution.source_repo_roots in ${result.target_project.project_yaml_path} before ${task_type} edits`,
          );
        } else if (!result.target_project.declared_source_repo_roots.includes(gitCommonRepoRoot)) {
          result.block_reasons.push(
            `git common repo root "${gitCommonRepoRoot}" is not declared for target project "${result.target_project.id}"`,
          );
          result.recovery_actions.push(
            `rerun in a declared source repo root: ${result.target_project.declared_source_repo_roots.join(', ')}`,
          );
        }
      }
    } catch {
      result.block_reasons.push('failed to resolve git repository identity for the requested edit');
    }
  }

  let state: any = {};
  if (result.target_project) {
    try {
      state = yaml.parse(await readFile(result.target_project.state_path, 'utf-8')) || {};
    } catch {
      result.block_reasons.push(`managed project state is missing or unreadable: ${result.target_project.state_path}`);
      result.recovery_actions.push('ensure the managed project state exists before using the edit guard');
    }
  }

  const latestBootstrap = extractLatestIssueBootstrap(state);
  if (!latestBootstrap) {
    result.block_reasons.push('no issue bootstrap evidence is recorded for the target project');
    result.recovery_actions.push('record agenticos_issue_bootstrap for the current issue before rerunning preflight');
  } else {
    result.evidence.issue_bootstrap_issue_id = typeof latestBootstrap.issue_id === 'string' ? latestBootstrap.issue_id : null;
    result.evidence.issue_bootstrap_repo_path = typeof latestBootstrap.repo_path === 'string' ? latestBootstrap.repo_path : null;
    result.evidence.issue_bootstrap_branch = typeof latestBootstrap.current_branch === 'string' ? latestBootstrap.current_branch : null;

    if (issue_id && latestBootstrap.issue_id !== issue_id) {
      result.block_reasons.push(
        `latest issue bootstrap issue "${latestBootstrap.issue_id || 'unknown'}" does not match requested issue "${issue_id}"`,
      );
      result.recovery_actions.push(`record agenticos_issue_bootstrap for issue #${issue_id} before rerunning preflight`);
    }

    if (repo_path && resolve(latestBootstrap.repo_path || '') !== resolve(repo_path)) {
      result.block_reasons.push('latest issue bootstrap was recorded for a different repo_path');
      result.recovery_actions.push('record agenticos_issue_bootstrap for the current repo_path before rerunning preflight');
    }

    if (result.evidence.current_branch && latestBootstrap.current_branch && latestBootstrap.current_branch !== result.evidence.current_branch) {
      result.block_reasons.push(
        `latest issue bootstrap branch "${latestBootstrap.current_branch}" does not match current branch "${result.evidence.current_branch}"`,
      );
      result.recovery_actions.push('record agenticos_issue_bootstrap again after entering the current issue branch/worktree');
    }
  }

  const preflight = state?.guardrail_evidence?.preflight;
  if (!preflight) {
    result.block_reasons.push('no preflight evidence is recorded for the target project');
    result.recovery_actions.push('run agenticos_preflight and get PASS after issue bootstrap before implementation edits');
  } else {
    result.evidence.preflight_issue_id = typeof preflight.issue_id === 'string' ? preflight.issue_id : null;
    result.evidence.preflight_repo_path = typeof preflight.repo_path === 'string' ? preflight.repo_path : null;
    result.evidence.preflight_status = typeof preflight?.result?.status === 'string' ? preflight.result.status : null;
    result.evidence.preflight_declared_target_files = Array.isArray(preflight.declared_target_files)
      ? normalizeDeclaredTargets(preflight.declared_target_files)
      : [];

    if (issue_id && preflight.issue_id !== issue_id) {
      result.block_reasons.push(
        `latest preflight issue "${preflight.issue_id || 'unknown'}" does not match requested issue "${issue_id}"`,
      );
      result.recovery_actions.push(`rerun agenticos_preflight for issue #${issue_id}`);
    }

    if (repo_path && resolve(preflight.repo_path || '') !== resolve(repo_path)) {
      result.block_reasons.push('latest preflight was recorded for a different repo_path');
      result.recovery_actions.push('rerun agenticos_preflight for the current repo_path');
    }

    if (preflight?.result?.status !== 'PASS') {
      result.block_reasons.push(`latest preflight status is ${preflight?.result?.status || 'unknown'} instead of PASS`);
      result.recovery_actions.push('resolve the latest preflight outcome and rerun it after issue bootstrap until it returns PASS');
    } else {
      result.preflight_ok = true;
    }

    const allowedTargets = new Set(result.evidence.preflight_declared_target_files);
    const outOfScopeTargets = attemptedTargets.filter((target) => !allowedTargets.has(target));
    if (outOfScopeTargets.length > 0) {
      result.block_reasons.push(
        `attempted targets exceed the latest preflight scope: ${outOfScopeTargets.join(', ')}`,
      );
      result.recovery_actions.push('rerun agenticos_preflight with the full intended target set before editing');
    } else if (attemptedTargets.length > 0) {
      result.scope_ok = true;
    }
  }

  if (result.block_reasons.length > 0) {
    result.status = 'BLOCK';
    result.summary = result.block_reasons[0];
  } else {
    result.status = 'PASS';
    result.summary = 'edit guard passed';
  }

  return JSON.stringify(result, null, 2);
}
