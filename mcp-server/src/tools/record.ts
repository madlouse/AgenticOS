import { readFile, writeFile } from 'fs/promises';
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
import { resolvePersistenceWritePlan } from '../utils/persistence-write-policy.js';
import {
  appendRecordCapture,
  getRuntimeCaptureConversationDir,
  type RecordCapturePayload,
} from '../utils/record-capture.js';
import { recordCapturedDistillationEntry } from '../utils/distillation-ledger.js';
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

async function applyTrackedContinuityPatch(args: {
  projectId: string;
  projectName: string;
  projectPath: string;
  statePath: string;
  markerPath: string;
  currentTask: any;
  now: Date;
  decisions: string[];
  outcomes: string[];
  pending: string[];
}): Promise<void> {
  let state: StateYamlSchema = {};
  try {
    const stateContent = await readFile(args.statePath, 'utf-8');
    state = yaml.parse(stateContent) as StateYamlSchema || {};
  } catch {}

  if (!state.working_memory) state.working_memory = { facts: [], decisions: [], pending: [] };
  if (!state.session) state.session = {};

  if (args.decisions.length > 0) {
    const existing_decisions = state.working_memory.decisions || [];
    state.working_memory.decisions = [...existing_decisions, ...args.decisions];
  }
  if (args.pending.length > 0) {
    state.working_memory.pending = args.pending;
  }
  if (args.outcomes.length > 0) {
    const existing_facts = state.working_memory.facts || [];
    state.working_memory.facts = [...existing_facts, ...args.outcomes];
  }
  if (args.currentTask) {
    state.current_task = {
      ...(state.current_task || {}),
      title: args.currentTask.title || state.current_task?.title,
      status: args.currentTask.status || 'in_progress',
      updated: args.now.toISOString(),
    };
  }

  state.session.last_backup = args.now.toISOString();
  await writeFile(args.statePath, yaml.stringify(state), 'utf-8');

  const claudeMdPath = `${args.projectPath}/CLAUDE.md`;
  await updateClaudeMdState(claudeMdPath, state, args.projectName);
  await writeFile(args.markerPath, args.now.toISOString(), 'utf-8');
  await patchProjectMetadata(args.projectId, {
    last_recorded: args.now.toISOString(),
  });
}

function renderCaptureOnlyResponse(args: {
  projectName: string;
  capturePath: string;
  ledgerPath?: string;
  ledgerEntryId?: string;
  planReason?: string;
  nextActions: string[];
}): string {
  const nextActions = `\nNext actions:\n${args.nextActions.map((action) => `- ${action}`).join('\n')}`;

  return `✅ Session captured for "${args.projectName}"\n\n` +
    'Status: RECORDED_CAPTURE_ONLY\n' +
    `📝 Capture: ${args.capturePath}\n` +
    (args.ledgerPath && args.ledgerEntryId ? `🧾 Distillation ledger: ${args.ledgerPath}#${args.ledgerEntryId}\n` : '') +
    '📊 Distill: skipped because tracked project writes are protected in this checkout\n' +
    (args.planReason ? `Reason: ${args.planReason}\n` : '') +
    nextActions;
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
      projectPath: args.project_path,
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

  const persistencePlan = await resolvePersistenceWritePlan({
    command: 'agenticos_record',
    projectPath,
    writes: [
      'sidecar_capture',
      'project_tree_runtime',
      'project_tree_continuity',
      'runtime_registry',
    ],
  });

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const payload: RecordCapturePayload = {
    summary,
    decisions,
    outcomes,
    pending,
  };

  const captureDir = persistencePlan.mode === 'capture_only'
    ? getRuntimeCaptureConversationDir(project.id)
    : conversationRoutingPlan.raw_conversations_dir;
  const capture = await appendRecordCapture({
    dir: captureDir,
    now,
    ...payload,
  });
  const ledgerCapture = await recordCapturedDistillationEntry({
    projectId: project.id,
    capture,
    summary,
    now,
  });

  if (persistencePlan.mode === 'capture_only') {
    return renderCaptureOnlyResponse({
      projectName: project.name,
      capturePath: capture.filePath,
      ledgerPath: ledgerCapture.path,
      ledgerEntryId: ledgerCapture.entry.id,
      planReason: persistencePlan.writeProtectionReason,
      nextActions: persistencePlan.nextActions,
    });
  }

  await applyTrackedContinuityPatch({
    projectId: project.id,
    projectName: project.name,
    projectPath,
    statePath,
    markerPath,
    currentTask: current_task,
    now,
    decisions,
    outcomes,
    pending,
  });

  const routingNotes = buildConversationRoutingStatusLines(conversationRoutingPlan, legacyTranscriptStatus);
  return `✅ Session recorded for "${project.name}"\n\n` +
    `📝 Raw conversation: ${conversationRoutingPlan.raw_conversations_display_dir}${today}.md\n` +
    `🧾 Distillation ledger: ${ledgerCapture.path}#${ledgerCapture.entry.id}\n` +
    `📊 State: ${contextPolicyPlan.trackedContextDisplayPaths.state} (updated)\n` +
    `📋 CLAUDE.md: Current State synced\n` +
    (routingNotes.length > 0 ? `\n${routingNotes.join('\n')}\n` : '');
}
