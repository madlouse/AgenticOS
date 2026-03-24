import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'yaml';
import { loadRegistry, saveRegistry } from '../utils/registry.js';
import { generateClaudeMd, generateAgentsMd, updateClaudeMdState, upgradeClaudeMd, CURRENT_TEMPLATE_VERSION, extractTemplateVersion } from '../utils/distill.js';
import { writeFile } from 'fs/promises';

type GuardrailCommand = 'agenticos_preflight' | 'agenticos_branch_bootstrap' | 'agenticos_pr_scope_check';

interface GuardrailEvidenceEntry {
  command?: GuardrailCommand;
  recorded_at?: string;
  issue_id?: string | null;
  result?: {
    status?: string;
    summary?: string;
    block_reasons?: string[];
    redirect_actions?: string[];
    notes?: string[];
    branch_name?: string;
    worktree_path?: string;
  };
}

interface GuardrailEvidenceState {
  updated_at?: string;
  last_command?: GuardrailCommand;
  preflight?: GuardrailEvidenceEntry;
  branch_bootstrap?: GuardrailEvidenceEntry;
  pr_scope_check?: GuardrailEvidenceEntry;
}

function formatTimestamp(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

function getLatestGuardrailEntry(guardrailEvidence?: GuardrailEvidenceState): GuardrailEvidenceEntry | null {
  if (!guardrailEvidence?.last_command) return null;

  switch (guardrailEvidence.last_command) {
    case 'agenticos_preflight':
      return guardrailEvidence.preflight || null;
    case 'agenticos_branch_bootstrap':
      return guardrailEvidence.branch_bootstrap || null;
    case 'agenticos_pr_scope_check':
      return guardrailEvidence.pr_scope_check || null;
  }
}

function summarizeGuardrailDetail(entry: GuardrailEvidenceEntry): string | null {
  const result = entry.result;
  if (!result) return null;

  if (result.status === 'BLOCK' && result.block_reasons && result.block_reasons.length > 0) {
    return result.block_reasons[0];
  }

  if (result.status === 'REDIRECT' && result.redirect_actions && result.redirect_actions.length > 0) {
    return result.redirect_actions[0];
  }

  if (result.status === 'CREATED') {
    if (result.branch_name) {
      return `created ${result.branch_name}`;
    }
    if (result.notes && result.notes.length > 0) {
      return result.notes[0];
    }
  }

  if (result.summary) {
    return result.summary;
  }

  return null;
}

function buildGuardrailSummaryLines(guardrailEvidence?: GuardrailEvidenceState): string[] {
  const latestGuardrail = getLatestGuardrailEntry(guardrailEvidence);
  if (!latestGuardrail?.command) {
    return ['🛡️ Latest guardrail: None recorded'];
  }

  const status = latestGuardrail.result?.status || 'UNKNOWN';
  const recordedAt =
    formatTimestamp(latestGuardrail.recorded_at) ||
    formatTimestamp(guardrailEvidence?.updated_at) ||
    'Unknown time';

  const lines = [`🛡️ Latest guardrail: ${latestGuardrail.command} -> ${status} (${recordedAt})`];

  if (latestGuardrail.issue_id) {
    lines.push(`   Issue: #${latestGuardrail.issue_id}`);
  }

  const detail = summarizeGuardrailDetail(latestGuardrail);
  if (detail) {
    lines.push(`   Detail: ${detail}`);
  }

  return lines;
}

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
  try {
    const projYaml = yaml.parse(await readFile(join(found.path, '.project.yaml'), 'utf-8'));
    description = projYaml?.meta?.description || '';
  } catch {}
  try {
    state = yaml.parse(await readFile(join(found.path, '.context', 'state.yaml'), 'utf-8'));
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
  const guardrailSummary = buildGuardrailSummaryLines(state?.guardrail_evidence as GuardrailEvidenceState | undefined);

  return `✅ Switched to project "${found.name}"\n\nPath: ${found.path}\nStatus: ${found.status}\n\nContext loaded from:\n- ${found.path}/.project.yaml\n- ${found.path}/.context/quick-start.md\n- ${found.path}/.context/state.yaml\n\n${guardrailSummary.join('\n')}${bootstrap}`;
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

  lines.push(...buildGuardrailSummaryLines(state.guardrail_evidence as GuardrailEvidenceState | undefined));

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
