import { exec } from 'child_process';
import { readFile, readdir, stat } from 'fs/promises';
import { join, resolve } from 'path';
import yaml from 'yaml';
import { analyzeCanonicalRepoSync, type CanonicalRepoSyncDetails } from './canonical-checkout-sync.js';
import { resolveManagedProjectContextPaths } from './agent-context-paths.js';
import { CURRENT_TEMPLATE_VERSION, extractTemplateVersion } from './distill.js';
import { getRuntimeCaptureConversationDir } from './record-capture.js';
import { loadRegistry } from './registry.js';
import { summarizeDistillationLedger, type DistillationLedgerHealth } from './distillation-ledger.js';

export interface KnowledgeEvolutionAdapterFreshness {
  path: string;
  status: 'current' | 'missing' | 'stale';
  installed_version: number | null;
  expected_version: number;
}

export interface KnowledgeEvolutionHealth {
  status: 'PASS' | 'WARN';
  summary: string;
  latest_sidecar_capture_at: string | null;
  latest_entry_state_refresh_at: string | null;
  latest_knowledge_update_at: string | null;
  latest_task_update_at: string | null;
  adapter_template_freshness: {
    expected_version: number;
    adapters: KnowledgeEvolutionAdapterFreshness[];
  };
  dirty_worktree: {
    status: 'PASS' | 'WARN' | 'UNKNOWN';
    dirty_path_count: number | null;
    runtime_dirty_path_count: number | null;
    source_dirty_path_count: number | null;
    summary: string;
  };
  registry_state_drift: {
    status: 'PASS' | 'WARN';
    active_project_id: string | null;
    target_project_id: string | null;
    registry_path: string | null;
    project_path: string | null;
    summary: string;
  };
  distillation_ledger: DistillationLedgerHealth;
  warnings: string[];
  recovery_actions: string[];
}

interface KnowledgeEvolutionArgs {
  projectPath?: string | null;
  repoPath?: string | null;
  projectYaml?: any | null;
  state?: any | null;
  repoSync?: CanonicalRepoSyncDetails | null;
  now?: Date;
  staleAfterDays?: number;
}

interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

const DEFAULT_STALE_AFTER_DAYS = 14;
const TRACKED_EXTENSIONS = new Set(['.md', '.markdown', '.yaml', '.yml', '.json']);

function execCommand(command: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        /* c8 ignore next -- stderr/stdout/error.message fallback shape depends on child_process internals. */
        reject(new Error(stderr || stdout || error.message));
        return;
      }
      resolvePromise(stdout);
    });
  });
}

function normalizeIso(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function latestIso(values: Array<string | null>): string | null {
  const sorted = values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return sorted[0] ?? null;
}

function isStale(value: string | null, now: Date, staleAfterDays: number): boolean {
  if (!value) return true;
  const ageMs = now.getTime() - new Date(value).getTime();
  return ageMs > staleAfterDays * 24 * 60 * 60 * 1000;
}

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot).toLowerCase() : '';
}

async function latestTrackedFileMtime(dir: string | null, depth = 4): Promise<string | null> {
  if (!dir || depth < 0) return null;
  let entries: DirectoryEntry[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates: string[] = [];
  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await latestTrackedFileMtime(entryPath, depth - 1);
      if (nested) candidates.push(nested);
      continue;
    }
    if (!entry.isFile() || !TRACKED_EXTENSIONS.has(extensionOf(entry.name))) {
      continue;
    }
    /* c8 ignore next 5 -- race-only path when a file disappears between readdir and stat. */
    try {
      candidates.push((await stat(entryPath)).mtime.toISOString());
    } catch {
      continue;
    }
  }
  return latestIso(candidates);
}

async function readProjectYaml(projectPath: string | null | undefined): Promise<any | null> {
  if (!projectPath) return null;
  try {
    return yaml.parse(await readFile(join(projectPath, '.project.yaml'), 'utf-8')) || null;
  } catch {
    return null;
  }
}

async function readState(projectPath: string | null | undefined, projectYaml: any | null): Promise<any | null> {
  if (!projectPath || !projectYaml) return null;
  try {
    const statePath = resolveManagedProjectContextPaths(projectPath, projectYaml).statePath;
    return yaml.parse(await readFile(statePath, 'utf-8')) || null;
  } catch {
    return null;
  }
}

async function inspectAdapters(projectPath: string | null): Promise<KnowledgeEvolutionAdapterFreshness[]> {
  const adapterNames = ['CLAUDE.md', 'AGENTS.md'];
  const adapters: KnowledgeEvolutionAdapterFreshness[] = [];
  for (const name of adapterNames) {
    const path = projectPath ? join(projectPath, name) : name;
    let installedVersion: number | null = null;
    let status: KnowledgeEvolutionAdapterFreshness['status'] = 'missing';
    if (projectPath) {
      try {
        installedVersion = extractTemplateVersion(await readFile(path, 'utf-8'));
        status = installedVersion >= CURRENT_TEMPLATE_VERSION ? 'current' : 'stale';
      } catch {
        status = 'missing';
      }
    }
    adapters.push({
      path,
      status,
      installed_version: installedVersion,
      expected_version: CURRENT_TEMPLATE_VERSION,
    });
  }
  return adapters;
}

async function resolveRepoSync(args: KnowledgeEvolutionArgs): Promise<CanonicalRepoSyncDetails | null> {
  if (args.repoSync) return args.repoSync;
  if (!args.repoPath) return null;
  try {
    const statusOutput = await execCommand(`git -C "${args.repoPath}" status --short --branch --untracked-files=all`);
    return analyzeCanonicalRepoSync({
      statusOutput,
      remoteBaseBranch: 'origin/main',
      runtimeManagedEntries: ['.context/', 'standards/.context/', 'CLAUDE.md', 'AGENTS.md'],
    }).details;
  } catch {
    return null;
  }
}

function buildDirtyWorktree(repoSync: CanonicalRepoSyncDetails | null): KnowledgeEvolutionHealth['dirty_worktree'] {
  if (!repoSync) {
    return {
      status: 'UNKNOWN',
      dirty_path_count: null,
      runtime_dirty_path_count: null,
      source_dirty_path_count: null,
      summary: 'Dirty worktree status could not be determined.',
    };
  }
  const dirtyCount = repoSync.dirty_paths.length;
  return {
    status: dirtyCount > 0 ? 'WARN' : 'PASS',
    dirty_path_count: dirtyCount,
    runtime_dirty_path_count: repoSync.runtime_dirty_paths.length,
    source_dirty_path_count: repoSync.source_dirty_paths.length,
    summary: dirtyCount > 0
      ? `Dirty worktree has ${dirtyCount} path(s): runtime ${repoSync.runtime_dirty_paths.length}, source ${repoSync.source_dirty_paths.length}.`
      : 'Worktree is clean.',
  };
}

async function buildRegistryDrift(projectPath: string | null, projectId: string | null): Promise<KnowledgeEvolutionHealth['registry_state_drift']> {
  try {
    const registry = await loadRegistry();
    const project = projectId ? registry.projects.find((candidate) => candidate.id === projectId) ?? null : null;
    const normalizedProjectPath = projectPath ? resolve(projectPath) : null;
    const normalizedRegistryPath = project?.path ? resolve(project.path) : null;
    const driftReasons: string[] = [];
    if (!projectId) {
      driftReasons.push('project meta.id is unavailable');
    } else if (!project) {
      driftReasons.push(`project "${projectId}" is missing from registry`);
    }
    if (registry.active_project && projectId && registry.active_project !== projectId) {
      driftReasons.push(`registry active_project is "${registry.active_project}"`);
    }
    if (normalizedProjectPath && normalizedRegistryPath && normalizedProjectPath !== normalizedRegistryPath) {
      driftReasons.push('registry path differs from project_path');
    }
    return {
      status: driftReasons.length > 0 ? 'WARN' : 'PASS',
      active_project_id: registry.active_project || null,
      target_project_id: projectId,
      registry_path: normalizedRegistryPath,
      project_path: normalizedProjectPath,
      summary: driftReasons.length > 0 ? `Registry/state drift: ${driftReasons.join('; ')}.` : 'Registry entry matches project identity.',
    };
  } catch {
    return {
      status: 'WARN',
      active_project_id: null,
      target_project_id: projectId,
      registry_path: null,
      project_path: projectPath ? resolve(projectPath) : null,
      summary: 'Registry/state drift could not be determined.',
    };
  }
}

function addFreshnessWarnings(args: {
  warnings: string[];
  latestSidecar: string | null;
  latestEntryRefresh: string | null;
  latestKnowledge: string | null;
  latestTask: string | null;
  now: Date;
  staleAfterDays: number;
}): void {
  if (isStale(args.latestSidecar, args.now, args.staleAfterDays)) {
    args.warnings.push(args.latestSidecar ? 'sidecar capture is stale' : 'sidecar capture is missing');
  }
  if (isStale(args.latestEntryRefresh, args.now, args.staleAfterDays)) {
    args.warnings.push(args.latestEntryRefresh ? 'entry-state refresh is stale' : 'entry-state refresh is missing');
  }
  if (isStale(args.latestKnowledge, args.now, args.staleAfterDays)) {
    args.warnings.push(args.latestKnowledge ? 'knowledge update is stale' : 'knowledge update is missing');
  }
  if (isStale(args.latestTask, args.now, args.staleAfterDays)) {
    args.warnings.push(args.latestTask ? 'task update is stale' : 'task update is missing');
  }
}

export async function assessKnowledgeEvolutionHealth(args: KnowledgeEvolutionArgs): Promise<KnowledgeEvolutionHealth> {
  const now = args.now ?? new Date();
  const staleAfterDays = args.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS;
  const projectPath = args.projectPath ?? null;
  const projectYaml = args.projectYaml ?? await readProjectYaml(projectPath);
  const state = args.state ?? await readState(projectPath, projectYaml);
  const projectId = typeof projectYaml?.meta?.id === 'string' ? projectYaml.meta.id.trim() || null : null;
  const contextPaths = projectPath && projectYaml ? resolveManagedProjectContextPaths(projectPath, projectYaml) : null;
  const latestSidecar = projectId ? await latestTrackedFileMtime(getRuntimeCaptureConversationDir(projectId)) : null;
  const latestEntryRefresh = latestIso([
    normalizeIso(state?.entry_surface_refresh?.refreshed_at),
    normalizeIso(state?.session?.last_entry_surface_refresh),
  ]);
  const latestKnowledge = await latestTrackedFileMtime(contextPaths?.knowledgeDir ?? null);
  const latestTask = await latestTrackedFileMtime(contextPaths?.tasksDir ?? null);
  const adapterTemplateFreshness = {
    expected_version: CURRENT_TEMPLATE_VERSION,
    adapters: await inspectAdapters(projectPath),
  };
  const dirtyWorktree = buildDirtyWorktree(await resolveRepoSync(args));
  const registryStateDrift = await buildRegistryDrift(projectPath, projectId);
  const distillationLedger = await summarizeDistillationLedger({
    projectId,
    now,
    staleAfterDays,
  });
  const warnings: string[] = [];

  addFreshnessWarnings({
    warnings,
    latestSidecar,
    latestEntryRefresh,
    latestKnowledge,
    latestTask,
    now,
    staleAfterDays,
  });

  for (const adapter of adapterTemplateFreshness.adapters) {
    if (adapter.status !== 'current') {
      warnings.push(`${adapter.path} adapter template is ${adapter.status}`);
    }
  }
  if (dirtyWorktree.status !== 'PASS') warnings.push(dirtyWorktree.summary);
  if (registryStateDrift.status === 'WARN') warnings.push(registryStateDrift.summary);
  warnings.push(...distillationLedger.warnings);

  const recoveryActions = warnings.length > 0
    ? [
        'run agenticos_record or agenticos_task_* to refresh task/knowledge continuity',
        ...(distillationLedger.status === 'WARN'
          ? ['promote, convert, supersede, or explicitly ignore stale captured ledger entries']
          : []),
        'run agenticos_refresh_entry_surfaces after important state changes',
        'review adapter templates and registry binding before relying on cross-session memory',
      ]
    : [];

  return {
    status: warnings.length > 0 ? 'WARN' : 'PASS',
    summary: warnings.length > 0
      ? `Knowledge evolution has ${warnings.length} warning(s).`
      : 'Knowledge evolution signals are fresh.',
    latest_sidecar_capture_at: latestSidecar,
    latest_entry_state_refresh_at: latestEntryRefresh,
    latest_knowledge_update_at: latestKnowledge,
    latest_task_update_at: latestTask,
    adapter_template_freshness: adapterTemplateFreshness,
    dirty_worktree: dirtyWorktree,
    registry_state_drift: registryStateDrift,
    distillation_ledger: distillationLedger,
    warnings,
    recovery_actions: recoveryActions,
  };
}

function displayTimestamp(value: string | null): string {
  return value ?? 'missing';
}

export function buildKnowledgeEvolutionStatusLines(assessment: KnowledgeEvolutionHealth): string[] {
  const lines = [
    `🧠 Knowledge evolution: ${assessment.status} - ${assessment.summary}`,
    `   Sidecar capture: ${displayTimestamp(assessment.latest_sidecar_capture_at)}`,
    `   Entry-state refresh: ${displayTimestamp(assessment.latest_entry_state_refresh_at)}`,
    `   Knowledge update: ${displayTimestamp(assessment.latest_knowledge_update_at)}`,
    `   Task update: ${displayTimestamp(assessment.latest_task_update_at)}`,
    `   Dirty worktree: ${assessment.dirty_worktree.summary}`,
    `   Registry/state: ${assessment.registry_state_drift.summary}`,
    `   Distillation ledger: ${assessment.distillation_ledger.summary}`,
  ];
  const staleAdapters = assessment.adapter_template_freshness.adapters.filter((adapter) => adapter.status !== 'current');
  lines.push(staleAdapters.length > 0
    ? `   Adapter templates: ${staleAdapters.length} warning(s)`
    : '   Adapter templates: current');
  for (const warning of assessment.warnings.slice(0, 5)) {
    lines.push(`   Warning: ${warning}`);
  }
  return lines;
}
