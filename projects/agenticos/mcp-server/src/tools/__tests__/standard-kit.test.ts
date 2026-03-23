import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'yaml';
import { runStandardKitAdopt, runStandardKitUpgradeCheck } from '../standard-kit.js';

async function setupKitHome(): Promise<{ home: string; projectRoot: string }> {
  const home = await mkdtemp(join(tmpdir(), 'agenticos-standard-kit-'));
  const productRoot = join(home, 'projects', 'agenticos');
  const kitRoot = join(productRoot, '.meta', 'standard-kit');
  const templateRoot = join(productRoot, '.meta', 'templates');
  const projectRoot = join(home, 'projects', 'sample-project');

  await mkdir(kitRoot, { recursive: true });
  await mkdir(templateRoot, { recursive: true });
  await mkdir(projectRoot, { recursive: true });

  const manifest = {
    kit_id: 'downstream-standard-kit',
    kit_version: '0.1.0',
    layers: {
      generated_files: {
        entries: [
          { path: 'AGENTS.md', canonical_source: 'projects/agenticos/mcp-server/src/utils/distill.ts' },
          { path: 'CLAUDE.md', canonical_source: 'projects/agenticos/mcp-server/src/utils/distill.ts' },
        ],
      },
      copied_templates: {
        entries: [
          { path: '.project.yaml', canonical_source: 'projects/agenticos/.meta/templates/.project.yaml' },
          { path: '.context/quick-start.md', canonical_source: 'projects/agenticos/.meta/templates/quick-start.md' },
          { path: '.context/state.yaml', canonical_source: 'projects/agenticos/.meta/templates/state.yaml' },
          { path: 'tasks/templates/agent-preflight-checklist.yaml', canonical_source: 'projects/agenticos/.meta/templates/agent-preflight-checklist.yaml' },
          { path: 'tasks/templates/issue-design-brief.md', canonical_source: 'projects/agenticos/.meta/templates/issue-design-brief.md' },
          { path: 'tasks/templates/non-code-evaluation-rubric.yaml', canonical_source: 'projects/agenticos/.meta/templates/non-code-evaluation-rubric.yaml' },
          { path: 'tasks/templates/submission-evidence.md', canonical_source: 'projects/agenticos/.meta/templates/submission-evidence.md' },
        ],
      },
    },
    adoption: {
      required_files: [
        'AGENTS.md',
        'CLAUDE.md',
        '.project.yaml',
        '.context/quick-start.md',
        '.context/state.yaml',
        'tasks/templates/agent-preflight-checklist.yaml',
        'tasks/templates/issue-design-brief.md',
        'tasks/templates/non-code-evaluation-rubric.yaml',
        'tasks/templates/submission-evidence.md',
      ],
    },
  };

  await writeFile(join(kitRoot, 'manifest.yaml'), yaml.stringify(manifest), 'utf-8');
  await writeFile(join(templateRoot, '.project.yaml'), `meta:\n  name: "Project Name"\n  id: "project-id"\n  version: "1.0.0"\n  created: "YYYY-MM-DD"\nstatus:\n  phase: "planning"\n  last_updated: "YYYY-MM-DD"\n`, 'utf-8');
  await writeFile(join(templateRoot, 'quick-start.md'), '# Quick Start\n\n- **Project**: [Project Name]\n- **Goal**: [Main objective]\n- **Status**: [Current phase]\n- **Last Action**: [What was done last]\n- **Next Step**: [What to do next]\n', 'utf-8');
  await writeFile(join(templateRoot, 'state.yaml'), 'session:\n  id: "session-001"\n  started: "YYYY-MM-DDTHH:MM:SSZ"\n  agent: "claude-sonnet-4.6"\ncurrent_task:\n  id: null\n  title: null\n  status: "pending"\n  next_step: null\nworking_memory:\n  facts: []\n  decisions: []\n  pending: []\nloaded_context:\n  - ".project.yaml"\n', 'utf-8');
  await writeFile(join(templateRoot, 'agent-preflight-checklist.yaml'), 'version: 0.2\n', 'utf-8');
  await writeFile(join(templateRoot, 'issue-design-brief.md'), '# Issue Design Brief\n', 'utf-8');
  await writeFile(join(templateRoot, 'non-code-evaluation-rubric.yaml'), 'version: 0.1\nname: non-code-evaluation-rubric\n', 'utf-8');
  await writeFile(join(templateRoot, 'submission-evidence.md'), '# Submission Evidence\n', 'utf-8');

  await mkdir(join(home, '.agent-workspace'), { recursive: true });
  await writeFile(join(home, '.agent-workspace', 'registry.yaml'), yaml.stringify({
    version: '1.0.0',
    last_updated: new Date().toISOString(),
    active_project: 'sample-project',
    projects: [
      {
        id: 'sample-project',
        name: 'Sample Project',
        path: 'projects/sample-project',
        status: 'active',
        created: '2026-03-23',
        last_accessed: new Date().toISOString(),
      },
    ],
  }), 'utf-8');

  return { home, projectRoot };
}

describe('standard kit commands', () => {
  afterEach(() => {
    delete process.env.AGENTICOS_HOME;
  });

  it('adopt creates missing files and does not overwrite existing copied templates', async () => {
    const { home, projectRoot } = await setupKitHome();
    process.env.AGENTICOS_HOME = home;

    await mkdir(join(projectRoot, '.context'), { recursive: true });
    await writeFile(join(projectRoot, '.context', 'quick-start.md'), 'custom quick start\n', 'utf-8');

    const result = JSON.parse(await runStandardKitAdopt({
      project_path: projectRoot,
      project_name: 'Sample Project',
      project_description: 'Adoption test project',
    })) as {
      status: string;
      created_files: string[];
      skipped_existing_templates: string[];
      upgraded_generated_files: string[];
    };

    expect(result.status).toBe('ADOPTED');
    expect(result.created_files).toContain('.project.yaml');
    expect(result.created_files).toContain('AGENTS.md');
    expect(result.created_files).toContain('CLAUDE.md');
    expect(result.created_files).toContain('tasks/templates/non-code-evaluation-rubric.yaml');
    expect(result.skipped_existing_templates).toContain('.context/quick-start.md');
    expect(result.upgraded_generated_files).toEqual([]);

    const projectYaml = yaml.parse(await readFile(join(projectRoot, '.project.yaml'), 'utf-8')) as any;
    expect(projectYaml.meta.name).toBe('Sample Project');
    expect(projectYaml.meta.id).toBe('sample-project');

    const quickStart = await readFile(join(projectRoot, '.context', 'quick-start.md'), 'utf-8');
    expect(quickStart).toBe('custom quick start\n');

    const agentsMd = await readFile(join(projectRoot, 'AGENTS.md'), 'utf-8');
    const claudeMd = await readFile(join(projectRoot, 'CLAUDE.md'), 'utf-8');
    expect(agentsMd).toContain('agenticos-template: v3');
    expect(claudeMd).toContain('agenticos-template: v3');
  });

  it('upgrade check reports missing, stale, matching, and diverged files', async () => {
    const { home, projectRoot } = await setupKitHome();
    process.env.AGENTICOS_HOME = home;

    await mkdir(join(projectRoot, '.context'), { recursive: true });
    await mkdir(join(projectRoot, 'tasks', 'templates'), { recursive: true });
    await writeFile(join(projectRoot, 'AGENTS.md'), '<!-- agenticos-template: v2 -->\nold agents\n', 'utf-8');
    await writeFile(join(projectRoot, '.context', 'quick-start.md'), await readFile(join(home, 'projects', 'agenticos', '.meta', 'templates', 'quick-start.md'), 'utf-8'), 'utf-8');
    await writeFile(join(projectRoot, 'tasks', 'templates', 'issue-design-brief.md'), 'local customization\n', 'utf-8');

    const result = JSON.parse(await runStandardKitUpgradeCheck({
      project_path: projectRoot,
      project_name: 'Sample Project',
    })) as {
      status: string;
      missing_required_files: string[];
      generated_files: Array<{ path: string; status: string; current_version: number | null }>;
      copied_templates: Array<{ path: string; status: string }>;
    };

    expect(result.status).toBe('CHECKED');
    expect(result.missing_required_files).toContain('CLAUDE.md');
    expect(result.missing_required_files).toContain('.project.yaml');

    const agentsStatus = result.generated_files.find((item) => item.path === 'AGENTS.md');
    const claudeStatus = result.generated_files.find((item) => item.path === 'CLAUDE.md');
    expect(agentsStatus).toMatchObject({ status: 'stale', current_version: 2 });
    expect(claudeStatus).toMatchObject({ status: 'missing', current_version: null });

    const quickStartStatus = result.copied_templates.find((item) => item.path === '.context/quick-start.md');
    const designBriefStatus = result.copied_templates.find((item) => item.path === 'tasks/templates/issue-design-brief.md');
    const rubricStatus = result.copied_templates.find((item) => item.path === 'tasks/templates/non-code-evaluation-rubric.yaml');
    expect(quickStartStatus).toMatchObject({ status: 'matches_canonical' });
    expect(designBriefStatus).toMatchObject({ status: 'diverged_from_canonical' });
    expect(rubricStatus).toMatchObject({ status: 'missing' });
  });
});
