import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'yaml';
import {
  getBootstrapAgent,
  getOfficialBootstrapAgents,
  loadAgentBootstrapMatrix,
} from '../bootstrap-matrix.js';

async function setupBootstrapHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'agenticos-bootstrap-matrix-'));
  const bootstrapDir = join(home, 'projects', 'agenticos', '.meta', 'bootstrap');
  await mkdir(bootstrapDir, { recursive: true });
  await writeFile(
    join(bootstrapDir, 'agent-bootstrap-matrix.yaml'),
    yaml.stringify({
      version: 1,
      primary_integration_mode: 'mcp-native',
      verification_contract: {
        canonical_runtime_entrypoint: 'agenticos-mcp',
        legacy_source_checkout_paths_unsupported: true,
        automation_boundary: 'manual_agent_cli',
        automation_rationale: ['agent-owned config'],
        session_start_sequence: ['call agenticos_status'],
      },
      supported_agents: [
        {
          id: 'claude-code',
          label: 'Claude Code',
          support_tier: 'official',
          transport: 'stdio',
          canonical_bootstrap_method: 'cli-command',
          canonical_config_location: 'managed',
          bootstrap_command: 'claude mcp add --transport stdio --scope user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp',
          verification: ['claude mcp list'],
          transport_debug: ['transport'],
          routing_debug: ['routing'],
          repair: ['claude mcp get agenticos'],
        },
      ],
      experimental_agents: [
        {
          id: 'generic-mcp-tool',
          label: 'Generic',
          support_tier: 'experimental',
          transport: 'varies',
          canonical_bootstrap_method: 'manual',
          canonical_config_location: 'tool-specific',
          verification: ['manual verify'],
          transport_debug: ['transport'],
          routing_debug: ['routing'],
        },
      ],
    }),
    'utf-8',
  );
  return home;
}

async function setupBootstrapHomeWithoutExperimental(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'agenticos-bootstrap-matrix-no-exp-'));
  const bootstrapDir = join(home, 'projects', 'agenticos', '.meta', 'bootstrap');
  await mkdir(bootstrapDir, { recursive: true });
  await writeFile(
    join(bootstrapDir, 'agent-bootstrap-matrix.yaml'),
    yaml.stringify({
      version: 1,
      primary_integration_mode: 'mcp-native',
      verification_contract: {
        canonical_runtime_entrypoint: 'agenticos-mcp',
        legacy_source_checkout_paths_unsupported: true,
        automation_boundary: 'manual_agent_cli',
        automation_rationale: ['agent-owned config'],
        session_start_sequence: ['call agenticos_status'],
      },
      supported_agents: [
        {
          id: 'codex',
          label: 'Codex',
          support_tier: 'official',
          transport: 'stdio',
          canonical_bootstrap_method: 'cli-command',
          canonical_config_location: 'managed',
          verification: ['codex mcp list'],
          transport_debug: ['transport'],
          routing_debug: ['routing'],
          repair: ['codex mcp list'],
        },
      ],
    }),
    'utf-8',
  );
  return home;
}

describe('bootstrap matrix', () => {
  afterEach(() => {
    delete process.env.AGENTICOS_HOME;
  });

  it('loads the canonical bootstrap matrix from AGENTICOS_HOME', async () => {
    const home = await setupBootstrapHome();
    process.env.AGENTICOS_HOME = home;

    const matrix = await loadAgentBootstrapMatrix();

    expect(matrix.version).toBe(1);
    expect(matrix.primary_integration_mode).toBe('mcp-native');
    expect(matrix.verification_contract.canonical_runtime_entrypoint).toBe('agenticos-mcp');
    expect(matrix.verification_contract.session_start_sequence).toContain('call agenticos_status');
    expect(matrix.supported_agents.map((agent) => agent.id)).toEqual(['claude-code']);
  });

  it('returns both official and experimental agents by id', async () => {
    const home = await setupBootstrapHome();
    process.env.AGENTICOS_HOME = home;

    const matrix = await loadAgentBootstrapMatrix();

    expect(getBootstrapAgent(matrix, 'claude-code').support_tier).toBe('official');
    expect(getBootstrapAgent(matrix, 'generic-mcp-tool').support_tier).toBe('experimental');
  });

  it('fails closed for unknown agent ids', async () => {
    const home = await setupBootstrapHome();
    process.env.AGENTICOS_HOME = home;

    const matrix = await loadAgentBootstrapMatrix();

    expect(() => getBootstrapAgent(matrix, 'missing-agent')).toThrow(
      'Unknown bootstrap agent "missing-agent".',
    );
  });

  it('still resolves official agents when experimental agents are omitted', async () => {
    const home = await setupBootstrapHomeWithoutExperimental();
    process.env.AGENTICOS_HOME = home;

    const matrix = await loadAgentBootstrapMatrix();

    expect(getBootstrapAgent(matrix, 'codex').label).toBe('Codex');
  });

  it('returns only official supported agents for Homebrew-facing messaging', async () => {
    const home = await setupBootstrapHome();
    process.env.AGENTICOS_HOME = home;

    const matrix = await loadAgentBootstrapMatrix();

    expect(getOfficialBootstrapAgents(matrix).map((agent) => agent.id)).toEqual(['claude-code']);
  });

  it('keeps repair guidance on official agent entries and records the manual verification boundary', async () => {
    const home = await setupBootstrapHome();
    process.env.AGENTICOS_HOME = home;

    const matrix = await loadAgentBootstrapMatrix();
    const agent = getBootstrapAgent(matrix, 'claude-code');

    expect(matrix.verification_contract.legacy_source_checkout_paths_unsupported).toBe(true);
    expect(matrix.verification_contract.automation_boundary).toBe('manual_agent_cli');
    expect(agent.repair).toContain('claude mcp get agenticos');
  });

  it('records explicit AGENTICOS_HOME injection for CLI bootstrap commands', async () => {
    const home = await setupBootstrapHome();
    process.env.AGENTICOS_HOME = home;

    const matrix = await loadAgentBootstrapMatrix();
    const agent = getBootstrapAgent(matrix, 'claude-code');

    expect(agent.bootstrap_command).toContain('AGENTICOS_HOME=');
  });
});
