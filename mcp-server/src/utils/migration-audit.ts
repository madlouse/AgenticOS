import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { basename, isAbsolute, join, resolve as resolveFsPath } from 'path';
import yaml from 'yaml';
import { resolveManagedProjectContextPaths } from './agent-context-paths.js';
import { getSessionProjectBinding } from './session-context.js';
import { getAgenticOSHome, loadRegistry, resolvePath, type Project, type Registry } from './registry.js';
import {
  buildArchivedReferenceMessage,
  isArchivedReferenceProject,
  validateContextPublicationPolicy,
  validateManagedProjectTopology,
} from './project-contract.js';

type MigrationFindingClass = 'compatible_only' | 'safe_lazy_repair' | 'explicit_migration_required';
type MigrationFindingSeverity = 'info' | 'warning' | 'error';
type AuditStatus = 'PASS' | 'WARN' | 'BLOCK';

interface MigrationFinding {
  code: string;
  migration_class: MigrationFindingClass;
  severity: MigrationFindingSeverity;
  summary: string;
  evidence: string[];
  recommended_action: string;
  safe_to_defer: boolean;
}

interface AuditProjectSummary {
  project_id: string | null;
  project_name: string | null;
  project_path: string;
  registry_entry_found: boolean;
  registry_status: Project['status'] | null;
  resolution_source: 'project' | 'project_path' | 'session';
  project_yaml_present: boolean;
  identity_proven: boolean;
}

interface AuditCounts {
  compatible_only: number;
  safe_lazy_repair: number;
  explicit_migration_required: number;
}

export interface MigrationAuditResult {
  command: 'agenticos_migration_audit';
  status: AuditStatus;
  project: AuditProjectSummary | null;
  findings: MigrationFinding[];
  finding_counts: AuditCounts;
  safe_to_continue_without_migration: boolean;
  recommended_next_action: string;
  block_reasons: string[];
  notes: string[];
}

interface HomeProjectSummary {
  project_id: string | null;
  project_name: string | null;
  project_path: string;
  status: AuditStatus;
  finding_counts: AuditCounts;
  safe_to_continue_without_migration: boolean;
  recommended_next_action: string;
}

export interface MigrateHomeResult {
  command: 'agenticos_migrate_home';
  status: AuditStatus;
  report_only: true;
  total_projects: number;
  safe_to_defer_projects: number;
  blocked_projects: number;
  findings_summary: AuditCounts;
  projects: HomeProjectSummary[];
  block_reasons: string[];
  notes: string[];
}

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

interface AuditContext {
  registry: Registry;
  rawRegistryState: RawRegistryState;
  registryEntry: Project | null;
  rawRegistryEntry: RawRegistryProject | null;
  projectPath: string;
  resolutionSource: 'project' | 'project_path' | 'session';
}

interface BuildProjectAuditOptions {
  includeHomeScopedRegistryFindings?: boolean;
}

interface RegistryDuplicateSummary {
  duplicateIds: string[];
  duplicatePaths: string[];
  duplicateNames: string[];
}

function emptyCounts(): AuditCounts {
  return {
    compatible_only: 0,
    safe_lazy_repair: 0,
    explicit_migration_required: 0,
  };
}

function buildRecommendedNextAction(status: AuditStatus): string {
  if (status === 'BLOCK') {
    return 'Run explicit per-project migration or normalization after reviewing the blocking findings.';
  }
  if (status === 'WARN') {
    return 'Safe to continue operating, but schedule metadata normalization or explicit migration based on the findings.';
  }
  return 'No migration action is currently required.';
}

function computeCounts(findings: MigrationFinding[]): AuditCounts {
  const counts = emptyCounts();
  for (const finding of findings) {
    counts[finding.migration_class] += 1;
  }
  return counts;
}

function computeStatus(findings: MigrationFinding[]): AuditStatus {
  if (findings.some((finding) => finding.migration_class === 'explicit_migration_required')) {
    return 'BLOCK';
  }
  if (findings.length > 0) {
    return 'WARN';
  }
  return 'PASS';
}

function pushFinding(findings: MigrationFinding[], finding: MigrationFinding): void {
  if (findings.some((existing) => existing.code === finding.code)) {
    return;
  }
  findings.push(finding);
}

function computeRegistryDuplicates(registry: Registry, entry: Project): RegistryDuplicateSummary {
  return {
    duplicateIds: registry.projects
      .filter((candidate) => candidate.id === entry.id)
      .map((candidate) => candidate.id),
    duplicatePaths: registry.projects
      .filter((candidate) => candidate.path === entry.path)
      .map((candidate) => candidate.path),
    duplicateNames: registry.projects
      .filter((candidate) => candidate.name === entry.name)
      .map((candidate) => candidate.name),
  };
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
  if (matches.length === 1) {
    return matches[0];
  }
  return null;
}

function resolveProjectMatches(registry: Registry, selector: string): Project[] {
  const normalizedSelector = normalizeProjectSelector(selector);
  return registry.projects.filter((candidate) =>
    candidate.id === selector ||
    candidate.name === selector ||
    candidate.path === normalizedSelector
  );
}

async function resolveAuditContext(args: any): Promise<{ context: AuditContext | null; blockReasons: string[] }> {
  const registry = await loadRegistry();
  const rawRegistryState = await loadRawRegistryState();
  const requestedProject = typeof args?.project === 'string' && args.project.trim().length > 0
    ? args.project.trim()
    : null;
  const requestedProjectPath = typeof args?.project_path === 'string' && args.project_path.trim().length > 0
    ? resolveInputProjectPath(args.project_path.trim())
    : null;
  const sessionProject = getSessionProjectBinding();

  if (requestedProjectPath) {
    const matches = registry.projects.filter((candidate) => candidate.path === requestedProjectPath);
    if (matches.length > 1) {
      return {
        context: null,
        blockReasons: [`Project identity is ambiguous because registry path "${requestedProjectPath}" is duplicated.`],
      };
    }
    const registryEntry = matches[0] || null;
    return {
      context: {
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

  if (requestedProject) {
    const matches = resolveProjectMatches(registry, requestedProject);
    if (matches.length === 0) {
      return {
        context: null,
        blockReasons: [`Project "${requestedProject}" not found in registry.`],
      };
    }
    if (matches.length > 1) {
      return {
        context: null,
        blockReasons: [`Project "${requestedProject}" is ambiguous in registry.`],
      };
    }
    const registryEntry = matches[0];
    return {
      context: {
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

  if (sessionProject) {
    const matches = registry.projects.filter((candidate) =>
      candidate.id === sessionProject.projectId || candidate.path === sessionProject.projectPath
    );
    if (matches.length === 0) {
      return {
        context: null,
        blockReasons: [`Session project "${sessionProject.projectId}" not found in registry.`],
      };
    }
    if (matches.length > 1) {
      return {
        context: null,
        blockReasons: [`Session project "${sessionProject.projectId}" is ambiguous in registry.`],
      };
    }
    const registryEntry = matches[0];
    return {
      context: {
        registry,
        rawRegistryState,
        registryEntry,
        rawRegistryEntry: findRawRegistryEntry(rawRegistryState.raw, registryEntry),
        projectPath: registryEntry.path,
        resolutionSource: 'session',
      },
      blockReasons: [],
    };
  }

  return {
    context: null,
    blockReasons: ['No project_path, project, or session project is available for agenticos_migration_audit.'],
  };
}

async function readYamlFile(filePath: string): Promise<{ exists: boolean; data: any | null; error: string | null }> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return {
      exists: true,
      data: yaml.parse(content) || {},
      error: null,
    };
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return { exists: false, data: null, error: null };
    }
    return {
      exists: false,
      data: null,
      error: error instanceof Error ? error.message : 'failed to read yaml file',
    };
  }
}

function collectLegacyActiveProjectPaths(value: unknown, currentPath = ''): string[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const matches: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      matches.push(...collectLegacyActiveProjectPaths(item, `${currentPath}[${index}]`));
    });
    return matches;
  }

  for (const [key, nested] of Object.entries(value)) {
    const nextPath = currentPath ? `${currentPath}.${key}` : key;
    if (key === 'active_project') {
      matches.push(nextPath);
    }
    matches.push(...collectLegacyActiveProjectPaths(nested, nextPath));
  }

  return matches;
}

async function buildProjectAudit(
  context: AuditContext,
  options: BuildProjectAuditOptions = {},
): Promise<MigrationAuditResult> {
  const findings: MigrationFinding[] = [];
  const blockReasons: string[] = [];
  const notes: string[] = [];
  const rawRegistry = context.rawRegistryState.raw;
  let identityProven = !!context.registryEntry;

  if (context.rawRegistryState.error) {
    pushFinding(findings, {
      code: 'registry_read_error',
      migration_class: 'explicit_migration_required',
      severity: 'error',
      summary: 'The registry could not be read cleanly, so migration inventory is incomplete.',
      evidence: [context.rawRegistryState.path, context.rawRegistryState.error],
      recommended_action: 'Repair or restore registry.yaml before relying on migration audit output.',
      safe_to_defer: false,
    });
    blockReasons.push('Registry could not be read cleanly.');
  }

  if (
    options.includeHomeScopedRegistryFindings !== false &&
    typeof rawRegistry.active_project === 'string' &&
    rawRegistry.active_project.trim().length > 0
  ) {
    pushFinding(findings, {
      code: 'legacy_active_project_present',
      migration_class: 'safe_lazy_repair',
      severity: 'warning',
      summary: 'The legacy registry current-project field is still populated.',
      evidence: [context.rawRegistryState.path, `active_project=${rawRegistry.active_project.trim()}`],
      recommended_action: 'Clear or downgrade the legacy current-project field during explicit migration or safe lazy repair.',
      safe_to_defer: true,
    });
  }

  if (!context.registryEntry) {
    identityProven = false;
    pushFinding(findings, {
      code: 'registry_entry_missing',
      migration_class: 'explicit_migration_required',
      severity: 'error',
      summary: 'The target project path is not registered in the current AgenticOS home.',
      evidence: [context.projectPath],
      recommended_action: 'Re-register the project explicitly before relying on managed-project migration tooling.',
      safe_to_defer: false,
    });
    blockReasons.push('Target project is not registered.');
  } else {
    const duplicates = computeRegistryDuplicates(context.registry, context.registryEntry);

    if (duplicates.duplicateIds.length > 1) {
      identityProven = false;
      pushFinding(findings, {
        code: 'registry_project_id_duplicated',
        migration_class: 'explicit_migration_required',
        severity: 'error',
        summary: 'The registry contains duplicate project ids for this managed project.',
        evidence: [context.rawRegistryState.path, `project.id=${context.registryEntry.id}`],
        recommended_action: 'Deduplicate registry project ids before relying on migration or runtime project targeting.',
        safe_to_defer: false,
      });
      blockReasons.push('Registry project id is duplicated.');
    }

    if (duplicates.duplicatePaths.length > 1) {
      identityProven = false;
      pushFinding(findings, {
        code: 'registry_project_path_duplicated',
        migration_class: 'explicit_migration_required',
        severity: 'error',
        summary: 'The registry contains duplicate project paths for this managed project.',
        evidence: [context.rawRegistryState.path, context.registryEntry.path],
        recommended_action: 'Deduplicate registry project paths before relying on migration or runtime project targeting.',
        safe_to_defer: false,
      });
      blockReasons.push('Registry project path is duplicated.');
    }

    if (duplicates.duplicateNames.length > 1) {
      identityProven = false;
      pushFinding(findings, {
        code: 'registry_project_name_duplicated',
        migration_class: 'explicit_migration_required',
        severity: 'error',
        summary: 'The registry contains duplicate project names for this managed project.',
        evidence: [context.rawRegistryState.path, `project.name=${context.registryEntry.name}`],
        recommended_action: 'Deduplicate registry project names before relying on name-based migration or runtime project targeting.',
        safe_to_defer: false,
      });
      blockReasons.push('Registry project name is duplicated.');
    }
  }

  const projectYamlPath = join(context.projectPath, '.project.yaml');
  const projectYamlResult = await readYamlFile(projectYamlPath);
  const projectYaml = projectYamlResult.data || {};
  const projectName =
    context.registryEntry?.name ||
    projectYaml?.meta?.name ||
    basename(context.projectPath);
  const projectId =
    context.registryEntry?.id ||
    projectYaml?.meta?.id ||
    null;

  if (!projectYamlResult.exists) {
    identityProven = false;
    pushFinding(findings, {
      code: 'project_yaml_missing',
      migration_class: 'explicit_migration_required',
      severity: 'error',
      summary: 'The project is missing .project.yaml, so managed-project identity cannot be proven.',
      evidence: [projectYamlPath],
      recommended_action: 'Restore or recreate .project.yaml before running explicit migration.',
      safe_to_defer: false,
    });
    blockReasons.push('.project.yaml is missing.');
  } else if (projectYamlResult.error) {
    identityProven = false;
    pushFinding(findings, {
      code: 'project_yaml_unreadable',
      migration_class: 'explicit_migration_required',
      severity: 'error',
      summary: 'The project .project.yaml could not be read cleanly.',
      evidence: [projectYamlPath, projectYamlResult.error],
      recommended_action: 'Repair .project.yaml before running explicit migration.',
      safe_to_defer: false,
    });
    blockReasons.push('.project.yaml could not be read.');
  } else {
    const metaId = typeof projectYaml?.meta?.id === 'string' ? projectYaml.meta.id.trim() : '';
    const metaName = typeof projectYaml?.meta?.name === 'string' ? projectYaml.meta.name.trim() : '';
    const archivedReference = isArchivedReferenceProject(projectYaml, context.registryEntry?.status);

    if (!metaId) {
      identityProven = false;
      pushFinding(findings, {
        code: 'project_meta_id_missing',
        migration_class: 'explicit_migration_required',
        severity: 'error',
        summary: 'The project .project.yaml is missing meta.id.',
        evidence: [projectYamlPath],
        recommended_action: 'Write a stable meta.id before running explicit migration.',
        safe_to_defer: false,
      });
      blockReasons.push('.project.yaml is missing meta.id.');
    }

    if (context.registryEntry && metaId && metaId !== context.registryEntry.id) {
      identityProven = false;
      pushFinding(findings, {
        code: 'project_id_mismatch',
        migration_class: 'explicit_migration_required',
        severity: 'error',
        summary: 'The registry project id and .project.yaml meta.id disagree.',
        evidence: [
          `registry.id=${context.registryEntry.id}`,
          `project.meta.id=${metaId}`,
          projectYamlPath,
        ],
        recommended_action: 'Repair project identity before applying migration.',
        safe_to_defer: false,
      });
      blockReasons.push('Registry/project identity mismatch.');
    }

    if (context.registryEntry && metaName && metaName !== context.registryEntry.name) {
      identityProven = false;
      pushFinding(findings, {
        code: 'project_name_mismatch',
        migration_class: 'explicit_migration_required',
        severity: 'error',
        summary: 'The registry project name and .project.yaml meta.name disagree.',
        evidence: [
          `registry.name=${context.registryEntry.name}`,
          `project.meta.name=${metaName}`,
          projectYamlPath,
        ],
        recommended_action: 'Repair project identity before applying migration.',
        safe_to_defer: false,
      });
      blockReasons.push('Registry/project name mismatch.');
    }

    if (archivedReference) {
      pushFinding(findings, {
        code: 'archived_reference_project',
        migration_class: 'compatible_only',
        severity: 'info',
        summary: buildArchivedReferenceMessage(projectName, projectYaml?.archive_contract?.replacement_project),
        evidence: [projectYamlPath],
        recommended_action: 'Migration can usually be deferred for archived reference projects unless their metadata must be normalized for reporting.',
        safe_to_defer: true,
      });
      notes.push('Archived reference projects are inventory-only in migration audit; active managed-project topology and state checks were skipped.');
    } else {
      const topologyValidation = validateManagedProjectTopology(projectName, projectYaml);
      if (!topologyValidation.ok) {
        pushFinding(findings, {
          code: 'topology_contract_invalid',
          migration_class: 'explicit_migration_required',
          severity: 'error',
          summary: topologyValidation.message,
          evidence: [projectYamlPath],
          recommended_action: 'Normalize the project topology before relying on managed-project migration behavior.',
          safe_to_defer: false,
        });
        blockReasons.push('Project topology contract is not normalized.');
      } else {
        const publicationValidation = validateContextPublicationPolicy(projectName, projectYaml);
        if (!publicationValidation.ok) {
          pushFinding(findings, {
            code: 'context_publication_policy_invalid',
            migration_class: 'explicit_migration_required',
            severity: 'error',
            summary: publicationValidation.message,
            evidence: [projectYamlPath],
            recommended_action: 'Normalize source_control.context_publication_policy before applying migration.',
            safe_to_defer: false,
          });
          blockReasons.push('Context publication policy is not normalized.');
        }
      }

      const contextPaths = resolveManagedProjectContextPaths(context.projectPath, projectYaml);
      if (!existsSync(contextPaths.statePath)) {
        pushFinding(findings, {
          code: 'state_surface_missing',
          migration_class: 'safe_lazy_repair',
          severity: 'warning',
          summary: 'The project state surface is missing.',
          evidence: [contextPaths.statePath],
          recommended_action: 'Regenerate or normalize state.yaml during explicit migration or entry-surface repair.',
          safe_to_defer: true,
        });
      } else {
        const stateYamlResult = await readYamlFile(contextPaths.statePath);
        if (stateYamlResult.error) {
          pushFinding(findings, {
            code: 'state_surface_unreadable',
            migration_class: 'explicit_migration_required',
            severity: 'error',
            summary: 'The project state surface exists but could not be read cleanly.',
            evidence: [contextPaths.statePath, stateYamlResult.error],
            recommended_action: 'Repair the state surface before applying migration.',
            safe_to_defer: false,
          });
          blockReasons.push('state.yaml could not be read.');
        } else {
          const activeProjectPaths = collectLegacyActiveProjectPaths(stateYamlResult.data);
          if (activeProjectPaths.length > 0) {
            pushFinding(findings, {
              code: 'legacy_active_project_evidence_present',
              migration_class: 'compatible_only',
              severity: 'info',
              summary: 'The project state still contains legacy active_project evidence fields.',
              evidence: activeProjectPaths.slice(0, 5).map((item) => `${contextPaths.statePath}:${item}`),
              recommended_action: 'This is compatibility-only historical evidence; rewrite only if explicit migration chooses to normalize old evidence shapes.',
              safe_to_defer: true,
            });
          }
        }
      }
    }
  }

  if (context.rawRegistryEntry) {
    const rawPath = typeof context.rawRegistryEntry.path === 'string' ? context.rawRegistryEntry.path : '';
    if (rawPath && isAbsolute(rawPath) && rawPath.startsWith(getAgenticOSHome())) {
      pushFinding(findings, {
        code: 'registry_path_stored_absolute_under_home',
        migration_class: 'safe_lazy_repair',
        severity: 'warning',
        summary: 'The registry stores this project path as an absolute path under AGENTICOS_HOME.',
        evidence: [context.rawRegistryState.path, rawPath],
        recommended_action: 'Normalize the registry path to a relative workspace path during explicit migration or safe lazy repair.',
        safe_to_defer: true,
      });
    }

    if (typeof context.rawRegistryEntry.last_accessed !== 'string' || context.rawRegistryEntry.last_accessed.trim().length === 0) {
      pushFinding(findings, {
        code: 'registry_last_accessed_missing',
        migration_class: 'safe_lazy_repair',
        severity: 'info',
        summary: 'The registry project entry is missing last_accessed metadata.',
        evidence: [context.rawRegistryState.path, `project.id=${context.registryEntry?.id || projectId || 'unknown'}`],
        recommended_action: 'Backfill lightweight metadata during safe lazy repair or explicit migration.',
        safe_to_defer: true,
      });
    }
  }

  const status = computeStatus(findings);
  const counts = computeCounts(findings);
  const safeToContinue = status !== 'BLOCK';
  if (safeToContinue && findings.length > 0) {
    notes.push('Report-only audit found legacy state, but current runtime compatibility should remain usable.');
  }

  return {
    command: 'agenticos_migration_audit',
    status,
    project: {
      project_id: projectId,
      project_name: projectName,
      project_path: context.projectPath,
      registry_entry_found: !!context.registryEntry,
      registry_status: context.registryEntry?.status || null,
      resolution_source: context.resolutionSource,
      project_yaml_present: projectYamlResult.exists,
      identity_proven: identityProven,
    },
    findings,
    finding_counts: counts,
    safe_to_continue_without_migration: safeToContinue,
    recommended_next_action: buildRecommendedNextAction(status),
    block_reasons: blockReasons,
    notes,
  };
}

export async function runMigrationAuditCheck(args: any): Promise<MigrationAuditResult> {
  const resolved = await resolveAuditContext(args ?? {});
  if (!resolved.context) {
    return {
      command: 'agenticos_migration_audit',
      status: 'BLOCK',
      project: null,
      findings: [],
      finding_counts: emptyCounts(),
      safe_to_continue_without_migration: false,
      recommended_next_action: buildRecommendedNextAction('BLOCK'),
      block_reasons: resolved.blockReasons,
      notes: [],
    };
  }

  return await buildProjectAudit(resolved.context);
}

export async function runMigrateHomeReport(args: any): Promise<MigrateHomeResult> {
  if (args?.report_only === false) {
    return {
      command: 'agenticos_migrate_home',
      status: 'BLOCK',
      report_only: true,
      total_projects: 0,
      safe_to_defer_projects: 0,
      blocked_projects: 0,
      findings_summary: emptyCounts(),
      projects: [],
      block_reasons: ['apply mode is not implemented yet; use report_only=true for the current #263 slice.'],
      notes: [],
    };
  }

  const registry = await loadRegistry();
  const rawRegistryState = await loadRawRegistryState();
  if (rawRegistryState.error) {
    return {
      command: 'agenticos_migrate_home',
      status: 'BLOCK',
      report_only: true,
      total_projects: 0,
      safe_to_defer_projects: 0,
      blocked_projects: 0,
      findings_summary: emptyCounts(),
      projects: [],
      block_reasons: ['Registry could not be read cleanly; home-wide migration inventory is unavailable.'],
      notes: [rawRegistryState.error],
    };
  }

  const projects: HomeProjectSummary[] = [];
  const findingsSummary = emptyCounts();
  let blockedProjects = 0;
  let safeToDeferProjects = 0;

  if (typeof rawRegistryState.raw.active_project === 'string' && rawRegistryState.raw.active_project.trim().length > 0) {
    findingsSummary.safe_lazy_repair += 1;
  }

  for (const registryEntry of registry.projects) {
    const result = await buildProjectAudit({
      registry,
      rawRegistryState,
      registryEntry,
      rawRegistryEntry: findRawRegistryEntry(rawRegistryState.raw, registryEntry),
      projectPath: registryEntry.path,
      resolutionSource: 'project',
    }, {
      includeHomeScopedRegistryFindings: false,
    });

    findingsSummary.compatible_only += result.finding_counts.compatible_only;
    findingsSummary.safe_lazy_repair += result.finding_counts.safe_lazy_repair;
    findingsSummary.explicit_migration_required += result.finding_counts.explicit_migration_required;

    if (result.status === 'BLOCK') {
      blockedProjects += 1;
    }
    if (result.safe_to_continue_without_migration) {
      safeToDeferProjects += 1;
    }

    projects.push({
      project_id: result.project?.project_id || null,
      project_name: result.project?.project_name || null,
      project_path: result.project?.project_path || registryEntry.path,
      status: result.status,
      finding_counts: result.finding_counts,
      safe_to_continue_without_migration: result.safe_to_continue_without_migration,
      recommended_next_action: result.recommended_next_action,
    });
  }

  const status: AuditStatus = blockedProjects > 0
    ? 'BLOCK'
    : projects.some((project) => project.status === 'WARN')
      ? 'WARN'
      : 'PASS';

  return {
    command: 'agenticos_migrate_home',
    status,
    report_only: true,
    total_projects: registry.projects.length,
    safe_to_defer_projects: safeToDeferProjects,
    blocked_projects: blockedProjects,
    findings_summary: findingsSummary,
    projects,
    block_reasons: [],
    notes: [
      ...(projects.length === 0 ? ['No managed projects are currently registered in this AgenticOS home.'] : []),
      ...(typeof rawRegistryState.raw.active_project === 'string' && rawRegistryState.raw.active_project.trim().length > 0
        ? ['The home registry still contains a populated legacy active_project field.']
        : []),
    ],
  };
}
