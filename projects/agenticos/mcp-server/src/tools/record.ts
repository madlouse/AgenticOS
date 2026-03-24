import { readFile, writeFile, mkdir } from 'fs/promises';
import yaml from 'yaml';
import { saveRegistry } from '../utils/registry.js';
import { updateClaudeMdState } from '../utils/distill.js';
import { resolveManagedProjectTarget } from '../utils/project-target.js';

function parseArray(val: unknown): string[] {
  if (Array.isArray(val)) return val as string[];
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed as string[];
    } catch {}
  }
  return [];
}

export async function recordSession(args: any): Promise<string> {
  const { summary, current_task } = args;
  const decisions = parseArray(args.decisions);
  const outcomes = parseArray(args.outcomes);
  const pending = parseArray(args.pending);

  if (!summary) {
    return '❌ summary is required. Provide a brief description of what happened.';
  }

  let resolved;
  try {
    resolved = await resolveManagedProjectTarget({
      project: args.project,
      commandName: 'agenticos_record',
    });
  } catch (error: any) {
    return `❌ ${error.message}`;
  }

  const { registry, project, projectPath, statePath, quickStartPath, conversationsDir: convDir, markerPath } = resolved;
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const time = now.toISOString().substring(11, 16);

  // 1. Append to conversations/YYYY-MM-DD.md
  await mkdir(convDir, { recursive: true });
  const convFile = `${convDir}/${today}.md`;

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
  const claudeMdPath = `${projectPath}/CLAUDE.md`;
  await updateClaudeMdState(claudeMdPath, state, project.name);

  // 4. Auto-enrich quick-start.md if it still contains boilerplate
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
