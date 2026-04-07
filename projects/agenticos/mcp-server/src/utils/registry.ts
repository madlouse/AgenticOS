import { readFile, writeFile, mkdir } from 'fs/promises';
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

export async function loadRegistry(): Promise<Registry> {
  const registryPath = getRegistryPath();
  try {
    const content = await readFile(registryPath, 'utf-8');
    const raw: Registry = yaml.parse(content);
    // Resolve relative paths to absolute at load time
    raw.projects = raw.projects.map((p) => ({
      ...p,
      path: resolvePath(p.path),
    }));
    return raw;
  } catch {
    return {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: null,
      projects: [],
    };
  }
}

export async function saveRegistry(registry: Registry): Promise<void> {
  const writeProtection = await detectCanonicalMainWriteProtection(getAgenticOSHome());
  if (writeProtection.blocked) {
    throw new Error(writeProtection.reason);
  }

  registry.last_updated = new Date().toISOString();
  // Convert absolute paths to relative before storing
  const toStore: Registry = {
    ...registry,
    projects: registry.projects.map((p) => ({
      ...p,
      path: toRelative(p.path),
    })),
  };
  await mkdir(join(getAgenticOSHome(), '.agent-workspace'), { recursive: true });
  await writeFile(getRegistryPath(), yaml.stringify(toStore), 'utf-8');
}
