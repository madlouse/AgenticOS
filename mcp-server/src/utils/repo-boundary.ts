import { access, readFile } from 'fs/promises';
import { basename, isAbsolute, join, resolve, sep } from 'path';
import yaml from 'yaml';
import { resolveManagedProjectTarget } from './project-target.js';
import { loadRegistry } from './registry.js';

export type GuardrailTaskType =
  | 'discussion_only'
  | 'analysis_or_doc'
  | 'implementation'
  | 'bugfix'
  | 'bootstrap';

export interface GuardrailProjectTarget {
  id: string;
  name: string;
  path: string;
  statePath: string;
  projectYamlPath: string;
  sourceRepoRoots: string[];
  sourceRepoRootsDeclared: boolean;
}

export interface GuardrailProjectResolution {
  activeProjectId: string | null;
  resolutionSource: 'explicit_project_path' | 'active_project' | 'repo_path_match' | null;
  targetProject: GuardrailProjectTarget | null;
  resolutionErrors: string[];
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function resolveDeclaredSourceRepoRoots(projectPath: string, projectYaml: any): {
  roots: string[];
  declared: boolean;
} {
  const rawRoots = projectYaml?.execution?.source_repo_roots;
  if (!Array.isArray(rawRoots)) {
    return {
      roots: [],
      declared: false,
    };
  }

  const roots = Array.from(new Set(
    rawRoots
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > 0)
      .map((value) => normalizePath(isAbsolute(value) ? value : join(projectPath, value))),
  ));

  return {
    roots,
    declared: true,
  };
}

async function buildTargetFromProjectPath(
  projectPath: string,
  fallbackId?: string,
  fallbackName?: string,
): Promise<GuardrailProjectTarget | null> {
  const normalizedProjectPath = normalizePath(projectPath);
  const projectYamlPath = join(normalizedProjectPath, '.project.yaml');
  if (!(await pathExists(projectYamlPath))) {
    return null;
  }

  const projectYaml = yaml.parse(await readFile(projectYamlPath, 'utf-8')) || {};
  const sourceRepoRoots = resolveDeclaredSourceRepoRoots(normalizedProjectPath, projectYaml);

  return {
    id: String(projectYaml?.meta?.id || fallbackId || basename(normalizedProjectPath)),
    name: String(projectYaml?.meta?.name || fallbackName || fallbackId || basename(normalizedProjectPath)),
    path: normalizedProjectPath,
    statePath: resolveProjectStatePath(normalizedProjectPath, projectYaml),
    projectYamlPath,
    sourceRepoRoots: sourceRepoRoots.roots,
    sourceRepoRootsDeclared: sourceRepoRoots.declared,
  };
}

export function isImplementationAffectingTask(taskType: GuardrailTaskType): boolean {
  return taskType === 'implementation' || taskType === 'bugfix';
}

export async function resolveGuardrailProjectTarget(args: {
  commandName: string;
  repoPath?: string;
  projectPath?: string;
}): Promise<GuardrailProjectResolution> {
  const { commandName, repoPath, projectPath } = args;
  const registry = await loadRegistry();
  const activeProjectId = registry.active_project || null;

  if (projectPath) {
    try {
      const targetProject = await buildTargetFromProjectPath(projectPath);
      return {
        activeProjectId,
        resolutionSource: targetProject ? 'explicit_project_path' : null,
        targetProject,
        resolutionErrors: targetProject ? [] : [`project_path is not a resolvable managed project: ${projectPath}`],
      };
    } catch (error) {
      return {
        activeProjectId,
        resolutionSource: null,
        targetProject: null,
        resolutionErrors: [error instanceof Error ? error.message : `failed to resolve project_path: ${projectPath}`],
      };
    }
  }

  if (activeProjectId) {
    try {
      const resolved = await resolveManagedProjectTarget({
        commandName,
      });
      const targetProject = await buildTargetFromProjectPath(
        resolved.projectPath,
        resolved.projectId,
        resolved.projectName,
      );
      return {
        activeProjectId,
        resolutionSource: 'active_project',
        targetProject,
        resolutionErrors: targetProject ? [] : [`active project "${activeProjectId}" is missing a readable .project.yaml`],
      };
    } catch (error) {
      return {
        activeProjectId,
        resolutionSource: null,
        targetProject: null,
        resolutionErrors: [error instanceof Error ? error.message : 'failed to resolve active project'],
      };
    }
  }

  if (!repoPath) {
    return {
      activeProjectId,
      resolutionSource: null,
      targetProject: null,
      resolutionErrors: ['no active project is set'],
    };
  }

  const normalizedRepoPath = normalizePath(repoPath);
  const match = registry.projects
    .map((project) => ({ ...project, path: normalizePath(project.path) }))
    .filter((project) => isWithinProject(normalizedRepoPath, project.path))
    .sort((a, b) => b.path.length - a.path.length)[0];

  if (!match) {
    return {
      activeProjectId,
      resolutionSource: null,
      targetProject: null,
      resolutionErrors: ['target project could not be resolved from repo_path; pass project_path explicitly'],
    };
  }

  const targetProject = await buildTargetFromProjectPath(match.path, match.id, match.name);
  return {
    activeProjectId,
    resolutionSource: targetProject ? 'repo_path_match' : null,
    targetProject,
    resolutionErrors: targetProject ? [] : [`project_path is not a resolvable managed project: ${match.path}`],
  };
}
