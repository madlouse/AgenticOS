import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, stat, utimes, writeFile } from 'fs/promises';
import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'yaml';
import { CURRENT_TEMPLATE_VERSION } from '../distill.js';
import { assessKnowledgeEvolutionHealth, buildKnowledgeEvolutionStatusLines } from '../knowledge-evolution-health.js';
import { saveDistillationLedger } from '../distillation-ledger.js';

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
    expect(result.distillation_ledger.status).toBe('MISSING');
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

  it('warns when captured ledger entries are stale and unprocessed', async () => {
    const projectRoot = await setupProject();
    await saveDistillationLedger('health-project', {
      version: '1.0.0',
      project_id: 'health-project',
      updated_at: now.toISOString(),
      entries: [{
        id: 'old-capture',
        project_id: 'health-project',
        status: 'captured',
        created_at: stale.toISOString(),
        updated_at: stale.toISOString(),
        captured_at: stale.toISOString(),
      }],
    }, now);

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
    expect(result.distillation_ledger.status).toBe('WARN');
    expect(result.distillation_ledger.stale_unprocessed_capture_count).toBe(1);
    expect(result.warnings).toContain('distillation ledger has 1 stale captured entry pending promotion');
    expect(result.recovery_actions).toContain('promote, convert, supersede, or explicitly ignore stale captured ledger entries');
    expect(buildKnowledgeEvolutionStatusLines(result)).toContain('   Distillation ledger: distillation ledger has 1 stale captured entry pending promotion');
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

  it('uses nested tracked file mtimes and session refresh fallback', async () => {
    const projectRoot = await setupProject({
      captureAt: recent,
      refreshAt: null,
      knowledgeAt: null,
      taskAt: null,
      agentsVersion: null,
    });
    await writeFile(join(projectRoot, 'standards', '.context', 'state.yaml'), yaml.stringify({
      session: { last_entry_surface_refresh: recent.toISOString() },
    }), 'utf-8');
    await mkdir(join(projectRoot, 'knowledge', 'nested'), { recursive: true });
    await touch(join(projectRoot, 'knowledge', 'nested', 'summary.markdown'), recent);
    await writeFile(join(projectRoot, 'knowledge', 'notes.txt'), 'ignored\n', 'utf-8');
    await writeFile(join(projectRoot, 'knowledge', 'README'), 'ignored\n', 'utf-8');
    await mkdir(join(projectRoot, 'tasks', 'nested'), { recursive: true });
    await touch(join(projectRoot, 'tasks', 'nested', 'task.json'), recent);

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

    expect(result.latest_entry_state_refresh_at).toBe(recent.toISOString());
    expect(result.latest_knowledge_update_at).toBe(recent.toISOString());
    expect(result.latest_task_update_at).toBe(recent.toISOString());
    expect(result.adapter_template_freshness.adapters.find((adapter) => adapter.path.endsWith('AGENTS.md'))?.status).toBe('missing');
    expect(result.warnings).toContain(`${join(projectRoot, 'AGENTS.md')} adapter template is missing`);
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

  it('warns when project yaml or state cannot be read and repo sync is unknown', async () => {
    home = await mkdtemp(join(tmpdir(), 'agenticos-knowledge-health-'));
    process.env.AGENTICOS_HOME = home;
    const projectRoot = join(home, 'projects', 'unreadable-project');
    await mkdir(projectRoot, { recursive: true });

    const result = await assessKnowledgeEvolutionHealth({
      projectPath: projectRoot,
      repoPath: projectRoot,
      now,
    });

    expect(result.status).toBe('WARN');
    expect(result.dirty_worktree.status).toBe('UNKNOWN');
    expect(result.registry_state_drift.summary).toContain('meta.id');
    expect(result.adapter_template_freshness.adapters.every((adapter) => adapter.status === 'missing')).toBe(true);
  });

  it('warns when the configured state file cannot be read', async () => {
    home = await mkdtemp(join(tmpdir(), 'agenticos-knowledge-health-'));
    process.env.AGENTICOS_HOME = home;
    const projectRoot = join(home, 'projects', 'missing-state-project');
    await mkdir(projectRoot, { recursive: true });
    await writeFile(join(projectRoot, '.project.yaml'), yaml.stringify({
      meta: { id: 'missing-state-project', name: 'Missing State Project' },
      agent_context: {
        current_state: 'standards/.context/state.yaml',
        knowledge: 'knowledge/',
        tasks: 'tasks/',
      },
    }), 'utf-8');

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

    expect(result.latest_entry_state_refresh_at).toBeNull();
    expect(result.warnings).toContain('entry-state refresh is missing');
  });

  it('handles null project/state yaml, invalid timestamps, absent repo sync input, and blank project ids', async () => {
    home = await mkdtemp(join(tmpdir(), 'agenticos-knowledge-health-'));
    process.env.AGENTICOS_HOME = home;
    const projectRoot = join(home, 'projects', 'null-surfaces-project');
    await mkdir(join(projectRoot, 'standards', '.context'), { recursive: true });
    await writeFile(join(projectRoot, '.project.yaml'), 'null\n', 'utf-8');
    await writeFile(join(projectRoot, 'standards', '.context', 'state.yaml'), 'null\n', 'utf-8');

    const nullYamlResult = await assessKnowledgeEvolutionHealth({
      projectPath: projectRoot,
      now,
    });
    expect(nullYamlResult.dirty_worktree.status).toBe('UNKNOWN');
    expect(nullYamlResult.registry_state_drift.summary).toContain('meta.id');

    const invalidTimestampResult = await assessKnowledgeEvolutionHealth({
      projectPath: projectRoot,
      projectYaml: { meta: { id: '   ' } },
      state: { entry_surface_refresh: { refreshed_at: 'not-a-date' } },
      repoSync: {
        branch_line: '## main...origin/main',
        branch_status: 'aligned',
        dirty_paths: [],
        runtime_dirty_paths: [],
        source_dirty_paths: [],
      },
      now,
    });
    expect(invalidTimestampResult.latest_entry_state_refresh_at).toBeNull();
    expect(invalidTimestampResult.registry_state_drift.summary).toContain('meta.id');

    await writeFile(join(projectRoot, '.project.yaml'), yaml.stringify({
      meta: { id: 'null-surfaces-project', name: 'Null Surfaces Project' },
      agent_context: { current_state: 'standards/.context/state.yaml' },
    }), 'utf-8');
    const nullStateResult = await assessKnowledgeEvolutionHealth({
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
    expect(nullStateResult.latest_entry_state_refresh_at).toBeNull();
  });

  it('warns when registry drift cannot be determined', async () => {
    const projectRoot = await setupProject();
    process.env.AGENTICOS_HOME = '';

    const result = await assessKnowledgeEvolutionHealth({
      projectPath: projectRoot,
      projectYaml: { meta: {}, agent_context: { current_state: 'standards/.context/state.yaml' } },
      state: {},
      repoSync: {
        branch_line: '## main...origin/main',
        branch_status: 'aligned',
        dirty_paths: [],
        runtime_dirty_paths: [],
        source_dirty_paths: [],
      },
      now,
    });

    expect(result.registry_state_drift.status).toBe('WARN');
    expect(result.registry_state_drift.summary).toBe('Registry/state drift could not be determined.');
  });

  it('reports null project_path when registry drift cannot be determined without a project path', async () => {
    home = await mkdtemp(join(tmpdir(), 'agenticos-knowledge-health-'));
    process.env.AGENTICOS_HOME = '';

    const result = await assessKnowledgeEvolutionHealth({
      projectPath: null,
      projectYaml: { meta: {} },
      state: {},
      repoSync: {
        branch_line: '## main...origin/main',
        branch_status: 'aligned',
        dirty_paths: [],
        runtime_dirty_paths: [],
        source_dirty_paths: [],
      },
      now,
    });

    expect(result.registry_state_drift.project_path).toBeNull();
    expect(result.registry_state_drift.summary).toBe('Registry/state drift could not be determined.');
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
