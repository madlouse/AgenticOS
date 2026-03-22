import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'yaml';
import { loadRegistry, saveRegistry } from '../utils/registry.js';
import { generateClaudeMd, generateAgentsMd, updateClaudeMdState, upgradeClaudeMd, CURRENT_TEMPLATE_VERSION, extractTemplateVersion } from '../utils/distill.js';
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

  // Auto-bootstrap: generate or upgrade CLAUDE.md / AGENTS.md
  const bootstrapNotes: string[] = [];
  const claudeMdPath = join(found.path, 'CLAUDE.md');
  const agentsMdPath = join(found.path, 'AGENTS.md');

  let description = '';
  let state: any = undefined;
  let quickStart = '';
  try {
    const projYaml = yaml.parse(await readFile(join(found.path, '.project.yaml'), 'utf-8'));
    description = projYaml?.meta?.description || '';
  } catch {}
  try {
    state = yaml.parse(await readFile(join(found.path, '.context', 'state.yaml'), 'utf-8'));
  } catch {}
  try {
    quickStart = await readFile(join(found.path, '.context', 'quick-start.md'), 'utf-8');
  } catch {}

  // CLAUDE.md: create if missing, upgrade if stale template version
  if (!existsSync(claudeMdPath)) {
    await writeFile(claudeMdPath, generateClaudeMd(found.name, description, state), 'utf-8');
    bootstrapNotes.push('📝 CLAUDE.md created');
  } else {
    const existingContent = await readFile(claudeMdPath, 'utf-8');
    const existingVersion = extractTemplateVersion(existingContent);
    if (existingVersion < CURRENT_TEMPLATE_VERSION) {
      await writeFile(claudeMdPath, upgradeClaudeMd(claudeMdPath, found.name, description, state), 'utf-8');
      bootstrapNotes.push(`📝 CLAUDE.md upgraded: v${existingVersion} → v${CURRENT_TEMPLATE_VERSION} (user content preserved)`);
    }
  }

  // AGENTS.md: create if missing, upgrade if stale
  if (!existsSync(agentsMdPath)) {
    await writeFile(agentsMdPath, generateAgentsMd(found.name, description), 'utf-8');
    bootstrapNotes.push('📝 AGENTS.md created');
  } else {
    const existingContent = await readFile(agentsMdPath, 'utf-8');
    const existingVersion = extractTemplateVersion(existingContent);
    if (existingVersion < CURRENT_TEMPLATE_VERSION) {
      await writeFile(agentsMdPath, generateAgentsMd(found.name, description), 'utf-8');
      bootstrapNotes.push(`📝 AGENTS.md upgraded: v${existingVersion} → v${CURRENT_TEMPLATE_VERSION}`);
    }
  }

  const bootstrap = bootstrapNotes.length > 0 ? '\n\n' + bootstrapNotes.join('\n') : '';

  // Build inline context summary
  const sep = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  const contextLines: string[] = [sep];

  // Project description: prefer .project.yaml, fall back to quick-start.md first paragraph
  let projectDescription = description;
  if (!projectDescription && quickStart) {
    // Extract first non-heading, non-empty paragraph from quick-start.md
    const paragraphs = quickStart
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('#'));
    if (paragraphs.length > 0) {
      projectDescription = paragraphs[0].trim();
    }
  }
  if (projectDescription) {
    contextLines.push(`📖 项目简介\n${projectDescription}\n`);
  }

  // Current task
  if (state?.current_task) {
    const task = state.current_task;
    contextLines.push(`🎯 当前任务：${task.title || 'Untitled'} (${task.status || 'unknown'})\n`);
  }

  // Last recorded
  if (found.last_recorded) {
    const recordedDate = new Date(found.last_recorded).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    contextLines.push(`📍 上次记录：${recordedDate}\n`);
  }

  // Pending items
  const pending: string[] = state?.working_memory?.pending || [];
  if (pending.length > 0) {
    contextLines.push(`📋 待办 (${pending.length}):`);
    for (const item of pending.slice(0, 5)) {
      contextLines.push(`  - ${item}`);
    }
    contextLines.push('');
  }

  // Recent decisions
  const decisions: string[] = state?.working_memory?.decisions || [];
  if (decisions.length > 0) {
    const recent = decisions.slice(-3);
    contextLines.push(`✅ 最近决策 (${recent.length}):`);
    for (const item of recent) {
      contextLines.push(`  - ${item}`);
    }
    contextLines.push('');
  }

  // Next step suggestion: first pending item
  if (pending.length > 0) {
    contextLines.push(`💡 建议下一步：${pending[0]}`);
  }

  // New project fallback
  if (!state?.current_task && pending.length === 0 && decisions.length === 0) {
    contextLines.push('新项目 — 尚无记录');
  }

  contextLines.push(sep);

  const inlineContext = '\n' + contextLines.join('\n');

  return `✅ Switched to project "${found.name}"\n\nPath: ${found.path}\nStatus: ${found.status}${inlineContext}${bootstrap}`;
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
