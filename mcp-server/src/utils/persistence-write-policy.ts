import { detectCanonicalMainWriteProtection } from './canonical-main-guard.js';

export type PersistenceWriteKind =
  | 'sidecar_capture'
  | 'project_tree_runtime'
  | 'project_tree_knowledge'
  | 'project_tree_continuity'
  | 'runtime_registry';

export type PersistenceMode = 'full' | 'capture_only' | 'blocked';

export interface PersistenceWriteDecision {
  kind: PersistenceWriteKind;
  allowed: boolean;
  reason?: string;
}

export interface PersistenceWritePlan {
  command: string;
  mode: PersistenceMode;
  writeProtectionReason?: string;
  writes: PersistenceWriteDecision[];
  nextActions: string[];
}

const PROJECT_TREE_WRITE_KINDS = new Set<PersistenceWriteKind>([
  'project_tree_runtime',
  'project_tree_knowledge',
  'project_tree_continuity',
]);

function isProjectTreeWrite(kind: PersistenceWriteKind): boolean {
  return PROJECT_TREE_WRITE_KINDS.has(kind);
}

export async function resolvePersistenceWritePlan(args: {
  command: string;
  projectPath: string;
  writes: PersistenceWriteKind[];
}): Promise<PersistenceWritePlan> {
  const writeProtection = await detectCanonicalMainWriteProtection(args.projectPath);
  const writeProtectionReason = writeProtection.blocked ? writeProtection.reason : undefined;

  const writes = args.writes.map((kind) => {
    if (writeProtection.blocked && isProjectTreeWrite(kind)) {
      return {
        kind,
        allowed: false,
        reason: writeProtection.reason,
      };
    }

    return {
      kind,
      allowed: true,
    };
  });

  const hasBlockedWrite = writes.some((write) => !write.allowed);
  const hasAllowedCapture = writes.some((write) => write.kind === 'sidecar_capture' && write.allowed);
  const mode: PersistenceMode = hasBlockedWrite
    ? hasAllowedCapture ? 'capture_only' : 'blocked'
    : 'full';

  const nextActions = mode === 'capture_only' || mode === 'blocked'
    ? [
        'create or enter an isolated issue worktree before distilling tracked continuity',
        'rerun agenticos_record after worktree alignment to apply tracked continuity updates',
        'run agenticos_status to verify session binding and pending capture context',
      ]
    : [];

  return {
    command: args.command,
    mode,
    writeProtectionReason,
    writes,
    nextActions,
  };
}

export function formatBlockedProjectTreeWrite(args: {
  command: string;
  projectName: string;
  writeKind: PersistenceWriteKind;
  reason?: string;
}): string {
  return `❌ ${args.command} blocked for "${args.projectName}" because canonical main checkout project-tree writes are protected.\n\n` +
    `- blocked write kind: ${args.writeKind}\n` +
    `- ${args.reason || 'canonical main checkout is write-protected'}\n` +
    '- create or enter an isolated issue worktree before writing tracked project continuity or knowledge';
}
