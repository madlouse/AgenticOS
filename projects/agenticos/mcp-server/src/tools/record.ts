import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import yaml from 'yaml';
import { loadRegistry, saveRegistry } from '../utils/registry.js';
import { updateClaudeMdState } from '../utils/distill.js';

export async function recordSession(args: any): Promise<string> {
  const {
    summary,
    decisions = [],
    outcomes = [],
    pending = [],
    current_task,
  } = args;

  if (!summary) {
    return '❌ summary is required. Provide a brief description of what happened.';
  }

  const registry = await loadRegistry();
  if (!registry.active_project) {
    return '❌ No active project. Use agenticos_switch first.';
  }

  const project = registry.projects.find((p) => p.id === registry.active_project);
  if (!project) return '❌ Active project not found in registry.';

  const projectPath = project.path;
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const time = now.toISOString().substring(11, 16);

  // 1. Append to conversations/YYYY-MM-DD.md
  const convDir = join(projectPath, '.context', 'conversations');
  await mkdir(convDir, { recursive: true });
  const convFile = join(convDir, `${today}.md`);

  let existing = '';
  try { existing = await readFile(convFile, 'utf-8'); } catch {}

  const sections: string[] = [];
  sections.push(`### ${time} — Session Record\n`);
  sections.push(`**Summary**: ${summary}\n`);
  if (outcomes.length > 0) {
    sections.push('**Outcomes**:');
    for (const o of outcomes) sections.push(`- ${o}`);
    sections.push('');
  }
  if (decisions.length > 0) {
    sections.push('**Decisions**:');
    for (const d of decisions) sections.push(`- ${d}`);
    sections.push('');
  }
  if (pending.length > 0) {
    sections.push('**Pending**:');
    for (const p of pending) sections.push(`- ${p}`);
    sections.push('');
  }

  const entry = sections.join('\n');

  if (existing) {
    await writeFile(convFile, existing + '\n\n' + entry, 'utf-8');
  } else {
    await writeFile(convFile, `# Sessions — ${today}\n\n${entry}`, 'utf-8');
  }

  // 2. Update state.yaml
  const statePath = join(projectPath, '.context', 'state.yaml');
  let state: any = {};
  try {
    const stateContent = await readFile(statePath, 'utf-8');
    state = yaml.parse(stateContent) || {};
  } catch {}

  if (!state.working_memory) state.working_memory = { facts: [], decisions: [], pending: [] };
  if (!state.session) state.session = {};

  if (decisions.length > 0) {
    const existing_decisions = state.working_memory.decisions || [];
    state.working_memory.decisions = [...existing_decisions, ...decisions];
  }
  if (pending.length > 0) {
    state.working_memory.pending = pending; // replace — pending is current state, not history
  }
  if (outcomes.length > 0) {
    const existing_facts = state.working_memory.facts || [];
    state.working_memory.facts = [...existing_facts, ...outcomes];
  }
  if (current_task) {
    state.current_task = {
      ...(state.current_task || {}),
      title: current_task.title || state.current_task?.title,
      status: current_task.status || 'in_progress',
      updated: now.toISOString(),
    };
  }

  state.session.last_backup = now.toISOString();
  await writeFile(statePath, yaml.stringify(state), 'utf-8');

  // 3. Sync CLAUDE.md Current State
  const claudeMdPath = join(projectPath, 'CLAUDE.md');
  await updateClaudeMdState(claudeMdPath, state, project.name);

  // 4. Auto-enrich quick-start.md if it still contains boilerplate
  const quickStartPath = join(projectPath, '.context', 'quick-start.md');
  try {
    const qsContent = await readFile(quickStartPath, 'utf-8');
    if (qsContent.includes('1. Define project goals')) {
      const outcomeLines = outcomes.length > 0
        ? outcomes.map((o: string) => `- ${o}`).join('\n')
        : '';
      const pendingLines = pending.length > 0
        ? pending.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')
        : '1. Continue development';

      const enriched = `# ${project.name} - Quick Start

## Project Overview
${summary}

## Current Status
- Started: ${today}
- Status: Active
${outcomeLines}

## Next Steps
${pendingLines}
`;
      await writeFile(quickStartPath, enriched, 'utf-8');
    }
  } catch {
    // quick-start.md doesn't exist — skip enrichment
  }

  // 5. Touch marker file for hook-based reminder system
  const markerPath = join(projectPath, '.context', '.last_record');
  await writeFile(markerPath, now.toISOString(), 'utf-8');

  // 6. Update registry with last_recorded timestamp
  registry.projects = registry.projects.map((p) =>
    p.id === project.id
      ? { ...p, last_recorded: now.toISOString() }
      : p
  );
  await saveRegistry(registry);

  return `✅ Session recorded for "${project.name}"\n\n` +
    `📝 Conversation: .context/conversations/${today}.md\n` +
    `📊 State: .context/state.yaml (updated)\n` +
    `📋 CLAUDE.md: Current State synced\n`;
}
