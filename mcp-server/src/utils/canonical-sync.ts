import { execFile } from 'child_process';
import { access, cp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { basename, dirname, join } from 'path';
import yaml from 'yaml';
import { resolveManagedProjectContextDisplayPaths } from './agent-context-paths.js';
import { analyzeCanonicalRepoSync, type CanonicalRepoSyncAnalysis, type CanonicalRepoSyncDetails } from './canonical-checkout-sync.js';
import { getAgenticOSHome } from './registry.js';

export type CanonicalSyncAction = 'plan' | 'snapshot' | 'prepare';

export interface CanonicalSyncArgs {
  action?: CanonicalSyncAction;
  repo_path?: string;
  project_path?: string;
  remote_base_branch?: string;
  snapshot_label?: string;
}

export interface CanonicalSyncSnapshot {
  snapshot_root: string;
  manifest_path: string;
  preserved_paths: string[];
  missing_paths: string[];
}

export interface CanonicalSyncCleanup {
  cleaned_paths: string[];
}

export interface CanonicalSyncResult {
  command: 'agenticos_canonical_sync';
  action: CanonicalSyncAction;
  status: 'PASS' | 'BLOCK';
  summary: string;
  repo_path: string;
  project_path: string | null;
  remote_base_branch: string;
  checked_at: string;
  prepare_allowed: boolean;
  snapshot_recommended: boolean;
  runtime_managed_entries: string[];
  repo_sync: CanonicalRepoSyncDetails;
  recovery_actions: string[];
  next_steps: string[];
  snapshot?: CanonicalSyncSnapshot;
  cleanup?: CanonicalSyncCleanup;
}

interface ExecFileResult {
  stdout: string;
  stderr: string;
}

async function execGit(repoPath: string, args: string[], options?: { allowFailure?: boolean }): Promise<ExecFileResult & { ok: boolean }> {
  try {
    const result = await new Promise<ExecFileResult>((resolve, reject) => {
      execFile('git', ['-C', repoPath, ...args], { encoding: 'utf-8' }, (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stdout, stderr }));
          return;
        }
        resolve({
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
        });
      });
    });
    return {
      ok: true,
      stdout: result.stdout.trimEnd(),
      stderr: result.stderr.trimEnd(),
    };
  } catch (error: any) {
    const failure = {
      ok: false,
      stdout: String(error?.stdout || '').trimEnd(),
      stderr: String(error?.stderr || '').trimEnd(),
    };
    if (options?.allowFailure) {
      return failure;
    }
    throw new Error(failure.stderr || failure.stdout || error?.message || `git ${args.join(' ')} failed`);
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readProjectYaml(projectPath?: string): Promise<any | null> {
  if (!projectPath) return null;

  try {
    return yaml.parse(await readFile(join(projectPath, '.project.yaml'), 'utf-8')) || {};
  } catch {
    return null;
  }
}

export function resolveRuntimeManagedEntries(projectYaml: any | null): string[] {
  if (!projectYaml) {
    return ['CLAUDE.md', 'AGENTS.md'];
  }

  const contextPaths = resolveManagedProjectContextDisplayPaths(projectYaml);
  const normalize = (path: string, options?: { directory?: boolean }): string => {
    const normalized = path.replace(/\\/g, '/').replace(/^\.\/+/, '');
    return options?.directory ? `${normalized.replace(/\/+$/, '')}/` : normalized;
  };

  return [
    normalize(contextPaths.quickStartPath),
    normalize(contextPaths.statePath),
    normalize(contextPaths.markerPath),
    normalize(contextPaths.conversationsDir, { directory: true }),
    'CLAUDE.md',
    'AGENTS.md',
  ];
}

function resolveProjectId(projectYaml: any | null, projectPath: string | undefined, repoPath: string): string {
  const configuredId = projectYaml?.meta?.id;
  if (typeof configuredId === 'string' && configuredId.trim().length > 0) {
    return configuredId.trim();
  }
  return basename(projectPath || repoPath);
}

async function inspectCanonicalCheckout(args: {
  repoPath: string;
  projectPath?: string;
  remoteBaseBranch: string;
}): Promise<{
  projectYaml: any | null;
  runtimeManagedEntries: string[];
  analysis: CanonicalRepoSyncAnalysis;
}> {
  const statusResult = await execGit(args.repoPath, ['status', '--short', '--branch', '--untracked-files=all']);
  const projectYaml = await readProjectYaml(args.projectPath);
  const runtimeManagedEntries = resolveRuntimeManagedEntries(projectYaml);
  const analysis = analyzeCanonicalRepoSync({
    statusOutput: statusResult.stdout,
    remoteBaseBranch: args.remoteBaseBranch,
    runtimeManagedEntries,
  });

  return {
    projectYaml,
    runtimeManagedEntries,
    analysis,
  };
}

function sanitizeSnapshotLabel(label?: string): string {
  const fallback = 'runtime-drift';
  const normalized = String(label || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function buildSnapshotRoot(projectId: string, checkedAt: string, snapshotLabel?: string): string {
  const home = getAgenticOSHome();
  const stamp = checkedAt.replace(/[:.]/g, '-');
  return join(
    home,
    '.agent-workspace',
    'canonical-sync-snapshots',
    projectId,
    `${stamp}-${sanitizeSnapshotLabel(snapshotLabel)}`,
  );
}

async function createSnapshot(args: {
  repoPath: string;
  projectId: string;
  runtimeDirtyPaths: string[];
  analysis: CanonicalRepoSyncAnalysis;
  checkedAt: string;
  snapshotLabel?: string;
}): Promise<CanonicalSyncSnapshot> {
  const snapshotRoot = buildSnapshotRoot(args.projectId, args.checkedAt, args.snapshotLabel);
  const filesRoot = join(snapshotRoot, 'files');
  const preservedPaths: string[] = [];
  const missingPaths: string[] = [];

  await mkdir(filesRoot, { recursive: true });

  for (const relativePath of args.runtimeDirtyPaths) {
    const sourcePath = join(args.repoPath, relativePath);
    if (!(await pathExists(sourcePath))) {
      missingPaths.push(relativePath);
      continue;
    }

    const targetPath = join(filesRoot, relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, { recursive: true });
    preservedPaths.push(relativePath);
  }

  const manifestPath = join(snapshotRoot, 'manifest.json');
  await writeFile(
    manifestPath,
    JSON.stringify({
      captured_at: args.checkedAt,
      repo_path: args.repoPath,
      branch_line: args.analysis.details.branch_line,
      branch_status: args.analysis.details.branch_status,
      dirty_paths: args.analysis.details.dirty_paths,
      runtime_dirty_paths: args.analysis.details.runtime_dirty_paths,
      source_dirty_paths: args.analysis.details.source_dirty_paths,
      preserved_paths: preservedPaths,
      missing_paths: missingPaths,
    }, null, 2),
    'utf-8',
  );

  return {
    snapshot_root: snapshotRoot,
    manifest_path: manifestPath,
    preserved_paths: preservedPaths,
    missing_paths: missingPaths,
  };
}

async function cleanupRuntimeDrift(repoPath: string, runtimeDirtyPaths: string[]): Promise<CanonicalSyncCleanup> {
  const cleanedPaths: string[] = [];

  for (const relativePath of runtimeDirtyPaths) {
    const trackedProbe = await execGit(repoPath, ['ls-files', '--error-unmatch', '--', relativePath], { allowFailure: true });
    if (trackedProbe.ok) {
      await execGit(repoPath, ['restore', '--source=HEAD', '--staged', '--worktree', '--', relativePath]);
    } else {
      await rm(join(repoPath, relativePath), { recursive: true, force: true });
    }
    cleanedPaths.push(relativePath);
  }

  return {
    cleaned_paths: cleanedPaths,
  };
}

function canPrepare(analysis: CanonicalRepoSyncAnalysis): boolean {
  return analysis.details.source_dirty_paths.length === 0 && analysis.details.branch_status !== 'not_on_main';
}

function buildNextSteps(args: {
  action: CanonicalSyncAction;
  analysis: CanonicalRepoSyncAnalysis;
  prepareAllowed: boolean;
  runtimeDirtyPaths: string[];
}): string[] {
  const nextSteps = [...args.analysis.recovery_actions];

  if (args.runtimeDirtyPaths.length === 0) {
    return nextSteps;
  }

  if (args.action === 'plan' || args.action === 'snapshot') {
    if (args.prepareAllowed) {
      nextSteps.unshift('run agenticos_canonical_sync with action "prepare" to snapshot and clean runtime-managed drift');
    } else {
      nextSteps.unshift('run agenticos_canonical_sync with action "snapshot" to preserve runtime-managed drift before manual cleanup');
    }
  }

  return Array.from(new Set(nextSteps));
}

function summarizePlan(analysis: CanonicalRepoSyncAnalysis, prepareAllowed: boolean): string {
  if (analysis.details.runtime_dirty_paths.length === 0) {
    return analysis.summary;
  }

  if (prepareAllowed) {
    return 'Runtime-managed drift is present and can be cleaned safely after a preserved snapshot.';
  }

  return 'Runtime-managed drift is present, but automatic prepare is blocked until source edits are resolved or the checkout returns to main.';
}

export async function runCanonicalSync(args: CanonicalSyncArgs): Promise<CanonicalSyncResult> {
  const action = args.action || 'plan';
  if (!args.repo_path) {
    throw new Error('repo_path is required.');
  }

  if (!['plan', 'snapshot', 'prepare'].includes(action)) {
    throw new Error(`Unsupported action "${String(action)}".`);
  }

  const repoPath = args.repo_path;
  const projectPath = args.project_path;
  const remoteBaseBranch = args.remote_base_branch || 'origin/main';
  const checkedAt = new Date().toISOString();

  const initial = await inspectCanonicalCheckout({
    repoPath,
    projectPath,
    remoteBaseBranch,
  });
  const prepareAllowed = canPrepare(initial.analysis);
  const projectId = resolveProjectId(initial.projectYaml, projectPath, repoPath);

  const baseResult = {
    command: 'agenticos_canonical_sync' as const,
    action,
    repo_path: repoPath,
    project_path: projectPath || null,
    remote_base_branch: remoteBaseBranch,
    checked_at: checkedAt,
    prepare_allowed: prepareAllowed,
    snapshot_recommended: initial.analysis.details.runtime_dirty_paths.length > 0,
    runtime_managed_entries: initial.runtimeManagedEntries,
  };

  if (action === 'plan') {
    return {
      ...baseResult,
      status: initial.analysis.status,
      summary: summarizePlan(initial.analysis, prepareAllowed),
      repo_sync: initial.analysis.details,
      recovery_actions: initial.analysis.recovery_actions,
      next_steps: buildNextSteps({
        action,
        analysis: initial.analysis,
        prepareAllowed,
        runtimeDirtyPaths: initial.analysis.details.runtime_dirty_paths,
      }),
    };
  }

  if (action === 'snapshot') {
    const snapshot = initial.analysis.details.runtime_dirty_paths.length > 0
      ? await createSnapshot({
          repoPath,
          projectId,
          runtimeDirtyPaths: initial.analysis.details.runtime_dirty_paths,
          analysis: initial.analysis,
          checkedAt,
          snapshotLabel: args.snapshot_label,
        })
      : undefined;

    return {
      ...baseResult,
      status: initial.analysis.status,
      summary: snapshot
        ? 'Runtime-managed drift snapshot was created without mutating the checkout.'
        : 'No runtime-managed drift was present, so no snapshot was needed.',
      repo_sync: initial.analysis.details,
      recovery_actions: initial.analysis.recovery_actions,
      next_steps: buildNextSteps({
        action,
        analysis: initial.analysis,
        prepareAllowed,
        runtimeDirtyPaths: initial.analysis.details.runtime_dirty_paths,
      }),
      snapshot,
    };
  }

  if (!prepareAllowed) {
    return {
      ...baseResult,
      status: 'BLOCK',
      summary: 'Automatic prepare is blocked because the checkout still has source-tree edits or is not on main.',
      repo_sync: initial.analysis.details,
      recovery_actions: initial.analysis.recovery_actions,
      next_steps: buildNextSteps({
        action,
        analysis: initial.analysis,
        prepareAllowed,
        runtimeDirtyPaths: initial.analysis.details.runtime_dirty_paths,
      }),
    };
  }

  if (initial.analysis.details.runtime_dirty_paths.length === 0) {
    return {
      ...baseResult,
      status: initial.analysis.status,
      summary: 'No runtime-managed drift was present, so prepare performed no cleanup.',
      repo_sync: initial.analysis.details,
      recovery_actions: initial.analysis.recovery_actions,
      next_steps: buildNextSteps({
        action,
        analysis: initial.analysis,
        prepareAllowed,
        runtimeDirtyPaths: initial.analysis.details.runtime_dirty_paths,
      }),
    };
  }

  const snapshot = await createSnapshot({
    repoPath,
    projectId,
    runtimeDirtyPaths: initial.analysis.details.runtime_dirty_paths,
    analysis: initial.analysis,
    checkedAt,
    snapshotLabel: args.snapshot_label || 'prepare',
  });
  const cleanup = await cleanupRuntimeDrift(repoPath, initial.analysis.details.runtime_dirty_paths);
  const postCleanup = await inspectCanonicalCheckout({
    repoPath,
    projectPath,
    remoteBaseBranch,
  });

  return {
    ...baseResult,
    status: postCleanup.analysis.status,
    summary: postCleanup.analysis.status === 'PASS'
      ? `Runtime-managed drift was snapshot to ${snapshot.snapshot_root} and the canonical checkout is now clean.`
      : 'Runtime-managed drift was snapshot and cleaned, but the canonical checkout still needs manual branch resync.',
    repo_sync: postCleanup.analysis.details,
    recovery_actions: postCleanup.analysis.recovery_actions,
    next_steps: buildNextSteps({
      action,
      analysis: postCleanup.analysis,
      prepareAllowed: canPrepare(postCleanup.analysis),
      runtimeDirtyPaths: postCleanup.analysis.details.runtime_dirty_paths,
    }),
    snapshot,
    cleanup,
  };
}
