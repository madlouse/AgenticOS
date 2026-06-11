import { join } from 'path';
import { initProject } from './init.js';
import { loadRegistry, type Project, type Registry } from '../utils/registry.js';
import { loadAndVerifyManagedProjectIdentity } from '../utils/checkout-identity.js';
import {
  buildArchivedReferenceMessage,
  defaultReviewSystemForProvider,
  isArchivedReferenceProject,
  isValidGitRepositoryProvider,
  isValidGitReviewSystem,
  isValidRepositoryHost,
  normalizeRepositoryHost,
  normalizeRepositorySlug,
  resolveSourceControlRepository,
  validateContextPublicationPolicy,
  validateManagedProjectTopology,
  validateProjectKind,
  type ContextPublicationPolicy,
  type GitRepositoryContract,
  type GitRepositoryProvider,
  type ProjectKind,
  type ProjectTopology,
} from '../utils/project-contract.js';
import {
  resolveManagedProjectContextDisplayPaths,
  resolveManagedProjectContextPaths,
} from '../utils/agent-context-paths.js';
import { containsControlCharacters, validatePathSecurity } from '../utils/session-context.js';

type ProjectResolveErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'AMBIGUOUS'
  | 'UNSAFE_PATH'
  | 'IDENTITY_UNPROVEN'
  | 'ARCHIVED'
  | 'UNNORMALIZED';

class ProjectResolveError extends Error {
  code: ProjectResolveErrorCode;

  constructor(code: ProjectResolveErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

interface ProjectResolveArgs {
  project?: unknown;
}

interface ProjectEnsureArgs {
  project?: unknown;
  name?: unknown;
  description?: unknown;
  path?: unknown;
  project_kind?: unknown;
  topology?: unknown;
  context_publication_policy?: unknown;
  github_repo?: unknown;
  repository?: unknown;
}

interface ProjectPayload {
  status: 'RESOLVED' | 'ENSURED' | 'CREATED';
  created: boolean;
  project_id: string;
  name: string;
  project_kind: ProjectKind;
  topology: ProjectTopology;
  repository: GitRepositoryContract | null;
  context_publication_policy: ContextPublicationPolicy;
  path: string;
  explicit_workdir: string;
  context_surface_paths: {
    project_yaml: string;
    quick_start: string;
    state: string;
    conversations: string;
    knowledge: string;
    tasks: string;
    artifacts: string;
    last_record_marker: string;
  };
  context_display_paths: {
    quick_start: string;
    state: string;
    conversations: string;
    knowledge: string;
    tasks: string;
    artifacts: string;
    last_record_marker: string;
  };
  routing: {
    external_surface: 'project';
    note: string;
  };
}

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function errorPayload(error: Error, requestedProject?: string): string {
  const message = error.message;
  const code = error instanceof ProjectResolveError ? error.code : 'UNKNOWN';
  const recovery = code === 'NOT_FOUND'
    ? [
        'Confirm the project name with agenticos_list.',
        'Use agenticos_project_ensure to create the project if this is a new durable topic/project.',
      ]
    : [
        'Do not fall back to agenticos_switch for read-only lookup.',
        'Repair the registry or .project.yaml identity mismatch before routing external work.',
      ];

  return toJson({
    status: 'ERROR',
    code,
    requested_project: requestedProject || null,
    error: message,
    recovery,
  });
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new ProjectResolveError('INVALID_INPUT', `${fieldName} must be a non-empty string.`);
  }

  if (containsControlCharacters(value)) {
    throw new ProjectResolveError('INVALID_INPUT', `${fieldName} must not contain control characters.`);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ProjectResolveError('INVALID_INPUT', `${fieldName} must be a non-empty string.`);
  }

  return trimmed;
}

function normalizeOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return normalizeRequiredString(value, fieldName);
}

function normalizeProjectKind(value: unknown): ProjectKind {
  if (value === undefined || value === null || value === '') {
    return 'project';
  }
  const validation = validateProjectKind('new project', {
    agenticos: { project_kind: value },
  });
  if (!validation.ok) {
    throw new ProjectResolveError('INVALID_INPUT', `${validation.message} Pass project_kind="topic" or project_kind="project".`);
  }
  return validation.project_kind;
}

function normalizeTopology(value: unknown): ProjectTopology {
  if (value === undefined || value === null || value === '') {
    return 'local_directory_only';
  }
  const topology = normalizeRequiredString(value, 'topology');
  if (topology !== 'local_directory_only' && topology !== 'github_versioned' && topology !== 'git_versioned') {
    throw new ProjectResolveError('INVALID_INPUT', 'topology must be "local_directory_only", "git_versioned", or legacy "github_versioned".');
  }
  return topology;
}

function normalizePublicationPolicy(topology: ProjectTopology, value: unknown): ContextPublicationPolicy {
  if (topology === 'local_directory_only') {
    if (value === undefined || value === null || value === '') {
      return 'local_private';
    }
    const policy = normalizeRequiredString(value, 'context_publication_policy');
    if (policy !== 'local_private') {
      throw new ProjectResolveError('INVALID_INPUT', 'context_publication_policy must be "local_private" when topology is "local_directory_only".');
    }
    return 'local_private';
  }

  const policy = normalizeRequiredString(value, 'context_publication_policy');
  if (policy !== 'private_continuity' && policy !== 'public_distilled') {
    throw new ProjectResolveError('INVALID_INPUT', `context_publication_policy must be "private_continuity" or "public_distilled" when topology is "${topology}".`);
  }
  return policy;
}

function isValidRepositorySlug(value: string): boolean {
  return /^[^/\s]+(?:\/[^/\s]+)+$/.test(value);
}

function normalizeRepositoryArg(topology: ProjectTopology, rawRepository: unknown, githubRepo?: string): GitRepositoryContract | undefined {
  if (topology === 'local_directory_only') {
    return undefined;
  }
  if (topology === 'github_versioned') {
    return githubRepo
      ? {
          provider: 'github',
          host: null,
          remote: 'origin',
          slug: normalizeRepositorySlug(githubRepo),
          default_base_branch: null,
          review_system: 'pull_request',
        }
      : undefined;
  }
  if (!rawRepository && githubRepo) {
    return {
      provider: 'github',
      host: null,
      remote: 'origin',
      slug: normalizeRepositorySlug(githubRepo),
      default_base_branch: null,
      review_system: 'pull_request',
    };
  }
  if (!rawRepository || typeof rawRepository !== 'object') {
    throw new ProjectResolveError('INVALID_INPUT', 'repository is required when topology is "git_versioned".');
  }
  const repository = rawRepository as Record<string, unknown>;
  const providerValue = normalizeRequiredString(repository.provider, 'repository.provider').toLowerCase();
  if (!isValidGitRepositoryProvider(providerValue)) {
    throw new ProjectResolveError('INVALID_INPUT', 'repository.provider must be "github", "gitlab", "gitee", or "generic".');
  }
  const provider = providerValue as GitRepositoryProvider;
  const hostValue = normalizeOptionalString(repository.host, 'repository.host');
  if (hostValue && !isValidRepositoryHost(hostValue)) {
    throw new ProjectResolveError('INVALID_INPUT', 'repository.host must be a hostname such as "gitlab.example.com" without scheme, port, or path.');
  }
  const slugValue = normalizeOptionalString(repository.slug, 'repository.slug');
  if (provider !== 'generic' && (!slugValue || !isValidRepositorySlug(slugValue))) {
    throw new ProjectResolveError('INVALID_INPUT', 'repository.slug must use a slash-delimited repository path when provider is not "generic".');
  }
  const remote = normalizeOptionalString(repository.remote, 'repository.remote') || 'origin';
  const reviewSystemValue = normalizeOptionalString(repository.review_system, 'repository.review_system');
  const reviewSystem = isValidGitReviewSystem(reviewSystemValue)
    ? reviewSystemValue
    : defaultReviewSystemForProvider(provider);
  return {
    provider,
    host: hostValue ? normalizeRepositoryHost(hostValue) : null,
    remote,
    slug: slugValue ? normalizeRepositorySlug(slugValue) : null,
    default_base_branch: normalizeOptionalString(repository.default_base_branch, 'repository.default_base_branch') || null,
    review_system: reviewSystem,
  };
}

function validateNewProjectName(name: string): void {
  const derivedId = name.toLowerCase().replace(/\s+/g, '-');
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(derivedId)) {
    throw new ProjectResolveError(
      'INVALID_INPUT',
      'Project name must derive to a filesystem-safe id. Use letters, numbers, spaces, underscores, or hyphens.',
    );
  }
}

function findProject(registry: Registry, requestedProject: string): Project {
  const matches = registry.projects.filter((candidate) =>
    candidate.id === requestedProject ||
    candidate.name === requestedProject ||
    candidate.path === requestedProject
  );

  if (matches.length === 0) {
    throw new ProjectResolveError('NOT_FOUND', `Project "${requestedProject}" not found in registry.`);
  }
  if (matches.length > 1) {
    throw new ProjectResolveError('AMBIGUOUS', `Project "${requestedProject}" is ambiguous in registry.`);
  }

  const project = matches[0];
  const sameId = registry.projects.filter((candidate) => candidate.id === project.id);
  if (sameId.length > 1) {
    throw new ProjectResolveError('AMBIGUOUS', `Project identity is ambiguous because registry id "${project.id}" is duplicated.`);
  }

  const samePath = registry.projects.filter((candidate) => candidate.path === project.path);
  if (samePath.length > 1) {
    throw new ProjectResolveError('AMBIGUOUS', `Project identity is ambiguous because registry path "${project.path}" is duplicated.`);
  }

  const sameName = registry.projects.filter((candidate) => candidate.name === project.name);
  if (sameName.length > 1) {
    throw new ProjectResolveError('AMBIGUOUS', `Project identity is ambiguous because registry name "${project.name}" is duplicated.`);
  }

  return project;
}

async function buildProjectPayload(args: {
  project: Project;
  status: ProjectPayload['status'];
  created: boolean;
}): Promise<ProjectPayload> {
  const { project, status, created } = args;
  const pathSecurity = validatePathSecurity(project.path);
  if (!pathSecurity.valid) {
    throw new ProjectResolveError('UNSAFE_PATH', `Project "${project.name}" has an unsafe registry path: ${pathSecurity.error}`);
  }

  const projectYamlPath = join(project.path, '.project.yaml');
  const identity = await loadAndVerifyManagedProjectIdentity(projectYamlPath, project.id);
  if (!identity.ok) {
    throw new ProjectResolveError('IDENTITY_UNPROVEN', identity.message);
  }
  const projectYaml = identity.projectYaml;
  // Identity is proven by id alone; registry name is a display name and may
  // legitimately diverge from .project.yaml meta.name.

  if (isArchivedReferenceProject(projectYaml, project.status)) {
    throw new ProjectResolveError(
      'ARCHIVED',
      `${buildArchivedReferenceMessage(project.name, projectYaml?.archive_contract?.replacement_project)} agenticos_project_resolve only works with active managed projects.`,
    );
  }

  const topologyValidation = validateManagedProjectTopology(project.name, projectYaml);
  if (!topologyValidation.ok) {
    throw new ProjectResolveError('UNNORMALIZED', `${topologyValidation.message} agenticos_project_resolve only works with normalized managed projects.`);
  }

  const policyValidation = validateContextPublicationPolicy(project.name, projectYaml);
  if (!policyValidation.ok) {
    throw new ProjectResolveError('UNNORMALIZED', policyValidation.message);
  }

  const projectKindValidation = validateProjectKind(project.name, projectYaml);
  if (!projectKindValidation.ok) {
    throw new ProjectResolveError('UNNORMALIZED', projectKindValidation.message);
  }

  const contextPaths = resolveManagedProjectContextPaths(project.path, projectYaml);
  const displayPaths = resolveManagedProjectContextDisplayPaths(projectYaml);

  return {
    status,
    created,
    project_id: project.id,
    name: project.name,
    project_kind: projectKindValidation.project_kind,
    topology: topologyValidation.topology,
    repository: resolveSourceControlRepository(projectYaml.source_control),
    context_publication_policy: policyValidation.policy,
    path: project.path,
    explicit_workdir: project.path,
    context_surface_paths: {
      project_yaml: projectYamlPath,
      quick_start: contextPaths.quickStartPath,
      state: contextPaths.statePath,
      conversations: contextPaths.conversationsDir,
      knowledge: contextPaths.knowledgeDir,
      tasks: contextPaths.tasksDir,
      artifacts: contextPaths.artifactsDir,
      last_record_marker: contextPaths.markerPath,
    },
    context_display_paths: {
      quick_start: displayPaths.quickStartPath,
      state: displayPaths.statePath,
      conversations: displayPaths.conversationsDir,
      knowledge: displayPaths.knowledgeDir,
      tasks: displayPaths.tasksDir,
      artifacts: displayPaths.artifactsDir,
      last_record_marker: displayPaths.markerPath,
    },
    routing: {
      external_surface: 'project',
      note: 'Assistant and optional channel integrations should surface topics and source projects as projects; project_kind remains available for internal routing.',
    },
  };
}

async function resolveProjectPayload(requestedProject: string, status: ProjectPayload['status'], created: boolean): Promise<ProjectPayload> {
  const registry = await loadRegistry();
  const project = findProject(registry, requestedProject);
  return buildProjectPayload({ project, status, created });
}

export async function runProjectResolve(args: ProjectResolveArgs = {}): Promise<string> {
  let requestedProject: string | undefined;
  try {
    requestedProject = normalizeRequiredString(args.project, 'project');
    const payload = await resolveProjectPayload(requestedProject, 'RESOLVED', false);
    return toJson(payload);
  } catch (error) {
    return errorPayload(error as Error, requestedProject);
  }
}

export async function runProjectEnsure(args: ProjectEnsureArgs = {}): Promise<string> {
  const lookupValue = args.project ?? args.name;
  let requestedProject: string | undefined;
  try {
    requestedProject = normalizeRequiredString(lookupValue, 'project');
    const requestedPath = normalizeOptionalString(args.path, 'path');
    if (requestedPath) {
      const pathSecurity = validatePathSecurity(requestedPath);
      if (!pathSecurity.valid) {
        throw new ProjectResolveError('UNSAFE_PATH', `Invalid project path: ${pathSecurity.error}`);
      }
    }

    try {
      const existing = await resolveProjectPayload(requestedProject, 'ENSURED', false);
      if (requestedPath && existing.path !== requestedPath) {
        throw new ProjectResolveError(
          'IDENTITY_UNPROVEN',
          `Existing project "${existing.project_id}" is registered at ${existing.path}, not requested path ${requestedPath}.`,
        );
      }
      return toJson(existing);
    } catch (error) {
      if (!(error instanceof ProjectResolveError) || error.code !== 'NOT_FOUND') {
        throw error;
      }
    }

    const name = normalizeRequiredString(args.name ?? args.project, 'name');
    validateNewProjectName(name);
    const description = normalizeOptionalString(args.description, 'description');
    const topology = normalizeTopology(args.topology);
    const contextPublicationPolicy = normalizePublicationPolicy(topology, args.context_publication_policy);
    const projectKind = normalizeProjectKind(args.project_kind);
    const githubRepo = normalizeOptionalString(args.github_repo, 'github_repo');
    const repository = normalizeRepositoryArg(topology, args.repository, githubRepo);

    await initProject({
      name,
      description,
      path: requestedPath,
      topology,
      context_publication_policy: contextPublicationPolicy,
      project_kind: projectKind,
      ...(githubRepo ? { github_repo: githubRepo } : {}),
      ...(repository ? { repository } : {}),
    });

    const created = await resolveProjectPayload(requestedPath || name, 'CREATED', true);
    return toJson(created);
  } catch (error) {
    return errorPayload(error as Error, requestedProject);
  }
}
