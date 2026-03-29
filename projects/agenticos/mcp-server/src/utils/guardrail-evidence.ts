import { access, readFile, writeFile } from 'fs/promises';
import { basename, dirname, join, resolve, sep } from 'path';
import yaml from 'yaml';
import { loadRegistry } from './registry.js';

type GuardrailCommand =
  | 'agenticos_preflight'
  | 'agenticos_branch_bootstrap'
  | 'agenticos_pr_scope_check';

interface GuardrailEvidenceState {
  updated_at?: string;
  last_command?: GuardrailCommand;
  preflight?: Record<string, unknown>;
  branch_bootstrap?: Record<string, unknown>;
  pr_scope_check?: Record<string, unknown>;
}

type GuardrailEvidenceSlot = 'preflight' | 'branch_bootstrap' | 'pr_scope_check';

interface StateYaml {
  guardrail_evidence?: GuardrailEvidenceState;
  [key: string]: unknown;
}

export interface GuardrailPersistenceResult {
  attempted: boolean;
  persisted: boolean;
  project_id?: string;
  state_path?: string;
  reason?: string;
}

interface PersistGuardrailEvidenceArgs {
  command: GuardrailCommand;
  repo_path?: string;
  project_path?: string;
  payload: Record<string, unknown>;
}

interface ResolvedProjectTarget {
  id: string;
  path: string;
  statePath: string;
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
  if (repoPath === projectPath) return true;
  return repoPath.startsWith(`${projectPath}${sep}`);
}

function getCommandSlot(command: GuardrailCommand): GuardrailEvidenceSlot {
  switch (command) {
    case 'agenticos_preflight':
      return 'preflight';
    case 'agenticos_branch_bootstrap':
      return 'branch_bootstrap';
    case 'agenticos_pr_scope_check':
      return 'pr_scope_check';
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findProjectRootFromRepoPath(repoPath: string): Promise<ResolvedProjectTarget | null> {
  let currentPath = normalizePath(repoPath);

  while (true) {
    const projectYamlPath = join(currentPath, '.project.yaml');
    const hasProjectYaml = await pathExists(projectYamlPath);

    if (hasProjectYaml) {
      let projectYaml: any = {};
      let projectId = currentPath.split(sep).filter(Boolean).pop() || 'unknown-project';
      try {
        projectYaml = yaml.parse(await readFile(projectYamlPath, 'utf-8')) || {};
        if (projectYaml?.meta?.id) {
          projectId = String(projectYaml.meta.id);
        }
      } catch {
        // Fall back to directory-derived project id.
      }

      const statePath = resolveProjectStatePath(currentPath, projectYaml);
      const hasState = await pathExists(statePath);
      if (!hasState) {
        const parentPath = dirname(currentPath);
        if (parentPath === currentPath) {
          return null;
        }
        currentPath = parentPath;
        continue;
      }

      return {
        id: projectId,
        path: currentPath,
        statePath,
      };
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      return null;
    }
    currentPath = parentPath;
  }
}

async function resolveExplicitProjectTarget(projectPath: string): Promise<ResolvedProjectTarget | null> {
  const normalizedProjectPath = normalizePath(projectPath);
  const projectYamlPath = join(normalizedProjectPath, '.project.yaml');
  if (!(await pathExists(projectYamlPath))) {
    return null;
  }

  let projectYaml: any = {};
  try {
    projectYaml = yaml.parse(await readFile(projectYamlPath, 'utf-8')) || {};
  } catch {
    projectYaml = {};
  }

  const statePath = resolveProjectStatePath(normalizedProjectPath, projectYaml);
  if (!(await pathExists(statePath))) {
    return null;
  }

  return {
    id: String(projectYaml?.meta?.id || basename(normalizedProjectPath)),
    path: normalizedProjectPath,
    statePath,
  };
}

async function resolveProjectTarget(repoPath: string, projectPath?: string): Promise<ResolvedProjectTarget | null> {
  if (projectPath) {
    return resolveExplicitProjectTarget(projectPath);
  }

  const registry = await loadRegistry();
  const normalizedRepoPath = normalizePath(repoPath);
  const matchingProjects = registry.projects
    .map((project) => ({ ...project, path: normalizePath(project.path) }))
    .filter((project) => isWithinProject(normalizedRepoPath, project.path))
    .sort((a, b) => b.path.length - a.path.length);

  const registryProject = matchingProjects[0];
  if (registryProject) {
    return {
      id: registryProject.id,
      path: registryProject.path,
      statePath: join(registryProject.path, '.context', 'state.yaml'),
    };
  }

  return findProjectRootFromRepoPath(normalizedRepoPath);
}

export async function persistGuardrailEvidence(
  args: PersistGuardrailEvidenceArgs,
): Promise<GuardrailPersistenceResult> {
  const { command, repo_path, project_path, payload } = args;

  if (!repo_path) {
    return {
      attempted: false,
      persisted: false,
      reason: 'repo_path is required for guardrail evidence persistence',
    };
  }

  const project = await resolveProjectTarget(repo_path, project_path);
  if (!project) {
    return {
      attempted: true,
      persisted: false,
      reason: project_path
        ? `project_path is not a resolvable AgenticOS project: ${project_path}`
        : `repo_path is not within a resolvable AgenticOS project: ${repo_path}`,
    };
  }

  const statePath = project.statePath;
  let state: StateYaml = {};

  try {
    const content = await readFile(statePath, 'utf-8');
    state = (yaml.parse(content) || {}) as StateYaml;
  } catch {
    state = {};
  }

  if (!state.guardrail_evidence) {
    state.guardrail_evidence = {};
  }

  const recordedAt = new Date().toISOString();
  const slot = getCommandSlot(command);

  state.guardrail_evidence.updated_at = recordedAt;
  state.guardrail_evidence.last_command = command;
  state.guardrail_evidence[slot] = {
    command,
    recorded_at: recordedAt,
    repo_path,
    ...payload,
  };

  await writeFile(statePath, yaml.stringify(state), 'utf-8');

  return {
    attempted: true,
    persisted: true,
    project_id: project.id,
    state_path: statePath,
  };
}
