import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'yaml';
import { loadRegistry, saveRegistry } from '../utils/registry.js';
import { generateClaudeMd, generateAgentsMd, updateClaudeMdState } from '../utils/distill.js';
import { writeFile } from 'fs/promises';

export async function switchProject(args: any): Promise<string> {
  const { project } = args;
  const registry = await loadRegistry();

  const found = registry.projects.find(
    (p) => p.id === project || p.name === project
  );

  if (!found) {
    return `❌ Project "${project}" not found.\n\nAvailable projects:\n${registry.projects.map((p) => `- ${p.name} (${p.id})`).join('\n')}`;
  }

  registry.active_project = found.id;
  found.last_accessed = new Date().toISOString();
  await saveRegistry(registry);

  // Auto-bootstrap: generate CLAUDE.md / AGENTS.md for legacy projects that lack them
  const bootstrapNotes: string[] = [];
  const claudeMdPath = join(found.path, 'CLAUDE.md');
  const agentsMdPath = join(found.path, 'AGENTS.md');

  if (!existsSync(claudeMdPath)) {
    // Read project metadata for description
    let description = '';
    try {
      const projYaml = yaml.parse(await readFile(join(found.path, '.project.yaml'), 'utf-8'));
      description = projYaml?.meta?.description || '';
    } catch {}

    // Read existing state for context
    let state: any = undefined;
    try {
      state = yaml.parse(await readFile(join(found.path, '.context', 'state.yaml'), 'utf-8'));
    } catch {}

    const claudeMd = generateClaudeMd(found.name, description, state);
    await writeFile(claudeMdPath, claudeMd, 'utf-8');
    bootstrapNotes.push('📝 CLAUDE.md auto-generated (enrich Project DNA section when ready)');

    // If state exists, sync it into CLAUDE.md
    if (state) {
      await updateClaudeMdState(claudeMdPath, state, found.name);
    }
  }

  if (!existsSync(agentsMdPath)) {
    let description = '';
    try {
      const projYaml = yaml.parse(await readFile(join(found.path, '.project.yaml'), 'utf-8'));
      description = projYaml?.meta?.description || '';
    } catch {}

    const agentsMd = generateAgentsMd(found.name, description);
    await writeFile(agentsMdPath, agentsMd, 'utf-8');
    bootstrapNotes.push('📝 AGENTS.md auto-generated (for Codex CLI compatibility)');
  }

  const bootstrap = bootstrapNotes.length > 0 ? '\n\n' + bootstrapNotes.join('\n') : '';

  return `✅ Switched to project "${found.name}"\n\nPath: ${found.path}\nStatus: ${found.status}\n\nContext loaded from:\n- ${found.path}/.project.yaml\n- ${found.path}/.context/quick-start.md\n- ${found.path}/.context/state.yaml${bootstrap}`;
}

export async function listProjects(): Promise<string> {
  const registry = await loadRegistry();

  if (registry.projects.length === 0) {
    return 'No projects found. Use agenticos_init to create your first project.';
  }

  const lines = ['# AgenticOS Projects\n'];

  for (const p of registry.projects) {
    const active = p.id === registry.active_project ? '🟢 ' : '';
    lines.push(`${active}**${p.name}** (${p.id})`);
    lines.push(`  Path: ${p.path}`);
    lines.push(`  Status: ${p.status}`);
    if (p.last_recorded) {
      const recordedDate = new Date(p.last_recorded).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      lines.push(`  Last recorded: ${recordedDate}`);
    } else {
      lines.push(`  Last recorded: Never`);
    }
    lines.push(`  Last accessed: ${p.last_accessed}\n`);
  }

  return lines.join('\n');
}

export async function getStatus(): Promise<string> {
  const registry = await loadRegistry();

  if (!registry.active_project) {
    return '❌ No active project. Use agenticos_switch first.';
  }

  const project = registry.projects.find((p) => p.id === registry.active_project);
  if (!project) return '❌ Active project not found in registry.';

  // Read state.yaml
  const statePath = join(project.path, '.context', 'state.yaml');
  let state: any = {};
  try {
    const content = await readFile(statePath, 'utf-8');
    state = yaml.parse(content) || {};
  } catch {
    return `❌ Failed to read state.yaml for project "${project.name}"`;
  }

  const lines: string[] = [];
  lines.push(`# Status: ${project.name}\n`);

  if (project.last_recorded) {
    const recordedDate = new Date(project.last_recorded).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    lines.push(`📍 Last recorded: ${recordedDate}`);
  } else {
    lines.push(`📍 Last recorded: Never`);
  }

  if (state.session?.last_backup) {
    const backupDate = new Date(state.session.last_backup).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    lines.push(`💾 Last saved: ${backupDate}`);
  }

  lines.push('');
  if (state.current_task) {
    lines.push(`🎯 Current task: ${state.current_task.title || 'Untitled'} (${state.current_task.status || 'unknown'})`);
  } else {
    lines.push(`🎯 Current task: None`);
  }

  const pending = state.working_memory?.pending || [];
  if (pending.length > 0) {
    lines.push(`\n📋 Pending (${pending.length}):`);
    for (const item of pending.slice(0, 5)) {
      lines.push(`  - ${item}`);
    }
  } else {
    lines.push(`\n📋 Pending: None`);
  }

  const decisions = state.working_memory?.decisions || [];
  if (decisions.length > 0) {
    lines.push(`\n✅ Recent decisions (${decisions.length}):`);
    for (const item of decisions.slice(-3)) {
      lines.push(`  - ${item}`);
    }
  }

  return lines.join('\n');
}
