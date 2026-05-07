import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../canonical-main-guard.js', () => ({
  detectCanonicalMainWriteProtection: vi.fn(),
}));

import {
  formatBlockedProjectTreeWrite,
  resolvePersistenceWritePlan,
} from '../persistence-write-policy.js';
import { detectCanonicalMainWriteProtection } from '../canonical-main-guard.js';

const canonicalMainGuardMock = detectCanonicalMainWriteProtection as unknown as ReturnType<typeof vi.fn>;

describe('persistence-write-policy', () => {
  beforeEach(() => {
    canonicalMainGuardMock.mockReset();
    canonicalMainGuardMock.mockResolvedValue({ blocked: false });
  });

  it('allows full writes when canonical-main protection is not active', async () => {
    const plan = await resolvePersistenceWritePlan({
      command: 'agenticos_record',
      projectPath: '/project',
      writes: ['sidecar_capture', 'project_tree_runtime', 'runtime_registry'],
    });

    expect(plan.mode).toBe('full');
    expect(plan.writes.every((write) => write.allowed)).toBe(true);
    expect(plan.nextActions).toEqual([]);
  });

  it('allows sidecar-only writes as full mode when nothing is blocked', async () => {
    const plan = await resolvePersistenceWritePlan({
      command: 'agenticos_record',
      projectPath: '/project',
      writes: ['sidecar_capture'],
    });

    expect(plan.mode).toBe('full');
    expect(plan.writes).toEqual([{ kind: 'sidecar_capture', allowed: true }]);
  });

  it('allows capture-only while blocking project-tree writes on canonical main', async () => {
    canonicalMainGuardMock.mockResolvedValue({
      blocked: true,
      reason: 'canonical main checkout is write-protected for runtime persistence: /project',
    });

    const plan = await resolvePersistenceWritePlan({
      command: 'agenticos_record',
      projectPath: '/project',
      writes: ['sidecar_capture', 'project_tree_runtime', 'runtime_registry'],
    });

    expect(plan.mode).toBe('capture_only');
    expect(plan.writeProtectionReason).toContain('/project');
    expect(plan.writes.find((write) => write.kind === 'sidecar_capture')?.allowed).toBe(true);
    expect(plan.writes.find((write) => write.kind === 'project_tree_runtime')?.allowed).toBe(false);
    expect(plan.writes.find((write) => write.kind === 'runtime_registry')?.allowed).toBe(true);
    expect(plan.nextActions).toContain('create or enter an isolated issue worktree before distilling tracked continuity');
  });

  it('blocks when canonical main would only receive project-tree writes', async () => {
    canonicalMainGuardMock.mockResolvedValue({
      blocked: true,
      reason: 'canonical main checkout is write-protected for runtime persistence: /project',
    });

    const plan = await resolvePersistenceWritePlan({
      command: 'agenticos_record_case',
      projectPath: '/project',
      writes: ['project_tree_knowledge'],
    });

    expect(plan.mode).toBe('blocked');
    expect(plan.writes).toEqual([{
      kind: 'project_tree_knowledge',
      allowed: false,
      reason: 'canonical main checkout is write-protected for runtime persistence: /project',
    }]);
  });

  it('formats blocked project-tree write messages with recovery guidance', () => {
    const message = formatBlockedProjectTreeWrite({
      command: 'agenticos_record_case',
      projectName: 'AgenticOS',
      writeKind: 'project_tree_knowledge',
      reason: 'canonical main checkout is write-protected',
    });

    expect(message).toContain('agenticos_record_case blocked for "AgenticOS"');
    expect(message).toContain('project_tree_knowledge');
    expect(message).toContain('isolated issue worktree');
  });

  it('formats blocked project-tree write messages with a default reason', () => {
    const message = formatBlockedProjectTreeWrite({
      command: 'agenticos_record_case',
      projectName: 'AgenticOS',
      writeKind: 'project_tree_knowledge',
    });

    expect(message).toContain('canonical main checkout is write-protected');
  });
});
