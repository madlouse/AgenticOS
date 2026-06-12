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
import {
  loadPendingCaptureEntries,
  markCapturesDistilledToState,
  recordCapturedDistillationEntry,
} from '../utils/distillation-ledger.js';
import {
  buildUncommittedContinuityNote,
  detectUncommittedContinuity,
} from '../utils/continuity-commit-status.js';
import {
  appendEvolutionEntries,
  deriveIssueRefFromBranch,
  type EvolutionLogAppendResult,
} from '../utils/evolution-log.js';
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
  ledgerPath: string;
  ledgerEntryId: string;
  planReason?: string;
  nextActions: string[];
}): string {
  const nextActions = `\nNext actions:\n${args.nextActions.map((action) => `- ${action}`).join('\n')}`;

  return `✅ Session captured for "${args.projectName}"\n\n` +
    'Status: RECORDED_CAPTURE_ONLY\n' +
    `📝 Capture: ${args.capturePath}\n` +
    `🧾 Distillation ledger: ${args.ledgerPath}#${args.ledgerEntryId}\n` +
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
    decisions,
    outcomes,
    pending,
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

  // Drain captures that accumulated while record was capture-only (e.g. on the
  // canonical main checkout). This full-mode record can distill them, so fold
  // their append-only decisions/outcomes into this state patch and mark them
  // distilled. The current session's own pending is authoritative, so prior
  // pending is not re-applied (it may already be resolved).
  const pendingCaptures = await loadPendingCaptureEntries(project.id, now);
  const drainedCaptures = pendingCaptures.entries.filter((entry) => entry.id !== ledgerCapture.entry.id);
  const drainedDecisions = drainedCaptures.flatMap((entry) => entry.decisions ?? []);
  const drainedOutcomes = drainedCaptures.flatMap((entry) => entry.outcomes ?? []);

  await applyTrackedContinuityPatch({
    projectId: project.id,
    projectName: project.name,
    projectPath,
    statePath,
    markerPath,
    currentTask: current_task,
    now,
    decisions: [...drainedDecisions, ...decisions],
    outcomes: [...drainedOutcomes, ...outcomes],
    pending,
  });

  // Mark the current capture and every drained prior capture as distilled into
  // tracked state so they stop showing as unprocessed in the ledger.
  await markCapturesDistilledToState({
    projectId: project.id,
    entryIds: [ledgerCapture.entry.id, ...drainedCaptures.map((entry) => entry.id)],
    now,
  });

  // Append typed decision entries to the git-tracked evolution log (#580 / L2).
  // The current session's decisions get refs.issue auto-stamped from the
  // worktree branch (deterministic — never relies on agent discipline); drained
  // canonical-main captures predate this worktree, so stamping them with this
  // branch's issue would mis-attribute — they go in unstamped. Best-effort: a
  // failed timeline append must not break the record flow.
  let evolutionNote = '';
  let evolutionResult: EvolutionLogAppendResult | null = null;
  try {
    const issueRef = await deriveIssueRefFromBranch(projectPath);
    const evolutionEntries = [
      ...decisions.map((summary) => ({
        kind: 'decision' as const,
        summary,
        ...(issueRef ? { refs: { issue: issueRef } } : {}),
      })),
      ...drainedDecisions.map((summary) => ({ kind: 'decision' as const, summary })),
    ];
    evolutionResult = await appendEvolutionEntries({ statePath, entries: evolutionEntries, now });
    if (evolutionResult.appendedCount > 0) {
      evolutionNote = `🧬 Evolution log: ${evolutionResult.contextRelativePath} (+${evolutionResult.appendedCount} entr${evolutionResult.appendedCount === 1 ? 'y' : 'ies'})\n`;
    }
  } catch (error) {
    evolutionNote = `⚠️ Evolution log append failed: ${error instanceof Error ? error.message : 'unknown error'}\n`;
  }

  // Continuity was written to the project tree but record never commits (it is
  // the no-git path). Surface uncommitted continuity explicitly so the operator
  // knows it is not yet durable and must run agenticos_save (#555 / G2). This is
  // a governance prompt, never a silent auto-commit.
  const stateDisplayDir = contextPolicyPlan.trackedContextDisplayPaths.state.replace(/\/[^/]+$/, '');
  const uncommittedContinuity = await detectUncommittedContinuity(projectPath, [
    { absPath: statePath, displayPath: contextPolicyPlan.trackedContextDisplayPaths.state },
    { absPath: `${projectPath}/CLAUDE.md`, displayPath: 'CLAUDE.md' },
    ...(evolutionResult && evolutionResult.appendedCount > 0
      ? [{
          absPath: evolutionResult.filePath,
          displayPath: `${stateDisplayDir}/${evolutionResult.contextRelativePath}`,
        }]
      : []),
  ]);
  const commitHygieneNote = buildUncommittedContinuityNote(uncommittedContinuity) ?? '';

  const routingNotes = buildConversationRoutingStatusLines(conversationRoutingPlan, legacyTranscriptStatus);
  const drainNote = drainedCaptures.length > 0
    ? `\n♻️ Drained ${drainedCaptures.length} pending capture-only record(s) into tracked state\n`
    : '';
  return `✅ Session recorded for "${project.name}"\n\n` +
    `📝 Raw conversation: ${conversationRoutingPlan.raw_conversations_display_dir}${today}.md\n` +
    `🧾 Distillation ledger: ${ledgerCapture.path}#${ledgerCapture.entry.id}\n` +
    `📊 State: ${contextPolicyPlan.trackedContextDisplayPaths.state} (updated)\n` +
    `📋 CLAUDE.md: Current State synced\n` +
    evolutionNote +
    drainNote +
    commitHygieneNote +
    (routingNotes.length > 0 ? `\n${routingNotes.join('\n')}\n` : '');
}
