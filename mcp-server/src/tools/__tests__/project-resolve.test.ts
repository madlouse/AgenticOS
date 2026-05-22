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
  topology?: 'local_directory_only' | 'github_versioned';
  contextPublicationPolicy?: 'local_private' | 'private_continuity' | 'public_distilled';
  path?: string;
}

let previousAgenticosHome: string | undefined;
let home: string;

function parseResult(value: string): any {
  return JSON.parse(value);
}

async function writeRegistry(projects: SeedProjectArgs[]): Promise<void> {
  await mkdir(join(home, '.agent-workspace'), { recursive: true });
  await writeFile(
    join(home, '.agent-workspace', 'registry.yaml'),
    yaml.stringify({
      version: '1.0.0',
      last_updated: '2026-05-22T00:00:00.000Z',
      active_project: null,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        path: project.path || join(home, 'projects', project.id),
        status: 'active',
        created: '2026-05-22',
        last_accessed: '2026-05-22T00:00:00.000Z',
      })),
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

  await writeFile(join(projectPath, '.project.yaml'), yaml.stringify(projectYaml), 'utf-8');
  await writeFile(join(projectPath, '.context', 'state.yaml'), 'state: preserved\n', 'utf-8');
  await writeFile(join(projectPath, '.context', 'quick-start.md'), '# preserved quick start\n', 'utf-8');
  await writeFile(join(projectPath, 'CLAUDE.md'), '# preserved claude\n', 'utf-8');
  await writeFile(join(projectPath, 'AGENTS.md'), '# preserved agents\n', 'utf-8');

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
  });
});
