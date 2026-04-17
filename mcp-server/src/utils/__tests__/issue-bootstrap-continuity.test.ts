import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { assessIssueBootstrapContinuity } from '../issue-bootstrap-continuity.js';

const createdPaths: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  createdPaths.push(dir);
  return dir;
}

afterEach(async () => {
  while (createdPaths.length > 0) {
    const path = createdPaths.pop();
    if (path) {
      await rm(path, { recursive: true, force: true });
    }
  }
});

describe('assessIssueBootstrapContinuity', () => {
  it('returns missing_or_invalid when no bootstrap evidence exists', async () => {
    const result = await assessIssueBootstrapContinuity({
      bootstrap: null,
      currentRepoPath: '/repo/current',
    });

    expect(result.status).toBe('missing_or_invalid');
    expect(result.summary).toContain('No issue bootstrap evidence');
    expect(result.recovery_actions).toEqual(['run agenticos_issue_bootstrap in the current checkout']);
  });

  it('returns missing_or_invalid when repo_path evidence is blank', async () => {
    const result = await assessIssueBootstrapContinuity({
      bootstrap: {
        repo_path: '   ',
      },
      currentRepoPath: '/repo/current',
    });

    expect(result.status).toBe('missing_or_invalid');
    expect(result.reasons).toEqual(['latest issue bootstrap is missing repo_path evidence']);
  });

  it('treats a matching current checkout as current when startup path checks are disabled', async () => {
    const repoDir = await makeTempDir('agenticos-bootstrap-current-');

    const result = await assessIssueBootstrapContinuity({
      bootstrap: {
        repo_path: repoDir,
        startup_context_paths: ['/missing/path/that/is/ignored'],
      },
      currentRepoPath: repoDir,
      checkStartupContextPaths: false,
    });

    expect(result.status).toBe('current');
    expect(result.details.repo_path_exists).toBe(true);
    expect(result.details.startup_context_paths_checked).toBe(0);
  });

  it('marks a missing relocated repo_path as historical for the current checkout', async () => {
    const currentRepoDir = await makeTempDir('agenticos-bootstrap-current-');

    const result = await assessIssueBootstrapContinuity({
      bootstrap: {
        repo_path: '/missing/old/worktree',
      },
      currentRepoPath: currentRepoDir,
      checkStartupContextPaths: false,
    });

    expect(result.status).toBe('historical_for_current_checkout');
    expect(result.reasons).toEqual([
      `recorded repo_path points at "${'/missing/old/worktree'}" instead of the current checkout "${currentRepoDir}"`,
      'recorded repo_path "/missing/old/worktree" no longer exists',
    ]);
  });

  it('resolves relative startup context paths against projectPath and reports missing historical paths', async () => {
    const repoDir = await makeTempDir('agenticos-bootstrap-project-');
    const projectDir = await makeTempDir('agenticos-bootstrap-context-');
    await mkdir(join(projectDir, '.context'), { recursive: true });
    await writeFile(join(projectDir, '.context', 'quick-start.md'), '# quick start\n', 'utf-8');

    const result = await assessIssueBootstrapContinuity({
      bootstrap: {
        repo_path: repoDir,
        startup_context_paths: ['.context/quick-start.md', '.context/missing.md'],
      },
      currentRepoPath: repoDir,
      projectPath: projectDir,
    });

    expect(result.status).toBe('historical_for_current_checkout');
    expect(result.details.startup_context_paths_checked).toBe(2);
    expect(result.details.missing_startup_context_paths).toEqual([
      join(projectDir, '.context', 'missing.md'),
    ]);
  });

  it('accepts existing absolute startup context paths', async () => {
    const repoDir = await makeTempDir('agenticos-bootstrap-project-');
    const contextFile = join(repoDir, 'startup.md');
    await writeFile(contextFile, 'startup\n', 'utf-8');

    const result = await assessIssueBootstrapContinuity({
      bootstrap: {
        repo_path: repoDir,
        startup_context_paths: [contextFile],
      },
      currentRepoPath: repoDir,
    });

    expect(result.status).toBe('current');
    expect(result.details.startup_context_paths_checked).toBe(1);
  });

  it('ignores unresolved relative startup context paths when no projectPath is available', async () => {
    const repoDir = await makeTempDir('agenticos-bootstrap-project-');

    const result = await assessIssueBootstrapContinuity({
      bootstrap: {
        repo_path: repoDir,
        startup_context_paths: ['relative/path.md'],
      },
      currentRepoPath: repoDir,
    });

    expect(result.status).toBe('current');
    expect(result.details.startup_context_paths_checked).toBe(0);
  });
});
