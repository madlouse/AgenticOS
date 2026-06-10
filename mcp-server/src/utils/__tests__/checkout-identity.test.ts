import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execGitMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const yamlParseMock = vi.hoisted(() => vi.fn());

vi.mock('../exec-git.js', () => ({
  execGit: execGitMock,
}));

vi.mock('fs/promises', () => ({
  readFile: readFileMock,
}));

vi.mock('yaml', () => ({
  default: { parse: yamlParseMock },
}));

import {
  loadAndVerifyManagedProjectIdentity,
  resolveGitCheckoutIdentity,
} from '../checkout-identity.js';

/**
 * Drive resolveGitCheckoutIdentity by mapping the two git invocations
 * (rev-parse --show-toplevel, rev-parse --git-common-dir) to fixture output.
 */
function mockGitRoots(showToplevel: string, gitCommonDir: string): void {
  execGitMock.mockImplementation((_repoPath: string, args: string[]) => {
    if (args.includes('--show-toplevel')) {
      return Promise.resolve({ ok: true, stdout: `${showToplevel}\n`, stderr: '' });
    }
    if (args.includes('--git-common-dir')) {
      return Promise.resolve({ ok: true, stdout: `${gitCommonDir}\n`, stderr: '' });
    }
    return Promise.reject(new Error(`unexpected git args: ${args.join(' ')}`));
  });
}

describe('resolveGitCheckoutIdentity — checkout shape matrix', () => {
  afterEach(() => vi.clearAllMocks());

  it('canonical main checkout: worktree root equals common repo root', async () => {
    mockGitRoots('/repo/projects/app', '.git');
    const identity = await resolveGitCheckoutIdentity('/repo/projects/app');

    expect(identity).toEqual({
      worktreeRoot: '/repo/projects/app',
      commonDir: '/repo/projects/app/.git',
      commonRepoRoot: '/repo/projects/app',
    });
  });

  it('nested worktree under the common repo root: common-dir is relative to the worktree', async () => {
    // git-common-dir is relative to the worktree root for a linked worktree.
    mockGitRoots('/repo/worktrees/app/app-123-topic', '/repo/projects/app/.git');
    const identity = await resolveGitCheckoutIdentity('/repo/worktrees/app/app-123-topic');

    expect(identity).toEqual({
      worktreeRoot: '/repo/worktrees/app/app-123-topic',
      commonDir: '/repo/projects/app/.git',
      commonRepoRoot: '/repo/projects/app',
    });
  });

  it('isolated worktree outside the common repo root: common repo root differs from worktree root (#509 shape)', async () => {
    mockGitRoots('/Users/x/worktrees/agenticos/agenticos-346-topic', '/Users/x/projects/agenticos/.git');
    const identity = await resolveGitCheckoutIdentity('/Users/x/worktrees/agenticos/agenticos-346-topic');

    expect(identity?.worktreeRoot).toBe('/Users/x/worktrees/agenticos/agenticos-346-topic');
    expect(identity?.commonRepoRoot).toBe('/Users/x/projects/agenticos');
    expect(identity?.commonRepoRoot).not.toBe(identity?.worktreeRoot);
  });

  it('resolves a relative --git-common-dir against the worktree root', async () => {
    mockGitRoots('/repo/app', '../.git');
    const identity = await resolveGitCheckoutIdentity('/repo/app');

    expect(identity?.commonDir).toBe('/repo/.git');
    expect(identity?.commonRepoRoot).toBe('/repo');
  });

  it('returns null when the directory is not a git repository (misbound checkout)', async () => {
    execGitMock.mockRejectedValue(Object.assign(new Error('not a git repository'), { stderr: 'fatal' }));
    const identity = await resolveGitCheckoutIdentity('/not/a/repo');

    expect(identity).toBeNull();
  });
});

describe('loadAndVerifyManagedProjectIdentity', () => {
  beforeEach(() => {
    yamlParseMock.mockImplementation((content: string) => {
      try {
        return JSON.parse(content);
      } catch {
        return undefined;
      }
    });
  });

  afterEach(() => vi.clearAllMocks());

  it('returns ok with the parsed yaml when meta.id matches the registry id', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({ meta: { id: 'alpha', name: 'Alpha Display' } }));
    const result = await loadAndVerifyManagedProjectIdentity('/p/.project.yaml', 'alpha');

    expect(result).toEqual({ ok: true, projectYaml: { meta: { id: 'alpha', name: 'Alpha Display' } } });
  });

  it('accepts a meta.name that diverges from the registry display name (#508)', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({ meta: { id: 'alpha', name: 'alpha-canonical-slug' } }));
    const result = await loadAndVerifyManagedProjectIdentity('/p/.project.yaml', 'alpha');

    expect(result.ok).toBe(true);
  });

  it('fails as unreadable when the file cannot be read', async () => {
    readFileMock.mockRejectedValue(new Error('ENOENT'));
    const result = await loadAndVerifyManagedProjectIdentity('/p/.project.yaml', 'alpha');

    expect(result).toEqual({
      ok: false,
      code: 'unreadable',
      message: 'Project identity could not be proven because /p/.project.yaml is missing or unreadable.',
    });
  });

  it('fails as missing_meta_id when meta.id is absent', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({ meta: { name: 'Alpha' } }));
    const result = await loadAndVerifyManagedProjectIdentity('/p/.project.yaml', 'alpha');

    expect(result).toEqual({
      ok: false,
      code: 'missing_meta_id',
      message: 'Project identity could not be proven because /p/.project.yaml is missing meta.id.',
    });
  });

  it('fails as mismatch when meta.id differs from the registry id', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({ meta: { id: 'beta' } }));
    const result = await loadAndVerifyManagedProjectIdentity('/p/.project.yaml', 'alpha');

    expect(result).toEqual({
      ok: false,
      code: 'mismatch',
      message: 'Project identity mismatch: registry id "alpha" does not match .project.yaml meta.id "beta".',
    });
  });
});
