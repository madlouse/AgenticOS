import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'yaml';
import { runMigrateProject } from '../migration-project.js';
import { clearSessionProjectBinding } from '../../utils/session-context.js';

async function writeRegistry(home: string, registry: unknown): Promise<void> {
  await mkdir(join(home, '.agent-workspace'), { recursive: true });
  await writeFile(join(home, '.agent-workspace', 'registry.yaml'), yaml.stringify(registry), 'utf-8');
}

async function createProject(
  home: string,
  id: string,
  options?: {
    name?: string;
    projectYaml?: any;
    stateYaml?: any;
  },
): Promise<string> {
  const projectRoot = join(home, 'projects', id);
  await mkdir(join(projectRoot, '.context'), { recursive: true });

  const projectYaml = options?.projectYaml ?? {
    meta: {
      id,
      name: options?.name || id,
    },
    source_control: {
      topology: 'local_directory_only',
      context_publication_policy: 'local_private',
    },
  };
  const stateYaml = options?.stateYaml ?? {
    session: {},
    working_memory: { facts: [], decisions: [], pending: [] },
  };

  await writeFile(join(projectRoot, '.project.yaml'), yaml.stringify(projectYaml), 'utf-8');
  await writeFile(join(projectRoot, '.context', 'state.yaml'), yaml.stringify(stateYaml), 'utf-8');
  await writeFile(join(projectRoot, '.context', 'quick-start.md'), '# Quick Start\n', 'utf-8');
  return projectRoot;
}

describe('migration project planner', () => {
  afterEach(() => {
    clearSessionProjectBinding();
    delete process.env.AGENTICOS_HOME;
  });

  it('builds a deterministic plan for safe registry repairs', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-migrate-project-'));
    process.env.AGENTICOS_HOME = home;

    const projectRoot = await createProject(home, 'sample-project', {
      name: 'Sample Project',
    });

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: 'sample-project',
      projects: [
        {
          id: 'sample-project',
          name: 'Sample Project',
          path: projectRoot,
          status: 'active',
          created: '2026-04-10',
        },
      ],
    });

    const first = JSON.parse(await runMigrateProject({
      project: 'sample-project',
      mode: 'plan',
    })) as {
      status: string;
      apply_ready: boolean;
      plan_hash: string | null;
      planned_actions: Array<{ id: string }>;
      manual_blocks: Array<{ code: string }>;
      notes: string[];
    };
    const second = JSON.parse(await runMigrateProject({
      project: 'sample-project',
      mode: 'plan',
    })) as {
      plan_hash: string | null;
      planned_actions: Array<{ id: string }>;
    };

    expect(first.status).toBe('READY');
    expect(first.apply_ready).toBe(true);
    expect(first.plan_hash).toBeTruthy();
    expect(first.plan_hash).toBe(second.plan_hash);
    expect(first.planned_actions.map((action) => action.id)).toEqual([
      'registry.backfill_last_accessed',
      'registry.clear_legacy_active_project',
      'registry.normalize_project_path',
    ]);
    expect(first.manual_blocks).toHaveLength(0);
    expect(first.notes.join(' ')).toContain('deterministic migration plan');
  });

  it('blocks plan mode when explicit structural/manual issues remain', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-migrate-project-'));
    process.env.AGENTICOS_HOME = home;

    await createProject(home, 'broken-project', {
      name: 'Broken Project',
      projectYaml: {
        meta: {
          id: 'broken-project',
          name: 'Broken Project',
        },
      },
    });

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: null,
      projects: [
        {
          id: 'broken-project',
          name: 'Broken Project',
          path: 'projects/broken-project',
          status: 'active',
          created: '2026-04-10',
          last_accessed: new Date().toISOString(),
        },
      ],
    });

    const result = JSON.parse(await runMigrateProject({
      project: 'broken-project',
      mode: 'plan',
    })) as {
      status: string;
      apply_ready: boolean;
      manual_blocks: Array<{ code: string }>;
      block_reasons: string[];
    };

    expect(result.status).toBe('BLOCK');
    expect(result.apply_ready).toBe(false);
    expect(result.manual_blocks.map((block) => block.code)).toContain('topology_contract_invalid');
    expect(result.block_reasons.join(' ')).toContain('topology');
  });

  it('requires an explicit target for migrate_project plan mode', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-migrate-project-'));
    process.env.AGENTICOS_HOME = home;

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: null,
      projects: [],
    });

    const result = JSON.parse(await runMigrateProject({
      mode: 'plan',
    })) as {
      status: string;
      block_reasons: string[];
    };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons[0]).toContain('requires an explicit project');
  });

  it('fails closed for apply mode in the current phase-2 slice', async () => {
    const result = JSON.parse(await runMigrateProject({
      mode: 'apply',
      project: 'anything',
    })) as {
      status: string;
      block_reasons: string[];
    };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons[0]).toContain('apply mode is not implemented yet');
  });

  it('supports safe_repairs_only planning scope', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-migrate-project-'));
    process.env.AGENTICOS_HOME = home;

    const projectRoot = await createProject(home, 'scoped-project', {
      name: 'Scoped Project',
    });

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: 'scoped-project',
      projects: [
        {
          id: 'scoped-project',
          name: 'Scoped Project',
          path: projectRoot,
          status: 'active',
          created: '2026-04-10',
        },
      ],
    });

    const result = JSON.parse(await runMigrateProject({
      project: 'scoped-project',
      mode: 'plan',
      apply_scope: 'safe_repairs_only',
    })) as {
      status: string;
      apply_scope: string;
      preconditions: { apply_scope: string } | null;
      planned_actions: Array<{ actionability: string }>;
    };

    expect(result.status).toBe('READY');
    expect(result.apply_scope).toBe('safe_repairs_only');
    expect(result.preconditions?.apply_scope).toBe('safe_repairs_only');
    expect(result.planned_actions.every((action) => action.actionability === 'safe_repair')).toBe(true);
  });
});
