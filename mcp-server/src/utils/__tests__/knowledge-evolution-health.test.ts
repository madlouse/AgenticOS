import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, stat, utimes, writeFile } from 'fs/promises';
import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'yaml';
import { CURRENT_TEMPLATE_VERSION } from '../distill.js';
import { assessKnowledgeEvolutionHealth, buildKnowledgeEvolutionStatusLines } from '../knowledge-evolution-health.js';

const originalHome = process.env.AGENTICOS_HOME;
const now = new Date('2026-05-21T00:00:00.000Z');
const recent = new Date('2026-05-20T00:00:00.000Z');
const stale = new Date('2026-04-01T00:00:00.000Z');

let home: string | null = null;

async function touch(path: string, date: Date): Promise<void> {
  await writeFile(path, `updated ${date.toISOString()}\n`, 'utf-8');
  await utimes(path, date, date);
}

async function writeRegistry(projectRoot: string, options: { activeProject?: string | null; path?: string } = {}): Promise<void> {
  await mkdir(join(home!, '.agent-workspace'), { recursive: true });
  await writeFile(join(home!, '.agent-workspace', 'registry.yaml'), yaml.stringify({
    version: '1.0.0',
    last_updated: now.toISOString(),
    active_project: options.activeProject === undefined ? 'health-project' : options.activeProject,
    projects: [{
      id: 'health-project',
      name: 'Health Project',
      path: options.path ?? projectRoot,
      status: 'active',
      created: '2026-01-01',
      last_accessed: now.toISOString(),
    }],
  }), 'utf-8');
}

async function setupProject(options: {
  captureAt?: Date | null;
  refreshAt?: Date | null;
  knowledgeAt?: Date | null;
  taskAt?: Date | null;
  claudeVersion?: number | null;
  agentsVersion?: number | null;
  registryActiveProject?: string | null;
  registryPath?: string;
} = {}): Promise<string> {
  home = await mkdtemp(join(tmpdir(), 'agenticos-knowledge-health-'));
  process.env.AGENTICOS_HOME = home;
  const projectRoot = join(home, 'projects', 'health-project');
  await mkdir(join(projectRoot, 'standards', '.context'), { recursive: true });
  await mkdir(join(projectRoot, 'knowledge'), { recursive: true });
  await mkdir(join(projectRoot, 'tasks'), { recursive: true });
  await writeFile(join(projectRoot, '.project.yaml'), yaml.stringify({
    meta: { id: 'health-project', name: 'Health Project' },
    source_control: { topology: 'github_versioned', context_publication_policy: 'public_distilled' },
    agent_context: {
      current_state: 'standards/.context/state.yaml',
      knowledge: 'knowledge/',
      tasks: 'tasks/',
    },
  }), 'utf-8');
  await writeFile(join(projectRoot, 'standards', '.context', 'state.yaml'), yaml.stringify({
    entry_surface_refresh: options.refreshAt === null ? {} : { refreshed_at: (options.refreshAt ?? recent).toISOString() },
  }), 'utf-8');

  if (options.captureAt !== null) {
    const captureDir = join(home, '.agent-workspace', 'projects', 'health-project', 'captures', 'conversations');
    await mkdir(captureDir, { recursive: true });
    await touch(join(captureDir, '2026-05-20.md'), options.captureAt ?? recent);
  }
  if (options.knowledgeAt !== null) {
    await touch(join(projectRoot, 'knowledge', 'summary.md'), options.knowledgeAt ?? recent);
  }
  if (options.taskAt !== null) {
    await touch(join(projectRoot, 'tasks', 'task.yaml'), options.taskAt ?? recent);
  }

  if (options.claudeVersion !== null) {
    await writeFile(join(projectRoot, 'CLAUDE.md'), `<!-- agenticos-template: v${options.claudeVersion ?? CURRENT_TEMPLATE_VERSION} -->\n`, 'utf-8');
  }
  if (options.agentsVersion !== null) {
    await writeFile(join(projectRoot, 'AGENTS.md'), `<!-- agenticos-template: v${options.agentsVersion ?? CURRENT_TEMPLATE_VERSION} -->\n`, 'utf-8');
  }
  await writeRegistry(projectRoot, {
    activeProject: options.registryActiveProject,
    path: options.registryPath,
  });
  return projectRoot;
}

afterEach(() => {
  process.env.AGENTICOS_HOME = originalHome;
  if (home) rmSync(home, { recursive: true, force: true });
  home = null;
});

describe('knowledge evolution health', () => {
  it('passes when capture, entry refresh, knowledge, tasks, adapters, registry, and worktree are fresh', async () => {
    const projectRoot = await setupProject();
    const result = await assessKnowledgeEvolutionHealth({
      projectPath: projectRoot,
      repoSync: {
        branch_line: '## main...origin/main',
        branch_status: 'aligned',
        dirty_paths: [],
        runtime_dirty_paths: [],
        source_dirty_paths: [],
      },
      now,
    });

    expect(result.status).toBe('PASS');
    expect(result.summary).toBe('Knowledge evolution signals are fresh.');
    expect(result.latest_sidecar_capture_at).toBe(recent.toISOString());
    expect(result.latest_entry_state_refresh_at).toBe(recent.toISOString());
    expect(result.latest_knowledge_update_at).toBe(recent.toISOString());
    expect(result.latest_task_update_at).toBe(recent.toISOString());
    expect(result.dirty_worktree.status).toBe('PASS');
    expect(result.registry_state_drift.status).toBe('PASS');
    expect(result.adapter_template_freshness.adapters.every((adapter) => adapter.status === 'current')).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(buildKnowledgeEvolutionStatusLines(result)[0]).toContain('Knowledge evolution: PASS');
  });

  it('warns when freshness signals are stale', async () => {
    const projectRoot = await setupProject({
      captureAt: stale,
      refreshAt: stale,
      knowledgeAt: stale,
      taskAt: stale,
    });
    const result = await assessKnowledgeEvolutionHealth({
      projectPath: projectRoot,
      repoSync: {
        branch_line: '## main...origin/main',
        branch_status: 'aligned',
        dirty_paths: [],
        runtime_dirty_paths: [],
        source_dirty_paths: [],
      },
      now,
    });

    expect(result.status).toBe('WARN');
    expect(result.warnings).toEqual(expect.arrayContaining([
      'sidecar capture is stale',
      'entry-state refresh is stale',
      'knowledge update is stale',
      'task update is stale',
    ]));
  });

  it('warns for a missing sidecar capture without blocking', async () => {
    const projectRoot = await setupProject({ captureAt: null });
    const result = await assessKnowledgeEvolutionHealth({
      projectPath: projectRoot,
      repoSync: {
        branch_line: '## main...origin/main',
        branch_status: 'aligned',
        dirty_paths: [],
        runtime_dirty_paths: [],
        source_dirty_paths: [],
      },
      now,
    });

    expect(result.status).toBe('WARN');
    expect(result.warnings).toContain('sidecar capture is missing');
    expect(result.summary).toContain('warning');
  });

  it('warns for dirty worktree summaries', async () => {
    const projectRoot = await setupProject();
    const result = await assessKnowledgeEvolutionHealth({
      projectPath: projectRoot,
      repoSync: {
        branch_line: '## main...origin/main',
        branch_status: 'aligned',
        dirty_paths: ['standards/.context/state.yaml', 'README.md'],
        runtime_dirty_paths: ['standards/.context/state.yaml'],
        source_dirty_paths: ['README.md'],
      },
      now,
    });

    expect(result.status).toBe('WARN');
    expect(result.dirty_worktree).toMatchObject({
      status: 'WARN',
      dirty_path_count: 2,
      runtime_dirty_path_count: 1,
      source_dirty_path_count: 1,
    });
    expect(result.warnings).toContain('Dirty worktree has 2 path(s): runtime 1, source 1.');
  });

  it('warns for stale adapter templates', async () => {
    const projectRoot = await setupProject({ claudeVersion: CURRENT_TEMPLATE_VERSION - 1 });
    const result = await assessKnowledgeEvolutionHealth({
      projectPath: projectRoot,
      repoSync: {
        branch_line: '## main...origin/main',
        branch_status: 'aligned',
        dirty_paths: [],
        runtime_dirty_paths: [],
        source_dirty_paths: [],
      },
      now,
    });

    expect(result.adapter_template_freshness.adapters.find((adapter) => adapter.path.endsWith('CLAUDE.md'))?.status).toBe('stale');
    expect(result.warnings.some((warning) => warning.includes('CLAUDE.md'))).toBe(true);
  });

  it('warns for registry/state drift', async () => {
    const projectRoot = await setupProject({
      registryActiveProject: 'other-project',
    });
    await writeRegistry(projectRoot, {
      activeProject: 'other-project',
      path: join(projectRoot, '..', 'wrong-path'),
    });
    const result = await assessKnowledgeEvolutionHealth({
      projectPath: projectRoot,
      repoSync: {
        branch_line: '## main...origin/main',
        branch_status: 'aligned',
        dirty_paths: [],
        runtime_dirty_paths: [],
        source_dirty_paths: [],
      },
      now,
    });

    expect(result.status).toBe('WARN');
    expect(result.registry_state_drift.status).toBe('WARN');
    expect(result.registry_state_drift.summary).toContain('active_project');
    expect(result.registry_state_drift.summary).toContain('registry path differs');
  });

  it('reports unknowns for missing project context and can derive dirty status from git', async () => {
    home = await mkdtemp(join(tmpdir(), 'agenticos-knowledge-health-'));
    process.env.AGENTICOS_HOME = home;
    const repo = join(home, 'repo');
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, 'README.md'), 'dirty\n', 'utf-8');
    await execFile('git init', repo);

    const result = await assessKnowledgeEvolutionHealth({
      projectPath: null,
      repoPath: repo,
      now,
    });

    expect(result.status).toBe('WARN');
    expect(result.dirty_worktree.status).toBe('WARN');
    expect(result.registry_state_drift.summary).toContain('meta.id');
    expect(result.adapter_template_freshness.adapters.every((adapter) => adapter.status === 'missing')).toBe(true);
    expect(buildKnowledgeEvolutionStatusLines(result).some((line) => line.includes('Adapter templates'))).toBe(true);
  });
});

async function execFile(command: string, cwd: string): Promise<void> {
  const { exec } = await import('child_process');
  await new Promise<void>((resolve, reject) => {
    exec(command, { cwd }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
