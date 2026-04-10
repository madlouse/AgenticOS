import { mkdir, writeFile, access, readFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'yaml';
import { loadRegistry, patchRegistry, getAgenticOSHome } from '../utils/registry.js';
import { generateClaudeMd, generateAgentsMd } from '../utils/distill.js';
import { buildProjectTopologyInitializationMessage, validateContextPublicationPolicy, type ContextPublicationPolicy, type ProjectTopology } from '../utils/project-contract.js';
import { resolveManagedProjectContextDisplayPaths, resolveManagedProjectContextPaths } from '../utils/agent-context-paths.js';

function isValidGithubRepo(value: string): boolean {
  return /^[^/\s]+\/[^/\s]+$/.test(value);
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
    throw new Error('context_publication_policy is required when topology is "github_versioned" and must be "private_continuity" or "public_distilled".');
  }

  return resolvedPolicy;
}

function resolveTopologyArgs(args: any): { topology: ProjectTopology; rawContextPublicationPolicy?: string; githubRepo?: string; normalizeExisting: boolean } {
  const topology = typeof args.topology === 'string' ? args.topology.trim() : '';
  const githubRepo = typeof args.github_repo === 'string' ? args.github_repo.trim() : '';
  const normalizeExisting = args.normalize_existing === true;
  const rawContextPublicationPolicy = typeof args.context_publication_policy === 'string'
    ? args.context_publication_policy
    : undefined;

  if (topology !== 'local_directory_only' && topology !== 'github_versioned') {
    throw new Error('topology is required and must be "local_directory_only" or "github_versioned".');
  }

  if (topology === 'github_versioned') {
    if (!githubRepo) {
      throw new Error('github_repo is required when topology is "github_versioned".');
    }
    if (!isValidGithubRepo(githubRepo)) {
      throw new Error('github_repo must use the form "OWNER/REPO".');
    }
    return { topology, rawContextPublicationPolicy, githubRepo, normalizeExisting };
  }

  return {
    topology,
    rawContextPublicationPolicy,
    normalizeExisting,
  };
}

async function loadExistingProjectYaml(projectPath: string): Promise<any> {
  try {
    return yaml.parse(await readFile(join(projectPath, '.project.yaml'), 'utf-8')) || {};
  } catch {
    return {};
  }
}

function buildProjectYaml(args: {
  name: string;
  id: string;
  description?: string;
  existingProjectYaml?: any;
  topology: ProjectTopology;
  contextPublicationPolicy: ContextPublicationPolicy;
  githubRepo?: string;
}): any {
  const { name, id, description, existingProjectYaml = {}, topology, contextPublicationPolicy, githubRepo } = args;
  const today = new Date().toISOString().split('T')[0];
  const meta = existingProjectYaml?.meta || {};
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
    source_control: {
      topology,
      context_publication_policy: contextPublicationPolicy,
      ...(topology === 'github_versioned'
        ? {
            github_repo: githubRepo,
            branch_strategy: 'github_flow',
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

  if (topology === 'github_versioned') {
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
  const { topology, rawContextPublicationPolicy, githubRepo, normalizeExisting } = resolveTopologyArgs(args);
  const id = name.toLowerCase().replace(/\s+/g, '-');

  const projectPath = customPath || join(getAgenticOSHome(), 'projects', id);

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
    const publicationValidation = validateContextPublicationPolicy(name, existingProjectYaml);
    if (!publicationValidation.ok) {
      return `${publicationValidation.message} Re-run agenticos_init with normalize_existing=true and the intended topology/publication contract.`;
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
  const today = new Date().toISOString().split('T')[0];
  const projectYaml = buildProjectYaml({
    name,
    id,
    description,
    existingProjectYaml,
    topology,
    contextPublicationPolicy,
    githubRepo,
  });
  await writeFile(join(projectPath, '.project.yaml'), yaml.stringify(projectYaml), 'utf-8');
  const contextPaths = resolveManagedProjectContextPaths(projectPath, projectYaml);
  const contextDisplayPaths = resolveManagedProjectContextDisplayPaths(projectYaml);

  await mkdir(contextPaths.conversationsDir, { recursive: true });
  await mkdir(contextPaths.knowledgeDir, { recursive: true });
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
    : 'Topology: local_directory_only';
  const publicationLine = `Context Publication: ${contextPublicationPolicy}`;
  const prefix = pathExists ? 'Normalized' : 'Created';
  return `✅ ${prefix} project "${name}" at ${projectPath}\n\nProject ID: ${id}\nStatus: Active\n${topologyLine}\n${publicationLine}\n\nUse agenticos_switch to load this project context.`;
}
