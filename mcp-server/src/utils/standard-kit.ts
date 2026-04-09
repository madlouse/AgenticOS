import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import yaml from 'yaml';
import { getAgenticOSHome, loadRegistry } from './registry.js';
import { getOfficialAgentAdapters, loadAgentAdapterMatrix } from './agent-adapter-matrix.js';
import { CURRENT_TEMPLATE_VERSION, extractTemplateVersion, generateAgentsMd, generateClaudeMd, upgradeClaudeMd } from './distill.js';
import { buildArchivedReferenceMessage, isArchivedReferenceProject } from './project-contract.js';
import { resolveAgenticOSProductPath, resolveAgenticOSProductRoot, toCanonicalProductRelativePath } from './product-source-root.js';
import { resolveManagedProjectContextDisplayPaths, resolveManagedProjectContextPaths, type ManagedProjectContextDisplayPaths } from './agent-context-paths.js';

interface StandardKitEntry {
  path: string;
  canonical_source?: string;
}

interface StandardKitLayer {
  entries?: StandardKitEntry[];
}

interface StandardKitManifest {
  kit_id: string;
  kit_version: string;
  layers: {
    generated_files?: StandardKitLayer;
    copied_templates?: StandardKitLayer;
  };
  adoption?: {
    required_files?: string[];
    required_behavior?: string[];
  };
}

export interface ResolvedProjectTarget {
  projectPath: string;
  projectName: string;
  projectDescription: string;
  projectId: string;
  projectYaml: any;
  agentContextPaths: ManagedProjectContextDisplayPaths;
}

export interface AdoptResult {
  command: 'agenticos_standard_kit_adopt';
  status: 'ADOPTED';
  project_path: string;
  project_name: string;
  project_id: string;
  kit_id: string;
  kit_version: string;
  created_files: string[];
  upgraded_generated_files: string[];
  skipped_existing_templates: string[];
  skipped_current_generated_files: string[];
}

export interface UpgradeCheckGeneratedStatus {
  path: string;
  status: 'missing' | 'current' | 'stale';
  current_version: number | null;
  expected_version: number;
}

export interface UpgradeCheckTemplateStatus {
  path: string;
  status: 'missing' | 'matches_canonical' | 'diverged_from_canonical';
  canonical_source: string;
}

export interface UpgradeCheckResult {
  command: 'agenticos_standard_kit_upgrade_check';
  status: 'CHECKED';
  project_path: string;
  project_name: string;
  project_id: string;
  kit_id: string;
  kit_version: string;
  missing_required_files: string[];
  generated_files: UpgradeCheckGeneratedStatus[];
  copied_templates: UpgradeCheckTemplateStatus[];
}

export interface ConformanceBehaviorStatus {
  behavior: string;
  status: 'PASS' | 'FAIL';
  summary: string;
  evidence_paths: string[];
}

export interface ConformanceAdapterStatus {
  agent_id: string;
  adapter_file: string;
  status: 'PASS' | 'FAIL';
  summary: string;
}

export interface StandardKitConformanceResult {
  command: 'agenticos_standard_kit_conformance_check';
  status: 'PASS' | 'FAIL' | 'SKIP';
  summary: string;
  project_path: string;
  project_name: string;
  project_id: string;
  kit_id: string;
  kit_version: string;
  missing_required_files: string[];
  generated_files: UpgradeCheckGeneratedStatus[];
  copied_templates: UpgradeCheckTemplateStatus[];
  behavior_checks: ConformanceBehaviorStatus[];
  adapter_checks: ConformanceAdapterStatus[];
}

export async function loadStandardKitManifest(): Promise<StandardKitManifest> {
  const manifestPath = resolveAgenticOSProductPath('.meta', 'standard-kit', 'manifest.yaml');
  const content = await readFile(manifestPath, 'utf-8');
  return yaml.parse(content) as StandardKitManifest;
}

export function resolveCanonicalSourcePath(relativeSourcePath: string): string {
  const productRoot = resolveAgenticOSProductRoot();
  const productRelative = toCanonicalProductRelativePath(relativeSourcePath);
  return join(productRoot, productRelative);
}

function slugifyProjectName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '-');
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function nowIso(): string {
  return new Date().toISOString();
}

async function resolveProjectPath(projectPath?: string): Promise<string> {
  if (projectPath) return projectPath;

  const registry = await loadRegistry();
  if (!registry.active_project) {
    throw new Error('No project_path provided and no active project found in registry.');
  }

  const active = registry.projects.find((project) => project.id === registry.active_project);
  if (!active) {
    throw new Error(`Active project "${registry.active_project}" not found in registry.`);
  }

  return active.path;
}

async function readProjectYaml(projectPath: string): Promise<any | null> {
  const projectYamlPath = join(projectPath, '.project.yaml');
  if (!existsSync(projectYamlPath)) return null;
  return yaml.parse(await readFile(projectYamlPath, 'utf-8'));
}

async function resolveProjectIdentity(projectPath: string, projectName?: string, projectDescription?: string): Promise<ResolvedProjectTarget> {
  const projectYaml = await readProjectYaml(projectPath);

  const registry = await loadRegistry();
  const registryMatch = registry.projects.find((project) => project.path === projectPath);

  const resolvedName =
    projectName ||
    projectYaml?.meta?.name ||
    registryMatch?.name;

  if (!resolvedName) {
    throw new Error('Unable to resolve project name. Provide project_name or create .project.yaml first.');
  }

  const resolvedDescription =
    projectDescription ||
    projectYaml?.meta?.description ||
    '';

  const resolvedId =
    projectYaml?.meta?.id ||
    registryMatch?.id ||
    slugifyProjectName(resolvedName);

  return {
    projectPath,
    projectName: resolvedName,
    projectDescription: resolvedDescription,
    projectId: resolvedId,
    projectYaml: projectYaml || {},
    agentContextPaths: resolveManagedProjectContextDisplayPaths(projectYaml || {}),
  };
}

async function ensureParentDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

async function ensureStandardDirectories(project: ResolvedProjectTarget): Promise<void> {
  const contextPaths = resolveManagedProjectContextPaths(project.projectPath, project.projectYaml);
  await mkdir(contextPaths.conversationsDir, { recursive: true });
  await mkdir(contextPaths.knowledgeDir, { recursive: true });
  await mkdir(join(contextPaths.tasksDir, 'templates'), { recursive: true });
  await mkdir(contextPaths.artifactsDir, { recursive: true });
}

function renderProjectYamlTemplate(templateContent: string, project: ResolvedProjectTarget): string {
  const parsed = yaml.parse(templateContent) as any;
  parsed.meta = parsed.meta || {};
  parsed.meta.name = project.projectName;
  parsed.meta.id = project.projectId;
  parsed.meta.version = parsed.meta.version || '1.0.0';
  parsed.meta.created = today();
  if (project.projectDescription) {
    parsed.meta.description = project.projectDescription;
  }
  parsed.status = parsed.status || {};
  parsed.status.last_updated = today();
  parsed.status.phase = parsed.status.phase || 'planning';
  return yaml.stringify(parsed);
}

function renderQuickStartTemplate(templateContent: string, project: ResolvedProjectTarget): string {
  return templateContent
    .replace(/\[Project Name\]/g, project.projectName)
    .replace(/\[Main objective\]/g, project.projectDescription || 'Define the main objective')
    .replace(/\[Current phase\]/g, 'planning')
    .replace(/\[What was done last\]/g, 'Standard kit adopted')
    .replace(/\[What to do next\]/g, 'Define project goals and first implementation issue')
    .replace(/\[Important fact 1\]/g, 'This project now uses the AgenticOS standard kit')
    .replace(/\[Important fact 2\]/g, 'Generated agent instructions can be upgraded through template version changes')
    .replace(/\[Task 1\]/g, 'Define project goals')
    .replace(/\[Task 2\]/g, 'Create the first issue and design brief')
    .replace(/\[Decision\]/g, 'Adopt the AgenticOS standard kit');
}

function renderStateTemplate(templateContent: string): string {
  const parsed = yaml.parse(templateContent) as any;
  parsed.session = parsed.session || {};
  parsed.session.id = `session-${today()}-001`;
  parsed.session.started = nowIso();
  parsed.session.agent = 'agenticos-standard-kit';
  parsed.current_task = parsed.current_task || {};
  parsed.current_task.id = null;
  parsed.current_task.title = null;
  parsed.current_task.status = 'pending';
  parsed.current_task.next_step = 'Define project goals';
  parsed.loaded_context = ['.project.yaml', '.context/quick-start.md'];
  return yaml.stringify(parsed);
}

function renderCopiedTemplate(destinationPath: string, templateContent: string, project: ResolvedProjectTarget): string {
  if (destinationPath === '.project.yaml') {
    return renderProjectYamlTemplate(templateContent, project);
  }
  if (destinationPath === '.context/quick-start.md') {
    return renderQuickStartTemplate(templateContent, project);
  }
  if (destinationPath === '.context/state.yaml') {
    return renderStateTemplate(templateContent);
  }
  return templateContent;
}

function getGeneratedEntries(manifest: StandardKitManifest): StandardKitEntry[] {
  return manifest.layers.generated_files?.entries || [];
}

function getCopiedTemplateEntries(manifest: StandardKitManifest): StandardKitEntry[] {
  return manifest.layers.copied_templates?.entries || [];
}

async function readProjectFile(projectPath: string, relativePath: string): Promise<string | null> {
  const absolutePath = join(projectPath, relativePath);
  if (!existsSync(absolutePath)) return null;
  return readFile(absolutePath, 'utf-8');
}

function fileContainsAll(content: string | null, needles: string[]): boolean {
  return !!content && needles.every((needle) => content.includes(needle));
}

export async function adoptStandardKit(args: { project_path?: string; project_name?: string; project_description?: string }): Promise<AdoptResult> {
  const manifest = await loadStandardKitManifest();
  const projectPath = await resolveProjectPath(args.project_path);
  const project = await resolveProjectIdentity(projectPath, args.project_name, args.project_description);

  await ensureStandardDirectories(project);

  const createdFiles: string[] = [];
  const upgradedGeneratedFiles: string[] = [];
  const skippedExistingTemplates: string[] = [];
  const skippedCurrentGeneratedFiles: string[] = [];

  for (const entry of getCopiedTemplateEntries(manifest)) {
    if (!entry.canonical_source) continue;
    const destination = join(project.projectPath, entry.path);
    if (existsSync(destination)) {
      skippedExistingTemplates.push(entry.path);
      continue;
    }

    const templateContent = await readFile(resolveCanonicalSourcePath(entry.canonical_source), 'utf-8');
    const rendered = renderCopiedTemplate(entry.path, templateContent, project);
    await ensureParentDir(destination);
    await writeFile(destination, rendered, 'utf-8');
    createdFiles.push(entry.path);
  }

  for (const entry of getGeneratedEntries(manifest)) {
      const destination = join(project.projectPath, entry.path);
      if (!existsSync(destination)) {
      const content = entry.path === 'AGENTS.md'
        ? generateAgentsMd(project.projectName, project.projectDescription, project.agentContextPaths)
        : generateClaudeMd(project.projectName, project.projectDescription, undefined, project.agentContextPaths);
      await writeFile(destination, content, 'utf-8');
      createdFiles.push(entry.path);
      continue;
    }

    const existingContent = await readFile(destination, 'utf-8');
    const version = extractTemplateVersion(existingContent);
    if (version >= CURRENT_TEMPLATE_VERSION) {
      skippedCurrentGeneratedFiles.push(entry.path);
      continue;
    }

    const upgraded = entry.path === 'AGENTS.md'
      ? generateAgentsMd(project.projectName, project.projectDescription, project.agentContextPaths)
      : upgradeClaudeMd(destination, project.projectName, project.projectDescription, undefined, project.agentContextPaths);
    await writeFile(destination, upgraded, 'utf-8');
    upgradedGeneratedFiles.push(entry.path);
  }

  return {
    command: 'agenticos_standard_kit_adopt',
    status: 'ADOPTED',
    project_path: project.projectPath,
    project_name: project.projectName,
    project_id: project.projectId,
    kit_id: manifest.kit_id,
    kit_version: manifest.kit_version,
    created_files: createdFiles,
    upgraded_generated_files: upgradedGeneratedFiles,
    skipped_existing_templates: skippedExistingTemplates,
    skipped_current_generated_files: skippedCurrentGeneratedFiles,
  };
}

export async function checkStandardKitUpgrade(args: { project_path?: string; project_name?: string; project_description?: string }): Promise<UpgradeCheckResult> {
  const manifest = await loadStandardKitManifest();
  const projectPath = await resolveProjectPath(args.project_path);
  const project = await resolveProjectIdentity(projectPath, args.project_name, args.project_description);

  const missingRequiredFiles: string[] = [];
  const generatedFiles: UpgradeCheckGeneratedStatus[] = [];
  const copiedTemplates: UpgradeCheckTemplateStatus[] = [];

  for (const requiredPath of manifest.adoption?.required_files || []) {
    if (!existsSync(join(project.projectPath, requiredPath))) {
      missingRequiredFiles.push(requiredPath);
    }
  }

  for (const entry of getGeneratedEntries(manifest)) {
    const destination = join(project.projectPath, entry.path);
    if (!existsSync(destination)) {
      generatedFiles.push({
        path: entry.path,
        status: 'missing',
        current_version: null,
        expected_version: CURRENT_TEMPLATE_VERSION,
      });
      continue;
    }

    const content = await readFile(destination, 'utf-8');
    const version = extractTemplateVersion(content);
    generatedFiles.push({
      path: entry.path,
      status: version >= CURRENT_TEMPLATE_VERSION ? 'current' : 'stale',
      current_version: version,
      expected_version: CURRENT_TEMPLATE_VERSION,
    });
  }

  for (const entry of getCopiedTemplateEntries(manifest)) {
    if (!entry.canonical_source) continue;
    const destination = join(project.projectPath, entry.path);
    if (!existsSync(destination)) {
      copiedTemplates.push({
        path: entry.path,
        status: 'missing',
        canonical_source: entry.canonical_source,
      });
      continue;
    }

    const destinationContent = readFileSync(destination, 'utf-8');
    const canonicalContent = readFileSync(resolveCanonicalSourcePath(entry.canonical_source), 'utf-8');
    copiedTemplates.push({
      path: entry.path,
      status: destinationContent === canonicalContent ? 'matches_canonical' : 'diverged_from_canonical',
      canonical_source: entry.canonical_source,
    });
  }

  return {
    command: 'agenticos_standard_kit_upgrade_check',
    status: 'CHECKED',
    project_path: project.projectPath,
    project_name: project.projectName,
    project_id: project.projectId,
    kit_id: manifest.kit_id,
    kit_version: manifest.kit_version,
    missing_required_files: missingRequiredFiles,
    generated_files: generatedFiles,
    copied_templates: copiedTemplates,
  };
}

export async function checkStandardKitConformance(args: { project_path?: string; project_name?: string; project_description?: string }): Promise<StandardKitConformanceResult> {
  const manifest = await loadStandardKitManifest();
  const projectPath = await resolveProjectPath(args.project_path);
  const project = await resolveProjectIdentity(projectPath, args.project_name, args.project_description);
  const projectYaml = yaml.parse((await readProjectFile(project.projectPath, '.project.yaml')) || '{}') as any;

  if (isArchivedReferenceProject(projectYaml)) {
    return {
      command: 'agenticos_standard_kit_conformance_check',
      status: 'SKIP',
      summary: buildArchivedReferenceMessage(project.projectName, projectYaml?.archive_contract?.replacement_project),
      project_path: project.projectPath,
      project_name: project.projectName,
      project_id: project.projectId,
      kit_id: manifest.kit_id,
      kit_version: manifest.kit_version,
      missing_required_files: [],
      generated_files: [],
      copied_templates: [],
      behavior_checks: [],
      adapter_checks: [],
    };
  }

  const upgrade = await checkStandardKitUpgrade({
    project_path: project.projectPath,
    project_name: project.projectName,
    project_description: project.projectDescription,
  });
  const stateYaml = yaml.parse((await readProjectFile(upgrade.project_path, '.context/state.yaml')) || '{}') as any;
  const agentsMd = await readProjectFile(upgrade.project_path, 'AGENTS.md');
  const claudeMd = await readProjectFile(upgrade.project_path, 'CLAUDE.md');
  const designBrief = await readProjectFile(upgrade.project_path, 'tasks/templates/issue-design-brief.md');
  const officialAdapters = getOfficialAgentAdapters(await loadAgentAdapterMatrix());

  const behaviorChecks: ConformanceBehaviorStatus[] = [];

  for (const behavior of manifest.adoption?.required_behavior || []) {
    switch (behavior) {
      case 'operator_intent_resolution': {
        const adaptersPass = fileContainsAll(agentsMd, [
          '## Task Intake Rule',
          'recover operator intent',
          'workflow fragments',
        ]) && fileContainsAll(claudeMd, [
          '## Task Intake Rule',
          'recover operator intent',
          'workflow fragments',
        ]);
        const templatePass = fileContainsAll(designBrief, [
          'Operator signals / partial methods:',
          'Contradictions or weak assumptions to resolve:',
        ]);
        const pass = adaptersPass && templatePass;
        behaviorChecks.push({
          behavior,
          status: pass ? 'PASS' : 'FAIL',
          summary: pass
            ? 'Adapter surfaces and the design-brief template preserve the compact operator-intent intake rule.'
            : 'Operator-intent intake guidance is missing from generated adapters or the issue-design-brief template.',
          evidence_paths: ['AGENTS.md', 'CLAUDE.md', 'tasks/templates/issue-design-brief.md'],
        });
        break;
      }
      case 'memory_layer_contracts': {
        const pass = !!projectYaml?.memory_contract?.version
          && !!projectYaml?.agent_context?.quick_start
          && !!projectYaml?.agent_context?.current_state
          && !!stateYaml?.memory_contract?.version
          && Array.isArray(stateYaml?.loaded_context)
          && stateYaml.loaded_context.includes('.context/quick-start.md');
        behaviorChecks.push({
          behavior,
          status: pass ? 'PASS' : 'FAIL',
          summary: pass
            ? 'Project metadata and state preserve the memory-layer contract.'
            : 'Project metadata or state is missing required memory-layer contract fields.',
          evidence_paths: ['.project.yaml', '.context/state.yaml'],
        });
        break;
      }
      case 'cross_agent_policy_contract': {
        const pass = fileContainsAll(agentsMd, [
          'Canonical Policy (Shared Across Agents)',
          'This project has one canonical AgenticOS execution policy',
        ]) && fileContainsAll(claudeMd, [
          'Canonical Policy (Shared Across Agents)',
          'This project has one canonical AgenticOS execution policy',
        ]);
        behaviorChecks.push({
          behavior,
          status: pass ? 'PASS' : 'FAIL',
          summary: pass
            ? 'Generated adapter docs expose the shared cross-agent policy block.'
            : 'Generated adapter docs are missing the shared cross-agent policy block.',
          evidence_paths: ['AGENTS.md', 'CLAUDE.md'],
        });
        break;
      }
      case 'implementation_preflight': {
        const pass = fileContainsAll(agentsMd, ['agenticos_preflight']) && fileContainsAll(claudeMd, ['agenticos_preflight']);
        behaviorChecks.push({
          behavior,
          status: pass ? 'PASS' : 'FAIL',
          summary: pass
            ? 'Both adapter surfaces require executable preflight before implementation edits.'
            : 'One or more adapter surfaces are missing executable preflight guidance.',
          evidence_paths: ['AGENTS.md', 'CLAUDE.md'],
        });
        break;
      }
      case 'issue_first_branching': {
        const pass = fileContainsAll(agentsMd, ['issue-first']) && fileContainsAll(claudeMd, ['issue-first']);
        behaviorChecks.push({
          behavior,
          status: pass ? 'PASS' : 'FAIL',
          summary: pass
            ? 'Both adapter surfaces preserve issue-first execution language.'
            : 'One or more adapter surfaces are missing issue-first execution language.',
          evidence_paths: ['AGENTS.md', 'CLAUDE.md'],
        });
        break;
      }
      case 'isolated_worktree_execution': {
        const pass = fileContainsAll(agentsMd, ['agenticos_branch_bootstrap'])
          && fileContainsAll(claudeMd, ['agenticos_branch_bootstrap', 'worktree']);
        behaviorChecks.push({
          behavior,
          status: pass ? 'PASS' : 'FAIL',
          summary: pass
            ? 'Adapter surfaces preserve isolated branch/worktree execution guidance.'
            : 'Adapter surfaces are missing isolated branch/worktree execution guidance.',
          evidence_paths: ['AGENTS.md', 'CLAUDE.md'],
        });
        break;
      }
      case 'edit_boundary_enforcement': {
        const indexSource = readFileSync(resolveAgenticOSProductPath('mcp-server', 'src', 'index.ts'), 'utf-8');
        const pass = indexSource.includes("name: 'agenticos_edit_guard'");
        behaviorChecks.push({
          behavior,
          status: pass ? 'PASS' : 'FAIL',
          summary: pass
            ? 'Canonical MCP surface exposes executable edit-boundary enforcement.'
            : 'Canonical MCP surface is missing executable edit-boundary enforcement.',
          evidence_paths: [join(toCanonicalProductRelativePath('projects/agenticos/mcp-server/src/index.ts'))],
        });
        break;
      }
      case 'pr_scope_validation': {
        const pass = fileContainsAll(agentsMd, ['agenticos_pr_scope_check']) && fileContainsAll(claudeMd, ['agenticos_pr_scope_check']);
        behaviorChecks.push({
          behavior,
          status: pass ? 'PASS' : 'FAIL',
          summary: pass
            ? 'Both adapter surfaces require PR scope validation.'
            : 'One or more adapter surfaces are missing PR scope validation guidance.',
          evidence_paths: ['AGENTS.md', 'CLAUDE.md'],
        });
        break;
      }
      case 'official_agent_adapter_surfaces': {
        const pass = officialAdapters.every((adapter) => existsSync(join(upgrade.project_path, adapter.adapter_file)));
        behaviorChecks.push({
          behavior,
          status: pass ? 'PASS' : 'FAIL',
          summary: pass
            ? 'Official agents map to present adapter surfaces.'
            : 'One or more official agents do not map to a present adapter surface.',
          evidence_paths: officialAdapters.map((adapter) => adapter.adapter_file),
        });
        break;
      }
      case 'sub_agent_context_inheritance': {
        const pass = existsSync(join(upgrade.project_path, 'tasks', 'templates', 'sub-agent-handoff.md'));
        behaviorChecks.push({
          behavior,
          status: pass ? 'PASS' : 'FAIL',
          summary: pass
            ? 'Sub-agent handoff template is present for downstream inheritance.'
            : 'Sub-agent handoff template is missing.',
          evidence_paths: ['tasks/templates/sub-agent-handoff.md'],
        });
        break;
      }
      default:
        behaviorChecks.push({
          behavior,
          status: 'FAIL',
          summary: `No executable conformance check is implemented for required behavior "${behavior}".`,
          evidence_paths: [],
        });
        break;
    }
  }

  const adapterChecks: ConformanceAdapterStatus[] = officialAdapters.map((adapter) => {
    const content = adapter.adapter_file === 'CLAUDE.md' ? claudeMd : agentsMd;
    const generatedStatus = upgrade.generated_files.find((item) => item.path === adapter.adapter_file);
    const pass = generatedStatus?.status === 'current'
      && fileContainsAll(content, adapter.required_runtime_guidance);
    return {
      agent_id: adapter.agent_id,
      adapter_file: adapter.adapter_file,
      status: pass ? 'PASS' : 'FAIL',
      summary: pass
        ? `${adapter.agent_id} is covered by a current generated adapter surface with required runtime guidance.`
        : `${adapter.agent_id} is missing a current generated adapter surface or required runtime guidance.`,
    };
  });

  const failedBehaviors = behaviorChecks.filter((item) => item.status === 'FAIL');
  const failedAdapters = adapterChecks.filter((item) => item.status === 'FAIL');
  const generatedDrift = upgrade.generated_files.filter((item) => item.status !== 'current');
  const status = upgrade.missing_required_files.length === 0
    && failedBehaviors.length === 0
    && failedAdapters.length === 0
    && generatedDrift.length === 0
    ? 'PASS'
    : 'FAIL';

  return {
    command: 'agenticos_standard_kit_conformance_check',
    status,
    summary: status === 'PASS'
      ? 'standard-kit conformance passed'
      : `standard-kit conformance failed: ${upgrade.missing_required_files.length} missing files, ${failedBehaviors.length} failed behaviors, ${failedAdapters.length} failed adapters`,
    project_path: upgrade.project_path,
    project_name: upgrade.project_name,
    project_id: upgrade.project_id,
    kit_id: manifest.kit_id,
    kit_version: manifest.kit_version,
    missing_required_files: upgrade.missing_required_files,
    generated_files: upgrade.generated_files,
    copied_templates: upgrade.copied_templates,
    behavior_checks: behaviorChecks,
    adapter_checks: adapterChecks,
  };
}
