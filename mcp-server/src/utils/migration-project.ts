import { createHash } from 'crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
import { basename, dirname, isAbsolute, join, resolve as resolveFsPath } from 'path';
import yaml from 'yaml';
import { resolveManagedProjectContextPaths } from './agent-context-paths.js';
import { getAgenticOSHome, loadRegistry, patchRegistry, resolvePath, type Project, type Registry } from './registry.js';
import { runMigrationAuditCheck, type MigrationAuditResult } from './migration-audit.js';

type ApplyScope = 'safe_repairs_only' | 'full';
type PlanStatus = 'READY' | 'BLOCK' | 'NOOP';
type Actionability = 'defer_only' | 'safe_repair' | 'explicit_apply' | 'manual_block';
type ActionType = 'registry_patch' | 'project_yaml_patch' | 'state_surface_repair' | 'evidence_write';

interface RawRegistryProject {
  id?: unknown;
  name?: unknown;
  path?: unknown;
  status?: unknown;
  created?: unknown;
  last_accessed?: unknown;
  last_recorded?: unknown;
}

interface RawRegistry {
  version?: unknown;
  last_updated?: unknown;
  active_project?: unknown;
  projects?: RawRegistryProject[];
}

interface RawRegistryState {
  raw: RawRegistry;
  error: string | null;
  path: string;
}

interface MigrationCandidate {
  registry: Registry;
  rawRegistryState: RawRegistryState;
  registryEntry: Project | null;
  rawRegistryEntry: RawRegistryProject | null;
  projectPath: string;
  resolutionSource: 'project' | 'project_path';
}

interface MigrationAction {
  id: string;
  actionability: Exclude<Actionability, 'defer_only' | 'manual_block'>;
  action_type: ActionType;
  summary: string;
  source_finding_codes: string[];
  target_paths: string[];
}

interface MigrationDeferredFinding {
  code: string;
  actionability: 'defer_only';
  summary: string;
  reason: string;
}

interface MigrationManualBlock {
  code: string;
  actionability: 'manual_block';
  summary: string;
  evidence: string[];
  reason: string;
}

interface MigrationPlanPreconditions {
  registry_path: string;
  registry_subset_digest: string;
  project_yaml_path: string;
  project_yaml_digest: string;
  state_path: string | null;
  state_digest: string | null;
  apply_scope: ApplyScope;
}

export interface MigrationProjectPlanResult {
  command: 'agenticos_migrate_project';
  mode: 'plan';
  status: PlanStatus;
  apply_scope: ApplyScope;
  apply_supported: true;
  project: MigrationAuditResult['project'];
  audit_status: MigrationAuditResult['status'] | 'BLOCK';
  audit_finding_counts: MigrationAuditResult['finding_counts'];
  safe_to_continue_without_migration: boolean;
  plan_hash: string | null;
  apply_ready: boolean;
  planned_actions: MigrationAction[];
  deferred_findings: MigrationDeferredFinding[];
  manual_blocks: MigrationManualBlock[];
  preconditions: MigrationPlanPreconditions | null;
  block_reasons: string[];
  notes: string[];
}

export interface MigrationProjectApplyResult {
  command: 'agenticos_migrate_project';
  mode: 'apply';
  status: 'APPLIED' | 'BLOCK';
  apply_scope: ApplyScope;
  apply_supported: true;
  project: MigrationAuditResult['project'];
  applied_plan_hash: string | null;
  applied_actions: MigrationAction[];
  deferred_findings: MigrationDeferredFinding[];
  manual_blocks: MigrationManualBlock[];
  evidence_paths: string[];
  post_audit_status: MigrationAuditResult['status'] | 'BLOCK';
  block_reasons: string[];
  notes: string[];
}

interface ResolvedPlan {
  audit: MigrationAuditResult;
  plannedActions: MigrationAction[];
  deferredFindings: MigrationDeferredFinding[];
  manualBlocks: MigrationManualBlock[];
  preconditions: MigrationPlanPreconditions | null;
  planHash: string | null;
  status: PlanStatus;
}

function registryFilePath(): string {
  return join(getAgenticOSHome(), '.agent-workspace', 'registry.yaml');
}

async function loadRawRegistryState(): Promise<RawRegistryState> {
  const path = registryFilePath();
  try {
    const content = await readFile(path, 'utf-8');
    const parsed = yaml.parse(content);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('registry yaml did not parse into an object');
    }
    const raw = parsed as RawRegistry;
    return {
      raw: {
        ...raw,
        projects: Array.isArray(raw.projects) ? raw.projects : [],
      },
      error: null,
      path,
    };
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return {
        raw: { active_project: null, projects: [] },
        error: null,
        path,
      };
    }
    return {
      raw: { active_project: null, projects: [] },
      error: error instanceof Error ? error.message : 'failed to read registry.yaml',
      path,
    };
  }
}

function resolveInputProjectPath(rawPath: string): string {
  return isAbsolute(rawPath)
    ? resolveFsPath(rawPath)
    : resolveFsPath(getAgenticOSHome(), rawPath);
}

function normalizeProjectSelector(rawSelector: string): string {
  if (isAbsolute(rawSelector) || rawSelector.includes('/') || rawSelector.includes('\\') || rawSelector.startsWith('.')) {
    return resolveInputProjectPath(rawSelector);
  }
  return rawSelector;
}

function findRawRegistryEntry(rawRegistry: RawRegistry, entry: Project): RawRegistryProject | null {
  const projects = Array.isArray(rawRegistry.projects) ? rawRegistry.projects : [];
  const matches = projects.filter((candidate) => {
    const candidateId = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const candidatePath = typeof candidate.path === 'string' ? resolvePath(candidate.path) : '';
    return candidateId === entry.id || candidatePath === entry.path;
  });
  return matches.length === 1 ? matches[0] : null;
}

async function resolveMigrationCandidate(args: any): Promise<{ candidate: MigrationCandidate | null; blockReasons: string[] }> {
  const registry = await loadRegistry();
  const rawRegistryState = await loadRawRegistryState();
  const requestedProject = typeof args?.project === 'string' && args.project.trim().length > 0
    ? args.project.trim()
    : null;
  const requestedProjectPath = typeof args?.project_path === 'string' && args.project_path.trim().length > 0
    ? resolveInputProjectPath(args.project_path.trim())
    : null;

  if (!requestedProject && !requestedProjectPath) {
    return {
      candidate: null,
      blockReasons: ['agenticos_migrate_project requires an explicit project or project_path.'],
    };
  }

  if (requestedProjectPath) {
    const matches = registry.projects.filter((candidate) => candidate.path === requestedProjectPath);
    if (matches.length > 1) {
      return {
        candidate: null,
        blockReasons: [`Project identity is ambiguous because registry path "${requestedProjectPath}" is duplicated.`],
      };
    }
    const registryEntry = matches[0] || null;
    return {
      candidate: {
        registry,
        rawRegistryState,
        registryEntry,
        rawRegistryEntry: registryEntry ? findRawRegistryEntry(rawRegistryState.raw, registryEntry) : null,
        projectPath: requestedProjectPath,
        resolutionSource: 'project_path',
      },
      blockReasons: [],
    };
  }

  const normalizedSelector = normalizeProjectSelector(requestedProject!);
  const matches = registry.projects.filter((candidate) =>
    candidate.id === requestedProject ||
    candidate.name === requestedProject ||
    candidate.path === normalizedSelector
  );
  if (matches.length === 0) {
    return {
      candidate: null,
      blockReasons: rawRegistryState.error
        ? ['Registry could not be read cleanly, so the explicit project selector could not be resolved.']
        : [`Project "${requestedProject}" not found in registry.`],
    };
  }
  if (matches.length > 1) {
    return {
      candidate: null,
      blockReasons: [`Project "${requestedProject}" is ambiguous in registry.`],
    };
  }
  const registryEntry = matches[0];
  return {
    candidate: {
      registry,
      rawRegistryState,
      registryEntry,
      rawRegistryEntry: findRawRegistryEntry(rawRegistryState.raw, registryEntry),
      projectPath: registryEntry.path,
      resolutionSource: 'project',
    },
    blockReasons: [],
  };
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function emptyCounts(): MigrationAuditResult['finding_counts'] {
  return {
    compatible_only: 0,
    safe_lazy_repair: 0,
    explicit_migration_required: 0,
  };
}

async function digestFileOrMarker(filePath: string): Promise<string> {
  try {
    return digest(await readFile(filePath, 'utf-8'));
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return digest(`MISSING:${filePath}`);
    }
    return digest(`ERROR:${filePath}:${error instanceof Error ? error.message : 'read-failed'}`);
  }
}

async function buildPreconditions(
  candidate: MigrationCandidate,
  audit: MigrationAuditResult,
  applyScope: ApplyScope,
): Promise<MigrationPlanPreconditions | null> {
  if (!audit.project) {
    return null;
  }

  const projectYamlPath = join(candidate.projectPath, '.project.yaml');
  let statePath: string | null = null;
  let stateDigest: string | null = null;

  try {
    const projectYaml = yaml.parse(await readFile(projectYamlPath, 'utf-8')) || {};
    const contextPaths = resolveManagedProjectContextPaths(candidate.projectPath, projectYaml);
    statePath = contextPaths.statePath;
    stateDigest = await digestFileOrMarker(statePath);
  } catch {
    statePath = null;
    stateDigest = null;
  }

  const registrySubset = {
    active_project: candidate.rawRegistryState.raw.active_project ?? null,
    target_entry: candidate.rawRegistryEntry || null,
  };

  return {
    registry_path: candidate.rawRegistryState.path,
    registry_subset_digest: digest(JSON.stringify(registrySubset)),
    project_yaml_path: projectYamlPath,
    project_yaml_digest: await digestFileOrMarker(projectYamlPath),
    state_path: statePath,
    state_digest: stateDigest,
    apply_scope: applyScope,
  };
}

function buildStateSurfacePath(projectPath: string): string {
  return join(projectPath, '.context', 'state.yaml');
}

function buildDefaultState(): any {
  return {
    session: {},
    current_task: {
      id: null,
      title: null,
      status: 'pending',
      next_step: null,
    },
    working_memory: {
      facts: [],
      decisions: [],
      pending: [],
    },
    memory_contract: {
      version: 1,
      quick_start_role: 'project_orientation',
      state_role: 'operational_working_state',
      conversations_role: 'append_only_session_history',
      knowledge_role: 'durable_synthesis',
      tasks_role: 'execution_artifacts',
      artifacts_role: 'deliverables',
    },
    loaded_context: ['.project.yaml'],
  };
}

async function readYamlFileOrDefault(filePath: string, fallback: any): Promise<any> {
  try {
    return yaml.parse(await readFile(filePath, 'utf-8')) || fallback;
  } catch {
    return fallback;
  }
}

async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, content, 'utf-8');
  await rename(tempPath, filePath);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withProjectMigrationLock<T>(projectPath: string, callback: () => Promise<T>): Promise<T> {
  const lockPath = join(projectPath, '.context', '.migration.lock');
  await mkdir(dirname(lockPath), { recursive: true });

  let locked = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await mkdir(lockPath);
      locked = true;
      break;
    } catch {
      await sleep(10);
    }
  }

  if (!locked) {
    throw new Error(`failed to acquire project migration lock at ${lockPath}`);
  }

  try {
    return await callback();
  } finally {
    await rm(lockPath, { recursive: true, force: true }).catch(() => undefined);
  }
}

function buildActions(audit: MigrationAuditResult, applyScope: ApplyScope): {
  plannedActions: MigrationAction[];
  deferredFindings: MigrationDeferredFinding[];
  manualBlocks: MigrationManualBlock[];
} {
  const plannedActions: MigrationAction[] = [];
  const deferredFindings: MigrationDeferredFinding[] = [];
  const manualBlocks: MigrationManualBlock[] = [];

  const pushAction = (action: MigrationAction): void => {
    if (plannedActions.some((candidate) => candidate.id === action.id)) {
      return;
    }
    plannedActions.push(action);
  };

  const projectPath = audit.project?.project_path || null;

  for (const finding of audit.findings) {
    switch (finding.code) {
      case 'legacy_active_project_present':
        pushAction({
          id: 'registry.clear_legacy_active_project',
          actionability: 'safe_repair',
          action_type: 'registry_patch',
          summary: 'Clear compatibility-only registry.active_project.',
          source_finding_codes: [finding.code],
          target_paths: [join(getAgenticOSHome(), '.agent-workspace', 'registry.yaml')],
        });
        break;
      case 'registry_path_stored_absolute_under_home':
        pushAction({
          id: 'registry.normalize_project_path',
          actionability: 'safe_repair',
          action_type: 'registry_patch',
          summary: 'Normalize the target registry path to a relative workspace path.',
          source_finding_codes: [finding.code],
          target_paths: [join(getAgenticOSHome(), '.agent-workspace', 'registry.yaml')],
        });
        break;
      case 'registry_last_accessed_missing':
        pushAction({
          id: 'registry.backfill_last_accessed',
          actionability: 'safe_repair',
          action_type: 'registry_patch',
          summary: 'Backfill lightweight registry metadata for last_accessed.',
          source_finding_codes: [finding.code],
          target_paths: [join(getAgenticOSHome(), '.agent-workspace', 'registry.yaml')],
        });
        break;
      case 'state_surface_missing':
        if (projectPath) {
          pushAction({
            id: 'state.rebuild_missing_surface',
            actionability: 'safe_repair',
            action_type: 'state_surface_repair',
            summary: 'Regenerate the missing project state surface using the current contract.',
            source_finding_codes: [finding.code],
            target_paths: [buildStateSurfacePath(projectPath)],
          });
        } else {
          manualBlocks.push({
            code: finding.code,
            actionability: 'manual_block',
            summary: finding.summary,
            evidence: finding.evidence,
            reason: 'State surface repair could not be planned because the target project path was not proven.',
          });
        }
        break;
      default:
        if (finding.migration_class === 'compatible_only') {
          deferredFindings.push({
            code: finding.code,
            actionability: 'defer_only',
            summary: finding.summary,
            reason: finding.recommended_action,
          });
        } else if (finding.migration_class === 'explicit_migration_required') {
          manualBlocks.push({
            code: finding.code,
            actionability: 'manual_block',
            summary: finding.summary,
            evidence: finding.evidence,
            reason: finding.recommended_action,
          });
        } else {
          manualBlocks.push({
            code: finding.code,
            actionability: 'manual_block',
            summary: finding.summary,
            evidence: finding.evidence,
            reason: 'This safe-lazy-repair finding does not yet have a deterministic apply action in the current phase-2 slice.',
          });
        }
        break;
    }
  }

  plannedActions.sort((left, right) => left.id.localeCompare(right.id));
  deferredFindings.sort((left, right) => left.code.localeCompare(right.code));
  manualBlocks.sort((left, right) => left.code.localeCompare(right.code));

  if (applyScope === 'safe_repairs_only') {
    return {
      plannedActions: plannedActions.filter((action) => action.actionability === 'safe_repair'),
      deferredFindings,
      manualBlocks,
    };
  }

  return {
    plannedActions,
    deferredFindings,
    manualBlocks,
  };
}

function buildPlanHash(
  audit: MigrationAuditResult,
  applyScope: ApplyScope,
  plannedActions: MigrationAction[],
  deferredFindings: MigrationDeferredFinding[],
  manualBlocks: MigrationManualBlock[],
  preconditions: MigrationPlanPreconditions | null,
): string | null {
  if (!audit.project || !preconditions) {
    return null;
  }

  return digest(JSON.stringify({
    project_id: audit.project.project_id,
    project_path: audit.project.project_path,
    apply_scope: applyScope,
    planned_actions: plannedActions.map((action) => ({
      id: action.id,
      actionability: action.actionability,
      action_type: action.action_type,
      source_finding_codes: action.source_finding_codes,
      target_paths: action.target_paths,
    })),
    deferred_findings: deferredFindings.map((finding) => finding.code),
    manual_blocks: manualBlocks.map((block) => block.code),
    preconditions,
  }));
}

async function resolvePlan(candidate: MigrationCandidate, applyScope: ApplyScope): Promise<ResolvedPlan> {
  const audit = await runMigrationAuditCheck({ project_path: candidate.projectPath });
  const { plannedActions, deferredFindings, manualBlocks } = buildActions(audit, applyScope);
  const preconditions = await buildPreconditions(candidate, audit, applyScope);
  const planHash = buildPlanHash(audit, applyScope, plannedActions, deferredFindings, manualBlocks, preconditions);

  const status: PlanStatus = manualBlocks.length > 0
    ? 'BLOCK'
    : plannedActions.length > 0
      ? 'READY'
      : 'NOOP';

  return {
    audit,
    plannedActions,
    deferredFindings,
    manualBlocks,
    preconditions,
    planHash,
    status,
  };
}

function buildPlanModeResult(resolved: ResolvedPlan, applyScope: ApplyScope): MigrationProjectPlanResult {
  const { audit, plannedActions, deferredFindings, manualBlocks, preconditions, planHash, status } = resolved;

  return {
    command: 'agenticos_migrate_project',
    mode: 'plan',
    status,
    apply_scope: applyScope,
    apply_supported: true,
    project: audit.project,
    audit_status: audit.status,
    audit_finding_counts: audit.finding_counts,
    safe_to_continue_without_migration: audit.safe_to_continue_without_migration,
    plan_hash: planHash,
    apply_ready: status === 'READY',
    planned_actions: plannedActions,
    deferred_findings: deferredFindings,
    manual_blocks: manualBlocks,
    preconditions,
    block_reasons: status === 'BLOCK'
      ? [
          ...audit.block_reasons,
          ...manualBlocks.map((block) => `${block.code}: ${block.reason}`),
        ]
      : [],
    notes: [
      ...audit.notes,
      ...(status === 'READY' ? ['No writes occurred. This phase-2 slice only produces a deterministic migration plan.'] : []),
      ...(status === 'NOOP' ? ['No writes occurred. The current project has no deterministic migration actions in this phase-2 slice.'] : []),
    ],
  };
}

async function applyResolvedPlan(
  candidate: MigrationCandidate,
  resolved: ResolvedPlan,
  applyScope: ApplyScope,
): Promise<MigrationProjectApplyResult> {
  if (!resolved.audit.project || !candidate.registryEntry) {
    return {
      command: 'agenticos_migrate_project',
      mode: 'apply',
      status: 'BLOCK',
      apply_scope: applyScope,
      apply_supported: true,
      project: resolved.audit.project,
      applied_plan_hash: resolved.planHash,
      applied_actions: [],
      deferred_findings: resolved.deferredFindings,
      manual_blocks: resolved.manualBlocks,
      evidence_paths: [],
      post_audit_status: 'BLOCK',
      block_reasons: ['The target project identity is not proven enough for apply mode.'],
      notes: [],
    };
  }

  const projectYaml = yaml.parse(await readFile(join(candidate.projectPath, '.project.yaml'), 'utf-8')) || {};
  const contextPaths = resolveManagedProjectContextPaths(candidate.projectPath, projectYaml);
  const statePath = contextPaths.statePath;
  const artifactsDir = contextPaths.artifactsDir;
  const appliedAt = new Date().toISOString();
  const reportFileName = `migration-${appliedAt.replace(/[:.]/g, '-')}.yaml`;
  const reportPath = join(artifactsDir, 'migrations', reportFileName);
  const reportDisplayPath = reportPath.startsWith(`${candidate.projectPath}/`)
    ? reportPath.substring(candidate.projectPath.length + 1)
    : reportPath;

  const appliedActions: MigrationAction[] = [];

  const hasAction = (id: string): boolean =>
    resolved.plannedActions.some((action) => action.id === id);

  if (hasAction('state.rebuild_missing_surface')) {
    const existingState = await readYamlFileOrDefault(statePath, null);
    const nextState = existingState && typeof existingState === 'object'
      ? existingState
      : buildDefaultState();
    await writeFileAtomic(statePath, yaml.stringify(nextState));
    appliedActions.push(resolved.plannedActions.find((action) => action.id === 'state.rebuild_missing_surface')!);
  }

  const needsRegistryPatch =
    hasAction('registry.clear_legacy_active_project') ||
    hasAction('registry.normalize_project_path') ||
    hasAction('registry.backfill_last_accessed');

  if (needsRegistryPatch) {
    await patchRegistry(async (registry) => {
      const projectIndex = registry.projects.findIndex((project) => project.id === candidate.registryEntry!.id);
      if (projectIndex < 0) {
        throw new Error(`Project "${candidate.registryEntry!.id}" not found in registry during apply.`);
      }

      if (hasAction('registry.clear_legacy_active_project')) {
        registry.active_project = null;
      }

      if (hasAction('registry.normalize_project_path')) {
        registry.projects[projectIndex] = {
          ...registry.projects[projectIndex],
          path: candidate.projectPath,
        };
      }

      if (hasAction('registry.backfill_last_accessed')) {
        registry.projects[projectIndex] = {
          ...registry.projects[projectIndex],
          last_accessed: appliedAt,
        };
      }
    });

    for (const actionId of [
      'registry.backfill_last_accessed',
      'registry.clear_legacy_active_project',
      'registry.normalize_project_path',
    ]) {
      const action = resolved.plannedActions.find((candidateAction) => candidateAction.id === actionId);
      if (action) {
        appliedActions.push(action);
      }
    }
  }

  const state = await readYamlFileOrDefault(statePath, buildDefaultState());
  if (!state.migrations || typeof state.migrations !== 'object') {
    state.migrations = {};
  }
  const existingReports = Array.isArray(state.migrations.reports) ? state.migrations.reports : [];
  state.migrations.latest = {
    applied_at: appliedAt,
    plan_hash: resolved.planHash,
    apply_scope: applyScope,
    report_path: reportDisplayPath,
    applied_action_ids: appliedActions.map((action) => action.id),
  };
  state.migrations.reports = [
    ...existingReports,
    {
      applied_at: appliedAt,
      plan_hash: resolved.planHash,
      report_path: reportDisplayPath,
    },
  ];
  await writeFileAtomic(statePath, yaml.stringify(state));

  const report = {
    command: 'agenticos_migrate_project',
    applied_at: appliedAt,
    project: resolved.audit.project,
    apply_scope: applyScope,
    plan_hash: resolved.planHash,
    applied_actions: appliedActions.map((action) => ({
      id: action.id,
      actionability: action.actionability,
      action_type: action.action_type,
      summary: action.summary,
      target_paths: action.target_paths,
    })),
    deferred_findings: resolved.deferredFindings,
    manual_blocks: resolved.manualBlocks,
  };
  await writeFileAtomic(reportPath, yaml.stringify(report));

  const postAudit = await runMigrationAuditCheck({ project_path: candidate.projectPath });

  return {
    command: 'agenticos_migrate_project',
    mode: 'apply',
    status: 'APPLIED',
    apply_scope: applyScope,
    apply_supported: true,
    project: postAudit.project,
    applied_plan_hash: resolved.planHash,
    applied_actions: appliedActions,
    deferred_findings: postAudit.findings
      .filter((finding) => finding.migration_class === 'compatible_only')
      .map((finding) => ({
        code: finding.code,
        actionability: 'defer_only' as const,
        summary: finding.summary,
        reason: finding.recommended_action,
      })),
    manual_blocks: [],
    evidence_paths: [statePath, reportPath],
    post_audit_status: postAudit.status,
    block_reasons: [],
    notes: [
      ...postAudit.notes,
      'Apply mode executed deterministic per-project migration actions only.',
    ],
  };
}

export async function runMigrationProjectPlan(args: any): Promise<MigrationProjectPlanResult | MigrationProjectApplyResult> {
  const mode = args?.mode === 'apply' ? 'apply' : 'plan';
  const applyScope: ApplyScope = args?.apply_scope === 'safe_repairs_only' ? 'safe_repairs_only' : 'full';

  const resolved = await resolveMigrationCandidate(args ?? {});
  if (!resolved.candidate) {
    const planResult: MigrationProjectPlanResult = {
      command: 'agenticos_migrate_project',
      mode: 'plan',
      status: 'BLOCK',
      apply_scope: applyScope,
      apply_supported: true,
      project: null,
      audit_status: 'BLOCK',
      audit_finding_counts: emptyCounts(),
      safe_to_continue_without_migration: false,
      plan_hash: null,
      apply_ready: false,
      planned_actions: [],
      deferred_findings: [],
      manual_blocks: [],
      preconditions: null,
      block_reasons: resolved.blockReasons,
      notes: ['No writes occurred. Plan mode requires an explicit project selector in the current phase-2 slice.'],
    };
    if (mode === 'apply') {
      return {
        command: 'agenticos_migrate_project',
        mode: 'apply',
        status: 'BLOCK',
        apply_scope: applyScope,
        apply_supported: true,
        project: null,
        applied_plan_hash: null,
        applied_actions: [],
        deferred_findings: [],
        manual_blocks: [],
        evidence_paths: [],
        post_audit_status: 'BLOCK',
        block_reasons: resolved.blockReasons,
        notes: ['No writes occurred. Apply mode requires an explicit project selector in the current phase-2 slice.'],
      };
    }
    return planResult;
  }

  const resolvedPlan = await resolvePlan(resolved.candidate, applyScope);

  if (mode === 'plan') {
    return buildPlanModeResult(resolvedPlan, applyScope);
  }

  const expectedPlanHash = typeof args?.expected_plan_hash === 'string' && args.expected_plan_hash.trim().length > 0
    ? args.expected_plan_hash.trim()
    : null;

  if (!expectedPlanHash) {
    return {
      command: 'agenticos_migrate_project',
      mode: 'apply',
      status: 'BLOCK',
      apply_scope: applyScope,
      apply_supported: true,
      project: resolvedPlan.audit.project,
      applied_plan_hash: resolvedPlan.planHash,
      applied_actions: [],
      deferred_findings: resolvedPlan.deferredFindings,
      manual_blocks: resolvedPlan.manualBlocks,
      evidence_paths: [],
      post_audit_status: 'BLOCK',
      block_reasons: ['expected_plan_hash is required for apply mode.'],
      notes: [],
    };
  }

  if (resolvedPlan.planHash && resolvedPlan.planHash !== expectedPlanHash) {
    return {
      command: 'agenticos_migrate_project',
      mode: 'apply',
      status: 'BLOCK',
      apply_scope: applyScope,
      apply_supported: true,
      project: resolvedPlan.audit.project,
      applied_plan_hash: resolvedPlan.planHash,
      applied_actions: [],
      deferred_findings: resolvedPlan.deferredFindings,
      manual_blocks: resolvedPlan.manualBlocks,
      evidence_paths: [],
      post_audit_status: 'BLOCK',
      block_reasons: ['The reviewed plan hash no longer matches the current deterministic migration plan. Rerun mode=plan and review the new plan before applying.'],
      notes: [],
    };
  }

  if (resolvedPlan.status !== 'READY' || !resolvedPlan.planHash) {
    return {
      command: 'agenticos_migrate_project',
      mode: 'apply',
      status: 'BLOCK',
      apply_scope: applyScope,
      apply_supported: true,
      project: resolvedPlan.audit.project,
      applied_plan_hash: resolvedPlan.planHash,
      applied_actions: [],
      deferred_findings: resolvedPlan.deferredFindings,
      manual_blocks: resolvedPlan.manualBlocks,
      evidence_paths: [],
      post_audit_status: 'BLOCK',
      block_reasons: [
        ...resolvedPlan.audit.block_reasons,
        ...resolvedPlan.manualBlocks.map((block) => `${block.code}: ${block.reason}`),
      ],
      notes: ['Apply mode is only available when plan mode returns READY.'],
    };
  }

  try {
    return await withProjectMigrationLock(resolved.candidate.projectPath, async () =>
      await applyResolvedPlan(resolved.candidate!, resolvedPlan, applyScope)
    );
  } catch (error: any) {
    return {
      command: 'agenticos_migrate_project',
      mode: 'apply',
      status: 'BLOCK',
      apply_scope: applyScope,
      apply_supported: true,
      project: resolvedPlan.audit.project,
      applied_plan_hash: resolvedPlan.planHash,
      applied_actions: [],
      deferred_findings: resolvedPlan.deferredFindings,
      manual_blocks: resolvedPlan.manualBlocks,
      evidence_paths: [],
      post_audit_status: 'BLOCK',
      block_reasons: [error instanceof Error ? error.message : 'migration apply failed'],
      notes: [],
    };
  }
}
