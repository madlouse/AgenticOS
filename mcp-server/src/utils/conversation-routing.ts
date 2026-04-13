import { readdir } from 'fs/promises';
import { relative } from 'path';
import { type ContextPolicyPlan } from './context-policy-plan.js';

export type TrackedRecoveryContract = 'local_only' | 'git_full' | 'git_distilled';
export type LegacyTranscriptStatus =
  | 'none'
  | 'tracked_legacy_present'
  | 'tracked_legacy_dirty'
  | 'misconfigured_public_raw_target';

export interface ConversationRoutingPlan {
  policy: ContextPolicyPlan['policy'];
  raw_conversations_dir: string;
  raw_conversations_display_dir: string;
  tracked_conversations_dir: string | null;
  tracked_conversations_display_dir: string | null;
  is_sidecar: boolean;
  tracked_recovery_contract: TrackedRecoveryContract;
  notes: string[];
}

interface DetectLegacyTrackedTranscriptStatusOptions {
  tracked_transcript_dirty?: boolean;
}

function toProjectRelativePath(projectRoot: string, absolutePath: string, directory = false): string {
  const relativePath = relative(projectRoot, absolutePath).replace(/\\/g, '/');
  if (!relativePath || relativePath.startsWith('..')) {
    throw new Error(`Path escapes project root: ${absolutePath}`);
  }
  return directory && !relativePath.endsWith('/') ? `${relativePath}/` : relativePath;
}

async function directoryContainsTranscriptFiles(path: string): Promise<boolean> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        return true;
      }
      if (entry.isDirectory() && await directoryContainsTranscriptFiles(`${path}/${entry.name}`)) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

export function resolveConversationRoutingPlan(plan: ContextPolicyPlan): ConversationRoutingPlan {
  const rawDisplayDir = toProjectRelativePath(plan.projectRoot, plan.rawConversationsDir, true);
  const trackedDisplayDir = plan.trackedConversationsDir
    ? toProjectRelativePath(plan.projectRoot, plan.trackedConversationsDir, true)
    : null;
  const trackedRecoveryContract: TrackedRecoveryContract = plan.policy === 'private_continuity'
    ? 'git_full'
    : plan.policy === 'public_distilled'
      ? 'git_distilled'
      : 'local_only';

  const notes: string[] = [];
  if (plan.policy === 'public_distilled') {
    notes.push(`Raw transcript writes route to \`${rawDisplayDir}\` and stay outside the tracked public tree.`);
    if (trackedDisplayDir) {
      notes.push(`Configured tracked/display transcript surface remains \`${trackedDisplayDir}\`.`);
    }
  }

  return {
    policy: plan.policy,
    raw_conversations_dir: plan.rawConversationsDir,
    raw_conversations_display_dir: rawDisplayDir,
    tracked_conversations_dir: plan.trackedConversationsDir,
    tracked_conversations_display_dir: trackedDisplayDir,
    is_sidecar: plan.rawConversationsDir !== plan.trackedContextPaths.conversations,
    tracked_recovery_contract: trackedRecoveryContract,
    notes,
  };
}

export async function detectLegacyTrackedTranscriptStatus(
  plan: ContextPolicyPlan,
  options: DetectLegacyTrackedTranscriptStatusOptions = {},
): Promise<LegacyTranscriptStatus> {
  if (plan.policy !== 'public_distilled') {
    return 'none';
  }

  const rawRelative = relative(plan.projectRoot, plan.rawConversationsDir).replace(/\\/g, '/');
  if (!rawRelative || rawRelative.startsWith('..')
    || plan.trackedConversationsDir !== null
    || plan.rawConversationsDir === plan.trackedContextPaths.conversations) {
    return 'misconfigured_public_raw_target';
  }

  if (options.tracked_transcript_dirty) {
    return 'tracked_legacy_dirty';
  }

  const hasTrackedLegacy = await directoryContainsTranscriptFiles(plan.trackedContextPaths.conversations);
  return hasTrackedLegacy ? 'tracked_legacy_present' : 'none';
}

export function buildConversationRoutingStatusLines(
  routingPlan: ConversationRoutingPlan,
  legacyTranscriptStatus: LegacyTranscriptStatus,
): string[] {
  if (routingPlan.policy !== 'public_distilled') {
    return [];
  }

  const lines = [
    `🔒 Raw transcripts: \`${routingPlan.raw_conversations_display_dir}\` (private sidecar; Git recovery is distilled-only)`,
  ];

  if (legacyTranscriptStatus === 'tracked_legacy_present') {
    lines.push(
      `⚠️ Legacy public transcripts remain under \`${routingPlan.tracked_conversations_display_dir || '.context/conversations/'}\` as historical tracked evidence; new raw writes should not continue there.`,
    );
  } else if (legacyTranscriptStatus === 'tracked_legacy_dirty') {
    lines.push(
      `❌ Tracked raw transcript changes are present under \`${routingPlan.tracked_conversations_display_dir || '.context/conversations/'}\`; publishing them would leak new private history.`,
    );
  } else if (legacyTranscriptStatus === 'misconfigured_public_raw_target') {
    lines.push('❌ Public transcript routing is misconfigured; raw transcript destination is not isolated from the tracked project tree.');
  }

  return lines;
}
