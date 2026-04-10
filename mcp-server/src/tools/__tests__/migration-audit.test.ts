import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'yaml';
import { runMigrationAudit, runMigrateHome } from '../migration-audit.js';
import { bindSessionProject, clearSessionProjectBinding } from '../../utils/session-context.js';

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

describe('migration audit tools', () => {
  afterEach(() => {
    clearSessionProjectBinding();
    delete process.env.AGENTICOS_HOME;
  });

  it('reports safe lazy repair and compatibility findings for a legacy but still operable project', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-migration-audit-'));
    process.env.AGENTICOS_HOME = home;

    const projectRoot = await createProject(home, 'sample-project', {
      name: 'Sample Project',
      stateYaml: {
        session: {},
        guardrail_evidence: {
          preflight: {
            result: {
              active_project: 'legacy-project',
            },
          },
        },
      },
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

    const result = JSON.parse(await runMigrationAudit({
      project: 'sample-project',
    })) as {
      status: string;
      safe_to_continue_without_migration: boolean;
      finding_counts: { compatible_only: number; safe_lazy_repair: number; explicit_migration_required: number };
      findings: Array<{ code: string }>;
    };

    expect(result.status).toBe('WARN');
    expect(result.safe_to_continue_without_migration).toBe(true);
    expect(result.finding_counts.compatible_only).toBe(1);
    expect(result.finding_counts.safe_lazy_repair).toBe(3);
    expect(result.finding_counts.explicit_migration_required).toBe(0);
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'legacy_active_project_present',
      'registry_path_stored_absolute_under_home',
      'registry_last_accessed_missing',
      'legacy_active_project_evidence_present',
    ]));
  });

  it('blocks when a project still needs structural topology normalization', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-migration-audit-'));
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

    const result = JSON.parse(await runMigrationAudit({
      project: 'broken-project',
    })) as {
      status: string;
      project: { identity_proven: boolean };
      safe_to_continue_without_migration: boolean;
      findings: Array<{ code: string }>;
      block_reasons: string[];
    };

    expect(result.status).toBe('BLOCK');
    expect(result.project.identity_proven).toBe(true);
    expect(result.safe_to_continue_without_migration).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain('topology_contract_invalid');
    expect(result.block_reasons.join(' ')).toContain('topology');
  });

  it('blocks explicit path audits when the target project is not registered', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-migration-audit-'));
    process.env.AGENTICOS_HOME = home;

    const projectRoot = await createProject(home, 'orphan-project', {
      name: 'Orphan Project',
    });

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: null,
      projects: [],
    });

    const result = JSON.parse(await runMigrationAudit({
      project_path: projectRoot,
    })) as {
      status: string;
      findings: Array<{ code: string }>;
      block_reasons: string[];
    };

    expect(result.status).toBe('BLOCK');
    expect(result.findings.map((finding) => finding.code)).toContain('registry_entry_missing');
    expect(result.block_reasons.join(' ')).toContain('not registered');
  });

  it('supports session-bound fallback when no explicit selector is provided', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-migration-audit-'));
    process.env.AGENTICOS_HOME = home;

    const projectRoot = await createProject(home, 'session-project', {
      name: 'Session Project',
    });

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: null,
      projects: [
        {
          id: 'session-project',
          name: 'Session Project',
          path: 'projects/session-project',
          status: 'active',
          created: '2026-04-10',
          last_accessed: new Date().toISOString(),
        },
      ],
    });

    bindSessionProject({
      projectId: 'session-project',
      projectName: 'Session Project',
      projectPath: projectRoot,
    });

    const result = JSON.parse(await runMigrationAudit({})) as {
      status: string;
      project: { project_id: string | null; resolution_source: string };
    };

    expect(result.status).toBe('PASS');
    expect(result.project.project_id).toBe('session-project');
    expect(result.project.resolution_source).toBe('session');
  });

  it('fails closed when no selector and no session project are available', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-migration-audit-'));
    process.env.AGENTICOS_HOME = home;

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: null,
      projects: [],
    });

    const result = JSON.parse(await runMigrationAudit({})) as {
      status: string;
      block_reasons: string[];
    };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons[0]).toContain('No project_path, project, or session project');
  });

  it('accepts workspace-relative project paths through the project selector contract', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-migration-audit-'));
    process.env.AGENTICOS_HOME = home;

    await createProject(home, 'relative-selector', {
      name: 'Relative Selector',
    });

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: null,
      projects: [
        {
          id: 'relative-selector',
          name: 'Relative Selector',
          path: 'projects/relative-selector',
          status: 'active',
          created: '2026-04-10',
          last_accessed: new Date().toISOString(),
        },
      ],
    });

    const result = JSON.parse(await runMigrationAudit({
      project: 'projects/relative-selector',
    })) as {
      status: string;
      project: { project_id: string | null };
    };

    expect(result.status).toBe('PASS');
    expect(result.project.project_id).toBe('relative-selector');
  });

  it('generates a home-wide report-only inventory with per-project statuses', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-migration-audit-'));
    process.env.AGENTICOS_HOME = home;

    await createProject(home, 'good-project', {
      name: 'Good Project',
    });
    await createProject(home, 'needs-migration', {
      name: 'Needs Migration',
      projectYaml: {
        meta: {
          id: 'needs-migration',
          name: 'Needs Migration',
        },
      },
    });

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: null,
      projects: [
        {
          id: 'good-project',
          name: 'Good Project',
          path: 'projects/good-project',
          status: 'active',
          created: '2026-04-10',
          last_accessed: new Date().toISOString(),
        },
        {
          id: 'needs-migration',
          name: 'Needs Migration',
          path: 'projects/needs-migration',
          status: 'active',
          created: '2026-04-10',
          last_accessed: new Date().toISOString(),
        },
      ],
    });

    const result = JSON.parse(await runMigrateHome({
      report_only: true,
    })) as {
      status: string;
      total_projects: number;
      blocked_projects: number;
      projects: Array<{ project_id: string | null; status: string }>;
    };

    expect(result.status).toBe('BLOCK');
    expect(result.total_projects).toBe(2);
    expect(result.blocked_projects).toBe(1);
    expect(result.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ project_id: 'good-project', status: 'PASS' }),
      expect.objectContaining({ project_id: 'needs-migration', status: 'BLOCK' }),
    ]));
  });

  it('treats archived reference projects as inventory-only instead of requiring active topology normalization', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-migration-audit-'));
    process.env.AGENTICOS_HOME = home;

    const projectRoot = join(home, 'projects', 'legacy-archive');
    await mkdir(projectRoot, { recursive: true });
    await writeFile(join(projectRoot, '.project.yaml'), yaml.stringify({
      meta: {
        id: 'legacy-archive',
        name: 'Legacy Archive',
      },
      archive_contract: {
        kind: 'archived_reference',
        execution_mode: 'reference_only',
        replacement_project: 'agenticos-standards',
      },
    }), 'utf-8');

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: null,
      projects: [
        {
          id: 'legacy-archive',
          name: 'Legacy Archive',
          path: 'projects/legacy-archive',
          status: 'archived',
          created: '2026-04-10',
          last_accessed: new Date().toISOString(),
        },
      ],
    });

    const result = JSON.parse(await runMigrationAudit({
      project: 'legacy-archive',
    })) as {
      status: string;
      safe_to_continue_without_migration: boolean;
      findings: Array<{ code: string }>;
      notes: string[];
    };

    expect(result.status).toBe('WARN');
    expect(result.safe_to_continue_without_migration).toBe(true);
    expect(result.findings.map((finding) => finding.code)).toContain('archived_reference_project');
    expect(result.findings.map((finding) => finding.code)).not.toContain('topology_contract_invalid');
    expect(result.findings.map((finding) => finding.code)).not.toContain('state_surface_missing');
    expect(result.notes.join(' ')).toContain('inventory-only');
  });

  it('blocks when registry identity is duplicated in the home-wide inventory', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-migration-audit-'));
    process.env.AGENTICOS_HOME = home;

    await createProject(home, 'shared-id', {
      name: 'Alpha Project',
    });
    await createProject(home, 'second-project', {
      name: 'Beta Project',
      projectYaml: {
        meta: {
          id: 'shared-id',
          name: 'Beta Project',
        },
        source_control: {
          topology: 'local_directory_only',
          context_publication_policy: 'local_private',
        },
      },
    });

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: null,
      projects: [
        {
          id: 'shared-id',
          name: 'Alpha Project',
          path: 'projects/shared-id',
          status: 'active',
          created: '2026-04-10',
          last_accessed: new Date().toISOString(),
        },
        {
          id: 'shared-id',
          name: 'Beta Project',
          path: 'projects/second-project',
          status: 'active',
          created: '2026-04-10',
          last_accessed: new Date().toISOString(),
        },
      ],
    });

    const result = JSON.parse(await runMigrateHome({
      report_only: true,
    })) as {
      status: string;
      blocked_projects: number;
      projects: Array<{ project_id: string | null; status: string }>;
    };

    expect(result.status).toBe('BLOCK');
    expect(result.blocked_projects).toBe(2);
    expect(result.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ project_id: 'shared-id', status: 'BLOCK' }),
    ]));
  });

  it('fails closed when non-report-only home migration is requested', async () => {
    const result = JSON.parse(await runMigrateHome({
      report_only: false,
    })) as {
      status: string;
      block_reasons: string[];
    };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons[0]).toContain('report_only=true');
  });

  it('does not mutate registry state in home report-only mode', async () => {
    const home = await mkdtemp(join(tmpdir(), 'agenticos-migration-audit-'));
    process.env.AGENTICOS_HOME = home;

    await createProject(home, 'report-only-project', {
      name: 'Report Only Project',
    });

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: '2026-04-10T00:00:00.000Z',
      active_project: 'report-only-project',
      projects: [
        {
          id: 'report-only-project',
          name: 'Report Only Project',
          path: 'projects/report-only-project',
          status: 'active',
          created: '2026-04-10',
          last_accessed: '2026-04-10T00:00:00.000Z',
        },
      ],
    });

    const registryPath = join(home, '.agent-workspace', 'registry.yaml');
    const before = await readFile(registryPath, 'utf-8');

    const result = JSON.parse(await runMigrateHome({
      report_only: true,
    })) as {
      status: string;
      total_projects: number;
    };

    const after = await readFile(registryPath, 'utf-8');

    expect(result.status).toBe('PASS');
    expect(result.total_projects).toBe(1);
    expect(after).toBe(before);
  });
});
