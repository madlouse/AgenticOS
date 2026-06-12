import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// yamlMock MUST be defined with vi.hoisted so it's available at vi.mock hoisting time
const yamlMock = vi.hoisted(() => ({
  parse: vi.fn(),
  stringify: vi.fn((obj: unknown) => JSON.stringify(obj)),
}));
const distillationLedgerMock = vi.hoisted(() => ({
  recordCapturedDistillationEntry: vi.fn(),
  loadPendingCaptureEntries: vi.fn(),
  markCapturesDistilledToState: vi.fn(),
}));
// Mock only the git-I/O half of continuity-commit-status; the real note builder
// runs so the record response wiring (#555) is exercised end-to-end.
const detectUncommittedContinuityMock = vi.hoisted(() => vi.fn());
const evolutionLogMock = vi.hoisted(() => ({
  appendEvolutionEntries: vi.fn(),
  deriveIssueRefFromBranch: vi.fn(),
}));

// Mock modules
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  default: {},
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
  default: {},
}));

vi.mock('yaml', () => ({
  default: yamlMock,
}));

vi.mock('../../utils/registry.js', () => ({
  loadRegistry: vi.fn(),
  patchProjectMetadata: vi.fn(),
  getAgenticOSHome: vi.fn(() => '/home/testuser/AgenticOS'),
  resolvePath: vi.fn((p: string) => p),
}));

vi.mock('../../utils/distill.js', () => ({
  updateClaudeMdState: vi.fn().mockResolvedValue({ updated: true, created: false }),
}));

vi.mock('../../utils/canonical-main-guard.js', () => ({
  detectCanonicalMainWriteProtection: vi.fn(),
}));

vi.mock('../../utils/distillation-ledger.js', () => ({
  recordCapturedDistillationEntry: distillationLedgerMock.recordCapturedDistillationEntry,
  loadPendingCaptureEntries: distillationLedgerMock.loadPendingCaptureEntries,
  markCapturesDistilledToState: distillationLedgerMock.markCapturesDistilledToState,
}));

vi.mock('../../utils/continuity-commit-status.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/continuity-commit-status.js')>();
  return { ...actual, detectUncommittedContinuity: detectUncommittedContinuityMock };
});

vi.mock('../../utils/evolution-log.js', () => ({
  appendEvolutionEntries: evolutionLogMock.appendEvolutionEntries,
  deriveIssueRefFromBranch: evolutionLogMock.deriveIssueRefFromBranch,
}));

import { recordSession } from '../record.js';
import * as fsPromises from 'fs/promises';
import * as registry from '../../utils/registry.js';
import { bindSessionProject, clearSessionProjectBinding } from '../../utils/session-context.js';
import { detectCanonicalMainWriteProtection } from '../../utils/canonical-main-guard.js';
const fsPromisesMock = fsPromises as typeof fsPromises & {
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
};
const registryMock = registry as typeof registry & {
  loadRegistry: ReturnType<typeof vi.fn>;
  patchProjectMetadata: ReturnType<typeof vi.fn>;
};
const canonicalMainGuardMock = detectCanonicalMainWriteProtection as unknown as ReturnType<typeof vi.fn>;

function buildRegistry(overrides: Record<string, unknown> = {}) {
  return {
    version: '1.0.0',
    last_updated: '2025-01-01T00:00:00.000Z',
    active_project: 'test-project',
    projects: [
      {
        id: 'test-project',
        name: 'Test Project',
        path: '/test/path',
        status: 'active' as const,
        created: '2025-01-01',
        last_accessed: '2025-01-01T00:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

function mockProjectFiles(options?: {
  projectYaml?: Record<string, unknown>;
  state?: Record<string, unknown>;
  quickStart?: string;
  conversation?: string;
}) {
  const projectYaml = options?.projectYaml || {
    meta: {
      id: 'test-project',
      name: 'Test Project',
    },
    source_control: {
      topology: 'local_directory_only',
      context_publication_policy: 'local_private',
    },
  };
  const state = options?.state || {
    session: {},
    working_memory: { decisions: [], facts: [], pending: [] },
  };
  const quickStart = options?.quickStart || '# Quick Start\n\n1. Define project goals';
  const conversation = options?.conversation || '';

  fsPromisesMock.readFile.mockImplementation(async (path: string) => {
    if (path.endsWith('/.project.yaml')) {
      return JSON.stringify(projectYaml);
    }
    if (path.endsWith('/state.yaml')) {
      return JSON.stringify(state);
    }
    if (path.endsWith('/quick-start.md')) {
      return quickStart;
    }
    if (path.includes('/conversations/') && path.endsWith('.md')) {
      return conversation;
    }
    return '';
  });
}

describe('recordSession', () => {
  beforeEach(() => {
    clearSessionProjectBinding();
    bindSessionProject({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/test/path',
    });
    // Clear mock calls but preserve implementations
    fsPromisesMock.readFile.mockClear();
    fsPromisesMock.writeFile.mockClear();
    registryMock.loadRegistry.mockClear();
    registryMock.patchProjectMetadata.mockClear();
    yamlMock.parse.mockClear();
    yamlMock.stringify.mockClear();
    // Set up default yamlMock implementations
    yamlMock.parse.mockImplementation((content: string) => {
      try { return JSON.parse(content); } catch { return undefined; }
    });
    yamlMock.stringify.mockImplementation((obj: unknown) => JSON.stringify(obj));
    // Default: no active project
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: null,
      projects: [],
    });
    registryMock.patchProjectMetadata.mockResolvedValue(undefined);
    canonicalMainGuardMock.mockResolvedValue({ blocked: false });
    distillationLedgerMock.recordCapturedDistillationEntry.mockResolvedValue({
      path: '/home/testuser/AgenticOS/.agent-workspace/projects/test-project/distillation-ledger.yaml',
      entry: { id: 'capture-2026-05-21-1200-test', status: 'captured' },
      created: true,
    });
    distillationLedgerMock.loadPendingCaptureEntries.mockResolvedValue({
      path: '/home/testuser/AgenticOS/.agent-workspace/projects/test-project/distillation-ledger.yaml',
      entries: [],
    });
    distillationLedgerMock.markCapturesDistilledToState.mockResolvedValue({
      path: '/home/testuser/AgenticOS/.agent-workspace/projects/test-project/distillation-ledger.yaml',
      markedCount: 0,
    });
    // Default: continuity reads back as clean (no save-prompt note) so existing
    // assertions are unaffected; individual tests opt into the dirty case.
    detectUncommittedContinuityMock.mockReset();
    detectUncommittedContinuityMock.mockResolvedValue([]);
    evolutionLogMock.appendEvolutionEntries.mockReset();
    evolutionLogMock.deriveIssueRefFromBranch.mockReset();
    evolutionLogMock.deriveIssueRefFromBranch.mockResolvedValue(null);
    evolutionLogMock.appendEvolutionEntries.mockResolvedValue({
      filePath: '/test/path/.context/evolution-log/2026-06.yaml',
      contextRelativePath: 'evolution-log/2026-06.yaml',
      appendedCount: 0,
    });
    mockProjectFiles();
  });

  afterEach(() => {
    clearSessionProjectBinding();
    vi.restoreAllMocks();
  });

  it('returns error when summary is missing', async () => {
    const result = await recordSession({} as any);
    expect(result).toContain('summary is required');
  });

  it('returns error when no explicit project and no session project are available', async () => {
    clearSessionProjectBinding();
    const result = await recordSession({ summary: 'test summary' });
    expect(result).toContain('No project provided and no session project is bound');
    expect(result).toContain('agenticos_switch');
  });

  it('ignores a populated legacy registry active_project when no session project is bound', async () => {
    clearSessionProjectBinding();
    registryMock.loadRegistry.mockResolvedValue({
      version: '1.0.0',
      last_updated: '2025-01-01T00:00:00.000Z',
      active_project: 'non-existent',
      projects: [
        {
          id: 'other-project',
          name: 'Other Project',
          path: '/some/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    const result = await recordSession({ summary: 'test summary' });
    expect(result).toContain('No project provided and no session project is bound');
  });

  it('captures only on canonical main without writing tracked continuity surfaces', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    canonicalMainGuardMock.mockResolvedValue({
      blocked: true,
      reason: 'canonical main checkout is write-protected for runtime persistence: /test/path',
    });

    const result = await recordSession({ summary: 'blocked write' });

    expect(result).toContain('RECORDED_CAPTURE_ONLY');
    expect(result).toContain('canonical main checkout is write-protected for runtime persistence: /test/path');
    expect(fsPromisesMock.mkdir).toHaveBeenCalledWith('/home/testuser/AgenticOS/.agent-workspace/projects/test-project/captures/conversations', { recursive: true });
    expect(fsPromisesMock.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('/.agent-workspace/projects/test-project/captures/conversations/'),
      expect.stringContaining('blocked write'),
      'utf-8',
    );
    expect(fsPromisesMock.writeFile.mock.calls.some((call) => String(call[0]).endsWith('state.yaml'))).toBe(false);
    expect(fsPromisesMock.writeFile.mock.calls.some((call) => String(call[0]).endsWith('.last_record'))).toBe(false);
    expect(registryMock.patchProjectMetadata).not.toHaveBeenCalled();
  });

  it('captures only on canonical main even when the guard omits a reason', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    canonicalMainGuardMock.mockResolvedValue({ blocked: true });

    const result = await recordSession({ summary: 'captured without reason' });

    expect(result).toContain('RECORDED_CAPTURE_ONLY');
    expect(result).not.toContain('Reason:');
    expect(fsPromisesMock.writeFile.mock.calls.some((call) => String(call[0]).endsWith('state.yaml'))).toBe(false);
  });

  it('records successfully for legacy local_directory_only projects with missing publication policy', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: {
          id: 'test-project',
          name: 'Test Project',
        },
        source_control: {
          topology: 'local_directory_only',
        },
      },
    });

    const result = await recordSession({ summary: 'legacy local-only record' });

    expect(result).toContain('✅ Session recorded for "Test Project"');
    expect(result).toContain('Raw conversation: .context/conversations/');
    expect(result).toContain('State: .context/state.yaml (updated)');
    expect(fsPromisesMock.writeFile.mock.calls.some((call) => String(call[0]).endsWith('state.yaml'))).toBe(true);
    expect(registryMock.patchProjectMetadata).toHaveBeenCalledWith(
      'test-project',
      expect.objectContaining({ last_recorded: expect.any(String) }),
    );
  });

  it('appends issue-stamped evolution entries for full-mode decisions (#580)', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    evolutionLogMock.deriveIssueRefFromBranch.mockResolvedValue('#580');
    evolutionLogMock.appendEvolutionEntries.mockResolvedValue({
      filePath: '/test/path/.context/evolution-log/2026-06.yaml',
      contextRelativePath: 'evolution-log/2026-06.yaml',
      appendedCount: 1,
    });

    const result = await recordSession({ summary: 'work', decisions: ['use two-tier storage'] });

    expect(result).toContain('🧬 Evolution log: evolution-log/2026-06.yaml (+1 entry)');
    expect(evolutionLogMock.appendEvolutionEntries).toHaveBeenCalledWith(expect.objectContaining({
      entries: [{ kind: 'decision', summary: 'use two-tier storage', refs: { issue: '#580' } }],
    }));
    // The freshly written log file joins the uncommitted-continuity surfaces (G2).
    const surfaces = detectUncommittedContinuityMock.mock.calls[0][1];
    expect(surfaces.some((surface: { absPath: string }) => surface.absPath.endsWith('evolution-log/2026-06.yaml'))).toBe(true);
  });

  it('drained canonical-main decisions get evolution entries without an issue stamp (#580)', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    evolutionLogMock.deriveIssueRefFromBranch.mockResolvedValue('#580');
    distillationLedgerMock.loadPendingCaptureEntries.mockResolvedValue({
      path: '/ledger.yaml',
      entries: [{ id: 'capture-old', status: 'captured', decisions: ['old main decision'] }],
    });

    await recordSession({ summary: 'work', decisions: ['current decision'] });

    const { entries } = evolutionLogMock.appendEvolutionEntries.mock.calls[0][0];
    expect(entries).toContainEqual({ kind: 'decision', summary: 'current decision', refs: { issue: '#580' } });
    expect(entries).toContainEqual({ kind: 'decision', summary: 'old main decision' });
  });

  it('does not touch the evolution log in capture-only mode (#580)', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    canonicalMainGuardMock.mockResolvedValue({ blocked: true, reason: 'canonical main checkout' });

    const result = await recordSession({ summary: 'work on main', decisions: ['d'] });

    expect(result).toContain('RECORDED_CAPTURE_ONLY');
    expect(evolutionLogMock.appendEvolutionEntries).not.toHaveBeenCalled();
  });

  it('surfaces an evolution append failure as a warning without breaking record (#580)', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    evolutionLogMock.appendEvolutionEntries.mockRejectedValue(new Error('disk full'));

    const result = await recordSession({ summary: 'work', decisions: ['d'] });

    expect(result).toContain('✅ Session recorded');
    expect(result).toContain('⚠️ Evolution log append failed: disk full');
  });

  it('flags uncommitted continuity with a save prompt after a full-mode record (#555)', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    detectUncommittedContinuityMock.mockResolvedValue(['.context/state.yaml', 'CLAUDE.md']);

    const result = await recordSession({ summary: 'work that left state uncommitted' });

    expect(result).toContain('✅ Session recorded for "Test Project"');
    expect(result).toContain('Tracked continuity is written but NOT committed');
    expect(result).toContain('   - .context/state.yaml');
    expect(result).toContain('   - CLAUDE.md');
    expect(result).toContain('Run agenticos_save to persist it to git');
    // The check runs against the resolved project tree.
    expect(detectUncommittedContinuityMock).toHaveBeenCalledWith(
      '/test/path',
      expect.arrayContaining([
        expect.objectContaining({ displayPath: '.context/state.yaml' }),
        expect.objectContaining({ displayPath: 'CLAUDE.md' }),
      ]),
    );
  });

  it('omits the save prompt when continuity reads back as committed/clean (#555)', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    detectUncommittedContinuityMock.mockResolvedValue([]);

    const result = await recordSession({ summary: 'work then saved' });

    expect(result).toContain('✅ Session recorded for "Test Project"');
    expect(result).not.toContain('NOT committed');
  });

  it('creates conversation file with correct date-based filename', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());

    await recordSession({ summary: 'Did some work' });

    // Check conversation file was written
    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const convCall = writeCalls.find((c) => c[0].includes('conversations') && c[0].endsWith('.md'));
    expect(convCall).toBeDefined();
    const convPath = convCall![0] as string;
    // Should contain today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    expect(convPath).toContain(today);
  });

  it('appends to existing conversation file', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      state: { session: {}, working_memory: { decisions: [], facts: [], pending: [] } },
      conversation: '# Existing content\n\nsome previous record',
    });

    await recordSession({ summary: 'Did more work' });

    // The conv file write should contain the existing content + new entry
    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const convCall = writeCalls.find((c) => c[0].includes('conversations') && c[0].endsWith('.md'));
    expect(convCall).toBeDefined();
    const content = convCall![1] as string;
    expect(content).toContain('Existing content');
    expect(content).toContain('Did more work');
  });

  it('updates state.yaml with decisions appended', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());

    const existingState = {
      session: {},
      working_memory: {
        decisions: ['previous decision'],
        facts: [],
        pending: [],
      },
    };
    mockProjectFiles({ state: existingState });

    await recordSession({
      summary: 'test',
      decisions: ['new decision 1', 'new decision 2'],
    });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    expect(stateCall).toBeDefined();
    const writtenState = JSON.parse(stateCall![1] as string);
    // Decisions should be appended
    expect(writtenState.working_memory.decisions).toContain('previous decision');
    expect(writtenState.working_memory.decisions).toContain('new decision 1');
    expect(writtenState.working_memory.decisions).toContain('new decision 2');
  });

  it('drains prior capture-only records into tracked state and marks them distilled', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {}, working_memory: { decisions: [], facts: [], pending: [] } } });

    distillationLedgerMock.loadPendingCaptureEntries.mockResolvedValue({
      path: '/home/testuser/AgenticOS/.agent-workspace/projects/test-project/distillation-ledger.yaml',
      entries: [
        { id: 'capture-2026-05-21-1200-test', status: 'captured', decisions: ['current'], outcomes: ['current-out'] },
        { id: 'prior-canonical-main-capture', status: 'captured', decisions: ['main-decision'], outcomes: ['main-outcome'], pending: ['stale-pending'] },
      ],
    });

    const result = await recordSession({
      summary: 'worktree session that drains canonical-main captures',
      decisions: ['worktree-decision'],
      outcomes: ['worktree-outcome'],
      pending: ['current-pending'],
    });

    const stateCall = fsPromisesMock.writeFile.mock.calls.find((c) => String(c[0]).endsWith('state.yaml'));
    expect(stateCall).toBeDefined();
    const writtenState = JSON.parse(stateCall![1] as string);
    // Drained prior decisions/outcomes are folded in (append-only) ahead of this session's.
    expect(writtenState.working_memory.decisions).toEqual(['main-decision', 'worktree-decision']);
    expect(writtenState.working_memory.facts).toEqual(['main-outcome', 'worktree-outcome']);
    // Pending is the current session's only — stale prior pending is not re-applied.
    expect(writtenState.working_memory.pending).toEqual(['current-pending']);

    // The current capture and the drained prior capture are both marked distilled.
    expect(distillationLedgerMock.markCapturesDistilledToState).toHaveBeenCalledWith(expect.objectContaining({
      entryIds: ['capture-2026-05-21-1200-test', 'prior-canonical-main-capture'],
    }));
    expect(result).toContain('Drained 1 pending capture-only record');
  });

  it('replaces pending items in state.yaml', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());

    const existingState = {
      session: {},
      working_memory: {
        decisions: [],
        facts: [],
        pending: ['old pending item'],
      },
    };
    mockProjectFiles({ state: existingState });

    await recordSession({
      summary: 'test',
      pending: ['new pending 1', 'new pending 2'],
    });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    const writtenState = JSON.parse(stateCall![1] as string);
    // Pending should be replaced, not appended
    expect(writtenState.working_memory.pending).toEqual(['new pending 1', 'new pending 2']);
    expect(writtenState.working_memory.pending).not.toContain('old pending item');
  });

  it('appends outcomes as facts in state.yaml', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());

    const existingState = {
      session: {},
      working_memory: {
        decisions: [],
        facts: ['existing fact'],
        pending: [],
      },
    };
    mockProjectFiles({ state: existingState });

    await recordSession({
      summary: 'test',
      outcomes: ['completed feature X', 'fixed bug Y'],
    });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    const writtenState = JSON.parse(stateCall![1] as string);
    // Facts should have existing + new outcomes
    expect(writtenState.working_memory.facts).toContain('existing fact');
    expect(writtenState.working_memory.facts).toContain('completed feature X');
    expect(writtenState.working_memory.facts).toContain('fixed bug Y');
  });

  it('updates current_task in state', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());

    const existingState = {
      session: {},
      working_memory: { decisions: [], facts: [], pending: [] },
    };
    mockProjectFiles({ state: existingState });

    await recordSession({
      summary: 'test',
      current_task: { title: 'Implement feature X', status: 'in_progress' },
    });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    const writtenState = JSON.parse(stateCall![1] as string);
    expect(writtenState.current_task.title).toBe('Implement feature X');
    expect(writtenState.current_task.status).toBe('in_progress');
  });

  it('falls back to existing task title and default status when current_task fields are partial', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      state: {
        session: {},
        current_task: {
          title: 'Existing task title',
        },
        working_memory: {
          pending: [],
        },
      },
    });

    await recordSession({
      summary: 'test',
      decisions: ['decision one'],
      outcomes: ['outcome one'],
      current_task: {},
    });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    const writtenState = JSON.parse(stateCall![1] as string);

    expect(writtenState.current_task.title).toBe('Existing task title');
    expect(writtenState.current_task.status).toBe('in_progress');
    expect(writtenState.working_memory.decisions).toEqual(['decision one']);
    expect(writtenState.working_memory.facts).toEqual(['outcome one']);
  });

  it('calls updateClaudeMdState', async () => {
    const { updateClaudeMdState } = await import('../../utils/distill.js');

    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {}, working_memory: { decisions: [], facts: [], pending: [] } } });

    await recordSession({ summary: 'test' });

    expect(updateClaudeMdState).toHaveBeenCalled();
  });

  it('updates registry with last_recorded timestamp', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {}, working_memory: { decisions: [], facts: [], pending: [] } } });

    await recordSession({ summary: 'test' });

    expect(registryMock.patchProjectMetadata).toHaveBeenCalledWith(
      'test-project',
      expect.objectContaining({
        last_recorded: expect.any(String),
      }),
    );
  });

  it('parses JSON-stringified array arguments without spreading as characters', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());

    const existingState = {
      session: {},
      working_memory: { decisions: [], facts: [], pending: [] },
    };
    mockProjectFiles({ state: existingState });

    await recordSession({
      summary: 'test',
      decisions: '["decision one","decision two"]',
      outcomes: '["outcome one","outcome two"]',
      pending: '["pending one"]',
    });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    expect(stateCall).toBeDefined();
    const writtenState = JSON.parse(stateCall![1] as string);

    expect(writtenState.working_memory.decisions).toEqual(['decision one', 'decision two']);
    expect(writtenState.working_memory.facts).toEqual(['outcome one', 'outcome two']);
    expect(writtenState.working_memory.pending).toEqual(['pending one']);

    for (const item of writtenState.working_memory.decisions) {
      expect((item as string).length).toBeGreaterThan(1);
    }
  });

  it('falls back to empty arrays when JSON-stringified list arguments are invalid', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      state: {
        session: {},
        working_memory: { decisions: ['existing'], facts: ['fact'], pending: ['pending'] },
      },
    });

    await recordSession({
      summary: 'test',
      decisions: 'not-json',
      outcomes: 'also-not-json',
      pending: 'broken-json',
    });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    const writtenState = JSON.parse(stateCall![1] as string);

    expect(writtenState.working_memory.decisions).toEqual(['existing']);
    expect(writtenState.working_memory.facts).toEqual(['fact']);
    expect(writtenState.working_memory.pending).toEqual(['pending']);
  });

  it('returns success message with paths', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {}, working_memory: { decisions: [], facts: [], pending: [] } } });

    const result = await recordSession({ summary: 'test session' });

    expect(result).toContain('Test Project');
    expect(result).toContain('conversations/');
    expect(result).toContain('state.yaml');
    expect(result).toContain('CLAUDE.md');
    expect(result).toContain('Distillation ledger: /home/testuser/AgenticOS/.agent-workspace/projects/test-project/distillation-ledger.yaml#capture-2026-05-21-1200-test');
    expect(result).toContain('✅ Session recorded');
    expect(distillationLedgerMock.recordCapturedDistillationEntry).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'test-project',
      summary: 'test session',
      capture: expect.objectContaining({
        filePath: expect.stringContaining('/conversations/'),
      }),
    }));
  });

  it('routes raw transcripts to a private sidecar path for public_distilled projects', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
        execution: {
          source_repo_roots: ['.'],
        },
      },
      state: { session: {}, working_memory: { decisions: [], facts: [], pending: [] } },
    });

    const result = await recordSession({ summary: 'test session' });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const convCall = writeCalls.find((c) => String(c[0]).includes('/.private/conversations/') && String(c[0]).endsWith('.md'));
    expect(convCall).toBeDefined();
    expect(result).toContain('Raw conversation: .private/conversations/');
    expect(result).toContain('Git recovery is distilled-only');
    expect(distillationLedgerMock.recordCapturedDistillationEntry).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'test-project',
      capture: expect.objectContaining({
        filePath: expect.stringContaining('/.private/conversations/'),
      }),
    }));
  });

  it('blocks when public_distilled raw transcript routing is misconfigured', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: { id: 'test-project', name: 'Test Project' },
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
          github_repo: 'example/test-project',
          branch_strategy: 'github_flow',
        },
        agent_context: {
          conversations: '.private/conversations/',
        },
        execution: {
          source_repo_roots: ['.'],
        },
      },
      state: { session: {}, working_memory: { decisions: [], facts: [], pending: [] } },
    });

    const result = await recordSession({ summary: 'test session' });

    expect(result).toContain('public transcript routing is misconfigured');
    expect(fsPromisesMock.writeFile).not.toHaveBeenCalled();
  });

  it('continues when quick-start.md is missing during enrichment', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: { id: 'test-project', name: 'Test Project' },
          source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
        });
      }
      if (path.endsWith('/state.yaml')) {
        return JSON.stringify({ session: {}, working_memory: { decisions: [], facts: [], pending: [] } });
      }
      if (path.endsWith('/quick-start.md')) {
        throw new Error('missing quick-start');
      }
      return '';
    });

    const result = await recordSession({ summary: 'test session' });

    expect(result).toContain('✅ Session recorded');
  });

  it('does not read or rewrite quick-start.md during record', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({ state: { session: {}, working_memory: { decisions: [], facts: [], pending: [] } } });

    await recordSession({ summary: 'runtime-only update' });

    expect(fsPromisesMock.readFile.mock.calls.some((call) => String(call[0]).endsWith('/quick-start.md'))).toBe(false);
    expect(fsPromisesMock.writeFile.mock.calls.some((call) => String(call[0]).endsWith('/quick-start.md'))).toBe(false);
  });

  it('creates a new conversation file and default state when conversation and state files do not exist yet', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: { id: 'test-project', name: 'Test Project' },
          source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
        });
      }
      if (path.endsWith('/state.yaml')) {
        throw new Error('missing state');
      }
      if (path.includes('/conversations/') && path.endsWith('.md')) {
        throw new Error('missing conversation');
      }
      if (path.endsWith('/quick-start.md')) {
        return '# Quick Start\n\n1. Define project goals';
      }
      return '';
    });

    const result = await recordSession({
      summary: 'bootstrapped',
      current_task: { title: 'Bootstrap project' },
    });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const convCall = writeCalls.find((c) => c[0].includes('conversations') && c[0].endsWith('.md'));
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    expect(convCall).toBeDefined();
    expect(String(convCall![1])).toContain('# Sessions');
    expect(stateCall).toBeDefined();
    const writtenState = JSON.parse(stateCall![1] as string);
    expect(writtenState.working_memory).toEqual({ facts: [], decisions: [], pending: [] });
    expect(writtenState.session.last_backup).toBeDefined();
    expect(writtenState.current_task.title).toBe('Bootstrap project');
    expect(result).toContain('✅ Session recorded');
  });

  it('falls back to an empty state object when state parsing returns nothing', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: { id: 'test-project', name: 'Test Project' },
          source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
        });
      }
      if (path.endsWith('/state.yaml')) {
        return 'not-json';
      }
      if (path.endsWith('/quick-start.md')) {
        return '# Quick Start\n\n1. Define project goals';
      }
      return '';
    });
    yamlMock.parse.mockImplementation((content: string) => {
      if (content === 'not-json') return undefined;
      try { return JSON.parse(content); } catch { return undefined; }
    });

    await recordSession({ summary: 'test session' });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    const writtenState = JSON.parse(stateCall![1] as string);
    expect(writtenState.working_memory).toEqual({ facts: [], decisions: [], pending: [] });
    expect(writtenState.session.last_backup).toBeDefined();
  });

  it('falls back to an empty state object when state parsing returns null', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('/.project.yaml')) {
        return JSON.stringify({
          meta: { id: 'test-project', name: 'Test Project' },
          source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
        });
      }
      if (path.endsWith('/state.yaml')) {
        return 'null';
      }
      if (path.endsWith('/quick-start.md')) {
        return '# Quick Start\n\n1. Define project goals';
      }
      return '';
    });

    await recordSession({ summary: 'test session' });

    const writeCalls = fsPromisesMock.writeFile.mock.calls;
    const stateCall = writeCalls.find((c) => c[0].endsWith('state.yaml'));
    const writtenState = JSON.parse(stateCall![1] as string);
    expect(writtenState.working_memory).toEqual({ facts: [], decisions: [], pending: [] });
    expect(writtenState.session.last_backup).toBeDefined();
  });

  it('only updates last_recorded on the resolved project', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      ...buildRegistry(),
      projects: [
        ...buildRegistry().projects,
        {
          id: 'other-project',
          name: 'Other Project',
          path: '/other/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
          last_recorded: '2025-01-01T12:00:00.000Z',
        },
      ],
    });
    mockProjectFiles({ state: { session: {}, working_memory: { decisions: [], facts: [], pending: [] } } });

    await recordSession({ summary: 'test session' });

    expect(registryMock.patchProjectMetadata).toHaveBeenCalledWith(
      'test-project',
      expect.objectContaining({
        last_recorded: expect.any(String),
      }),
    );
  });

  it('allows an explicit project even when legacy active_project differs', async () => {
    registryMock.loadRegistry.mockResolvedValue({
      ...buildRegistry(),
      projects: [
        ...buildRegistry().projects,
        {
          id: 'other-project',
          name: 'Other Project',
          path: '/other/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path === '/other/path/.project.yaml') {
        return JSON.stringify({
          meta: { id: 'other-project', name: 'Other Project' },
          source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
        });
      }
      if (path === '/other/path/.context/state.yaml') {
        return JSON.stringify({
          session: {},
          working_memory: { decisions: [], facts: [], pending: [] },
        });
      }
      if (path === '/other/path/.context/quick-start.md') {
        return '# Quick Start\n\n1. Define project goals';
      }
      if (path.includes('/other/path/.context/conversations/') && path.endsWith('.md')) {
        return '';
      }
      if (path === '/test/path/.project.yaml') {
        return JSON.stringify({
          meta: { id: 'test-project', name: 'Test Project' },
          source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
        });
      }
      if (path === '/test/path/.context/state.yaml') {
        return JSON.stringify({
          session: {},
          working_memory: { decisions: [], facts: [], pending: [] },
        });
      }
      if (path === '/test/path/.context/quick-start.md') {
        return '# Quick Start\n\n1. Define project goals';
      }
      if (path.includes('/test/path/.context/conversations/') && path.endsWith('.md')) {
        return '';
      }
      return '';
    });

    const result = await recordSession({
      project: 'other-project',
      summary: 'test',
    });

    expect(result).toContain('Session recorded for "Other Project"');
    expect(registryMock.patchProjectMetadata).toHaveBeenCalledWith(
      'other-project',
      expect.objectContaining({
        last_recorded: expect.any(String),
      }),
    );
  });

  it('uses project_path override as the writable checkout for explicit project records', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path === '/worktree/path/.project.yaml') {
        return JSON.stringify({
          meta: { id: 'test-project', name: 'Test Project' },
          source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
        });
      }
      if (path === '/worktree/path/.context/state.yaml') {
        return JSON.stringify({
          session: {},
          working_memory: { decisions: [], facts: [], pending: [] },
        });
      }
      if (path.includes('/worktree/path/.context/conversations/') && path.endsWith('.md')) {
        return '';
      }
      return '';
    });

    const result = await recordSession({
      project: 'test-project',
      project_path: '/worktree/path',
      summary: 'worktree record',
      decisions: ['use worktree'],
    });

    expect(result).toContain('Session recorded for "Test Project"');
    expect(fsPromisesMock.writeFile.mock.calls.some((call) => String(call[0]).startsWith('/worktree/path/.context/conversations/'))).toBe(true);
    expect(fsPromisesMock.writeFile.mock.calls.some((call) => String(call[0]) === '/worktree/path/.context/state.yaml')).toBe(true);
  });

  it('uses the session-local bound project when no explicit project is provided', async () => {
    bindSessionProject({
      projectId: 'other-project',
      projectName: 'Other Project',
      projectPath: '/other/path',
    });
    registryMock.loadRegistry.mockResolvedValue({
      ...buildRegistry({ active_project: null }),
      projects: [
        ...buildRegistry().projects,
        {
          id: 'other-project',
          name: 'Other Project',
          path: '/other/path',
          status: 'active' as const,
          created: '2025-01-01',
          last_accessed: '2025-01-01T00:00:00.000Z',
        },
      ],
    });
    fsPromisesMock.readFile.mockImplementation(async (path: string) => {
      if (path === '/other/path/.project.yaml') {
        return JSON.stringify({
          meta: { id: 'other-project', name: 'Other Project' },
          source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
        });
      }
      if (path === '/other/path/.context/state.yaml') {
        return JSON.stringify({
          session: {},
          working_memory: { decisions: [], facts: [], pending: [] },
        });
      }
      if (path === '/other/path/.context/quick-start.md') {
        return '# Quick Start\n\n1. Define project goals';
      }
      if (path.includes('/other/path/.context/conversations/') && path.endsWith('.md')) {
        return '';
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await recordSession({ summary: 'session-bound record' });

    expect(result).toContain('Session recorded for "Other Project"');
  });

  it('fails closed when .project.yaml identity mismatches the registry project', async () => {
    registryMock.loadRegistry.mockResolvedValue(buildRegistry());
    mockProjectFiles({
      projectYaml: {
        meta: {
          id: 'wrong-project',
          name: 'Test Project',
        },
        source_control: {
          topology: 'local_directory_only',
          context_publication_policy: 'local_private',
        },
      },
    });

    const result = await recordSession({ summary: 'test' });

    expect(result).toContain('does not match .project.yaml meta.id');
    expect(fsPromisesMock.writeFile).not.toHaveBeenCalled();
  });
});
