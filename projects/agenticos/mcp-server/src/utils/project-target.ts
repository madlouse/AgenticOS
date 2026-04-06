import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import yaml from 'yaml';
import { loadRegistry, type Project, type Registry } from './registry.js';
import { buildArchivedReferenceMessage, isArchivedReferenceProject } from './project-contract.js';

export interface ResolvedManagedProjectTarget {
  registry: Registry;
  project: Project;
  projectYaml: any;
  projectId: string;
  projectName: string;
  projectPath: string;
  projectYamlPath: string;
  quickStartPath: string;
  statePath: string;
  conversationsDir: string;
  markerPath: string;
}

interface ResolveManagedProjectTargetArgs {
  project?: string;
  commandName: string;
}

export interface ManagedProjectContextPaths {
  quickStartPath: string;
  statePath: string;
  conversationsDir: string;
  markerPath: string;
}

function uniqueMatch<T>(matches: T[], notFound: string, ambiguous: string): T {
  if (matches.length === 0) {
    throw new Error(notFound);
  }
  if (matches.length > 1) {
    throw new Error(ambiguous);
  }
  return matches[0];
}

function assertRegistryUniqueness(registry: Registry, project: Project, requestedProject?: string): void {
  const sameId = registry.projects.filter((candidate) => candidate.id === project.id);
  if (sameId.length > 1) {
    throw new Error(`Project identity is ambiguous because registry id "${project.id}" is duplicated.`);
  }

  const samePath = registry.projects.filter((candidate) => candidate.path === project.path);
  if (samePath.length > 1) {
    throw new Error(`Project identity is ambiguous because registry path "${project.path}" is duplicated.`);
  }

  const sameName = registry.projects.filter((candidate) => candidate.name === project.name);
  if (sameName.length > 1) {
    throw new Error(`Project identity is ambiguous because registry name "${project.name}" is duplicated.`);
  }
}

export function resolveManagedProjectContextPaths(projectPath: string, projectYaml: any): ManagedProjectContextPaths {
  const agentContext = projectYaml?.agent_context || {};
  const statePath = join(projectPath, typeof agentContext.current_state === 'string' && agentContext.current_state.trim().length > 0
    ? agentContext.current_state.trim()
    : '.context/state.yaml');
  const quickStartPath = join(projectPath, typeof agentContext.quick_start === 'string' && agentContext.quick_start.trim().length > 0
    ? agentContext.quick_start.trim()
    : '.context/quick-start.md');
  const conversationsDir = join(projectPath, typeof agentContext.conversations === 'string' && agentContext.conversations.trim().length > 0
    ? agentContext.conversations.trim()
    : '.context/conversations');
  const markerPath = typeof agentContext.last_record_marker === 'string' && agentContext.last_record_marker.trim().length > 0
    ? join(projectPath, agentContext.last_record_marker.trim())
    : join(dirname(statePath), '.last_record');

  return {
    quickStartPath,
    statePath,
    conversationsDir,
    markerPath,
  };
}

export async function resolveManagedProjectTarget(args: ResolveManagedProjectTargetArgs): Promise<ResolvedManagedProjectTarget> {
  const registry = await loadRegistry();
  const requestedProject = typeof args.project === 'string' && args.project.trim().length > 0
    ? args.project.trim()
    : null;

  if (!requestedProject && !registry.active_project) {
    throw new Error(`No active project. Use agenticos_switch first or pass project to ${args.commandName}.`);
  }

  let project: Project;
  if (requestedProject) {
    const matches = registry.projects.filter((candidate) =>
      candidate.id === requestedProject ||
      candidate.name === requestedProject ||
      candidate.path === requestedProject
    );
    project = uniqueMatch(
      matches,
      `Project "${requestedProject}" not found in registry.`,
      `Project "${requestedProject}" is ambiguous in registry.`
    );

    if (registry.active_project && registry.active_project !== project.id) {
      throw new Error(
        `Requested project "${requestedProject}" does not match active project "${registry.active_project}". Switch first or pass the active project explicitly.`
      );
    }
  } else {
    project = uniqueMatch(
      registry.projects.filter((candidate) => candidate.id === registry.active_project),
      `Active project "${registry.active_project}" not found in registry.`,
      `Active project "${registry.active_project}" is ambiguous in registry.`
    );
  }

  assertRegistryUniqueness(registry, project, requestedProject || undefined);

  const projectYamlPath = join(project.path, '.project.yaml');
  let projectYaml: any;
  try {
    projectYaml = yaml.parse(await readFile(projectYamlPath, 'utf-8')) || {};
  } catch {
    throw new Error(`Project identity could not be proven because ${projectYamlPath} is missing or unreadable.`);
  }

  const metaId = projectYaml?.meta?.id;
  const metaName = projectYaml?.meta?.name;

  if (!metaId) {
    throw new Error(`Project identity could not be proven because ${projectYamlPath} is missing meta.id.`);
  }
  if (metaId !== project.id) {
    throw new Error(
      `Project identity mismatch: registry id "${project.id}" does not match .project.yaml meta.id "${metaId}".`
    );
  }
  if (metaName && metaName !== project.name) {
    throw new Error(
      `Project identity mismatch: registry name "${project.name}" does not match .project.yaml meta.name "${metaName}".`
    );
  }

  if (isArchivedReferenceProject(projectYaml, project.status)) {
    throw new Error(
      `${buildArchivedReferenceMessage(project.name, projectYaml?.archive_contract?.replacement_project)} ${args.commandName} only works with active managed projects.`
    );
  }

  const contextPaths = resolveManagedProjectContextPaths(project.path, projectYaml);

  return {
    registry,
    project,
    projectYaml,
    projectId: project.id,
    projectName: project.name,
    projectPath: project.path,
    projectYamlPath,
    quickStartPath: contextPaths.quickStartPath,
    statePath: contextPaths.statePath,
    conversationsDir: contextPaths.conversationsDir,
    markerPath: contextPaths.markerPath,
  };
}
