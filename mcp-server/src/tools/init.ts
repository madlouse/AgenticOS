import { mkdir, writeFile, access, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import yaml from 'yaml';
import { loadRegistry, patchRegistry, getAgenticOSHome } from '../utils/registry.js';
import { generateClaudeMd, generateAgentsMd } from '../utils/distill.js';
import { renderCursorProjectRule, CURSOR_PROJECT_RULE_RELATIVE_PATH } from '../utils/cursor-project-rule.js';
import {
  buildProjectTopologyInitializationMessage,
  defaultReviewSystemForProvider,
  hasDeclaredContextPublicationPolicy,
  isGitBackedTopology,
  isValidGitRepositoryProvider,
  isValidGitReviewSystem,
  normalizeRepositorySlug,
  validateContextPublicationPolicy,
  validateProjectKind,
  type ContextPublicationPolicy,
  type GitRepositoryContract,
  type GitRepositoryProvider,
  type ProjectKind,
  type ProjectTopology,
} from '../utils/project-contract.js';
import { resolveManagedProjectContextDisplayPaths, resolveManagedProjectContextPaths } from '../utils/agent-context-paths.js';
import { ensureCaseKnowledgeDirectories } from '../utils/case-knowledge.js';
import { validatePathSecurity } from '../utils/session-context.js';

function isValidGithubRepo(value: string): boolean {
  return /^[^/\s]+\/[^/\s]+$/.test(value);
}

function isValidRepositorySlug(value: string): boolean {
  return /^[^/\s]+(?:\/[^/\s]+)+$/.test(value);
}

function resolveContextPublicationPolicy(
  topology: ProjectTopology,
  rawPolicy: unknown,
  existingProjectYaml?: any,
): ContextPublicationPolicy {
  const policy = typeof rawPolicy === 'string' ? rawPolicy.trim() : '';
  const existingPolicy = typeof existingProjectYaml?.source_control?.context_publication_policy === 'string'
    ? existingProjectYaml.source_control.context_publication_policy.trim()
    : '';
  const resolvedPolicy = policy || existingPolicy;

  if (topology === 'local_directory_only') {
    if (!resolvedPolicy) return 'local_private';
    if (resolvedPolicy !== 'local_private') {
      throw new Error('context_publication_policy must be "local_private" when topology is "local_directory_only".');
    }
    return 'local_private';
  }

  if (resolvedPolicy !== 'private_continuity' && resolvedPolicy !== 'public_distilled') {
    throw new Error(`context_publication_policy is required when topology is "${topology}" and must be "private_continuity" or "public_distilled".`);
  }

  return resolvedPolicy;
}

function resolveRepositoryArg(topology: ProjectTopology, args: any, githubRepo?: string): GitRepositoryContract | undefined {
  if (topology === 'github_versioned') {
    return {
      provider: 'github',
      remote: 'origin',
      slug: normalizeRepositorySlug(githubRepo!),
      default_base_branch: null,
      review_system: 'pull_request',
    };
  }

  const rawRepository = args.repository && typeof args.repository === 'object'
    ? args.repository
    : null;
  if (!rawRepository && githubRepo) {
    return {
      provider: 'github',
      remote: 'origin',
      slug: normalizeRepositorySlug(githubRepo),
      default_base_branch: null,
      review_system: 'pull_request',
    };
  }
  if (!rawRepository) {
    throw new Error('repository is required when topology is "git_versioned". Pass repository={provider, slug} or the legacy github_repo shorthand for GitHub projects.');
  }

  const providerValue = typeof rawRepository.provider === 'string' ? rawRepository.provider.trim().toLowerCase() : '';
  if (!isValidGitRepositoryProvider(providerValue)) {
    throw new Error('repository.provider must be "github", "gitlab", "gitee", or "generic" when topology is "git_versioned".');
  }
  const provider = providerValue as GitRepositoryProvider;
  const slugValue = typeof rawRepository.slug === 'string' ? rawRepository.slug.trim() : '';
  if (provider !== 'generic' && !isValidRepositorySlug(slugValue)) {
    throw new Error('repository.slug must use a slash-delimited repository path such as "OWNER/REPO" when provider is not "generic".');
  }
  const remoteValue = typeof rawRepository.remote === 'string' && rawRepository.remote.trim().length > 0
    ? rawRepository.remote.trim()
    : 'origin';
  const reviewSystemValue = typeof rawRepository.review_system === 'string' ? rawRepository.review_system.trim() : '';
  const reviewSystem = isValidGitReviewSystem(reviewSystemValue)
    ? reviewSystemValue
    : defaultReviewSystemForProvider(provider);
  const defaultBaseBranch = typeof rawRepository.default_base_branch === 'string' && rawRepository.default_base_branch.trim().length > 0
    ? rawRepository.default_base_branch.trim()
    : null;

  return {
    provider,
    remote: remoteValue,
    slug: slugValue ? normalizeRepositorySlug(slugValue) : null,
    default_base_branch: defaultBaseBranch,
    review_system: reviewSystem,
  };
}

function resolveTopologyArgs(args: any): { topology: ProjectTopology; rawContextPublicationPolicy?: string; githubRepo?: string; repository?: GitRepositoryContract; normalizeExisting: boolean } {
  const topology = typeof args.topology === 'string' ? args.topology.trim() : '';
  const githubRepo = typeof args.github_repo === 'string' ? args.github_repo.trim() : '';
  const normalizeExisting = args.normalize_existing === true;
  const rawContextPublicationPolicy = typeof args.context_publication_policy === 'string'
    ? args.context_publication_policy
    : undefined;

  if (topology !== 'local_directory_only' && topology !== 'github_versioned' && topology !== 'git_versioned') {
    throw new Error('topology is required and must be "local_directory_only", "git_versioned", or legacy "github_versioned".');
  }

  if (topology === 'github_versioned') {
    if (!githubRepo) {
      throw new Error('github_repo is required when topology is "github_versioned".');
    }
    if (!isValidGithubRepo(githubRepo)) {
      throw new Error('github_repo must use the form "OWNER/REPO".');
    }
    return { topology, rawContextPublicationPolicy, githubRepo, repository: resolveRepositoryArg(topology, args, githubRepo), normalizeExisting };
  }

  if (topology === 'git_versioned') {
    return {
      topology,
      rawContextPublicationPolicy,
      githubRepo: githubRepo || undefined,
      repository: resolveRepositoryArg(topology, args, githubRepo),
      normalizeExisting,
    };
  }

  return {
    topology,
    rawContextPublicationPolicy,
    normalizeExisting,
  };
}

function resolveProjectKindArg(
  name: string,
  rawProjectKind: unknown,
  existingProjectYaml: any = {},
): ProjectKind {
  if (rawProjectKind !== undefined) {
    const validation = validateProjectKind(name, {
      agenticos: { project_kind: rawProjectKind },
    });
    if (!validation.ok) {
      throw new Error(`${validation.message} Pass project_kind="topic" or project_kind="project".`);
    }
    return validation.project_kind;
  }

  const validation = validateProjectKind(name, existingProjectYaml);
  if (!validation.ok) {
    throw new Error(`${validation.message} Re-run agenticos_init with normalize_existing=true and project_kind="topic" or project_kind="project" to repair it.`);
  }
  return validation.project_kind;
}

async function loadExistingProjectYaml(projectPath: string): Promise<any> {
  try {
    return yaml.parse(await readFile(join(projectPath, '.project.yaml'), 'utf-8')) || {};
  } catch {
    return {};
  }
}

async function ensureIgnoreEntries(projectPath: string, entries: string[]): Promise<void> {
  const gitignorePath = join(projectPath, '.gitignore');
  let existing = '';
  try {
    existing = await readFile(gitignorePath, 'utf-8');
  } catch {
    existing = '';
  }

  const lines = existing.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  const missingEntries = entries.filter((entry) => !lines.includes(entry));
  if (missingEntries.length === 0) {
    return;
  }

  const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  const separator = existing.trim().length > 0 ? '\n' : '';
  const block = `${separator}# AgenticOS private runtime surfaces\n${missingEntries.join('\n')}\n`;
  await writeFile(gitignorePath, `${existing}${prefix}${block}`, 'utf-8');
}

function buildProjectYaml(args: {
  name: string;
  id: string;
  description?: string;
  existingProjectYaml?: any;
  topology: ProjectTopology;
  contextPublicationPolicy: ContextPublicationPolicy;
  projectKind: ProjectKind;
  githubRepo?: string;
  repository?: GitRepositoryContract;
}): any {
  const { name, id, description, existingProjectYaml = {}, topology, contextPublicationPolicy, projectKind, githubRepo, repository } = args;
  const today = new Date().toISOString().split('T')[0];
  const meta = existingProjectYaml?.meta || {};
  const repositoryYaml = repository
    ? {
        provider: repository.provider,
        remote: repository.remote,
        ...(repository.slug ? { slug: repository.slug } : {}),
        ...(repository.default_base_branch ? { default_base_branch: repository.default_base_branch } : {}),
        review_system: repository.review_system,
      }
    : undefined;
  const merged: any = {
    ...existingProjectYaml,
    meta: {
      ...meta,
      name,
      id,
      description: description ?? meta.description ?? '',
      created: meta.created || today,
      version: meta.version || '1.0.0',
    },
    agenticos: {
      ...(existingProjectYaml?.agenticos && typeof existingProjectYaml.agenticos === 'object' ? existingProjectYaml.agenticos : {}),
      project_kind: projectKind,
    },
    source_control: {
      topology,
      context_publication_policy: contextPublicationPolicy,
      ...(topology === 'github_versioned'
        ? {
            github_repo: githubRepo,
            branch_strategy: 'github_flow',
          }
        : {}),
      ...(topology === 'git_versioned'
        ? {
            repository: repositoryYaml,
            branch_strategy: 'issue_branch_review_merge',
          }
        : {}),
    },
    agent_context: {
      quick_start: existingProjectYaml?.agent_context?.quick_start || '.context/quick-start.md',
      current_state: existingProjectYaml?.agent_context?.current_state || '.context/state.yaml',
      conversations: existingProjectYaml?.agent_context?.conversations || '.context/conversations/',
      knowledge: existingProjectYaml?.agent_context?.knowledge || 'knowledge/',
      tasks: existingProjectYaml?.agent_context?.tasks || 'tasks/',
      artifacts: existingProjectYaml?.agent_context?.artifacts || 'artifacts/',
    },
  };

  if (isGitBackedTopology(topology)) {
    merged.execution = {
      ...(existingProjectYaml?.execution || {}),
      source_repo_roots: ['.'],
    };
  } else if (merged.execution?.source_repo_roots) {
    const { source_repo_roots, ...rest } = merged.execution;
    merged.execution = Object.keys(rest).length > 0 ? rest : undefined;
  }

  return merged;
}

export async function initProject(args: any): Promise<string> {
  const { name, path: customPath } = args;
  const description = typeof args.description === 'string' ? args.description : undefined;
  const { topology, rawContextPublicationPolicy, githubRepo, repository, normalizeExisting } = resolveTopologyArgs(args);
  const id = name.toLowerCase().replace(/\s+/g, '-');

  const projectPath = customPath || join(getAgenticOSHome(), 'projects', id);
  const pathSecurity = validatePathSecurity(projectPath);
  if (!pathSecurity.valid) {
    throw new Error(`Invalid project path: ${pathSecurity.error}`);
  }

  let pathExists = false;
  try {
    await access(join(projectPath, '.project.yaml'));
    pathExists = true;
  } catch {
    pathExists = false;
  }

  const registry = await loadRegistry();
  const existingIdx = registry.projects.findIndex((p) => p.id === id);
  const registryHasId = existingIdx >= 0;

  if (pathExists && registryHasId && !normalizeExisting) {
    const existingProjectYaml = await loadExistingProjectYaml(projectPath);
    if (!existingProjectYaml?.source_control?.topology) {
      return buildProjectTopologyInitializationMessage(name);
    }
    if (existingProjectYaml.source_control.topology === 'local_directory_only' && !hasDeclaredContextPublicationPolicy(existingProjectYaml)) {
      return `Project "${name}" is missing source_control.context_publication_policy. Use "local_private", "private_continuity", or "public_distilled". Re-run agenticos_init with normalize_existing=true and the intended topology/publication contract.`;
    }
    const publicationValidation = validateContextPublicationPolicy(name, existingProjectYaml);
    if (!publicationValidation.ok) {
      return `${publicationValidation.message} Re-run agenticos_init with normalize_existing=true and the intended topology/publication contract.`;
    }
    const projectKindValidation = validateProjectKind(name, existingProjectYaml);
    if (!projectKindValidation.ok) {
      return `${projectKindValidation.message} Re-run agenticos_init with normalize_existing=true and project_kind="topic" or project_kind="project".`;
    }
    return `Project '${name}' already exists at ${projectPath}. Use \`agenticos_switch\` to activate it.`;
  }

  if (pathExists && !registryHasId && !normalizeExisting) {
    return `Project '${name}' already exists at ${projectPath} but is not registered. Re-run agenticos_init with normalize_existing=true and a topology choice to normalize and re-register it.`;
  }

  if (!pathExists && registryHasId) {
    await patchRegistry((current) => {
      current.projects = current.projects.filter((project) => project.id !== id);
      if (current.active_project === id) {
        current.active_project = null;
      }
    });
  }

  const existingProjectYaml = pathExists ? await loadExistingProjectYaml(projectPath) : {};
  const contextPublicationPolicy = resolveContextPublicationPolicy(
    topology,
    rawContextPublicationPolicy,
    existingProjectYaml,
  );
  const projectKind = resolveProjectKindArg(name, args.project_kind, existingProjectYaml);
  const today = new Date().toISOString().split('T')[0];
  const projectYaml = buildProjectYaml({
    name,
    id,
    description,
    existingProjectYaml,
    topology,
    contextPublicationPolicy,
    projectKind,
    githubRepo,
    repository,
  });
  await mkdir(projectPath, { recursive: true });
  await writeFile(join(projectPath, '.project.yaml'), yaml.stringify(projectYaml), 'utf-8');
  const contextPaths = resolveManagedProjectContextPaths(projectPath, projectYaml);
  const contextDisplayPaths = resolveManagedProjectContextDisplayPaths(projectYaml);

  await mkdir(contextPaths.conversationsDir, { recursive: true });
  if (contextPublicationPolicy === 'public_distilled') {
    await mkdir(join(projectPath, '.private', 'conversations'), { recursive: true });
    await ensureIgnoreEntries(projectPath, ['.private/', '.meta/transcripts/']);
  }
  await ensureCaseKnowledgeDirectories(projectPath, projectYaml);
  await mkdir(contextPaths.tasksDir, { recursive: true });
  await mkdir(contextPaths.artifactsDir, { recursive: true });

  const stateYaml = {
    session: {
      id: `session-${today}-001`,
      started: new Date().toISOString(),
      agent: 'claude-sonnet-4.6',
    },
    current_task: null,
    working_memory: {
      facts: [],
      decisions: [],
      pending: [],
    },
    loaded_context: ['.project.yaml', contextDisplayPaths.quickStartPath],
  };
  await writeFile(contextPaths.statePath, yaml.stringify(stateYaml), 'utf-8');

  const quickStart = `# ${name} - Quick Start

## Project Overview
${description ?? existingProjectYaml?.meta?.description ?? ''}

## Current Status
- Created: ${today}
- Status: Active

## Next Steps
1. Define project goals
2. Set up initial tasks
3. Begin development
`;
  await writeFile(contextPaths.quickStartPath, quickStart, 'utf-8');

  const claudeMd = generateClaudeMd(name, description ?? existingProjectYaml?.meta?.description ?? '', undefined, contextDisplayPaths);
  await writeFile(join(projectPath, 'CLAUDE.md'), claudeMd, 'utf-8');

  const agentsMd = generateAgentsMd(name, description ?? existingProjectYaml?.meta?.description ?? '', contextDisplayPaths);
  await writeFile(join(projectPath, 'AGENTS.md'), agentsMd, 'utf-8');

  const cursorRule = renderCursorProjectRule(name, description ?? existingProjectYaml?.meta?.description ?? '', contextDisplayPaths);
  const cursorRulePath = join(projectPath, CURSOR_PROJECT_RULE_RELATIVE_PATH);
  await mkdir(dirname(cursorRulePath), { recursive: true });
  await writeFile(cursorRulePath, cursorRule, 'utf-8');

  const projectEntry = {
    id,
    name,
    path: projectPath,
    status: 'active' as const,
    created: existingProjectYaml?.meta?.created || today,
    last_accessed: new Date().toISOString(),
  };

  await patchRegistry((current) => {
    current.projects = current.projects.filter((project) => project.id !== id);
    current.projects.push(projectEntry);
    current.active_project = null;
  });

  const topologyLine = topology === 'github_versioned'
    ? `Topology: github_versioned (${githubRepo}, github_flow)`
    : topology === 'git_versioned'
      ? `Topology: git_versioned (${repository?.provider}${repository?.slug ? `:${repository.slug}` : ''}, issue_branch_review_merge)`
      : 'Topology: local_directory_only';
  const publicationLine = `Context Publication: ${contextPublicationPolicy}`;
  const projectKindLine = `Project Kind: ${projectKind}`;
  const prefix = pathExists ? 'Normalized' : 'Created';
  return `✅ ${prefix} project "${name}" at ${projectPath}\n\nProject ID: ${id}\nStatus: Active\n${projectKindLine}\n${topologyLine}\n${publicationLine}\n\nUse agenticos_switch to load this project context.`;
}
