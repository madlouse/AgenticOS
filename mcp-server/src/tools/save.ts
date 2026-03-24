import { exec } from 'child_process';
import { updateClaudeMdState } from '../utils/distill.js';
import { readFile, writeFile } from 'fs/promises';
import yaml from 'yaml';
import { resolveManagedProjectTarget } from '../utils/project-target.js';

async function execCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        const enriched = Object.assign(error, { stdout, stderr });
        reject(enriched);
        return;
      }
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
      });
    });
  });
}

/** Detect git root from a directory path */
async function findGitRoot(fromDir: string): Promise<string | null> {
  try {
    const { stdout } = await execCommand(`git -C "${fromDir}" rev-parse --show-toplevel`);
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
  let resolved;
  try {
    resolved = await resolveManagedProjectTarget({
      project: args.project,
      commandName: 'agenticos_save',
    });
  } catch (error: any) {
    return `❌ ${error.message}`;
  }

  const { project, projectPath, statePath } = resolved;

  try {
    // Update state.yaml with backup timestamp
    const stateContent = await readFile(statePath, 'utf-8');
    const state = yaml.parse(stateContent);

    if (!state.session) state.session = {};
    state.session.last_backup = new Date().toISOString();

    await writeFile(statePath, yaml.stringify(state), 'utf-8');

    // Distill state.yaml into CLAUDE.md Current State section
    const claudeMdPath = `${projectPath}/CLAUDE.md`;
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

    // Phase 1: git add
    await execCommand(`${gitCmd} add "${projectPath}/"`);

    // Phase 2: git commit
    let committed = false;
    try {
      await execCommand(`${gitCmd} commit -m "${commitMessage}"`);
      committed = true;
    } catch (e: any) {
      const msg = (e.stderr || e.stdout || e.message || '').toString();
      if (msg.includes('nothing to commit')) {
        committed = false; // not an error
      } else {
        return `⚠️ State saved locally but git commit failed\n\nError: ${e.message}\nTimestamp: ${state.session.last_backup}${claudeMdNote}`;
      }
    }

    // Phase 3: git push
    let pushed = false;
    if (committed) {
      try {
        await execCommand(`${gitCmd} push`);
        pushed = true;
      } catch { /* push failure is degraded, not fatal */ }
    }

    // Build structured status
    const phases: string[] = [];
    phases.push('✅ State saved locally');
    if (committed) phases.push('📦 Git commit created');
    else phases.push('📦 No new changes to commit');
    if (pushed) phases.push('☁️ Pushed to remote');
    else if (committed) phases.push('⚠️ Push failed (committed locally, not synced)');

    return `${phases.join('\n')}\n\nProject: "${project.name}"\nCommit: ${commitMessage}\nTimestamp: ${state.session.last_backup}${claudeMdNote}`;
  } catch (error: any) {
    return `⚠️ Partial save completed\n\nError: ${error.message}`;
  }
}
