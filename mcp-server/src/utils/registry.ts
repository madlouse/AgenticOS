import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import yaml from 'yaml';

const REGISTRY_PATH = join(homedir(), 'AgenticOS', '.agent-workspace', 'registry.yaml');

export interface Project {
  id: string;
  name: string;
  path: string;
  status: 'active' | 'archived';
  created: string;
  last_accessed: string;
}

export interface Registry {
  version: string;
  last_updated: string;
  active_project: string | null;
  projects: Project[];
}

export async function loadRegistry(): Promise<Registry> {
  try {
    const content = await readFile(REGISTRY_PATH, 'utf-8');
    return yaml.parse(content);
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
  registry.last_updated = new Date().toISOString();
  await mkdir(join(homedir(), 'AgenticOS', '.agent-workspace'), { recursive: true });
  await writeFile(REGISTRY_PATH, yaml.stringify(registry), 'utf-8');
}
