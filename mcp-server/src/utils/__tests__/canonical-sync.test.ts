import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const childProcessMock = vi.hoisted(() => ({
  execFile: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execFile: childProcessMock.execFile,
  };
});

import { resolveRuntimeManagedEntries, runCanonicalSync } from '../canonical-sync.js';

function mockExecFileImplementation(handlers: Array<(args: string[]) => { stdout?: string; stderr?: string; error?: Error | null }>) {
  childProcessMock.execFile.mockImplementation((_file: string, args: string[], _options: unknown, cb: Function) => {
    const handler = handlers.shift();
    if (!handler) {
      cb(new Error(`unexpected execFile call: ${args.join(' ')}`));
      return;
    }
    const result = handler(args);
    if (result.error) {
      cb(Object.assign(result.error, { stdout: result.stdout || '', stderr: result.stderr || '' }));
      return;
    }
    cb(null, result.stdout || '', result.stderr || '');
  });
}

async function setupProjectRoot(): Promise<{ home: string; projectRoot: string }> {
  const home = await mkdtemp(join(tmpdir(), 'agenticos-canonical-sync-home-'));
  const projectRoot = join(home, 'projects', 'agenticos');
  await mkdir(join(projectRoot, 'standards', '.context', 'conversations'), { recursive: true });
  await writeFile(join(projectRoot, '.project.yaml'), `meta:\n  id: "agenticos"\n  name: "AgenticOS"\nsource_control:\n  topology: "github_versioned"\n  context_publication_policy: "public_distilled"\nagent_context:\n  quick_start: "standards/.context/quick-start.md"\n  current_state: "standards/.context/state.yaml"\n  conversations: "standards/.context/conversations/"\n  last_record_marker: "standards/.context/.last_record"\n`, 'utf-8');
  await writeFile(join(projectRoot, 'CLAUDE.md'), 'runtime note\n', 'utf-8');
  await writeFile(join(projectRoot, 'README.md'), 'source file\n', 'utf-8');
  await writeFile(join(projectRoot, 'standards', '.context', 'state.yaml'), 'state: dirty\n', 'utf-8');
  await writeFile(join(projectRoot, 'standards', '.context', 'conversations', '2026-04-14.md'), 'conversation\n', 'utf-8');
  return { home, projectRoot };
}

describe('runCanonicalSync', () => {
  beforeEach(() => {
    childProcessMock.execFile.mockReset();
  });

  afterEach(() => {
    delete process.env.AGENTICOS_HOME;
  });

  it('resolves runtime-managed entries from configured agent context paths', () => {
    expect(resolveRuntimeManagedEntries(null)).toEqual(['CLAUDE.md', 'AGENTS.md']);
    expect(resolveRuntimeManagedEntries({
      agent_context: {
        quick_start: './standards/.context/quick-start.md',
        current_state: './standards/.context/state.yaml',
        conversations: './standards/.context/conversations',
        last_record_marker: './standards/.context/.last_record',
      },
    })).toEqual([
      'standards/.context/quick-start.md',
      'standards/.context/state.yaml',
      'standards/.context/.last_record',
      'standards/.context/conversations/',
      'CLAUDE.md',
      'AGENTS.md',
    ]);
    expect(resolveRuntimeManagedEntries({
      agent_context: {
        conversations: 'standards/.context/conversations/',
      },
    })).toContain('standards/.context/conversations/');
  });

  it('returns a plan showing runtime drift and blocked prepare when source edits are present', async () => {
    const { home, projectRoot } = await setupProjectRoot();
    process.env.AGENTICOS_HOME = home;

    mockExecFileImplementation([
      () => ({
        stdout: '## main...origin/main [behind 2]\n M standards/.context/state.yaml\n M README.md\n?? standards/.context/conversations/2026-04-14.md\n',
      }),
    ]);

    const result = await runCanonicalSync({
      action: 'plan',
      repo_path: projectRoot,
      project_path: projectRoot,
    });

    expect(result.status).toBe('BLOCK');
    expect(result.prepare_allowed).toBe(false);
    expect(result.snapshot_recommended).toBe(true);
    expect(result.repo_sync.runtime_dirty_paths).toEqual([
      'standards/.context/state.yaml',
      'standards/.context/conversations/2026-04-14.md',
    ]);
    expect(result.repo_sync.source_dirty_paths).toEqual(['README.md']);
    expect(result.next_steps[0]).toContain('action "snapshot"');
  });

  it('defaults to a plan action and summarizes prepare-allowed runtime drift', async () => {
    const { home, projectRoot } = await setupProjectRoot();
    process.env.AGENTICOS_HOME = home;

    mockExecFileImplementation([
      () => ({
        stdout: '## main...origin/main\n M standards/.context/state.yaml\n',
      }),
    ]);

    const result = await runCanonicalSync({
      repo_path: projectRoot,
      project_path: projectRoot,
    });

    expect(result.action).toBe('plan');
    expect(result.status).toBe('BLOCK');
    expect(result.prepare_allowed).toBe(true);
    expect(result.summary).toContain('can be cleaned safely');
    expect(result.next_steps[0]).toContain('action "prepare"');
  });

  it('returns the underlying health summary for a clean plan with no runtime drift', async () => {
    const { home, projectRoot } = await setupProjectRoot();
    process.env.AGENTICOS_HOME = home;

    mockExecFileImplementation([
      () => ({
        stdout: '## main...origin/main\n',
      }),
    ]);

    const result = await runCanonicalSync({
      action: 'plan',
      repo_path: projectRoot,
      project_path: projectRoot,
    });

    expect(result.status).toBe('PASS');
    expect(result.summary).toBe('Canonical checkout is clean and aligned with origin/main.');
    expect(result.next_steps).toEqual([]);
  });

  it('creates a runtime drift snapshot without mutating the checkout', async () => {
    const { home, projectRoot } = await setupProjectRoot();
    process.env.AGENTICOS_HOME = home;

    mockExecFileImplementation([
      () => ({
        stdout: '## main...origin/main\n M standards/.context/state.yaml\n?? standards/.context/conversations/2026-04-14.md\n',
      }),
    ]);

    const result = await runCanonicalSync({
      action: 'snapshot',
      repo_path: projectRoot,
      project_path: projectRoot,
      snapshot_label: 'Pre Pull',
    });

    expect(result.status).toBe('BLOCK');
    expect(result.summary).toContain('snapshot was created');
    expect(result.snapshot?.preserved_paths).toEqual([
      'standards/.context/state.yaml',
      'standards/.context/conversations/2026-04-14.md',
    ]);

    const manifest = JSON.parse(await readFile(result.snapshot!.manifest_path, 'utf-8')) as { runtime_dirty_paths: string[] };
    expect(manifest.runtime_dirty_paths).toEqual([
      'standards/.context/state.yaml',
      'standards/.context/conversations/2026-04-14.md',
    ]);
    expect(result.snapshot?.snapshot_root).toContain('pre-pull');
  });

  it('creates no snapshot when runtime drift is absent and falls back to repo basename metadata', async () => {
    const { home, projectRoot } = await setupProjectRoot();
    process.env.AGENTICOS_HOME = home;

    mockExecFileImplementation([
      () => ({
        stdout: '## main...origin/main\n',
      }),
    ]);

    const result = await runCanonicalSync({
      action: 'snapshot',
      repo_path: projectRoot,
      project_path: join(projectRoot, 'missing-project-root'),
    });

    expect(result.status).toBe('PASS');
    expect(result.summary).toContain('no snapshot was needed');
    expect(result.snapshot).toBeUndefined();
    expect(result.runtime_managed_entries).toEqual(['CLAUDE.md', 'AGENTS.md']);
  });

  it('succeeds without project_path and uses repo-path fallback metadata', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-canonical-sync-bare-home-'));
    const repoPath = join(home, 'bare-canonical-checkout');
    await mkdir(repoPath, { recursive: true });
    process.env.AGENTICOS_HOME = home;

    mockExecFileImplementation([
      () => ({
        stdout: '## main...origin/main\n',
      }),
    ]);

    const result = await runCanonicalSync({
      action: 'snapshot',
      repo_path: repoPath,
      snapshot_label: undefined,
    });

    expect(result.project_path).toBeNull();
    expect(result.status).toBe('PASS');
    expect(result.runtime_managed_entries).toEqual(['CLAUDE.md', 'AGENTS.md']);
    expect(result.summary).toContain('no snapshot was needed');
  });

  it('treats a null project yaml as an empty object and still completes planning', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-canonical-sync-null-yaml-home-'));
    const repoPath = join(home, 'null-yaml-project');
    await mkdir(repoPath, { recursive: true });
    await writeFile(join(repoPath, '.project.yaml'), 'null\n', 'utf-8');
    process.env.AGENTICOS_HOME = home;

    mockExecFileImplementation([
      () => ({
        stdout: '## main...origin/main\n',
      }),
    ]);

    const result = await runCanonicalSync({
      action: 'plan',
      repo_path: repoPath,
      project_path: repoPath,
    });

    expect(result.status).toBe('PASS');
    expect(result.runtime_managed_entries).toContain('.context/conversations/');
  });

  it('records missing runtime paths in the snapshot manifest', async () => {
    const { home, projectRoot } = await setupProjectRoot();
    process.env.AGENTICOS_HOME = home;
    await rm(join(projectRoot, 'standards', '.context', 'state.yaml'));

    mockExecFileImplementation([
      () => ({
        stdout: '## main...origin/main\n D standards/.context/state.yaml\n',
      }),
    ]);

    const result = await runCanonicalSync({
      action: 'snapshot',
      repo_path: projectRoot,
      project_path: projectRoot,
      snapshot_label: '   ',
    });

    expect(result.snapshot?.preserved_paths).toEqual([]);
    expect(result.snapshot?.missing_paths).toEqual(['standards/.context/state.yaml']);
    expect(result.snapshot?.snapshot_root).toContain('runtime-drift');
  });

  it('uses the default snapshot label when runtime drift exists and no label is provided', async () => {
    const { home, projectRoot } = await setupProjectRoot();
    process.env.AGENTICOS_HOME = home;

    mockExecFileImplementation([
      () => ({
        stdout: '## main...origin/main\n M standards/.context/state.yaml\n',
      }),
    ]);

    const result = await runCanonicalSync({
      action: 'snapshot',
      repo_path: projectRoot,
      project_path: projectRoot,
    });

    expect(result.snapshot?.snapshot_root).toContain('runtime-drift');
    expect(result.snapshot?.preserved_paths).toEqual(['standards/.context/state.yaml']);
  });

  it('blocks prepare when source-tree edits are still present', async () => {
    const { home, projectRoot } = await setupProjectRoot();
    process.env.AGENTICOS_HOME = home;

    mockExecFileImplementation([
      () => ({
        stdout: '## main...origin/main\n M standards/.context/state.yaml\n M README.md\n',
      }),
    ]);

    const result = await runCanonicalSync({
      action: 'prepare',
      repo_path: projectRoot,
      project_path: projectRoot,
    });

    expect(result.status).toBe('BLOCK');
    expect(result.summary).toContain('blocked');
    expect(result.cleanup).toBeUndefined();
  });

  it('snapshots and cleans runtime-only drift, then reports the remaining branch misalignment', async () => {
    const { home, projectRoot } = await setupProjectRoot();
    process.env.AGENTICOS_HOME = home;

    mockExecFileImplementation([
      () => ({
        stdout: '## main...origin/main [behind 1]\n M standards/.context/state.yaml\n?? standards/.context/conversations/2026-04-14.md\n',
      }),
      (args) => {
        expect(args).toEqual(['-C', projectRoot, 'ls-files', '--error-unmatch', '--', 'standards/.context/state.yaml']);
        return { stdout: 'standards/.context/state.yaml\n' };
      },
      (args) => {
        expect(args).toEqual(['-C', projectRoot, 'restore', '--source=HEAD', '--staged', '--worktree', '--', 'standards/.context/state.yaml']);
        return { stdout: '' };
      },
      (args) => {
        expect(args).toEqual(['-C', projectRoot, 'ls-files', '--error-unmatch', '--', 'standards/.context/conversations/2026-04-14.md']);
        return { error: new Error('not tracked') };
      },
      () => ({
        stdout: '## main...origin/main [behind 1]\n',
      }),
    ]);

    const result = await runCanonicalSync({
      action: 'prepare',
      repo_path: projectRoot,
      project_path: projectRoot,
    });

    expect(result.status).toBe('BLOCK');
    expect(result.cleanup?.cleaned_paths).toEqual([
      'standards/.context/state.yaml',
      'standards/.context/conversations/2026-04-14.md',
    ]);
    expect(result.repo_sync.runtime_dirty_paths).toEqual([]);
    expect(result.next_steps[0]).toContain('fast-forward canonical main');
  });

  it('returns PASS after prepare when cleanup leaves a fully aligned checkout', async () => {
    const { home, projectRoot } = await setupProjectRoot();
    process.env.AGENTICOS_HOME = home;

    mockExecFileImplementation([
      () => ({
        stdout: '## main...origin/main\n M standards/.context/state.yaml\n',
      }),
      () => ({
        stdout: 'standards/.context/state.yaml\n',
      }),
      () => ({
        stdout: '',
      }),
      () => ({
        stdout: '## main...origin/main\n',
      }),
    ]);

    const result = await runCanonicalSync({
      action: 'prepare',
      repo_path: projectRoot,
      project_path: projectRoot,
      snapshot_label: 'clean',
    });

    expect(result.status).toBe('PASS');
    expect(result.summary).toContain('canonical checkout is now clean');
    expect(result.cleanup?.cleaned_paths).toEqual(['standards/.context/state.yaml']);
  });

  it('returns PASS for prepare when no runtime drift exists and validates required args', async () => {
    const { home, projectRoot } = await setupProjectRoot();
    process.env.AGENTICOS_HOME = home;

    mockExecFileImplementation([
      () => ({
        stdout: '## main...origin/main\n',
      }),
    ]);

    const result = await runCanonicalSync({
      action: 'prepare',
      repo_path: projectRoot,
      project_path: projectRoot,
    });

    expect(result.status).toBe('PASS');
    expect(result.summary).toContain('no cleanup');
    await expect(() => runCanonicalSync({ action: 'plan' })).rejects.toThrow('repo_path is required.');
    await expect(() => runCanonicalSync({ action: 'bad' as any, repo_path: projectRoot })).rejects.toThrow('Unsupported action');
  });

  it('surfaces git failures when the initial status probe cannot run', async () => {
    const { home, projectRoot } = await setupProjectRoot();
    process.env.AGENTICOS_HOME = home;

    mockExecFileImplementation([
      () => ({
        error: new Error('fatal: not a git repository'),
        stderr: 'fatal: not a git repository',
      }),
    ]);

    await expect(() => runCanonicalSync({
      action: 'plan',
      repo_path: projectRoot,
      project_path: projectRoot,
    })).rejects.toThrow('fatal: not a git repository');
  });

  it('surfaces message-only git failures when stderr and stdout are empty', async () => {
    const { home, projectRoot } = await setupProjectRoot();
    process.env.AGENTICOS_HOME = home;

    mockExecFileImplementation([
      () => ({
        error: new Error('message only git failure'),
      }),
    ]);

    await expect(() => runCanonicalSync({
      action: 'plan',
      repo_path: projectRoot,
      project_path: projectRoot,
    })).rejects.toThrow('message only git failure');
  });

  it('falls back to a synthesized git command error when no failure detail is available', async () => {
    const { home, projectRoot } = await setupProjectRoot();
    process.env.AGENTICOS_HOME = home;

    mockExecFileImplementation([
      () => ({
        error: { message: '' } as Error,
      }),
    ]);

    await expect(() => runCanonicalSync({
      action: 'plan',
      repo_path: projectRoot,
      project_path: projectRoot,
    })).rejects.toThrow('git status --short --branch --untracked-files=all failed');
  });
});
