import { exec } from 'child_process';
import { promisify } from 'util';
import { loadRegistry } from '../utils/registry.js';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'yaml';

const execAsync = promisify(exec);

export async function saveState(args: any): Promise<string> {
  const { message = 'Auto-save from AgenticOS MCP' } = args;
  const registry = await loadRegistry();

  if (!registry.active_project) {
    return '❌ No active project. Use agenticos_switch first.';
  }

  const project = registry.projects.find((p) => p.id === registry.active_project);
  if (!project) {
    return '❌ Active project not found in registry.';
  }

  const projectPath = project.path;

  try {
    // Update state.yaml with backup timestamp
    const statePath = join(projectPath, '.context', 'state.yaml');
    const stateContent = await readFile(statePath, 'utf-8');
    const state = yaml.parse(stateContent);

    if (!state.session) state.session = {};
    state.session.last_backup = new Date().toISOString();

    await writeFile(statePath, yaml.stringify(state), 'utf-8');

    // Git operations
    await execAsync(`cd "${projectPath}" && git add -A`);
    await execAsync(`cd "${projectPath}" && git commit -m "${message}" || true`);
    await execAsync(`cd "${projectPath}" && git push || true`);

    return `✅ Saved and backed up project "${project.name}"\n\nCommit: ${message}\nTimestamp: ${state.session.last_backup}`;
  } catch (error: any) {
    return `⚠️ Partial save completed\n\nError: ${error.message}`;
  }
}
