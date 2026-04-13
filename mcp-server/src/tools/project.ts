import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'yaml';
import { loadRegistry, patchProjectMetadata } from '../utils/registry.js';
import { generateClaudeMd, generateAgentsMd, updateClaudeMdState, upgradeClaudeMd, CURRENT_TEMPLATE_VERSION, extractTemplateVersion } from '../utils/distill.js';
import { writeFile } from 'fs/promises';
import { buildArchivedReferenceMessage, isArchivedReferenceProject, validateManagedProjectTopology } from '../utils/project-contract.js';
import { resolveManagedProjectContextPaths, resolveManagedProjectTarget } from '../utils/project-target.js';
import { type IssueBootstrapRecord, type IssueBootstrapState } from '../utils/guardrail-evidence.js';
import { resolveManagedProjectContextDisplayPaths } from '../utils/agent-context-paths.js';
import { resolveContextPolicyPlan } from '../utils/context-policy-plan.js';
import {
  buildConversationRoutingStatusLines,
  detectLegacyTrackedTranscriptStatus,
  resolveConversationRoutingPlan,
} from '../utils/conversation-routing.js';
import { bindSessionProject, getSessionProjectBinding } from '../utils/session-context.js';

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

interface IssueBootstrapSummaryInput {
  issueBootstrap?: IssueBootstrapState;
}

interface SwitchContextSummaryInput {
  description?: string;
  quickStart?: string;
  state?: any;
  lastRecorded?: string;
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

function summarizeIssueBootstrapDetail(entry: IssueBootstrapRecord): string | null {
  const startupCount = Array.isArray(entry.startup_context_paths) ? entry.startup_context_paths.length : 0;
  const additionalCount = Array.isArray(entry.additional_context) ? entry.additional_context.length : 0;

  if (startupCount > 0 || additionalCount > 0) {
    return `${startupCount} startup surface(s), ${additionalCount} additional context document(s)`;
  }

  return null;
}

function buildIssueBootstrapSummaryLines(input: IssueBootstrapSummaryInput): string[] {
  const latestBootstrap = input.issueBootstrap?.latest;
  if (!latestBootstrap) {
    return ['🧭 Latest issue bootstrap: None recorded'];
  }

  const recordedAt =
    formatTimestamp(latestBootstrap.recorded_at) ||
    formatTimestamp(input.issueBootstrap?.updated_at) ||
    'Unknown time';
  const issueLabel = latestBootstrap.issue_id ? `#${latestBootstrap.issue_id}` : 'unknown issue';
  const branchDetail = latestBootstrap.current_branch ? ` on ${latestBootstrap.current_branch}` : '';
  const lines = [`🧭 Latest issue bootstrap: ${issueLabel}${branchDetail} (${recordedAt})`];

  if (latestBootstrap.issue_title) {
    lines.push(`   Title: ${latestBootstrap.issue_title}`);
  }

  const detail = summarizeIssueBootstrapDetail(latestBootstrap);
  if (detail) {
    lines.push(`   Detail: ${detail}`);
  }

  return lines;
}

function extractQuickStartSummary(quickStart?: string): string | null {
  if (!quickStart) return null;

  const lines = quickStart
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('-') && !line.startsWith('1.') && !line.startsWith('2.') && !line.startsWith('3.'));

  return lines[0] || null;
}

function buildSwitchContextSummaryLines(input: SwitchContextSummaryInput): string[] {
  const lines: string[] = [];
  const state = input.state || {};
  const pending = Array.isArray(state.working_memory?.pending) ? state.working_memory.pending : [];
  const decisions = Array.isArray(state.working_memory?.decisions) ? state.working_memory.decisions : [];
  const task = state.current_task;
  const description = input.description || extractQuickStartSummary(input.quickStart);

  if (input.lastRecorded) {
    const recordedAt = formatTimestamp(input.lastRecorded);
    if (recordedAt) {
      lines.push(`📍 Last recorded: ${recordedAt}`);
    }
  }

  if (task?.title) {
    lines.push(`🎯 Current task: ${task.title} (${task.status || 'unknown'})`);
  }

  if (pending.length > 0) {
    lines.push(`📋 Pending (${pending.length}):`);
    for (const item of pending.slice(0, 5)) {
      lines.push(`  - ${item}`);
    }
  } else {
    lines.push('📋 Pending: None');
  }

  if (decisions.length > 0) {
    lines.push(`✅ Recent decisions (${Math.min(decisions.length, 3)}):`);
    for (const item of decisions.slice(-3)) {
      lines.push(`  - ${item}`);
    }
  }

  if (description) {
    lines.push(`📖 Project summary: ${description}`);
  }

  if (pending.length > 0) {
    lines.push(`💡 Suggested next step: ${pending[0]}`);
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

  let projectYaml: any = {};
  try {
    projectYaml = yaml.parse(await readFile(join(found.path, '.project.yaml'), 'utf-8')) || {};
  } catch {}

  if (isArchivedReferenceProject(projectYaml, found.status)) {
    return `❌ ${buildArchivedReferenceMessage(found.name, projectYaml?.archive_contract?.replacement_project)}`;
  }

  const topologyValidation = validateManagedProjectTopology(found.name, projectYaml);
  if (!topologyValidation.ok) {
    return `❌ ${topologyValidation.message}`;
  }

  found.last_accessed = new Date().toISOString();
  bindSessionProject({
    projectId: found.id,
    projectName: found.name,
    projectPath: found.path,
  });

  // Auto-bootstrap: generate or upgrade CLAUDE.md / AGENTS.md
  const bootstrapNotes: string[] = [];
  try {
    await patchProjectMetadata(found.id, {
      last_accessed: found.last_accessed,
    });
  } catch (error: any) {
    bootstrapNotes.push(`⚠️ Session bound, but registry metadata was not updated: ${error.message}`);
  }
  const claudeMdPath = join(found.path, 'CLAUDE.md');
  const agentsMdPath = join(found.path, 'AGENTS.md');

  let description = '';
  let state: any = undefined;
  let quickStart = '';
  description = projectYaml?.meta?.description || '';
  const contextPaths = resolveManagedProjectContextPaths(found.path, projectYaml);
  const contextDisplayPaths = resolveManagedProjectContextDisplayPaths(projectYaml);
  try {
    state = yaml.parse(await readFile(contextPaths.statePath, 'utf-8'));
  } catch {}
  try {
    quickStart = await readFile(contextPaths.quickStartPath, 'utf-8');
  } catch {}
  let transcriptRoutingSummary: string[] = [];
  try {
    const contextPolicyPlan = resolveContextPolicyPlan({
      projectName: found.name,
      projectPath: found.path,
      projectYaml,
    });
    transcriptRoutingSummary = buildConversationRoutingStatusLines(
      resolveConversationRoutingPlan(contextPolicyPlan),
      await detectLegacyTrackedTranscriptStatus(contextPolicyPlan),
    );
  } catch {}

  // CLAUDE.md: create if missing, upgrade if stale template version
  if (!existsSync(claudeMdPath)) {
    await writeFile(claudeMdPath, generateClaudeMd(found.name, description, state, contextDisplayPaths), 'utf-8');
    bootstrapNotes.push('📝 CLAUDE.md created');
  } else {
    const existingContent = await readFile(claudeMdPath, 'utf-8');
    const existingVersion = extractTemplateVersion(existingContent);
    if (existingVersion < CURRENT_TEMPLATE_VERSION) {
      await writeFile(claudeMdPath, upgradeClaudeMd(claudeMdPath, found.name, description, state, contextDisplayPaths), 'utf-8');
      bootstrapNotes.push(`📝 CLAUDE.md upgraded: v${existingVersion} → v${CURRENT_TEMPLATE_VERSION} (user content preserved)`);
    }
  }

  // AGENTS.md: create if missing, upgrade if stale
  if (!existsSync(agentsMdPath)) {
    await writeFile(agentsMdPath, generateAgentsMd(found.name, description, contextDisplayPaths), 'utf-8');
    bootstrapNotes.push('📝 AGENTS.md created');
  } else {
    const existingContent = await readFile(agentsMdPath, 'utf-8');
    const existingVersion = extractTemplateVersion(existingContent);
    if (existingVersion < CURRENT_TEMPLATE_VERSION) {
      await writeFile(agentsMdPath, generateAgentsMd(found.name, description, contextDisplayPaths), 'utf-8');
      bootstrapNotes.push(`📝 AGENTS.md upgraded: v${existingVersion} → v${CURRENT_TEMPLATE_VERSION}`);
    }
  }

  const bootstrap = bootstrapNotes.length > 0 ? '\n\n' + bootstrapNotes.join('\n') : '';
  const guardrailSummary = buildGuardrailSummaryLines(state?.guardrail_evidence as GuardrailEvidenceState | undefined);
  const issueBootstrapSummary = buildIssueBootstrapSummaryLines({
    issueBootstrap: state?.issue_bootstrap as IssueBootstrapState | undefined,
  });
  const contextSummary = buildSwitchContextSummaryLines({
    description,
    quickStart,
    state,
    lastRecorded: found.last_recorded,
  });

  return `✅ Switched to project "${found.name}"\n\nPath: ${found.path}\nStatus: ${found.status}\n\n${contextSummary.join('\n')}\n${transcriptRoutingSummary.length > 0 ? `\n${transcriptRoutingSummary.join('\n')}\n` : '\n'}Context loaded from:\n- ${found.path}/.project.yaml\n- ${contextPaths.quickStartPath}\n- ${contextPaths.statePath}\n\n${guardrailSummary.join('\n')}\n${issueBootstrapSummary.join('\n')}${bootstrap}`;
}

export async function listProjects(): Promise<string> {
  const registry = await loadRegistry();
  const sessionProject = getSessionProjectBinding();

  if (registry.projects.length === 0) {
    return 'No projects found. Use agenticos_init to create your first project.';
  }

  const lines = ['# AgenticOS Projects\n'];

  for (const p of registry.projects) {
    const active = p.id === sessionProject?.projectId ? '🟢 ' : '';
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

export async function getStatus(args: any = {}): Promise<string> {
  let resolved;
  try {
    resolved = await resolveManagedProjectTarget({
      project: args?.project,
      commandName: 'agenticos_status',
    });
  } catch (error: any) {
    return `❌ ${error.message}`;
  }

  const { project, statePath } = resolved;
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

  try {
    const contextPolicyPlan = resolveContextPolicyPlan({
      projectName: project.name,
      projectPath: resolved.projectPath,
      projectYaml: resolved.projectYaml,
    });
    lines.push(...buildConversationRoutingStatusLines(
      resolveConversationRoutingPlan(contextPolicyPlan),
      await detectLegacyTrackedTranscriptStatus(contextPolicyPlan),
    ));
  } catch {}

  lines.push(...buildGuardrailSummaryLines(state.guardrail_evidence as GuardrailEvidenceState | undefined));
  lines.push(...buildIssueBootstrapSummaryLines({
    issueBootstrap: state.issue_bootstrap as IssueBootstrapState | undefined,
  }));

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
