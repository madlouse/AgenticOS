import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { execFile } from 'child_process';
import yaml from 'yaml';
import { getAgenticOSHome, loadRegistry, patchProjectMetadata } from '../utils/registry.js';
import { generateClaudeMd, generateAgentsMd, updateClaudeMdState, upgradeClaudeMd, CURRENT_TEMPLATE_VERSION, extractTemplateVersion } from '../utils/distill.js';
import { adoptStandardKit, checkStandardKitUpgrade } from '../utils/standard-kit.js';
import { writeFile } from 'fs/promises';
import { buildArchivedReferenceMessage, isArchivedReferenceProject, isGitBackedTopology, validateManagedProjectTopology, validateProjectKind, type ProjectKind } from '../utils/project-contract.js';
import { resolveManagedProjectContextPaths, resolveManagedProjectTarget } from '../utils/project-target.js';
import { loadLatestGuardrailState, type IssueBootstrapRecord, type IssueBootstrapState } from '../utils/guardrail-evidence.js';
import { resolveManagedProjectContextDisplayPaths } from '../utils/agent-context-paths.js';
import { resolveContextPolicyPlan } from '../utils/context-policy-plan.js';
import {
  buildConversationRoutingStatusLines,
  detectLegacyTrackedTranscriptStatus,
  resolveConversationRoutingPlan,
} from '../utils/conversation-routing.js';
import {
  bindSessionProject,
  getSessionContextState,
  getSessionProjectBinding,
  alignPwd,
  switchOutSessionProject,
  type PwdAlignmentResult,
  type SwitchOutSessionResult,
} from '../utils/session-context.js';
import {
  assessVersionedEntrySurfaceState,
  type VersionedEntrySurfaceAssessment,
} from '../utils/versioned-entry-surface-state.js';
import {
  assessIssueBootstrapContinuity,
  type IssueBootstrapContinuityAssessment,
} from '../utils/issue-bootstrap-continuity.js';
import { deriveExpectedWorktreeRoot, inspectProjectWorktreeTopology } from '../utils/worktree-topology.js';
import { detectCanonicalMainWriteProtection } from '../utils/canonical-main-guard.js';
import { assessKnowledgeEvolutionHealth, buildKnowledgeEvolutionStatusLines } from '../utils/knowledge-evolution-health.js';

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
  continuity?: IssueBootstrapContinuityAssessment;
}

interface SwitchContextSummaryInput {
  description?: string;
  quickStart?: string;
  state?: any;
  lastRecorded?: string;
  committedSnapshotAssessment?: VersionedEntrySurfaceAssessment;
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

function usesCommittedSnapshotLabels(assessment?: VersionedEntrySurfaceAssessment): boolean {
  return Boolean(assessment?.applies && assessment.freshness !== 'fresh');
}

function buildCommittedSnapshotSummaryLines(assessment?: VersionedEntrySurfaceAssessment): string[] {
  if (!assessment?.applies || assessment.freshness === 'fresh') {
    return [];
  }

  const lines = [
    assessment.freshness === 'stale'
      ? '⚠️ Committed snapshot: stale for canonical mainline use'
      : '⚠️ Committed snapshot: freshness is not proven for canonical mainline use',
  ];

  for (const reason of assessment.reasons.slice(0, 3)) {
    lines.push(`   Reason: ${reason}`);
  }

  return lines;
}

function buildGuardrailSummaryLines(
  guardrailEvidence?: GuardrailEvidenceState,
  committedSnapshotAssessment?: VersionedEntrySurfaceAssessment,
): string[] {
  const label = usesCommittedSnapshotLabels(committedSnapshotAssessment)
    ? '🛡️ Latest committed guardrail snapshot'
    : '🛡️ Latest guardrail';
  const latestGuardrail = getLatestGuardrailEntry(guardrailEvidence);
  if (!latestGuardrail?.command) {
    return [`${label}: ${usesCommittedSnapshotLabels(committedSnapshotAssessment) ? 'freshness not proven' : 'None recorded'}`];
  }

  const status = latestGuardrail.result?.status || 'UNKNOWN';
  const recordedAt =
    formatTimestamp(latestGuardrail.recorded_at) ||
    formatTimestamp(guardrailEvidence?.updated_at) ||
    'Unknown time';

  const lines = [`${label}: ${latestGuardrail.command} -> ${status} (${recordedAt})`];

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
    return ['🧭 Latest issue bootstrap record: None recorded'];
  }

  const recordedAt =
    formatTimestamp(latestBootstrap.recorded_at) ||
    formatTimestamp(input.issueBootstrap?.updated_at) ||
    'Unknown time';
  const issueLabel = latestBootstrap.issue_id ? `#${latestBootstrap.issue_id}` : 'unknown issue';
  const branchDetail = latestBootstrap.current_branch ? ` on ${latestBootstrap.current_branch}` : '';
  const lines = [`🧭 Latest issue bootstrap record: ${issueLabel}${branchDetail} (${recordedAt})`];

  if (latestBootstrap.issue_title) {
    lines.push(`   Title: ${latestBootstrap.issue_title}`);
  }

  const detail = summarizeIssueBootstrapDetail(latestBootstrap);
  if (detail) {
    lines.push(`   Detail: ${detail}`);
  }

  const continuity = input.continuity;
  if (continuity) {
    const continuityLabel = continuity.status === 'current'
      ? 'current for this project path'
      : continuity.status === 'historical_for_current_checkout'
        ? 'historical for this project path'
        : 'missing or invalid for this project path';
    lines.push(`   Status: ${continuityLabel}`);

    if (continuity.reasons.length > 0) {
      lines.push(`   Reason: ${continuity.reasons[0]}`);
    }

    if (continuity.recovery_actions.length > 0) {
      lines.push(`   Recovery: ${continuity.recovery_actions[0]}`);
    }
  }

  return lines;
}

async function buildWorktreeTopologySummaryLines(projectPath: string, projectYaml: any): Promise<string[]> {
  if (!isGitBackedTopology(projectYaml?.source_control?.topology)) {
    return [];
  }

  /* c8 ignore next -- current public flows prove project identity before calling this helper */
  const projectId = typeof projectYaml?.meta?.id === 'string' ? projectYaml.meta.id.trim() : '';
  /* c8 ignore next 3 -- getStatus proves project identity earlier; missing meta.id is surfaced before topology rendering in current public flows */
  if (!projectId) {
    return ['⚠️ Worktree topology: project meta.id is missing, so derived worktree-root checks are unavailable'];
  }

  const topology = await inspectProjectWorktreeTopology({
    repoPath: projectPath,
    canonicalProjectPath: projectPath,
    expectedWorktreeRoot: deriveExpectedWorktreeRoot(getAgenticOSHome(), projectId),
  });

  const lines = [`🪵 Expected worktree root: ${topology.expected_worktree_root}`];
  if (!topology.applies) {
    return lines;
  }

  if (topology.status === 'BLOCK' && topology.counts.misplaced_clean === 0 && topology.counts.misplaced_dirty === 0) {
    lines.push(`⚠️ Worktree topology: ${topology.summary}`);
    return lines;
  }

  if (topology.counts.misplaced_clean === 0 && topology.counts.misplaced_dirty === 0) {
    lines.push('🪵 Worktree topology: no misplaced worktrees detected');
    return lines;
  }

  lines.push(`⚠️ Misplaced worktrees: clean ${topology.counts.misplaced_clean}, dirty ${topology.counts.misplaced_dirty}`);
  for (const worktree of topology.worktrees.filter((entry) => entry.placement === 'misplaced').slice(0, 3)) {
    const branchDetail = worktree.branch ? ` (${worktree.branch})` : '';
    lines.push(`   - ${worktree.path}${branchDetail}${worktree.dirty ? ' [dirty]' : ' [clean]'}`);
  }

  return lines;
}

async function readBootstrapState(projectPath: string): Promise<any | null> {
  const paths = [
    join(getAgenticOSHome(), '.agent-workspace', 'bootstrap-state.yaml'),
    join(projectPath, '.agent-workspace', 'bootstrap-state.yaml'),
  ];
  const uniquePaths = Array.from(new Set(paths));

  for (const bootstrapStatePath of uniquePaths) {
    try {
      return yaml.parse(await readFile(bootstrapStatePath, 'utf-8')) || null;
    } catch {}
  }

  return null;
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
  const taskLabel = usesCommittedSnapshotLabels(input.committedSnapshotAssessment)
    ? '🎯 Current committed task snapshot'
    : '🎯 Current task';

  if (input.lastRecorded) {
    const recordedAt = formatTimestamp(input.lastRecorded);
    if (recordedAt) {
      lines.push(`📍 Last recorded: ${recordedAt}`);
    }
  }

  if (task?.title) {
    lines.push(`${taskLabel}: ${task.title} (${task.status || 'unknown'})`);
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

function buildFilesystemAlignmentLines(
  projectPath: string,
  pwdResult: PwdAlignmentResult,
): string[] {
  const lines = [
    `project_workdir: ${projectPath}`,
    `explicit_workdir: ${projectPath}`,
    `🧰 Project path: ${projectPath}`,
    `🧰 Recommended explicit workdir for tool calls: ${projectPath}`,
  ];

  const relation = pwdResult.observedMcpProcessPwd === projectPath ? 'matches project path' : 'differs from project path';
  lines.push(`🧭 Observed MCP process PWD: ${pwdResult.observedMcpProcessPwd} (${relation})`);

  lines.push('⚠️ Client shell PWD: unavailable to MCP; verify with `pwd` in the client shell.');

  if (pwdResult.warning) {
    lines.push(`⚠️ ${pwdResult.warning}`);
  }

  if (pwdResult.agentType === 'codex') {
    lines.push('⚠️ Codex current-session cwd cannot be changed by MCP output.');
    lines.push('   Use this project path as explicit workdir for every filesystem operation.');
    if (pwdResult.instruction) {
      lines.push('   To start a new Codex session in this project, run:');
      lines.push(`   ${pwdResult.instruction}`);
    }
  } else if (pwdResult.agentType === 'claude-code') {
    lines.push('⚠️ Claude Code shell cwd is per-call; MCP output cannot persistently change the parent session cwd.');
    lines.push('   Use this project path as explicit workdir for file/edit tools, or prefix each shell command with:');
    lines.push(`   ${pwdResult.instruction}`);
  } else {
    lines.push('📍 Client alignment hint:');
    lines.push(`   ${pwdResult.instruction}`);
    lines.push('   Treat this as a hint; verify the client shell PWD before using relative paths.');
  }

  return lines;
}

function buildTargetWorkdirAlignmentLines(
  targetWorkdir: string,
  pwdResult: PwdAlignmentResult,
): string[] {
  const lines = [
    `target_workdir: ${targetWorkdir}`,
    `explicit_workdir: ${targetWorkdir}`,
    `🧰 Recommended explicit workdir for tool calls: ${targetWorkdir}`,
  ];

  const relation = pwdResult.observedMcpProcessPwd === targetWorkdir ? 'matches target workdir' : 'differs from target workdir';
  lines.push(`🧭 Observed MCP process PWD: ${pwdResult.observedMcpProcessPwd} (${relation})`);
  lines.push('⚠️ Client shell PWD: unavailable to MCP; switch-out is complete only when the agent uses target_workdir for subsequent filesystem and shell calls.');

  if (pwdResult.warning) {
    lines.push(`⚠️ ${pwdResult.warning}`);
  }

  if (pwdResult.agentType === 'codex') {
    lines.push('⚠️ Codex current-session cwd cannot be changed by MCP output.');
    lines.push('   Use target_workdir as explicit workdir for every filesystem operation after switch-out.');
    if (pwdResult.instruction) {
      lines.push('   To start a new Codex session at the restored workdir, run:');
      lines.push(`   ${pwdResult.instruction}`);
    }
  } else if (pwdResult.agentType === 'claude-code') {
    lines.push('⚠️ Claude Code shell cwd is per-call; switch-out is complete only when subsequent operations use target_workdir.');
    lines.push('   Use target_workdir as explicit workdir for file/edit tools, or prefix each shell command with:');
    lines.push(`   ${pwdResult.instruction}`);
  } else {
    lines.push('📍 Client alignment hint:');
    lines.push(`   ${pwdResult.instruction}`);
    lines.push('   Treat this as a hint; verify the client shell PWD before using relative paths.');
  }

  return lines;
}

async function inspectDirtyWorktree(projectPath: string): Promise<string | null> {
  const gitMarker = join(projectPath, '.git');
  if (!existsSync(gitMarker)) return null;

  return new Promise((resolve) => {
    execFile('git', ['-C', projectPath, 'status', '--short'], (error, stdout) => {
      if (error) {
        resolve('⚠️ Project pollution check: git status could not be inspected before switch-out.');
        return;
      }
      if (stdout.trim().length > 0) {
        resolve('⚠️ Project pollution risk: current project worktree has uncommitted changes.');
        return;
      }
      resolve(null);
    });
  });
}

async function buildSwitchOutPollutionLines(result: SwitchOutSessionResult): Promise<string[]> {
  const lines: string[] = [];
  if (!result.exitedProject) return lines;

  const dirtyLine = await inspectDirtyWorktree(result.exitedProject.projectPath);
  if (dirtyLine) lines.push(dirtyLine);
  if (result.exitedProject.projectPath.includes('/worktrees/')) {
    lines.push('⚠️ Project pollution check: exited project path looks like an issue worktree; confirm task/PR state before deleting it.');
  }

  return lines;
}

function stripPwdWarningPrefix(warning: string | null): string {
  /* c8 ignore next -- alignPwd failure results currently always include a warning string */
  return warning?.replace(/^\[WARN\] PWD alignment skipped:\s*/, '') || 'project path is not usable';
}

function validateProjectKindOrThrow(projectName: string, projectYaml: any): ProjectKind {
  const validation = validateProjectKind(projectName, projectYaml);
  if (!validation.ok) {
    throw new Error(`${validation.message} Re-run agenticos_init with normalize_existing=true and project_kind="topic" or project_kind="project".`);
  }
  return validation.project_kind;
}

async function readProjectKindForList(projectName: string, projectPath: string): Promise<ProjectKind> {
  try {
    const projectYaml = yaml.parse(await readFile(join(projectPath, '.project.yaml'), 'utf-8')) || {};
    return validateProjectKindOrThrow(projectName, projectYaml);
  } catch (error: any) {
    if (error?.message?.includes('agenticos.project_kind')) {
      throw error;
    }
    return 'project';
  }
}

export async function switchProject(args: any): Promise<string> {
  const { project } = args;
  const explicitRepoPath = typeof args.repo_path === 'string' && args.repo_path.trim().length > 0
    ? args.repo_path.trim()
    : null;
  const registry = await loadRegistry();

  const found = registry.projects.find(
    (p) => p.id === project || p.name === project
  );

  if (!found) {
    return `❌ Project "${project}" not found.\n\nAvailable projects:\n${registry.projects.map((p) => `- ${p.name} (${p.id})`).join('\n')}`;
  }

  const sessionPath = explicitRepoPath || found.path;
  if (explicitRepoPath) {
    const explicitProjectYamlPath = join(explicitRepoPath, '.project.yaml');
    try {
      const explicitProjectYaml = yaml.parse(await readFile(explicitProjectYamlPath, 'utf-8')) || {};
      const explicitProjectId = explicitProjectYaml?.meta?.id;
      if (!explicitProjectId) {
        return `❌ Project "${found.name}" cannot be bound to repo_path because ${explicitProjectYamlPath} is missing meta.id.`;
      }
      if (explicitProjectId !== found.id) {
        return `❌ Project "${found.name}" cannot be bound to repo_path because ${explicitProjectYamlPath} meta.id "${explicitProjectId}" does not match registry id "${found.id}".`;
      }
    } catch {
      return `❌ Project "${found.name}" cannot be bound to repo_path because ${explicitProjectYamlPath} is missing or unreadable.`;
    }
  }

  // Validate the project path before loading context or binding the MCP session.
  // A stale registry entry should not produce a successful switch.
  const pwdResult = await alignPwd(sessionPath);
  if (!pwdResult.success) {
    return [
      `❌ Project "${found.name}" cannot be switched because its registered path is not usable.`,
      '',
      `Path: ${JSON.stringify(sessionPath)}`,
      `Reason: ${stripPwdWarningPrefix(pwdResult.warning)}`,
      'Recovery: repair or re-register the project path, then run agenticos_switch again.',
    ].join('\n');
  }

  let projectYaml: any = {};
  try {
    projectYaml = yaml.parse(await readFile(join(sessionPath, '.project.yaml'), 'utf-8')) || {};
  } catch {}

  if (isArchivedReferenceProject(projectYaml, found.status)) {
    return `❌ ${buildArchivedReferenceMessage(found.name, projectYaml?.archive_contract?.replacement_project)}`;
  }

  const topologyValidation = validateManagedProjectTopology(found.name, projectYaml);
  if (!topologyValidation.ok) {
    return `❌ ${topologyValidation.message}`;
  }
  let projectKind: ProjectKind;
  try {
    projectKind = validateProjectKindOrThrow(found.name, projectYaml);
  } catch (error: any) {
    return `❌ ${error.message}`;
  }

  found.last_accessed = new Date().toISOString();

  // Bind session to project in memory. Filesystem cwd alignment remains a client concern.
  bindSessionProject({
    projectId: found.id,
    projectName: found.name,
    projectPath: sessionPath,
  }, {
    originCwd: typeof args.origin_cwd === 'string' ? args.origin_cwd : null,
  });

  // Check if entry surface writes are allowed in this checkout
  const writeProtection = await detectCanonicalMainWriteProtection(sessionPath);
  const bootstrapNotes: string[] = [];
  try {
    await patchProjectMetadata(found.id, {
      last_accessed: found.last_accessed,
    });
  } catch (error: any) {
    bootstrapNotes.push(`⚠️ Session bound, but registry metadata was not updated: ${error.message}`);
  }
  const claudeMdPath = join(sessionPath, 'CLAUDE.md');
  const agentsMdPath = join(sessionPath, 'AGENTS.md');

  let description = '';
  let state: any = undefined;
  let displayState: any = undefined;
  let quickStart = '';
  description = projectYaml?.meta?.description || '';
  const contextPaths = resolveManagedProjectContextPaths(sessionPath, projectYaml);
  const contextDisplayPaths = resolveManagedProjectContextDisplayPaths(projectYaml);
  try {
    state = yaml.parse(await readFile(contextPaths.statePath, 'utf-8'));
  } catch {}
  try {
    const loadedGuardrailState = await loadLatestGuardrailState({
      project_id: found.id,
      committed_state_path: contextPaths.statePath,
    });
    displayState = loadedGuardrailState.state;
  } catch {
    displayState = state;
  }
  try {
    quickStart = await readFile(contextPaths.quickStartPath, 'utf-8');
  } catch {}
  let transcriptRoutingSummary: string[] = [];
  try {
    const contextPolicyPlan = resolveContextPolicyPlan({
      projectName: found.name,
      projectPath: sessionPath,
      projectYaml,
    });
    transcriptRoutingSummary = buildConversationRoutingStatusLines(
      resolveConversationRoutingPlan(contextPolicyPlan),
      await detectLegacyTrackedTranscriptStatus(contextPolicyPlan),
    );
  } catch {}

  // CLAUDE.md: create if missing, upgrade if stale template version
  // Skip writes to canonical main — entry surface changes must happen in isolated worktrees
  if (writeProtection.blocked) {
    const existingVersion = existsSync(claudeMdPath) ? extractTemplateVersion(await readFile(claudeMdPath, 'utf-8')) : 0;
    if (existingVersion < CURRENT_TEMPLATE_VERSION) {
      bootstrapNotes.push(`⚠️ CLAUDE.md stale (v${existingVersion} < v${CURRENT_TEMPLATE_VERSION}) — refresh in isolated worktree`);
    }
  } else if (!existsSync(claudeMdPath)) {
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
  // Skip writes to canonical main — entry surface changes must happen in isolated worktrees
  if (writeProtection.blocked) {
    const existingVersion = existsSync(agentsMdPath) ? extractTemplateVersion(await readFile(agentsMdPath, 'utf-8')) : 0;
    if (existingVersion < CURRENT_TEMPLATE_VERSION) {
      bootstrapNotes.push(`⚠️ AGENTS.md stale (v${existingVersion} < v${CURRENT_TEMPLATE_VERSION}) — refresh in isolated worktree`);
    }
  } else if (!existsSync(agentsMdPath)) {
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

  // Auto-adopt standard kit for non-canonical main projects
  // This ensures stale templates, missing files are automatically fixed on switch
  // Note: diverged_from_canonical is intentionally NOT checked here
  // because adoptStandardKit preserves user modifications to copied templates
  if (!writeProtection.blocked) {
    try {
      const upgradeCheck = await checkStandardKitUpgrade({ project_path: sessionPath });
      const hasIssues =
        (upgradeCheck.missing_required_files.length > 0) ||
        (upgradeCheck.generated_files.some(f => f.status === 'stale')) ||
        (upgradeCheck.copied_templates.some(t => t.status === 'missing'));

      if (hasIssues) {
        const adoptResult = await adoptStandardKit({ project_path: sessionPath });
        const summaryParts: string[] = [];
        if (adoptResult.upgraded_generated_files.length > 0) {
          summaryParts.push(`upgraded: ${adoptResult.upgraded_generated_files.join(', ')}`);
        }
        if (adoptResult.created_files.length > 0) {
          summaryParts.push(`created: ${adoptResult.created_files.join(', ')}`);
        }
        if (summaryParts.length > 0) {
          bootstrapNotes.push(`📦 Standard kit auto-adopted (${summaryParts.join('; ')})`);
        }
      }
    } catch (error: any) {
      bootstrapNotes.push(`⚠️ Standard kit auto-adopt failed: ${error.message}`);
    }
  }

  const bootstrap = bootstrapNotes.length > 0 ? '\n\n' + bootstrapNotes.join('\n') : '';
  const committedSnapshotAssessment = assessVersionedEntrySurfaceState({
    projectYaml,
    state,
    projectPath: sessionPath,
  });
  const committedSnapshotSummary = buildCommittedSnapshotSummaryLines(committedSnapshotAssessment);
  const guardrailSummary = buildGuardrailSummaryLines(
    displayState?.guardrail_evidence as GuardrailEvidenceState | undefined,
    committedSnapshotAssessment,
  );
  const latestSwitchBootstrap = displayState?.issue_bootstrap?.latest as IssueBootstrapRecord | null | undefined;
  const bootstrapContinuity = latestSwitchBootstrap
    ? await assessIssueBootstrapContinuity({
        bootstrap: latestSwitchBootstrap,
        currentRepoPath: sessionPath,
        projectPath: sessionPath,
      })
    : undefined;
  const issueBootstrapSummary = buildIssueBootstrapSummaryLines({
    issueBootstrap: displayState?.issue_bootstrap as IssueBootstrapState | undefined,
    continuity: bootstrapContinuity,
  });
  const contextSummary = buildSwitchContextSummaryLines({
    description,
    quickStart,
    state,
    lastRecorded: found.last_recorded,
    committedSnapshotAssessment,
  });
  const filesystemAlignmentSummary = buildFilesystemAlignmentLines(sessionPath, pwdResult);

  return `✅ Switched to project "${found.name}"\n\nPath: ${sessionPath}\nStatus: ${found.status}\nKind: ${projectKind}\n${filesystemAlignmentSummary.join('\n')}\n\n${contextSummary.join('\n')}${committedSnapshotSummary.length > 0 ? `\n${committedSnapshotSummary.join('\n')}` : ''}\n${transcriptRoutingSummary.length > 0 ? `\n${transcriptRoutingSummary.join('\n')}\n` : '\n'}Context loaded from:\n- ${sessionPath}/.project.yaml\n- ${contextPaths.quickStartPath}\n- ${contextPaths.statePath}\n\n${guardrailSummary.join('\n')}\n${issueBootstrapSummary.join('\n')}${bootstrap}`;
}

export async function switchOutProject(_args: any = {}): Promise<string> {
  const result = switchOutSessionProject();
  const lines: string[] = [];

  if (!result.hadActiveProject) {
    lines.push('ℹ️ No active AgenticOS project context is currently bound.');
  } else {
    lines.push(`✅ Exited AgenticOS project context "${result.exitedProject!.projectName}"`);
  }

  if (result.previousProject) {
    lines.push(`Previous project before last switch: ${result.previousProject.projectName} (${result.previousProject.projectId})`);
    lines.push(`To return there, explicitly run agenticos_switch with project "${result.previousProject.projectId}".`);
  }

  if (result.origin?.warning) {
    lines.push(`⚠️ Origin cwd was not usable when captured: ${result.origin.warning}`);
  }

  if (!result.origin) {
    lines.push('⚠️ origin_cwd: unknown');
    lines.push('No origin workdir has been captured yet. Choose a neutral non-project workdir before continuing.');
    return lines.join('\n');
  }

  if (!result.targetWorkdir) {
    lines.push('⚠️ target_workdir: unknown');
    lines.push('The active project binding was cleared, but AgenticOS cannot prove a restore directory.');
    lines.push('Do not continue with the previous project path unless the user explicitly switches back into it.');
    return lines.join('\n');
  }

  lines.push(`origin_cwd: ${result.targetWorkdir}`);
  lines.push(`origin_source: ${result.origin.source}`);

  const pollutionLines = await buildSwitchOutPollutionLines(result);
  lines.push(...pollutionLines);

  const pwdResult = await alignPwd(result.targetWorkdir);
  if (!pwdResult.success) {
    lines.push(`⚠️ target_workdir: ${result.targetWorkdir}`);
    lines.push(`⚠️ Restore workdir is not currently usable: ${stripPwdWarningPrefix(pwdResult.warning)}`);
    lines.push('The active project binding was cleared, but the agent must choose a safe non-project workdir before continuing.');
    return lines.join('\n');
  }

  lines.push(...buildTargetWorkdirAlignmentLines(result.targetWorkdir, pwdResult));
  lines.push('Contract: MCP cannot mutate the parent process cwd by itself; the agent must apply target_workdir explicitly.');
  return lines.join('\n');
}

export async function listProjects(): Promise<string> {
  const registry = await loadRegistry();
  const sessionProject = getSessionProjectBinding();

  if (registry.projects.length === 0) {
    return 'No projects found. Use agenticos_init to create your first project.';
  }

  const lines = ['# AgenticOS Projects\n'];

  for (const p of registry.projects) {
    let projectKind: ProjectKind;
    try {
      projectKind = await readProjectKindForList(p.name, p.path);
    } catch (error: any) {
      return `❌ ${error.message}`;
    }
    const active = p.id === sessionProject?.projectId ? '🟢 ' : '';
    lines.push(`${active}**${p.name}** (${p.id})`);
    lines.push(`  Path: ${p.path}`);
    lines.push(`  Status: ${p.status}`);
    lines.push(`  Kind: ${projectKind}`);
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
  const sessionStateBeforeResolve = getSessionContextState();
  let resolved;
  try {
    resolved = await resolveManagedProjectTarget({
      project: args?.project,
      commandName: 'agenticos_status',
    });
  } catch (error: any) {
    if (!args?.project && !sessionStateBeforeResolve.activeProject && (
      sessionStateBeforeResolve.origin ||
      sessionStateBeforeResolve.expectedWorkdir ||
      sessionStateBeforeResolve.switchedOutAt
    )) {
      const lines = ['# Status: No active AgenticOS project\n'];
      lines.push('🧭 Active project: none');
      lines.push(`🧰 Expected workdir: ${sessionStateBeforeResolve.expectedWorkdir || 'unknown'}`);
      if (sessionStateBeforeResolve.origin) {
        lines.push(`📍 Origin cwd: ${sessionStateBeforeResolve.origin.cwd || 'unknown'} (${sessionStateBeforeResolve.origin.source})`);
        if (sessionStateBeforeResolve.origin.warning) {
          lines.push(`⚠️ Origin warning: ${sessionStateBeforeResolve.origin.warning}`);
        }
      }
      if (sessionStateBeforeResolve.switchedOutAt) {
        lines.push(`📤 Switched out at: ${sessionStateBeforeResolve.switchedOutAt}`);
      }
      lines.push('Use agenticos_switch to enter a project again.');
      return lines.join('\n');
    }
    return `❌ ${error.message}`;
  }

  const { project, statePath } = resolved;
  let projectKind: ProjectKind;
  try {
    projectKind = validateProjectKindOrThrow(project.name, resolved.projectYaml);
  } catch (error: any) {
    return `❌ ${error.message}`;
  }
  let state: any = {};
  let displayState: any = {};
  try {
    const content = await readFile(statePath, 'utf-8');
    state = yaml.parse(content) || {};
  } catch {
    return `❌ Failed to read state.yaml for project "${project.name}"`;
  }
  try {
    const loadedGuardrailState = await loadLatestGuardrailState({
      project_id: project.id,
      committed_state_path: statePath,
    });
    displayState = loadedGuardrailState.state;
  } catch {
    displayState = state;
  }

  const lines: string[] = [];
  lines.push(`# Status: ${project.name}\n`);
  lines.push(`🧭 Project kind: ${projectKind}`);
  const sessionState = getSessionContextState();
  if (sessionState.activeProject) {
    lines.push(`🧭 Active project: ${sessionState.activeProject.projectName} (${sessionState.activeProject.projectId})`);
    lines.push(`🧰 Expected workdir: ${sessionState.expectedWorkdir || sessionState.activeProject.projectPath}`);
  }
  if (sessionState.origin) {
    lines.push(`📍 Origin cwd: ${sessionState.origin.cwd || 'unknown'} (${sessionState.origin.source})`);
  }

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

  const committedSnapshotAssessment = assessVersionedEntrySurfaceState({
    projectYaml: resolved.projectYaml,
    state,
    projectPath: resolved.projectPath,
  });
  const latestStatusBootstrap = displayState.issue_bootstrap?.latest as IssueBootstrapRecord | null | undefined;
  const bootstrapContinuity = latestStatusBootstrap
    ? await assessIssueBootstrapContinuity({
        bootstrap: latestStatusBootstrap,
        currentRepoPath: resolved.projectPath,
        projectPath: resolved.projectPath,
      })
    : undefined;

  lines.push(...buildCommittedSnapshotSummaryLines(committedSnapshotAssessment));
  lines.push(...buildGuardrailSummaryLines(
    displayState.guardrail_evidence as GuardrailEvidenceState | undefined,
    committedSnapshotAssessment,
  ));
  lines.push(...buildIssueBootstrapSummaryLines({
    issueBootstrap: displayState.issue_bootstrap as IssueBootstrapState | undefined,
    continuity: bootstrapContinuity,
  }));
  try {
    lines.push(...await buildWorktreeTopologySummaryLines(resolved.projectPath, resolved.projectYaml));
  } catch {}
  try {
    lines.push(...buildKnowledgeEvolutionStatusLines(await assessKnowledgeEvolutionHealth({
      projectPath: resolved.projectPath,
      repoPath: resolved.projectPath,
      projectYaml: resolved.projectYaml,
      state,
    })));
  } catch {}

  lines.push('');
  const taskLabel = usesCommittedSnapshotLabels(committedSnapshotAssessment)
    ? '🎯 Current committed task snapshot'
    : '🎯 Current task';
  if (state.current_task) {
    lines.push(`${taskLabel}: ${state.current_task.title || 'Untitled'} (${state.current_task.status || 'unknown'})`);
  } else {
    lines.push(`${taskLabel}: None`);
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

  const bootstrapState = await readBootstrapState(resolved.projectPath);
  if (bootstrapState?.failed_agents?.length > 0) {
    lines.push('');
    lines.push('⚠️ Bootstrap Issues:');
    for (const agent of bootstrapState.failed_agents as string[]) {
      lines.push(`   - ${agent}: verification failed`);
    }
    lines.push('   Run: agenticos-bootstrap --verify');
  }

  return lines.join('\n');
}
