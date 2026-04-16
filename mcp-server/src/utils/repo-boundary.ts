import { access, readFile } from 'fs/promises';
import { basename, isAbsolute, join, resolve, sep } from 'path';
import yaml from 'yaml';
import { type ProjectTopology, validateManagedProjectTopology } from './project-contract.js';
import { getAgenticOSHome, loadRegistry } from './registry.js';
import { getSessionProjectBinding } from './session-context.js';
import { deriveExpectedWorktreeRoot } from './worktree-topology.js';

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
  topology: ProjectTopology;
  githubRepo: string | null;
  sourceRepoRoots: string[];
  sourceRepoRootsDeclared: boolean;
  expectedWorktreeRoot: string | null;
}

export interface GuardrailProjectResolution {
  activeProjectId: string | null;
  resolutionSource: 'explicit_project_path' | 'repo_path_match' | 'session_project' | null;
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

interface ProjectBoundaryMetadata extends GuardrailProjectTarget {
  topologyValidationError: string | null;
}

async function loadProjectBoundaryMetadata(
  projectPath: string,
  fallbackId?: string,
  fallbackName?: string,
): Promise<ProjectBoundaryMetadata | null> {
  const normalizedProjectPath = normalizePath(projectPath);
  const projectYamlPath = join(normalizedProjectPath, '.project.yaml');
  if (!(await pathExists(projectYamlPath))) {
    return null;
  }

  const projectYaml = yaml.parse(await readFile(projectYamlPath, 'utf-8'));
  if (!projectYaml || typeof projectYaml !== 'object') {
    throw new Error(`${projectYamlPath} did not parse to a project object`);
  }
  const sourceRepoRoots = resolveDeclaredSourceRepoRoots(normalizedProjectPath, projectYaml);
  const name = String(projectYaml?.meta?.name || fallbackName || fallbackId || basename(normalizedProjectPath));
  const topologyValidation = validateManagedProjectTopology(name, projectYaml);
  const topology = topologyValidation.ok ? topologyValidation.topology : null;
  const projectId = String(projectYaml?.meta?.id || fallbackId || basename(normalizedProjectPath));

  return {
    id: projectId,
    name,
    path: normalizedProjectPath,
    statePath: resolveProjectStatePath(normalizedProjectPath, projectYaml),
    projectYamlPath,
    topology: topology || 'local_directory_only',
    githubRepo: typeof projectYaml?.source_control?.github_repo === 'string' && projectYaml.source_control.github_repo.trim().length > 0
      ? projectYaml.source_control.github_repo.trim()
      : null,
    sourceRepoRoots: sourceRepoRoots.roots,
    sourceRepoRootsDeclared: sourceRepoRoots.declared,
    expectedWorktreeRoot: topology === 'github_versioned'
      ? deriveExpectedWorktreeRoot(getAgenticOSHome(), projectId)
      : null,
    topologyValidationError: topologyValidation.ok ? null : topologyValidation.message,
  };
}

async function buildTargetFromProjectPath(
  projectPath: string,
  fallbackId?: string,
  fallbackName?: string,
): Promise<GuardrailProjectTarget | null> {
  const metadata = await loadProjectBoundaryMetadata(projectPath, fallbackId, fallbackName);
  if (!metadata) {
    return null;
  }

  if (metadata.topologyValidationError) {
    throw new Error(metadata.topologyValidationError);
  }

  const { topologyValidationError: _topologyValidationError, ...target } = metadata;
  return target;
}

function uniqueRegistryProjectMatch<T>(matches: T[], notFound: string, ambiguous: string): T {
  if (matches.length === 0) {
    throw new Error(notFound);
  }
  if (matches.length > 1) {
    throw new Error(ambiguous);
  }
  return matches[0];
}

async function resolveRegistryProjectTarget(project: {
  id: string;
  name: string;
  path: string;
}): Promise<GuardrailProjectTarget | null> {
  return await buildTargetFromProjectPath(project.path, project.id, project.name);
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
  const sessionProject = getSessionProjectBinding();

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

  if (repoPath) {
    try {
      const normalizedRepoPath = normalizePath(repoPath);
      const candidates: Array<{
        targetProject: GuardrailProjectTarget | null;
        matchLength: number;
        resolutionError: string | null;
      }> = [];

      for (const project of registry.projects) {
        const projectMetadata = await loadProjectBoundaryMetadata(project.path, project.id, project.name);
        if (!projectMetadata) continue;

        const matchedRoots = [
          projectMetadata.path,
          ...projectMetadata.sourceRepoRoots,
          ...(projectMetadata.expectedWorktreeRoot ? [projectMetadata.expectedWorktreeRoot] : []),
        ].filter((candidatePath) => isWithinProject(normalizedRepoPath, candidatePath));

        if (matchedRoots.length === 0) continue;
        const { topologyValidationError, ...targetProject } = projectMetadata;

        candidates.push({
          targetProject: topologyValidationError ? null : targetProject,
          matchLength: Math.max(...matchedRoots.map((candidatePath) => normalizePath(candidatePath).length)),
          resolutionError: topologyValidationError,
        });
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.matchLength - a.matchLength);
        const strongestMatchLength = candidates[0].matchLength;
        const strongestMatches = candidates.filter((candidate) => candidate.matchLength === strongestMatchLength);

        if (strongestMatches.length > 1) {
          return {
            activeProjectId,
            resolutionSource: null,
            targetProject: null,
            resolutionErrors: [`repo_path "${repoPath}" matches multiple managed projects; pass project_path explicitly`],
          };
        }

        if (strongestMatches[0].resolutionError) {
          return {
            activeProjectId,
            resolutionSource: null,
            targetProject: null,
            resolutionErrors: [strongestMatches[0].resolutionError],
          };
        }

        return {
          activeProjectId,
          resolutionSource: 'repo_path_match',
          targetProject: strongestMatches[0].targetProject,
          resolutionErrors: [],
        };
      }
    } catch (error) {
      return {
        activeProjectId,
        resolutionSource: null,
        targetProject: null,
        resolutionErrors: [error instanceof Error ? error.message : `failed to resolve repo_path: ${repoPath}`],
      };
    }
  }

  if (sessionProject) {
    try {
      const project = uniqueRegistryProjectMatch(
        registry.projects.filter((candidate) =>
          candidate.id === sessionProject.projectId || candidate.path === sessionProject.projectPath
        ),
        `Session project "${sessionProject.projectId}" not found in registry.`,
        `Session project "${sessionProject.projectId}" is ambiguous in registry.`,
      );
      const targetProject = await resolveRegistryProjectTarget(project);
      return {
        activeProjectId,
        resolutionSource: targetProject ? 'session_project' : null,
        targetProject,
        resolutionErrors: targetProject ? [] : [`session project "${sessionProject.projectId}" is missing a readable .project.yaml`],
      };
    } catch (error) {
      return {
        activeProjectId,
        resolutionSource: null,
        targetProject: null,
        resolutionErrors: [error instanceof Error ? error.message : 'failed to resolve session project'],
      };
    }
  }

  return {
    activeProjectId,
    resolutionSource: null,
    targetProject: null,
    resolutionErrors: repoPath
      ? ['target project could not be resolved from repo_path or session binding; pass project_path explicitly']
      : [`No project_path, repo_path proof, or session binding is available for ${commandName}.`],
  };
}
