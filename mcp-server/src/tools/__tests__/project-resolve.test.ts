import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'yaml';
import { runProjectEnsure, runProjectResolve } from '../project-resolve.js';
import * as toolExports from '../index.js';

interface SeedProjectArgs {
  id: string;
  name: string;
  projectKind?: 'topic' | 'project' | null;
  topology?: 'local_directory_only' | 'github_versioned' | 'git_versioned';
  contextPublicationPolicy?: 'local_private' | 'private_continuity' | 'public_distilled';
  path?: string;
  status?: 'active' | 'archived';
}

let previousAgenticosHome: string | undefined;
let home: string;

function parseResult(value: string): any {
  return JSON.parse(value);
}

async function writeRegistry(projects: SeedProjectArgs[]): Promise<void> {
  await writeRegistryEntries(projects.map((project) => ({
    id: project.id,
    name: project.name,
    path: project.path || join(home, 'projects', project.id),
    status: project.status || 'active',
    created: '2026-05-22',
    last_accessed: '2026-05-22T00:00:00.000Z',
  })));
}

async function writeRegistryEntries(projects: any[]): Promise<void> {
  await mkdir(join(home, '.agent-workspace'), { recursive: true });
  await writeFile(
    join(home, '.agent-workspace', 'registry.yaml'),
    yaml.stringify({
      version: '1.0.0',
      last_updated: '2026-05-22T00:00:00.000Z',
      active_project: null,
      projects,
    }),
    'utf-8',
  );
}

async function seedProject(project: SeedProjectArgs): Promise<string> {
  const projectPath = project.path || join(home, 'projects', project.id);
  await mkdir(join(projectPath, '.context', 'conversations'), { recursive: true });
  await mkdir(join(projectPath, 'knowledge'), { recursive: true });
  await mkdir(join(projectPath, 'tasks'), { recursive: true });
  await mkdir(join(projectPath, 'artifacts'), { recursive: true });

  const projectYaml: any = {
    meta: {
      id: project.id,
      name: project.name,
      description: `${project.name} description`,
      created: '2026-05-22',
      version: '1.0.0',
    },
    source_control: {
      topology: project.topology || 'local_directory_only',
      context_publication_policy: project.contextPublicationPolicy || 'local_private',
    },
    agent_context: {
      quick_start: '.context/quick-start.md',
      current_state: '.context/state.yaml',
      conversations: '.context/conversations/',
      knowledge: 'knowledge/',
      tasks: 'tasks/',
      artifacts: 'artifacts/',
    },
  };

  if (project.projectKind !== null) {
    projectYaml.agenticos = { project_kind: project.projectKind || 'project' };
  }
  if (project.topology === 'github_versioned') {
    projectYaml.source_control.github_repo = 'madlouse/sample';
    projectYaml.source_control.branch_strategy = 'github_flow';
    projectYaml.execution = { source_repo_roots: ['.'] };
  }
  if (project.topology === 'git_versioned') {
    projectYaml.source_control.repository = {
      provider: 'gitlab',
      remote: 'origin',
      slug: 'group/sample',
      review_system: 'merge_request',
    };
    projectYaml.source_control.branch_strategy = 'issue_branch_review_merge';
    projectYaml.execution = { source_repo_roots: ['.'] };
  }

  await writeFile(join(projectPath, '.project.yaml'), yaml.stringify(projectYaml), 'utf-8');
  await writeFile(join(projectPath, '.context', 'state.yaml'), 'state: preserved\n', 'utf-8');
  await writeFile(join(projectPath, '.context', 'quick-start.md'), '# preserved quick start\n', 'utf-8');
  await writeFile(join(projectPath, 'CLAUDE.md'), '# preserved claude\n', 'utf-8');
  await writeFile(join(projectPath, 'AGENTS.md'), '# preserved agents\n', 'utf-8');

  return projectPath;
}

async function seedRawProject(id: string, name: string, projectYaml: any, projectPath = join(home, 'projects', id)): Promise<string> {
  await mkdir(projectPath, { recursive: true });
  await writeFile(join(projectPath, '.project.yaml'), yaml.stringify(projectYaml), 'utf-8');
  return projectPath;
}

async function snapshotContinuityFiles(projectPath: string): Promise<Record<string, string>> {
  const paths = [
    '.project.yaml',
    '.context/state.yaml',
    '.context/quick-start.md',
    'CLAUDE.md',
    'AGENTS.md',
  ];
  const entries = await Promise.all(
    paths.map(async (relativePath) => [relativePath, await readFile(join(projectPath, relativePath), 'utf-8')] as const),
  );
  return Object.fromEntries(entries);
}

beforeEach(async () => {
  previousAgenticosHome = process.env.AGENTICOS_HOME;
  home = await mkdtemp(join(tmpdir(), 'agenticos-project-resolve-'));
  process.env.AGENTICOS_HOME = home;
});

afterEach(async () => {
  if (previousAgenticosHome === undefined) {
    delete process.env.AGENTICOS_HOME;
  } else {
    process.env.AGENTICOS_HOME = previousAgenticosHome;
  }
  await rm(home, { recursive: true, force: true });
});

describe('AgenticOS project resolve/ensure MCP API', () => {
  it('exports project resolve tools from the public tools barrel', () => {
    expect(toolExports.runProjectResolve).toBe(runProjectResolve);
    expect(toolExports.runProjectEnsure).toBe(runProjectEnsure);
  });

  it('resolves an existing project by id without writing continuity files', async () => {
    const projectPath = await seedProject({
      id: 'agenticos',
      name: 'AgenticOS',
      projectKind: 'topic',
    });
    await writeRegistry([{ id: 'agenticos', name: 'AgenticOS', projectKind: 'topic', path: projectPath }]);
    const before = await snapshotContinuityFiles(projectPath);

    const result = parseResult(await runProjectResolve({ project: 'agenticos' }));

    expect(result.status).toBe('RESOLVED');
    expect(result.created).toBe(false);
    expect(result.project_id).toBe('agenticos');
    expect(result.name).toBe('AgenticOS');
    expect(result.project_kind).toBe('topic');
    expect(result.topology).toBe('local_directory_only');
    expect(result.path).toBe(projectPath);
    expect(result.explicit_workdir).toBe(projectPath);
    expect(result.context_surface_paths.state).toBe(join(projectPath, '.context/state.yaml'));
    expect(await snapshotContinuityFiles(projectPath)).toEqual(before);
  });

  it('resolves an existing project by registered path', async () => {
    const projectPath = await seedProject({
      id: 'path-project',
      name: 'Path Project',
    });
    await writeRegistry([{ id: 'path-project', name: 'Path Project', path: projectPath }]);

    const result = parseResult(await runProjectResolve({ project: projectPath }));

    expect(result.status).toBe('RESOLVED');
    expect(result.project_id).toBe('path-project');
  });

  it('returns actionable failure for an unknown project without falling back to switch', async () => {
    await writeRegistry([]);

    const result = parseResult(await runProjectResolve({ project: 'missing' }));

    expect(result.status).toBe('ERROR');
    expect(result.code).toBe('NOT_FOUND');
    expect(result.recovery.join(' ')).toContain('agenticos_project_ensure');
  });

  it('ensures an existing project without normalizing or rewriting files', async () => {
    const projectPath = await seedProject({
      id: 't5t',
      name: 'T5T',
      projectKind: 'project',
    });
    await writeRegistry([{ id: 't5t', name: 'T5T', projectKind: 'project', path: projectPath }]);
    const before = await snapshotContinuityFiles(projectPath);

    const result = parseResult(await runProjectEnsure({ project: 'T5T', description: 'new text should not rewrite' }));

    expect(result.status).toBe('ENSURED');
    expect(result.created).toBe(false);
    expect(result.project_id).toBe('t5t');
    expect(await snapshotContinuityFiles(projectPath)).toEqual(before);
  });

  it('creates a missing local private project with safe defaults', async () => {
    const result = parseResult(await runProjectEnsure({
      project: 'T5T Project',
      description: 'Durable topic/project for T5T writing.',
    }));

    const projectPath = join(home, 'projects', 't5t-project');
    expect(result.status).toBe('CREATED');
    expect(result.created).toBe(true);
    expect(result.project_id).toBe('t5t-project');
    expect(result.name).toBe('T5T Project');
    expect(result.project_kind).toBe('project');
    expect(result.topology).toBe('local_directory_only');
    expect(result.context_publication_policy).toBe('local_private');
    expect(result.path).toBe(projectPath);
    expect(yaml.parse(await readFile(join(projectPath, '.project.yaml'), 'utf-8')).source_control.context_publication_policy).toBe('local_private');
    expect(await readFile(join(projectPath, '.context', 'state.yaml'), 'utf-8')).toContain('session');
  });

  it('creates a missing topic project when explicitly requested', async () => {
    const result = parseResult(await runProjectEnsure({
      project: 'Sleep Topic',
      project_kind: 'topic',
    }));

    expect(result.status).toBe('CREATED');
    expect(result.project_id).toBe('sleep-topic');
    expect(result.project_kind).toBe('topic');
    expect(result.routing.external_surface).toBe('project');
  });

  it('creates projects with explicit local and github topology arguments', async () => {
    const local = parseResult(await runProjectEnsure({
      project: 'Local Explicit',
      context_publication_policy: 'local_private',
    }));
    expect(local.status).toBe('CREATED');
    expect(local.context_publication_policy).toBe('local_private');

    const github = parseResult(await runProjectEnsure({
      project: 'GitHub Project',
      topology: 'github_versioned',
      context_publication_policy: 'private_continuity',
      github_repo: 'madlouse/github-project',
    }));
    expect(github.status).toBe('CREATED');
    expect(github.topology).toBe('github_versioned');
    expect(github.context_publication_policy).toBe('private_continuity');
    expect(yaml.parse(await readFile(join(github.path, '.project.yaml'), 'utf-8')).source_control.github_repo).toBe('madlouse/github-project');

    const gitlab = parseResult(await runProjectEnsure({
      project: 'GitLab Project',
      topology: 'git_versioned',
      context_publication_policy: 'private_continuity',
      repository: {
        provider: 'gitlab',
        slug: 'group/subgroup/gitlab-project',
        review_system: 'pull_request',
      },
    }));
    expect(gitlab.status).toBe('CREATED');
    expect(gitlab.topology).toBe('git_versioned');
    expect(gitlab.repository).toEqual({
      provider: 'gitlab',
      host: null,
      remote: 'origin',
      slug: 'group/subgroup/gitlab-project',
      default_base_branch: null,
      review_system: 'pull_request',
    });
    expect(yaml.parse(await readFile(join(gitlab.path, '.project.yaml'), 'utf-8')).source_control.branch_strategy).toBe('issue_branch_review_merge');

    const shorthand = parseResult(await runProjectEnsure({
      project: 'GitHub Shorthand',
      topology: 'git_versioned',
      context_publication_policy: 'private_continuity',
      github_repo: 'madlouse/github-shorthand',
    }));
    expect(shorthand.status).toBe('CREATED');
    expect(shorthand.repository).toEqual({
      provider: 'github',
      host: null,
      remote: 'origin',
      slug: 'madlouse/github-shorthand',
      default_base_branch: null,
      review_system: 'pull_request',
    });

    const defaultReview = parseResult(await runProjectEnsure({
      project: 'Gitee Project',
      topology: 'git_versioned',
      context_publication_policy: 'private_continuity',
      repository: {
        provider: 'gitee',
        slug: 'owner/gitee-project',
      },
    }));
    expect(defaultReview.repository.review_system).toBe('pull_request');

    const generic = parseResult(await runProjectEnsure({
      project: 'Generic Git Project',
      topology: 'git_versioned',
      context_publication_policy: 'private_continuity',
      repository: {
        provider: 'generic',
      },
    }));
    expect(generic.repository).toEqual({
      provider: 'generic',
      host: null,
      remote: 'origin',
      slug: null,
      default_base_branch: null,
      review_system: 'none',
    });
  });

  it('supports name-only ensure calls for router-created projects', async () => {
    const result = parseResult(await runProjectEnsure({ name: 'Name Only' }));

    expect(result.status).toBe('CREATED');
    expect(result.project_id).toBe('name-only');
  });

  it('defaults legacy projects without agenticos.project_kind to project', async () => {
    const projectPath = await seedProject({
      id: 'legacy',
      name: 'Legacy',
      projectKind: null,
    });
    await writeRegistry([{ id: 'legacy', name: 'Legacy', projectKind: null, path: projectPath }]);

    const result = parseResult(await runProjectResolve({ project: 'Legacy' }));

    expect(result.status).toBe('RESOLVED');
    expect(result.project_kind).toBe('project');
  });

  it('fails closed for unsafe names, control characters, and mismatched paths', async () => {
    const missingArg = parseResult(await runProjectResolve({}));
    expect(missingArg.status).toBe('ERROR');
    expect(missingArg.code).toBe('INVALID_INPUT');

    const empty = parseResult(await runProjectResolve({ project: '   ' }));
    expect(empty.status).toBe('ERROR');
    expect(empty.code).toBe('INVALID_INPUT');

    const unsafeName = parseResult(await runProjectEnsure({ project: 'Bad/Name' }));
    expect(unsafeName.status).toBe('ERROR');
    expect(unsafeName.code).toBe('INVALID_INPUT');
    expect(unsafeName.error).toContain('filesystem-safe');

    const control = parseResult(await runProjectResolve({ project: 'agenticos\n' }));
    expect(control.status).toBe('ERROR');
    expect(control.code).toBe('INVALID_INPUT');

    const projectPath = await seedProject({
      id: 'agenticos',
      name: 'AgenticOS',
    });
    await writeRegistry([{ id: 'agenticos', name: 'AgenticOS', path: projectPath }]);

    const mismatchedPath = parseResult(await runProjectEnsure({
      project: 'agenticos',
      path: join(home, 'projects', 'other'),
    }));
    expect(mismatchedPath.status).toBe('ERROR');
    expect(mismatchedPath.code).toBe('IDENTITY_UNPROVEN');

    const unsafePath = parseResult(await runProjectEnsure({
      project: 'Unsafe Path',
      path: 'relative/path',
    }));
    expect(unsafePath.status).toBe('ERROR');
    expect(unsafePath.code).toBe('UNSAFE_PATH');
  });

  it('fails closed for invalid creation metadata', async () => {
    const invalidKind = parseResult(await runProjectEnsure({ project: 'Bad Kind', project_kind: 'workflow' }));
    expect(invalidKind.status).toBe('ERROR');
    expect(invalidKind.code).toBe('INVALID_INPUT');
    expect(invalidKind.error).toContain('agenticos.project_kind');

    const invalidTopology = parseResult(await runProjectEnsure({ project: 'Bad Topology', topology: 'svn' }));
    expect(invalidTopology.status).toBe('ERROR');
    expect(invalidTopology.code).toBe('INVALID_INPUT');
    expect(invalidTopology.error).toContain('topology');

    const invalidLocalPolicy = parseResult(await runProjectEnsure({
      project: 'Bad Local Policy',
      context_publication_policy: 'private_continuity',
    }));
    expect(invalidLocalPolicy.status).toBe('ERROR');
    expect(invalidLocalPolicy.code).toBe('INVALID_INPUT');
    expect(invalidLocalPolicy.error).toContain('local_private');

    const invalidGithubPolicy = parseResult(await runProjectEnsure({
      project: 'Bad GitHub Policy',
      topology: 'github_versioned',
      context_publication_policy: 'local_private',
      github_repo: 'madlouse/bad-github-policy',
    }));
    expect(invalidGithubPolicy.status).toBe('ERROR');
    expect(invalidGithubPolicy.code).toBe('INVALID_INPUT');
    expect(invalidGithubPolicy.error).toContain('private_continuity');

    const missingGithubRepo = parseResult(await runProjectEnsure({
      project: 'Missing GitHub Repo',
      topology: 'github_versioned',
      context_publication_policy: 'private_continuity',
    }));
    expect(missingGithubRepo.status).toBe('ERROR');
    expect(missingGithubRepo.code).toBe('UNKNOWN');
    expect(missingGithubRepo.error).toContain('github_repo is required');

    const missingRepository = parseResult(await runProjectEnsure({
      project: 'Missing Repository',
      topology: 'git_versioned',
      context_publication_policy: 'private_continuity',
    }));
    expect(missingRepository.status).toBe('ERROR');
    expect(missingRepository.code).toBe('INVALID_INPUT');
    expect(missingRepository.error).toContain('repository is required');

    const invalidRepositoryProvider = parseResult(await runProjectEnsure({
      project: 'Invalid Provider',
      topology: 'git_versioned',
      context_publication_policy: 'private_continuity',
      repository: {
        provider: 'bitbucket',
        slug: 'owner/repo',
      },
    }));
    expect(invalidRepositoryProvider.status).toBe('ERROR');
    expect(invalidRepositoryProvider.code).toBe('INVALID_INPUT');
    expect(invalidRepositoryProvider.error).toContain('repository.provider');

    const invalidRepositorySlug = parseResult(await runProjectEnsure({
      project: 'Invalid Slug',
      topology: 'git_versioned',
      context_publication_policy: 'private_continuity',
      repository: {
        provider: 'gitee',
        slug: 'not-a-repo',
      },
    }));
    expect(invalidRepositorySlug.status).toBe('ERROR');
    expect(invalidRepositorySlug.code).toBe('INVALID_INPUT');
    expect(invalidRepositorySlug.error).toContain('repository.slug');
  });

  it('fails closed for ambiguous registry identities', async () => {
    const firstPath = await seedProject({ id: 'one', name: 'Duplicate' });
    const secondPath = await seedProject({ id: 'two', name: 'Duplicate' });
    await writeRegistry([
      { id: 'one', name: 'Duplicate', path: firstPath },
      { id: 'two', name: 'Duplicate', path: secondPath },
    ]);
    expect(parseResult(await runProjectResolve({ project: 'Duplicate' })).code).toBe('AMBIGUOUS');

    await writeRegistry([
      { id: 'one', name: 'One', path: firstPath },
      { id: 'two', name: 'Two', path: firstPath },
    ]);
    expect(parseResult(await runProjectResolve({ project: 'one' })).code).toBe('AMBIGUOUS');

    await seedProject({ id: 'same-id', name: 'Same Id One', path: firstPath });
    await seedProject({ id: 'same-id', name: 'Same Id Two', path: secondPath });
    await writeRegistry([
      { id: 'same-id', name: 'Same Id One', path: firstPath },
      { id: 'same-id', name: 'Same Id Two', path: secondPath },
    ]);
    expect(parseResult(await runProjectResolve({ project: firstPath })).code).toBe('AMBIGUOUS');

    await seedProject({ id: 'same-name-one', name: 'Same Name', path: firstPath });
    await seedProject({ id: 'same-name-two', name: 'Same Name', path: secondPath });
    await writeRegistry([
      { id: 'same-name-one', name: 'Same Name', path: firstPath },
      { id: 'same-name-two', name: 'Same Name', path: secondPath },
    ]);
    expect(parseResult(await runProjectResolve({ project: firstPath })).code).toBe('AMBIGUOUS');
  });

  it('fails closed when registry identity cannot be proven from project yaml', async () => {
    const unsafeRegistryPath = `${home}/bad\npath`;
    await writeRegistryEntries([{
      id: 'unsafe',
      name: 'Unsafe',
      path: unsafeRegistryPath,
      status: 'active',
      created: '2026-05-22',
      last_accessed: '2026-05-22T00:00:00.000Z',
    }]);
    expect(parseResult(await runProjectResolve({ project: 'unsafe' })).code).toBe('UNSAFE_PATH');

    const missingYamlPath = join(home, 'projects', 'missing-yaml');
    await mkdir(missingYamlPath, { recursive: true });
    await writeRegistry([{ id: 'missing-yaml', name: 'Missing Yaml', path: missingYamlPath }]);
    expect(parseResult(await runProjectResolve({ project: 'missing-yaml' })).code).toBe('IDENTITY_UNPROVEN');

    const missingMetaPath = await seedRawProject('missing-meta', 'Missing Meta', null);
    await writeRegistry([{ id: 'missing-meta', name: 'Missing Meta', path: missingMetaPath }]);
    expect(parseResult(await runProjectResolve({ project: 'missing-meta' })).code).toBe('IDENTITY_UNPROVEN');

    const idMismatchPath = await seedRawProject('id-mismatch', 'Id Mismatch', {
      meta: { id: 'other', name: 'Id Mismatch' },
      source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
    });
    await writeRegistry([{ id: 'id-mismatch', name: 'Id Mismatch', path: idMismatchPath }]);
    expect(parseResult(await runProjectResolve({ project: 'id-mismatch' })).code).toBe('IDENTITY_UNPROVEN');

    // Display-name divergence is allowed: identity is proven by id alone.
    const nameMismatchPath = await seedRawProject('name-mismatch', 'Name Mismatch', {
      meta: { id: 'name-mismatch', name: 'Other Name' },
      source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
    });
    await writeRegistry([{ id: 'name-mismatch', name: 'Name Mismatch', path: nameMismatchPath }]);
    expect(parseResult(await runProjectResolve({ project: 'name-mismatch' })).status).toBe('RESOLVED');
  });

  it('fails closed for archived or unnormalized projects', async () => {
    const archivedPath = await seedProject({ id: 'archived', name: 'Archived', status: 'archived' });
    await writeRegistry([{ id: 'archived', name: 'Archived', path: archivedPath, status: 'archived' }]);
    expect(parseResult(await runProjectResolve({ project: 'archived' })).code).toBe('ARCHIVED');

    const archivedReplacementPath = await seedRawProject('archived-replacement', 'Archived Replacement', {
      meta: { id: 'archived-replacement', name: 'Archived Replacement' },
      source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
      archive_contract: { kind: 'archived_reference', replacement_project: 'active-project' },
    });
    await writeRegistry([{ id: 'archived-replacement', name: 'Archived Replacement', path: archivedReplacementPath }]);
    const archivedReplacement = parseResult(await runProjectResolve({ project: 'archived-replacement' }));
    expect(archivedReplacement.code).toBe('ARCHIVED');
    expect(archivedReplacement.error).toContain('active-project');

    const missingTopologyPath = await seedRawProject('missing-topology', 'Missing Topology', {
      meta: { id: 'missing-topology', name: 'Missing Topology' },
    });
    await writeRegistry([{ id: 'missing-topology', name: 'Missing Topology', path: missingTopologyPath }]);
    expect(parseResult(await runProjectResolve({ project: 'missing-topology' })).code).toBe('UNNORMALIZED');

    const invalidPolicyPath = await seedRawProject('invalid-policy', 'Invalid Policy', {
      meta: { id: 'invalid-policy', name: 'Invalid Policy' },
      source_control: { topology: 'local_directory_only', context_publication_policy: 'public_distilled' },
    });
    await writeRegistry([{ id: 'invalid-policy', name: 'Invalid Policy', path: invalidPolicyPath }]);
    expect(parseResult(await runProjectResolve({ project: 'invalid-policy' })).code).toBe('UNNORMALIZED');

    const invalidKindPath = await seedRawProject('invalid-kind', 'Invalid Kind', {
      meta: { id: 'invalid-kind', name: 'Invalid Kind' },
      source_control: { topology: 'local_directory_only', context_publication_policy: 'local_private' },
      agenticos: { project_kind: 'workflow' },
    });
    await writeRegistry([{ id: 'invalid-kind', name: 'Invalid Kind', path: invalidKindPath }]);
    expect(parseResult(await runProjectResolve({ project: 'invalid-kind' })).code).toBe('UNNORMALIZED');
  });
});
