import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { basename, isAbsolute, join, resolve as resolveFsPath } from 'path';
import yaml from 'yaml';
import { resolveManagedProjectContextPaths } from './agent-context-paths.js';
import { getAgenticOSHome, loadRegistry, resolvePath, type Project, type Registry } from './registry.js';
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
  apply_supported: false;
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

export interface MigrationProjectApplyStubResult {
  command: 'agenticos_migrate_project';
  mode: 'apply';
  status: 'BLOCK';
  apply_scope: ApplyScope;
  apply_supported: false;
  block_reasons: string[];
  notes: string[];
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

export async function runMigrationProjectPlan(args: any): Promise<MigrationProjectPlanResult | MigrationProjectApplyStubResult> {
  const mode = args?.mode === 'apply' ? 'apply' : 'plan';
  const applyScope: ApplyScope = args?.apply_scope === 'safe_repairs_only' ? 'safe_repairs_only' : 'full';

  if (mode === 'apply') {
    return {
      command: 'agenticos_migrate_project',
      mode: 'apply',
      status: 'BLOCK',
      apply_scope: applyScope,
      apply_supported: false,
      block_reasons: ['apply mode is not implemented yet; use mode=plan to review the deterministic migration plan in the current #263 slice.'],
      notes: [],
    };
  }

  const resolved = await resolveMigrationCandidate(args ?? {});
  if (!resolved.candidate) {
    return {
      command: 'agenticos_migrate_project',
      mode: 'plan',
      status: 'BLOCK',
      apply_scope: applyScope,
      apply_supported: false,
      project: null,
      audit_status: 'BLOCK',
      audit_finding_counts: {
        compatible_only: 0,
        safe_lazy_repair: 0,
        explicit_migration_required: 0,
      },
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
  }

  const audit = await runMigrationAuditCheck({ project_path: resolved.candidate.projectPath });
  const { plannedActions, deferredFindings, manualBlocks } = buildActions(audit, applyScope);
  const preconditions = await buildPreconditions(resolved.candidate, audit, applyScope);
  const planHash = buildPlanHash(audit, applyScope, plannedActions, deferredFindings, manualBlocks, preconditions);

  const status: PlanStatus = manualBlocks.length > 0
    ? 'BLOCK'
    : plannedActions.length > 0
      ? 'READY'
      : 'NOOP';

  return {
    command: 'agenticos_migrate_project',
    mode: 'plan',
    status,
    apply_scope: applyScope,
    apply_supported: false,
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
