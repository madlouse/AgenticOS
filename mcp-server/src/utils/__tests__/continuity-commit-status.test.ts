import { afterEach, describe, expect, it, vi } from 'vitest';

const execGitMock = vi.hoisted(() => vi.fn());

vi.mock('../exec-git.js', () => ({
  execGit: execGitMock,
}));

import { buildUncommittedContinuityNote, detectUncommittedContinuity } from '../continuity-commit-status.js';

const STATE = { absPath: '/repo/.context/state.yaml', displayPath: '.context/state.yaml' };
const CLAUDE = { absPath: '/repo/CLAUDE.md', displayPath: 'CLAUDE.md' };

describe('detectUncommittedContinuity', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns the display paths of surfaces git reports as dirty', async () => {
    execGitMock.mockImplementation(async (_repo: string, args: string[]) => {
      const pathArg = args[args.length - 1];
      if (pathArg === STATE.absPath) return { ok: true, stdout: ' M .context/state.yaml\n', stderr: '' };
      return { ok: true, stdout: '', stderr: '' }; // CLAUDE.md clean
    });

    const result = await detectUncommittedContinuity('/repo', [STATE, CLAUDE]);
    expect(result).toEqual(['.context/state.yaml']);
  });

  it('treats an untracked surface (??) as uncommitted', async () => {
    execGitMock.mockResolvedValue({ ok: true, stdout: '?? CLAUDE.md\n', stderr: '' });

    const result = await detectUncommittedContinuity('/repo', [CLAUDE]);
    expect(result).toEqual(['CLAUDE.md']);
  });

  it('returns empty when every surface is clean', async () => {
    execGitMock.mockResolvedValue({ ok: true, stdout: '', stderr: '' });

    const result = await detectUncommittedContinuity('/repo', [STATE, CLAUDE]);
    expect(result).toEqual([]);
  });

  it('omits a surface when git cannot prove dirtiness (non-repo / failure)', async () => {
    execGitMock.mockResolvedValue({ ok: false, stdout: '', stderr: 'fatal: not a git repository' });

    const result = await detectUncommittedContinuity('/repo', [STATE, CLAUDE]);
    expect(result).toEqual([]);
  });

  it('queries git status with a porcelain pathspec per surface and never throws', async () => {
    execGitMock.mockResolvedValue({ ok: true, stdout: '', stderr: '' });

    await detectUncommittedContinuity('/repo', [STATE, CLAUDE]);

    expect(execGitMock).toHaveBeenCalledTimes(2);
    const [repo, args, opts] = execGitMock.mock.calls[0];
    expect(repo).toBe('/repo');
    expect(args).toEqual(['status', '--porcelain', '--untracked-files=all', '--', STATE.absPath]);
    expect(opts).toMatchObject({ allowFailure: true });
  });
});

describe('buildUncommittedContinuityNote', () => {
  it('returns null when nothing is uncommitted', () => {
    expect(buildUncommittedContinuityNote([])).toBeNull();
  });

  it('renders a save-prompt note listing each uncommitted surface', () => {
    const note = buildUncommittedContinuityNote(['.context/state.yaml', 'CLAUDE.md']);
    expect(note).toContain('NOT committed');
    expect(note).toContain('   - .context/state.yaml');
    expect(note).toContain('   - CLAUDE.md');
    expect(note).toContain('agenticos_save');
  });
});
