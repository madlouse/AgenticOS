import { dirname, join, posix } from 'path';

export interface ManagedProjectContextDisplayPaths {
  quickStartPath: string;
  statePath: string;
  conversationsDir: string;
  markerPath: string;
  knowledgeDir: string;
  tasksDir: string;
  artifactsDir: string;
}

export interface ManagedProjectContextPaths {
  quickStartPath: string;
  statePath: string;
  conversationsDir: string;
  markerPath: string;
  knowledgeDir: string;
  tasksDir: string;
  artifactsDir: string;
}

function normalizeRelativePath(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  return trimmed.replace(/\\/g, '/');
}

function normalizeDirectoryPath(value: unknown, fallback: string): string {
  const normalized = normalizeRelativePath(value, fallback);
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

export function resolveManagedProjectContextDisplayPaths(projectYaml: any): ManagedProjectContextDisplayPaths {
  const agentContext = projectYaml?.agent_context || {};
  const statePath = normalizeRelativePath(agentContext.current_state, '.context/state.yaml');
  const stateDir = posix.dirname(statePath);
  const defaultMarkerPath = stateDir === '.' ? '.context/.last_record' : `${stateDir}/.last_record`;

  return {
    quickStartPath: normalizeRelativePath(agentContext.quick_start, '.context/quick-start.md'),
    statePath,
    conversationsDir: normalizeDirectoryPath(agentContext.conversations, '.context/conversations/'),
    markerPath: normalizeRelativePath(agentContext.last_record_marker, defaultMarkerPath),
    knowledgeDir: normalizeDirectoryPath(agentContext.knowledge, 'knowledge/'),
    tasksDir: normalizeDirectoryPath(agentContext.tasks, 'tasks/'),
    artifactsDir: normalizeDirectoryPath(agentContext.artifacts, 'artifacts/'),
  };
}

export function resolveManagedProjectContextPaths(projectPath: string, projectYaml: any): ManagedProjectContextPaths {
  const displayPaths = resolveManagedProjectContextDisplayPaths(projectYaml);

  return {
    quickStartPath: join(projectPath, displayPaths.quickStartPath),
    statePath: join(projectPath, displayPaths.statePath),
    conversationsDir: join(projectPath, displayPaths.conversationsDir),
    markerPath: join(projectPath, displayPaths.markerPath),
    knowledgeDir: join(projectPath, displayPaths.knowledgeDir),
    tasksDir: join(projectPath, displayPaths.tasksDir),
    artifactsDir: join(projectPath, displayPaths.artifactsDir),
  };
}

export function joinDisplayPath(baseDir: string, relativePath: string): string {
  const trimmedBase = baseDir.replace(/\/+$/, '');
  const trimmedRelative = relativePath.replace(/^\/+/, '');
  if (trimmedBase.length === 0) return trimmedRelative;
  return `${trimmedBase}/${trimmedRelative}`;
}

