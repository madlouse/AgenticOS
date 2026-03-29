import { readFile } from 'fs/promises';
import { basename, join, resolve, sep } from 'path';
import yaml from 'yaml';
import { loadRegistry } from '../utils/registry.js';

type TaskType = 'discussion_only' | 'analysis_or_doc' | 'implementation' | 'bootstrap';
type GuardStatus = 'PASS' | 'BLOCK';

interface EditGuardArgs {
  issue_id?: string;
  task_type?: TaskType;
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
  } | null;
  preflight_ok: boolean;
  scope_ok: boolean;
  block_reasons: string[];
  recovery_actions: string[];
  evidence: {
    repo_path: string | null;
    project_path: string | null;
    preflight_issue_id: string | null;
    preflight_repo_path: string | null;
    preflight_status: string | null;
    preflight_declared_target_files: string[];
  };
}

function normalizePath(path: string): string {
  return resolve(path);
}

function resolveProjectStatePath(projectPath: string, projectYaml: any): string {
  const configuredStatePath = projectYaml?.agent_context?.current_state;
  if (typeof configuredStatePath === 'string' && configuredStatePath.trim().length > 0) {
    return join(projectPath, configuredStatePath.trim());
  }
  return join(projectPath, '.context', 'state.yaml');
}

function isWithinProject(repoPath: string, projectPath: string): boolean {
  return repoPath === projectPath || repoPath.startsWith(`${projectPath}${sep}`);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

function normalizeDeclaredTargets(targets: string[]): string[] {
  return targets
    .map((target) => String(target || '').trim())
    .filter((target) => target.length > 0);
}

async function resolveTargetProject(repoPath: string, explicitProjectPath?: string): Promise<EditGuardResult['target_project']> {
  if (explicitProjectPath) {
    const normalizedProjectPath = normalizePath(explicitProjectPath);
    const projectYamlPath = join(normalizedProjectPath, '.project.yaml');
    if (!(await fileExists(projectYamlPath))) {
      return null;
    }

    const projectYaml = yaml.parse(await readFile(projectYamlPath, 'utf-8')) || {};
    return {
      id: String(projectYaml?.meta?.id || basename(normalizedProjectPath)),
      name: String(projectYaml?.meta?.name || projectYaml?.meta?.id || basename(normalizedProjectPath)),
      path: normalizedProjectPath,
      state_path: resolveProjectStatePath(normalizedProjectPath, projectYaml),
    };
  }

  const registry = await loadRegistry();
  const normalizedRepoPath = normalizePath(repoPath);
  const match = registry.projects
    .map((project) => ({ ...project, path: normalizePath(project.path) }))
    .filter((project) => isWithinProject(normalizedRepoPath, project.path))
    .sort((a, b) => b.path.length - a.path.length)[0];

  if (!match) {
    return null;
  }

  const projectYamlPath = join(match.path, '.project.yaml');
  if (!(await fileExists(projectYamlPath))) {
    return null;
  }

  const projectYaml = yaml.parse(await readFile(projectYamlPath, 'utf-8')) || {};
  return {
    id: String(projectYaml?.meta?.id || match.id),
    name: String(projectYaml?.meta?.name || match.name),
    path: match.path,
    state_path: resolveProjectStatePath(match.path, projectYaml),
  };
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
      preflight_issue_id: null,
      preflight_repo_path: null,
      preflight_status: null,
      preflight_declared_target_files: [],
    },
  };

  if (task_type !== 'implementation') {
    result.status = 'PASS';
    result.summary = `edit guard not required for task_type=${task_type}`;
    return JSON.stringify(result, null, 2);
  }

  if (!repo_path) {
    result.block_reasons.push('repo_path is required');
  }

  if (!issue_id) {
    result.block_reasons.push('issue_id is required for implementation edits');
  }

  const attemptedTargets = normalizeDeclaredTargets(declared_target_files);
  if (attemptedTargets.length === 0) {
    result.block_reasons.push('declared_target_files is required for implementation edits');
  }

  const registry = await loadRegistry();
  result.active_project = registry.active_project || null;
  if (!registry.active_project) {
    result.block_reasons.push('no active project is set');
    result.recovery_actions.push('call agenticos_switch before attempting implementation edits');
  }

  if (repo_path) {
    result.target_project = await resolveTargetProject(repo_path, project_path);
  }

  if (!result.target_project) {
    result.block_reasons.push(
      project_path
        ? `project_path is not a resolvable managed project: ${project_path}`
        : 'target project could not be resolved from repo_path; pass project_path explicitly',
    );
    result.recovery_actions.push('pass project_path pointing at the managed project root');
  }

  if (result.active_project && result.target_project && result.active_project !== result.target_project.id) {
    result.block_reasons.push(
      `active project "${result.active_project}" does not match target project "${result.target_project.id}"`,
    );
    result.recovery_actions.push(`call agenticos_switch for project "${result.target_project.id}" before editing`);
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

  const preflight = state?.guardrail_evidence?.preflight;
  if (!preflight) {
    result.block_reasons.push('no preflight evidence is recorded for the target project');
    result.recovery_actions.push('run agenticos_preflight and get PASS before implementation edits');
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

    if (repo_path && normalizePath(preflight.repo_path || '') !== normalizePath(repo_path)) {
      result.block_reasons.push('latest preflight was recorded for a different repo_path');
      result.recovery_actions.push('rerun agenticos_preflight for the current repo_path');
    }

    if (preflight?.result?.status !== 'PASS') {
      result.block_reasons.push(`latest preflight status is ${preflight?.result?.status || 'unknown'} instead of PASS`);
      result.recovery_actions.push('resolve the latest preflight outcome and rerun until it returns PASS');
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
