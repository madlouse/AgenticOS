import { exec } from 'child_process';
import { promisify } from 'util';
import { loadRegistry } from '../utils/registry.js';
import { updateClaudeMdState } from '../utils/distill.js';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'yaml';

const execAsync = promisify(exec);

/** Detect git root from a directory path */
async function findGitRoot(fromDir: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`git -C "${fromDir}" rev-parse --show-toplevel`);
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function saveState(args: any): Promise<string> {
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').substring(0, 16);
  const { message } = args;
  const commitMessage = message || `Auto-save [${timestamp}]`;
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

    // Distill state.yaml into CLAUDE.md Current State section
    const claudeMdPath = join(projectPath, 'CLAUDE.md');
    const distillResult = await updateClaudeMdState(claudeMdPath, state, project.name);
    const claudeMdNote = distillResult.created
      ? '\n📝 CLAUDE.md was auto-generated (Project DNA section needs manual enrichment)'
      : '';

    // Find git root from the project path (works regardless of AGENTICOS_HOME)
    const gitRoot = await findGitRoot(projectPath);
    if (!gitRoot) {
      return `⚠️ State saved but no git repo found at ${projectPath}\n\nTimestamp: ${state.session.last_backup}${claudeMdNote}`;
    }

    // Project-scoped git: only stage this project's files + registry
    const gitCmd = `git -C "${gitRoot}"`;
    await execAsync(`${gitCmd} add "${projectPath}/"`);
    await execAsync(`${gitCmd} commit -m "${commitMessage}" || true`);
    await execAsync(`${gitCmd} push || true`);

    return `✅ Saved and backed up project "${project.name}"\n\nCommit: ${commitMessage}\nTimestamp: ${state.session.last_backup}${claudeMdNote}`;
  } catch (error: any) {
    return `⚠️ Partial save completed\n\nError: ${error.message}`;
  }
}
