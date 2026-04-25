import { readFile, writeFile, mkdir } from 'fs/promises';
import yaml from 'yaml';
import { patchProjectMetadata } from '../utils/registry.js';
import { updateClaudeMdState } from '../utils/distill.js';
import { resolveManagedProjectTarget } from '../utils/project-target.js';
import { resolveContextPolicyPlan } from '../utils/context-policy-plan.js';
import {
  buildConversationRoutingStatusLines,
  detectLegacyTrackedTranscriptStatus,
  resolveConversationRoutingPlan,
} from '../utils/conversation-routing.js';
import { type StateYamlSchema } from '../utils/yaml-schemas.js';

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

  const { project, projectPath, projectYaml, statePath, markerPath } = resolved;

  const contextPolicyPlan = resolveContextPolicyPlan({
    projectName: project.name,
    projectPath,
    projectYaml,
  });
  const conversationRoutingPlan = resolveConversationRoutingPlan(contextPolicyPlan);
  const legacyTranscriptStatus = await detectLegacyTrackedTranscriptStatus(contextPolicyPlan);
  if (legacyTranscriptStatus === 'misconfigured_public_raw_target') {
    return `❌ agenticos_record blocked for "${project.name}" because public transcript routing is misconfigured. Raw transcript destination must remain sidecar-only for public_distilled projects.`;
  }
  const convDir = conversationRoutingPlan.raw_conversations_dir;
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
  let state: StateYamlSchema = {};
  try {
    const stateContent = await readFile(statePath, 'utf-8');
    state = yaml.parse(stateContent) as StateYamlSchema || {};
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

  // 4. Touch marker file for hook-based reminder system
  await writeFile(markerPath, now.toISOString(), 'utf-8');

  // 5. Update registry with last_recorded timestamp
  await patchProjectMetadata(project.id, {
    last_recorded: now.toISOString(),
  });

  const routingNotes = buildConversationRoutingStatusLines(conversationRoutingPlan, legacyTranscriptStatus);
  return `✅ Session recorded for "${project.name}"\n\n` +
    `📝 Raw conversation: ${conversationRoutingPlan.raw_conversations_display_dir}${today}.md\n` +
    `📊 State: ${contextPolicyPlan.trackedContextDisplayPaths.state} (updated)\n` +
    `📋 CLAUDE.md: Current State synced\n` +
    (routingNotes.length > 0 ? `\n${routingNotes.join('\n')}\n` : '');
}
