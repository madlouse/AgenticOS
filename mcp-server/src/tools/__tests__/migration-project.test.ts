import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
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

  it('requires expected_plan_hash for apply mode', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-migrate-project-'));
    process.env.AGENTICOS_HOME = home;

    const projectRoot = await createProject(home, 'apply-project', {
      name: 'Apply Project',
    });

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: 'apply-project',
      projects: [
        {
          id: 'apply-project',
          name: 'Apply Project',
          path: projectRoot,
          status: 'active',
          created: '2026-04-10',
        },
      ],
    });

    const result = JSON.parse(await runMigrateProject({
      mode: 'apply',
      project: 'apply-project',
    })) as {
      status: string;
      block_reasons: string[];
    };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons[0]).toContain('expected_plan_hash is required');
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

  it('applies deterministic safe repairs and writes migration evidence', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-migrate-project-'));
    process.env.AGENTICOS_HOME = home;

    const projectRoot = await createProject(home, 'apply-project', {
      name: 'Apply Project',
      stateYaml: {
        session: {},
        working_memory: { facts: [], decisions: [], pending: [] },
      },
    });

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: 'apply-project',
      projects: [
        {
          id: 'apply-project',
          name: 'Apply Project',
          path: projectRoot,
          status: 'active',
          created: '2026-04-10',
        },
      ],
    });

    const planned = JSON.parse(await runMigrateProject({
      project: 'apply-project',
      mode: 'plan',
    })) as {
      status: string;
      plan_hash: string;
    };

    const applied = JSON.parse(await runMigrateProject({
      project: 'apply-project',
      mode: 'apply',
      expected_plan_hash: planned.plan_hash,
    })) as {
      status: string;
      applied_actions: Array<{ id: string }>;
      evidence_paths: string[];
      post_audit_status: string;
    };

    const registry = yaml.parse(await readFile(join(home, '.agent-workspace', 'registry.yaml'), 'utf-8')) as any;
    const state = yaml.parse(await readFile(join(projectRoot, '.context', 'state.yaml'), 'utf-8')) as any;
    const reportPath = applied.evidence_paths.find((path) => path.includes('/artifacts/migrations/'));
    if (!reportPath) {
      throw new Error('expected migration report path to be written');
    }
    const report = yaml.parse(await readFile(reportPath, 'utf-8')) as any;

    expect(applied.status).toBe('APPLIED');
    expect(applied.applied_actions.map((action) => action.id)).toEqual([
      'registry.backfill_last_accessed',
      'registry.clear_legacy_active_project',
      'registry.normalize_project_path',
    ]);
    expect(applied.post_audit_status).toBe('PASS');
    expect(registry.active_project).toBeNull();
    expect(registry.projects[0].path).toBe('projects/apply-project');
    expect(typeof registry.projects[0].last_accessed).toBe('string');
    expect(state.migrations.latest.report_path).toContain('artifacts/migrations/');
    expect(report.plan_hash).toBe(planned.plan_hash);
    expect(report.applied_actions).toHaveLength(3);
  });

  it('blocks apply when the reviewed plan hash is stale', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-migrate-project-'));
    process.env.AGENTICOS_HOME = home;

    const projectRoot = await createProject(home, 'stale-project', {
      name: 'Stale Project',
    });

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: 'stale-project',
      projects: [
        {
          id: 'stale-project',
          name: 'Stale Project',
          path: projectRoot,
          status: 'active',
          created: '2026-04-10',
        },
      ],
    });

    const planned = JSON.parse(await runMigrateProject({
      project: 'stale-project',
      mode: 'plan',
    })) as {
      plan_hash: string;
    };

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: null,
      projects: [
        {
          id: 'stale-project',
          name: 'Stale Project',
          path: 'projects/stale-project',
          status: 'active',
          created: '2026-04-10',
          last_accessed: new Date().toISOString(),
        },
      ],
    });

    const applied = JSON.parse(await runMigrateProject({
      project: 'stale-project',
      mode: 'apply',
      expected_plan_hash: planned.plan_hash,
    })) as {
      status: string;
      block_reasons: string[];
    };

    expect(applied.status).toBe('BLOCK');
    expect(applied.block_reasons[0]).toContain('plan hash no longer matches');
  });

  it('rebuilds a missing state surface during apply when the plan is ready', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-migrate-project-'));
    process.env.AGENTICOS_HOME = home;

    const projectRoot = await createProject(home, 'stateful-project', {
      name: 'Stateful Project',
    });
    await rm(join(projectRoot, '.context', 'state.yaml'));

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: null,
      projects: [
        {
          id: 'stateful-project',
          name: 'Stateful Project',
          path: 'projects/stateful-project',
          status: 'active',
          created: '2026-04-10',
          last_accessed: new Date().toISOString(),
        },
      ],
    });

    const planned = JSON.parse(await runMigrateProject({
      project: 'stateful-project',
      mode: 'plan',
    })) as {
      status: string;
      plan_hash: string;
      planned_actions: Array<{ id: string }>;
    };

    const applied = JSON.parse(await runMigrateProject({
      project: 'stateful-project',
      mode: 'apply',
      expected_plan_hash: planned.plan_hash,
    })) as {
      status: string;
      evidence_paths: string[];
    };

    const state = yaml.parse(await readFile(join(projectRoot, '.context', 'state.yaml'), 'utf-8')) as any;

    expect(planned.status).toBe('READY');
    expect(planned.planned_actions.map((action) => action.id)).toContain('state.rebuild_missing_surface');
    expect(applied.status).toBe('APPLIED');
    expect(state.memory_contract.version).toBe(1);
    expect(applied.evidence_paths).toContain(join(projectRoot, '.context', 'state.yaml'));
  });
});
