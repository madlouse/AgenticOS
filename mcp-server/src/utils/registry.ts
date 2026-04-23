import { readFile, writeFile, mkdir, rename, rm } from 'fs/promises';
import { join, isAbsolute, relative } from 'path';
import yaml from 'yaml';
import { detectCanonicalMainWriteProtection } from './canonical-main-guard.js';

export const MISSING_AGENTICOS_HOME_MESSAGE =
  'AGENTICOS_HOME is not set. AgenticOS requires an explicit workspace root. Set AGENTICOS_HOME before starting agenticos-mcp.';

/** Resolve AGENTICOS_HOME with fail-fast semantics */
export function getAgenticOSHome(): string {
  const configuredHome = process.env.AGENTICOS_HOME?.trim();
  if (!configuredHome) {
    throw new Error(MISSING_AGENTICOS_HOME_MESSAGE);
  }
  return configuredHome;
}

/**
 * Returns the confirmed canonical AGENTICOS_HOME for this machine.
 *
 * Resolution order:
 * 1. AGENTICOS_HOME environment variable (already confirmed by operator)
 * 2. Registry's last-used workspace (persisted canonical home)
 * 3. null (no confirmed home — operator must bootstrap)
 *
 * Once confirmed, the canonical home persists until explicitly migrated.
 * Install/upgrade surfaces must NOT redefine this value silently.
 */
export function pickMostRecentlyAccessedPath(projects: Project[]): string | null {
  const sorted = [...projects].sort(
    (a, b) => new Date(b.last_accessed).getTime() - new Date(a.last_accessed).getTime(),
  );
  return sorted[0]?.path ?? null;
}

export async function getCanonicalAgenticosHome(): Promise<string | null> {
  // Priority 1: AGENTICOS_HOME env var — always confirmed by operator when set
  const configuredHome = process.env.AGENTICOS_HOME;
  if (configuredHome !== undefined && configuredHome.trim() !== '') {
    return configuredHome.trim();
  }

  // Priority 2: Registry — last-used project path (canonical home persists here)
  try {
    const registry = await loadRegistryFresh();
    if (registry.projects.length === 0) return null;
    return pickMostRecentlyAccessedPath(registry.projects);
  } catch {
    // loadRegistryFresh returns defaultRegistry on ENOENT/no-parse,
    // so only unexpected errors reach here
    return null;
  }
}

/** Convert an absolute path under AGENTICOS_HOME to a relative path for storage */
function toRelative(absPath: string): string {
  const home = getAgenticOSHome();
  if (isAbsolute(absPath) && absPath.startsWith(home)) {
    return relative(home, absPath);
  }
  return absPath; // external path: store as-is
}

/** Resolve a stored path (may be relative or absolute) to an absolute path */
export function resolvePath(storedPath: string): string {
  if (isAbsolute(storedPath)) return storedPath;
  return join(getAgenticOSHome(), storedPath);
}

/** Lazy registry path — evaluated at call time, not module load time */
function getRegistryPath(): string {
  return join(getAgenticOSHome(), '.agent-workspace', 'registry.yaml');
}

export interface Project {
  id: string;
  name: string;
  path: string; // stored as relative path in YAML; resolved to absolute at runtime
  status: 'active' | 'archived';
  created: string;
  last_accessed: string;
  last_recorded?: string; // ISO timestamp of last agenticos_record call
}

export interface Registry {
  version: string;
  last_updated: string;
  active_project: string | null;
  projects: Project[];
}

function defaultRegistry(): Registry {
  return {
    version: '1.0.0',
    last_updated: new Date().toISOString(),
    active_project: null,
    projects: [],
  };
}

function normalizeLoadedRegistry(raw: Registry): Registry {
  return {
    ...raw,
    projects: Array.isArray(raw.projects)
      ? raw.projects.map((p) => ({
          ...p,
          path: resolvePath(p.path),
        }))
      : [],
  };
}

async function loadRegistryFresh(): Promise<Registry> {
  const registryPath = getRegistryPath();
  try {
    const content = await readFile(registryPath, 'utf-8');
    const raw: Registry = yaml.parse(content);
    if (!raw || typeof raw !== 'object') {
      throw new Error('registry yaml did not parse into an object');
    }
    return normalizeLoadedRegistry(raw);
  } catch {
    return defaultRegistry();
  }
}

export async function loadRegistry(): Promise<Registry> {
  return await loadRegistryFresh();
}

export { loadRegistryFresh };

function toStoredRegistry(registry: Registry): Registry {
  return {
    ...registry,
    projects: registry.projects.map((p) => ({
      ...p,
      path: toRelative(p.path),
    })),
  };
}

function getRegistryLockPath(): string {
  return join(getAgenticOSHome(), '.agent-workspace', 'registry.lock');
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRegistryLock<T>(callback: () => Promise<T>): Promise<T> {
  const writeProtection = await detectCanonicalMainWriteProtection(getAgenticOSHome());
  if (writeProtection.blocked) {
    throw new Error(writeProtection.reason);
  }

  const workspaceDir = join(getAgenticOSHome(), '.agent-workspace');
  const lockPath = getRegistryLockPath();
  await mkdir(workspaceDir, { recursive: true });

  let locked = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await mkdir(lockPath);
      locked = true;
      break;
    } catch {
      await sleep(10);
    }
  }

  if (!locked) {
    throw new Error(`failed to acquire registry lock at ${lockPath}`);
  }

  try {
    return await callback();
  } finally {
    await rm(lockPath, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function writeRegistrySnapshot(registry: Registry): Promise<Registry> {
  const nextRegistry: Registry = {
    ...registry,
    last_updated: new Date().toISOString(),
  };
  const registryPath = getRegistryPath();
  const tempPath = `${registryPath}.tmp-${process.pid}-${Date.now()}`;
  const toStore = toStoredRegistry(nextRegistry);

  await mkdir(join(getAgenticOSHome(), '.agent-workspace'), { recursive: true });
  await writeFile(tempPath, yaml.stringify(toStore), 'utf-8');
  await rename(tempPath, registryPath);
  return normalizeLoadedRegistry(nextRegistry);
}

export async function saveRegistry(registry: Registry): Promise<void> {
  await withRegistryLock(async () => {
    await writeRegistrySnapshot(registry);
  });
}

export async function patchRegistry(
  mutator: (registry: Registry) => void | Registry | Promise<void | Registry>,
): Promise<Registry> {
  return await withRegistryLock(async () => {
    const current = await loadRegistryFresh();
    const maybeNext = await mutator(current);
    return await writeRegistrySnapshot(maybeNext || current);
  });
}

export async function patchProjectMetadata(
  projectId: string,
  patch:
    | Partial<Project>
    | ((project: Project) => Partial<Project> | void | Promise<Partial<Project> | void>),
): Promise<Registry> {
  return await patchRegistry(async (registry) => {
    const projectIndex = registry.projects.findIndex((candidate) => candidate.id === projectId);
    if (projectIndex < 0) {
      throw new Error(`Project "${projectId}" not found in registry.`);
    }

    const currentProject = registry.projects[projectIndex];
    const nextPatch = typeof patch === 'function'
      ? await patch(currentProject)
      : patch;

    registry.projects[projectIndex] = {
      ...currentProject,
      ...(nextPatch || {}),
    };
  });
}
