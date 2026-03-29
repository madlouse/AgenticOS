import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'yaml';
import { runStandardKitAdopt, runStandardKitConformanceCheck, runStandardKitUpgradeCheck } from '../standard-kit.js';
import { generateAgentsMd } from '../../utils/distill.js';

async function writeRegistry(home: string, registry: unknown): Promise<void> {
  await mkdir(join(home, '.agent-workspace'), { recursive: true });
  await writeFile(join(home, '.agent-workspace', 'registry.yaml'), yaml.stringify(registry), 'utf-8');
}

async function writeManifest(home: string, manifest: unknown): Promise<void> {
  await writeFile(
    join(home, 'projects', 'agenticos', '.meta', 'standard-kit', 'manifest.yaml'),
    yaml.stringify(manifest),
    'utf-8',
  );
}

async function setupKitHome(): Promise<{ home: string; projectRoot: string }> {
  const home = await mkdtemp(join(tmpdir(), 'agenticos-standard-kit-'));
  const productRoot = join(home, 'projects', 'agenticos');
  const kitRoot = join(productRoot, '.meta', 'standard-kit');
  const bootstrapRoot = join(productRoot, '.meta', 'bootstrap');
  const canonicalServerRoot = join(productRoot, 'mcp-server', 'src');
  const templateRoot = join(productRoot, '.meta', 'templates');
  const projectRoot = join(home, 'projects', 'sample-project');

  await mkdir(kitRoot, { recursive: true });
  await mkdir(bootstrapRoot, { recursive: true });
  await mkdir(canonicalServerRoot, { recursive: true });
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
          { path: 'tasks/templates/sub-agent-handoff.md', canonical_source: 'projects/agenticos/.meta/templates/sub-agent-handoff.md' },
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
        'tasks/templates/sub-agent-handoff.md',
        'tasks/templates/submission-evidence.md',
      ],
      required_behavior: [
        'memory_layer_contracts',
        'cross_agent_policy_contract',
        'implementation_preflight',
        'issue_first_branching',
        'isolated_worktree_execution',
        'edit_boundary_enforcement',
        'pr_scope_validation',
        'official_agent_adapter_surfaces',
        'sub_agent_context_inheritance',
      ],
    },
  };

  await writeFile(join(kitRoot, 'manifest.yaml'), yaml.stringify(manifest), 'utf-8');
  await writeFile(join(templateRoot, '.project.yaml'), `meta:\n  name: "Project Name"\n  id: "project-id"\n  version: "1.0.0"\n  created: "YYYY-MM-DD"\n  description: "Project description"\nagent_context:\n  quick_start: ".context/quick-start.md"\n  current_state: ".context/state.yaml"\n  conversations: ".context/conversations/"\n  knowledge: "knowledge/"\n  tasks: "tasks/"\n  artifacts: "artifacts/"\nmemory_contract:\n  version: 1\n  quick_start_role: "project_orientation"\n  state_role: "operational_working_state"\n  conversations_role: "append_only_session_history"\n  knowledge_role: "durable_synthesis"\n  tasks_role: "execution_artifacts"\n  artifacts_role: "deliverables"\nstatus:\n  phase: "planning"\n  last_updated: "YYYY-MM-DD"\n`, 'utf-8');
  await writeFile(join(templateRoot, 'quick-start.md'), '# Quick Start\n\n> Contract: concise project-level orientation for fast resume.\n> Do not store full session history, exhaustive decision logs, or issue-by-issue execution details here.\n\n## Project Snapshot\n- **Project**: [Project Name]\n- **Goal**: [Main objective]\n- **Status**: [Current phase]\n- **Last Action**: [What was done last]\n- **Current Focus**: [What to do next]\n- **Resume Here**: [What to do next]\n\n## Key Facts\n- [Important fact 1]\n- [Important fact 2]\n\n## Canonical Layers\n- Operational state: `.context/state.yaml`\n- Session history: `.context/conversations/`\n- Durable knowledge: `knowledge/`\n- Execution plans: `tasks/`\n- Deliverables: `artifacts/`\n', 'utf-8');
  await writeFile(join(templateRoot, 'state.yaml'), '# Contract:\n# - Mutable operational working state only\n# - Keep current task, working memory, and latest guardrail evidence here\n# - Do not append raw conversation transcripts here\n# - Durable synthesis belongs in knowledge/\nsession:\n  id: "session-001"\n  started: "YYYY-MM-DDTHH:MM:SSZ"\n  agent: "claude-sonnet-4.6"\ncurrent_task:\n  id: null\n  title: null\n  status: "pending"\n  next_step: null\nworking_memory:\n  facts: []\n  decisions: []\n  pending: []\nmemory_contract:\n  version: 1\n  quick_start_role: "project_orientation"\n  state_role: "operational_working_state"\n  conversations_role: "append_only_session_history"\n  knowledge_role: "durable_synthesis"\n  tasks_role: "execution_artifacts"\nloaded_context:\n  - ".project.yaml"\n', 'utf-8');
  await writeFile(join(templateRoot, 'agent-preflight-checklist.yaml'), 'version: 0.2\n', 'utf-8');
  await writeFile(join(templateRoot, 'issue-design-brief.md'), '# Issue Design Brief\n', 'utf-8');
  await writeFile(join(templateRoot, 'non-code-evaluation-rubric.yaml'), 'version: 0.1\nname: non-code-evaluation-rubric\n', 'utf-8');
  await writeFile(join(templateRoot, 'sub-agent-handoff.md'), '# Sub-Agent Handoff\n', 'utf-8');
  await writeFile(join(templateRoot, 'submission-evidence.md'), '# Submission Evidence\n', 'utf-8');
  await writeFile(join(canonicalServerRoot, 'index.ts'), "name: 'agenticos_edit_guard'\n", 'utf-8');
  await writeFile(
    join(bootstrapRoot, 'agent-bootstrap-matrix.yaml'),
    yaml.stringify({
      version: 1,
      primary_integration_mode: 'mcp-native',
      supported_agents: [
        {
          id: 'claude-code',
          label: 'Claude Code',
          support_tier: 'official',
          transport: 'stdio',
          canonical_bootstrap_method: 'cli-command',
          canonical_config_location: 'claude user config',
          verification: ['call agenticos_list'],
          transport_debug: ['restart Claude Code'],
          routing_debug: ['use explicit tool calls'],
        },
        {
          id: 'codex',
          label: 'Codex',
          support_tier: 'official',
          transport: 'stdio',
          canonical_bootstrap_method: 'cli-command',
          canonical_config_location: 'codex config',
          verification: ['call agenticos_list'],
          transport_debug: ['restart Codex'],
          routing_debug: ['use explicit tool calls'],
        },
      ],
    }),
    'utf-8',
  );
  await writeFile(
    join(bootstrapRoot, 'cross-agent-execution-contract.yaml'),
    yaml.stringify({
      version: 1,
      contract_id: 'cross-agent-execution-contract',
      policy_invariants: [{ id: 'issue_first_execution' }],
      adapter_surfaces: [
        { id: 'codex-generic', generated_file: 'AGENTS.md' },
        { id: 'claude-code', generated_file: 'CLAUDE.md' },
      ],
    }),
    'utf-8',
  );
  await writeFile(
    join(bootstrapRoot, 'agent-adapter-matrix.yaml'),
    yaml.stringify({
      version: 1,
      primary_policy_surface: 'cross-agent-execution-contract',
      adapters: [
        {
          agent_id: 'claude-code',
          support_tier: 'official',
          adapter_file: 'CLAUDE.md',
          adapter_family: 'claude',
          required_runtime_guidance: [
            '`CLAUDE.md` is the Claude Code adapter surface for this project.',
            '## Claude Runtime Notes',
            'Claude CLI-managed user MCP config',
            'optional local stop-hook reminders',
          ],
        },
        {
          agent_id: 'codex',
          support_tier: 'official',
          adapter_file: 'AGENTS.md',
          adapter_family: 'generic',
          required_runtime_guidance: [
            '`AGENTS.md` is the Codex/generic adapter surface for this project.',
            '## Codex / Generic Runtime Notes',
            'use explicit `agenticos_*` tool calls',
            'Bootstrap differences are runtime concerns',
          ],
        },
      ],
    }),
    'utf-8',
  );

  await writeRegistry(home, {
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
  });

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
    expect(result.created_files).toContain('tasks/templates/sub-agent-handoff.md');
    expect(result.skipped_existing_templates).toContain('.context/quick-start.md');
    expect(result.upgraded_generated_files).toEqual([]);

    const projectYaml = yaml.parse(await readFile(join(projectRoot, '.project.yaml'), 'utf-8')) as any;
    expect(projectYaml.meta.name).toBe('Sample Project');
    expect(projectYaml.meta.id).toBe('sample-project');
    expect(projectYaml.memory_contract.version).toBe(1);
    expect(projectYaml.agent_context.conversations).toBe('.context/conversations/');

    const quickStart = await readFile(join(projectRoot, '.context', 'quick-start.md'), 'utf-8');
    expect(quickStart).toBe('custom quick start\n');

    const stateYaml = yaml.parse(await readFile(join(projectRoot, '.context', 'state.yaml'), 'utf-8')) as any;
    expect(stateYaml.memory_contract.version).toBe(1);
    expect(stateYaml.loaded_context).toContain('.context/quick-start.md');

    const agentsMd = await readFile(join(projectRoot, 'AGENTS.md'), 'utf-8');
    const claudeMd = await readFile(join(projectRoot, 'CLAUDE.md'), 'utf-8');
    expect(agentsMd).toContain('agenticos-template: v4');
    expect(claudeMd).toContain('agenticos-template: v4');
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
    const subAgentHandoffStatus = result.copied_templates.find((item) => item.path === 'tasks/templates/sub-agent-handoff.md');
    expect(quickStartStatus).toMatchObject({ status: 'matches_canonical' });
    expect(designBriefStatus).toMatchObject({ status: 'diverged_from_canonical' });
    expect(rubricStatus).toMatchObject({ status: 'missing' });
    expect(subAgentHandoffStatus).toMatchObject({ status: 'missing' });
  });

  it('adopt can resolve the active project from registry and upgrades stale generated files while skipping current ones', async () => {
    const { home, projectRoot } = await setupKitHome();
    process.env.AGENTICOS_HOME = home;

    await writeFile(join(projectRoot, 'AGENTS.md'), generateAgentsMd('Sample Project', ''), 'utf-8');
    await writeFile(
      join(projectRoot, 'CLAUDE.md'),
      '<!-- agenticos-template: v2 -->\n# CLAUDE.md — Sample Project\n\n## Project DNA\n\ncustom dna\n\n## Navigation\n\ncustom nav\n',
      'utf-8',
    );

    const result = JSON.parse(await runStandardKitAdopt(undefined)) as {
      status: string;
      created_files: string[];
      upgraded_generated_files: string[];
      skipped_current_generated_files: string[];
      project_id: string;
      project_name: string;
    };

    expect(result.status).toBe('ADOPTED');
    expect(result.project_name).toBe('Sample Project');
    expect(result.project_id).toBe('sample-project');
    expect(result.upgraded_generated_files).toContain('CLAUDE.md');
    expect(result.skipped_current_generated_files).toContain('AGENTS.md');
    expect(result.created_files).toContain('.project.yaml');

    const claudeMd = await readFile(join(projectRoot, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('agenticos-template: v4');
    expect(claudeMd).toContain('custom dna');
    expect(claudeMd).toContain('## Current State');
  });

  it('upgrade check reports current generated files when template versions already match', async () => {
    const { home, projectRoot } = await setupKitHome();
    process.env.AGENTICOS_HOME = home;

    await writeFile(join(projectRoot, 'AGENTS.md'), generateAgentsMd('Sample Project', ''), 'utf-8');
    await writeFile(join(projectRoot, 'CLAUDE.md'), '<!-- agenticos-template: v4 -->\ncurrent claude\n', 'utf-8');

    const result = JSON.parse(await runStandardKitUpgradeCheck({ project_path: projectRoot })) as {
      generated_files: Array<{ path: string; status: string; current_version: number | null }>;
    };

    expect(result.generated_files.find((item) => item.path === 'AGENTS.md')).toMatchObject({
      status: 'current',
      current_version: 4,
    });
    expect(result.generated_files.find((item) => item.path === 'CLAUDE.md')).toMatchObject({
      status: 'current',
      current_version: 4,
    });
  });

  it('conformance check passes after downstream adoption', async () => {
    const { home, projectRoot } = await setupKitHome();
    process.env.AGENTICOS_HOME = home;

    await runStandardKitAdopt({
      project_path: projectRoot,
      project_name: 'Sample Project',
      project_description: 'Conformance test project',
    });

    const result = JSON.parse(await runStandardKitConformanceCheck({
      project_path: projectRoot,
      project_name: 'Sample Project',
    })) as {
      status: string;
      behavior_checks: Array<{ behavior: string; status: string }>;
      adapter_checks: Array<{ agent_id: string; status: string; adapter_file: string }>;
    };

    expect(result.status).toBe('PASS');
    expect(result.behavior_checks.every((item) => item.status === 'PASS')).toBe(true);
    expect(result.adapter_checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agent_id: 'claude-code', status: 'PASS', adapter_file: 'CLAUDE.md' }),
        expect.objectContaining({ agent_id: 'codex', status: 'PASS', adapter_file: 'AGENTS.md' }),
      ]),
    );
  });

  it('conformance check fails when a generated adapter surface loses the shared policy block', async () => {
    const { home, projectRoot } = await setupKitHome();
    process.env.AGENTICOS_HOME = home;

    await runStandardKitAdopt({
      project_path: projectRoot,
      project_name: 'Sample Project',
      project_description: 'Broken conformance project',
    });
    await writeFile(join(projectRoot, 'AGENTS.md'), '<!-- agenticos-template: v4 -->\n# AGENTS.md — Sample Project\n', 'utf-8');

    const result = JSON.parse(await runStandardKitConformanceCheck({
      project_path: projectRoot,
      project_name: 'Sample Project',
    })) as {
      status: string;
      behavior_checks: Array<{ behavior: string; status: string }>;
      adapter_checks: Array<{ agent_id: string; status: string }>;
    };

    expect(result.status).toBe('FAIL');
    expect(result.behavior_checks.find((item) => item.behavior === 'cross_agent_policy_contract')).toMatchObject({ status: 'FAIL' });
    expect(result.adapter_checks.find((item) => item.agent_id === 'codex')).toMatchObject({ status: 'FAIL' });
  });

  it('conformance check fails Claude parity when Claude-specific runtime guidance is removed', async () => {
    const { home, projectRoot } = await setupKitHome();
    process.env.AGENTICOS_HOME = home;

    await runStandardKitAdopt({
      project_path: projectRoot,
      project_name: 'Sample Project',
      project_description: 'Claude parity project',
    });

    const claudeMd = await readFile(join(projectRoot, 'CLAUDE.md'), 'utf-8');
    await writeFile(
      join(projectRoot, 'CLAUDE.md'),
      claudeMd.replace(/## Claude Runtime Notes[\s\S]*?## Guardrail Protocol \(MANDATORY\)/, '## Guardrail Protocol (MANDATORY)'),
      'utf-8',
    );

    const result = JSON.parse(await runStandardKitConformanceCheck({
      project_path: projectRoot,
      project_name: 'Sample Project',
    })) as {
      status: string;
      adapter_checks: Array<{ agent_id: string; status: string }>;
    };

    expect(result.status).toBe('FAIL');
    expect(result.adapter_checks.find((item) => item.agent_id === 'claude-code')).toMatchObject({ status: 'FAIL' });
    expect(result.adapter_checks.find((item) => item.agent_id === 'codex')).toMatchObject({ status: 'PASS' });
  });

  it('upgrade check can resolve project identity from an existing .project.yaml through the active registry project', async () => {
    const { home, projectRoot } = await setupKitHome();
    process.env.AGENTICOS_HOME = home;

    await writeFile(
      join(projectRoot, '.project.yaml'),
      'meta:\n  name: "Yaml Project"\n  id: "yaml-project"\n  description: "yaml description"\n',
      'utf-8',
    );

    const result = JSON.parse(await runStandardKitUpgradeCheck(undefined)) as {
      project_name: string;
      project_id: string;
    };

    expect(result.project_name).toBe('Yaml Project');
    expect(result.project_id).toBe('yaml-project');
  });

  it('adopt upgrades stale AGENTS.md files to the current generated template', async () => {
    const { home, projectRoot } = await setupKitHome();
    process.env.AGENTICOS_HOME = home;

    await writeFile(join(projectRoot, 'AGENTS.md'), '<!-- agenticos-template: v2 -->\nold agents\n', 'utf-8');

    const result = JSON.parse(await runStandardKitAdopt({
      project_path: projectRoot,
      project_name: 'Sample Project',
    })) as {
      upgraded_generated_files: string[];
    };

    expect(result.upgraded_generated_files).toContain('AGENTS.md');
    const agentsMd = await readFile(join(projectRoot, 'AGENTS.md'), 'utf-8');
    expect(agentsMd).toContain('agenticos-template: v4');
    expect(agentsMd).toContain('Guardrail Protocol');
  });

  it('adopt slugifies a provided project name when no canonical project id exists yet', async () => {
    const { home } = await setupKitHome();
    process.env.AGENTICOS_HOME = home;

    const orphanProjectRoot = join(home, 'projects', 'custom-project');
    await mkdir(orphanProjectRoot, { recursive: true });

    const result = JSON.parse(await runStandardKitAdopt({
      project_path: orphanProjectRoot,
      project_name: 'Custom Project',
    })) as {
      project_id: string;
      project_name: string;
    };

    expect(result.project_name).toBe('Custom Project');
    expect(result.project_id).toBe('custom-project');
  });

  it('adopt tolerates a minimal manifest and skips copied-template entries without canonical sources', async () => {
    const { home, projectRoot } = await setupKitHome();
    process.env.AGENTICOS_HOME = home;

    await writeManifest(home, {
      kit_id: 'downstream-standard-kit',
      kit_version: '0.1.0',
      layers: {
        copied_templates: {
          entries: [{ path: 'tasks/templates/ignored.md' }],
        },
      },
    });

    const result = JSON.parse(await runStandardKitAdopt({
      project_path: projectRoot,
      project_name: 'Sample Project',
    })) as {
      created_files: string[];
      upgraded_generated_files: string[];
    };

    expect(result.created_files).toEqual([]);
    expect(result.upgraded_generated_files).toEqual([]);
  });

  it('upgrade check tolerates a minimal manifest and skips copied-template entries without canonical sources', async () => {
    const { home, projectRoot } = await setupKitHome();
    process.env.AGENTICOS_HOME = home;

    await writeManifest(home, {
      kit_id: 'downstream-standard-kit',
      kit_version: '0.1.0',
      layers: {
        copied_templates: {
          entries: [{ path: 'tasks/templates/ignored.md' }],
        },
      },
    });

    const result = JSON.parse(await runStandardKitUpgradeCheck({
      project_path: projectRoot,
      project_name: 'Sample Project',
    })) as {
      missing_required_files: string[];
      generated_files: unknown[];
      copied_templates: unknown[];
    };

    expect(result.missing_required_files).toEqual([]);
    expect(result.generated_files).toEqual([]);
    expect(result.copied_templates).toEqual([]);
  });

  it('adopt fills missing state sections and preserves an explicit project phase from the template', async () => {
    const { home, projectRoot } = await setupKitHome();
    process.env.AGENTICOS_HOME = home;

    await writeManifest(home, {
      kit_id: 'downstream-standard-kit',
      kit_version: '0.1.0',
      layers: {
        copied_templates: {
          entries: [
            { path: '.project.yaml', canonical_source: 'projects/agenticos/.meta/templates/.project.yaml' },
            { path: '.context/state.yaml', canonical_source: 'projects/agenticos/.meta/templates/state.yaml' },
          ],
        },
      },
    });
    await writeFile(
      join(home, 'projects', 'agenticos', '.meta', 'templates', '.project.yaml'),
      'meta:\n  name: "Template Name"\nstatus:\n  phase: "discovery"\n',
      'utf-8',
    );
    await writeFile(
      join(home, 'projects', 'agenticos', '.meta', 'templates', 'state.yaml'),
      'loaded_context: []\n',
      'utf-8',
    );

    await runStandardKitAdopt({
      project_path: projectRoot,
      project_name: 'Sample Project',
    });

    const projectYaml = yaml.parse(await readFile(join(projectRoot, '.project.yaml'), 'utf-8')) as any;
    const stateYaml = yaml.parse(await readFile(join(projectRoot, '.context', 'state.yaml'), 'utf-8')) as any;

    expect(projectYaml.status.phase).toBe('discovery');
    expect(projectYaml.status.last_updated).toBeTypeOf('string');
    expect(stateYaml.session.id).toMatch(/^session-\d{4}-\d{2}-\d{2}-001$/);
    expect(stateYaml.current_task.status).toBe('pending');
    expect(stateYaml.current_task.next_step).toBe('Define project goals');
  });

  it('adopt fills missing project metadata and default planning status when the project template is skeletal', async () => {
    const { home, projectRoot } = await setupKitHome();
    process.env.AGENTICOS_HOME = home;

    await writeManifest(home, {
      kit_id: 'downstream-standard-kit',
      kit_version: '0.1.0',
      layers: {
        copied_templates: {
          entries: [
            { path: '.project.yaml', canonical_source: 'projects/agenticos/.meta/templates/.project.yaml' },
          ],
        },
      },
    });
    await writeFile(
      join(home, 'projects', 'agenticos', '.meta', 'templates', '.project.yaml'),
      '{}\n',
      'utf-8',
    );

    await runStandardKitAdopt({
      project_path: projectRoot,
      project_name: 'Sample Project',
    });

    const projectYaml = yaml.parse(await readFile(join(projectRoot, '.project.yaml'), 'utf-8')) as any;
    expect(projectYaml.meta.name).toBe('Sample Project');
    expect(projectYaml.meta.id).toBe('sample-project');
    expect(projectYaml.meta.version).toBe('1.0.0');
    expect(projectYaml.status.phase).toBe('planning');
  });

  it('upgrade check tolerates manifests with no copied-template layer at all', async () => {
    const { home, projectRoot } = await setupKitHome();
    process.env.AGENTICOS_HOME = home;

    await writeManifest(home, {
      kit_id: 'downstream-standard-kit',
      kit_version: '0.1.0',
      layers: {},
    });

    const result = JSON.parse(await runStandardKitUpgradeCheck({
      project_path: projectRoot,
      project_name: 'Sample Project',
    })) as {
      generated_files: unknown[];
      copied_templates: unknown[];
    };

    expect(result.generated_files).toEqual([]);
    expect(result.copied_templates).toEqual([]);
  });

  it('adopt blocks when no active project exists and no project_path is provided', async () => {
    const { home } = await setupKitHome();
    process.env.AGENTICOS_HOME = home;

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: null,
      projects: [],
    });

    await expect(runStandardKitAdopt(undefined)).rejects.toThrow(
      'No project_path provided and no active project found in registry.',
    );
  });

  it('adopt blocks when the registry active project cannot be resolved', async () => {
    const { home } = await setupKitHome();
    process.env.AGENTICOS_HOME = home;

    await writeRegistry(home, {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      active_project: 'missing-project',
      projects: [],
    });

    await expect(runStandardKitAdopt({})).rejects.toThrow(
      'Active project "missing-project" not found in registry.',
    );
  });

  it('adopt blocks when project identity cannot resolve a name', async () => {
    const { home } = await setupKitHome();
    process.env.AGENTICOS_HOME = home;

    const orphanProjectRoot = join(home, 'projects', 'orphan-project');
    await mkdir(orphanProjectRoot, { recursive: true });

    await expect(runStandardKitAdopt({ project_path: orphanProjectRoot })).rejects.toThrow(
      'Unable to resolve project name. Provide project_name or create .project.yaml first.',
    );
  });
});
