import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import yaml from 'yaml';
import { getAgenticOSHome, loadRegistry } from './registry.js';
import { CURRENT_TEMPLATE_VERSION, extractTemplateVersion, generateAgentsMd, generateClaudeMd, upgradeClaudeMd } from './distill.js';

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
  };
}

export interface ResolvedProjectTarget {
  projectPath: string;
  projectName: string;
  projectDescription: string;
  projectId: string;
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

export async function loadStandardKitManifest(): Promise<StandardKitManifest> {
  const manifestPath = join(getAgenticOSHome(), 'projects', 'agenticos', '.meta', 'standard-kit', 'manifest.yaml');
  const content = await readFile(manifestPath, 'utf-8');
  return yaml.parse(content) as StandardKitManifest;
}

export function resolveCanonicalSourcePath(relativeSourcePath: string): string {
  return join(getAgenticOSHome(), relativeSourcePath);
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
  };
}

async function ensureParentDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

async function ensureStandardDirectories(projectPath: string): Promise<void> {
  await mkdir(join(projectPath, '.context', 'conversations'), { recursive: true });
  await mkdir(join(projectPath, 'knowledge'), { recursive: true });
  await mkdir(join(projectPath, 'tasks', 'templates'), { recursive: true });
  await mkdir(join(projectPath, 'artifacts'), { recursive: true });
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

export async function adoptStandardKit(args: { project_path?: string; project_name?: string; project_description?: string }): Promise<AdoptResult> {
  const manifest = await loadStandardKitManifest();
  const projectPath = await resolveProjectPath(args.project_path);
  const project = await resolveProjectIdentity(projectPath, args.project_name, args.project_description);

  await ensureStandardDirectories(project.projectPath);

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
        ? generateAgentsMd(project.projectName, project.projectDescription)
        : generateClaudeMd(project.projectName, project.projectDescription);
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
      ? generateAgentsMd(project.projectName, project.projectDescription)
      : upgradeClaudeMd(destination, project.projectName, project.projectDescription);
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
