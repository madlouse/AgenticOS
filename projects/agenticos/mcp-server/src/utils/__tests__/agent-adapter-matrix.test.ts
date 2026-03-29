import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'yaml';
import {
  getAgentAdapter,
  getOfficialAgentAdapters,
  loadAgentAdapterMatrix,
} from '../agent-adapter-matrix.js';

async function setupAdapterHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'agenticos-adapter-matrix-'));
  const bootstrapDir = join(home, 'projects', 'agenticos', '.meta', 'bootstrap');
  await mkdir(bootstrapDir, { recursive: true });
  await writeFile(
    join(bootstrapDir, 'agent-adapter-matrix.yaml'),
    yaml.stringify({
      version: 1,
      primary_policy_surface: 'cross-agent-execution-contract',
      adapters: [
        {
          agent_id: 'claude-code',
          support_tier: 'official',
          adapter_file: 'CLAUDE.md',
          adapter_family: 'claude',
          required_runtime_guidance: ['Claude Runtime Notes'],
        },
        {
          agent_id: 'codex',
          support_tier: 'official',
          adapter_file: 'AGENTS.md',
          adapter_family: 'generic',
          required_runtime_guidance: ['Codex / Generic Runtime Notes'],
        },
        {
          agent_id: 'generic-mcp-tool',
          support_tier: 'experimental',
          adapter_file: 'AGENTS.md',
          adapter_family: 'generic',
          required_runtime_guidance: ['Codex / Generic Runtime Notes'],
        },
      ],
    }),
    'utf-8',
  );
  return home;
}

describe('agent adapter matrix', () => {
  afterEach(() => {
    delete process.env.AGENTICOS_HOME;
  });

  it('loads the canonical adapter matrix from AGENTICOS_HOME', async () => {
    const home = await setupAdapterHome();
    process.env.AGENTICOS_HOME = home;

    const matrix = await loadAgentAdapterMatrix();

    expect(matrix.primary_policy_surface).toBe('cross-agent-execution-contract');
    expect(matrix.adapters.map((adapter) => adapter.agent_id)).toEqual(['claude-code', 'codex', 'generic-mcp-tool']);
  });

  it('returns only official agent adapters for parity enforcement', async () => {
    const home = await setupAdapterHome();
    process.env.AGENTICOS_HOME = home;

    const matrix = await loadAgentAdapterMatrix();

    expect(getOfficialAgentAdapters(matrix).map((adapter) => adapter.agent_id)).toEqual(['claude-code', 'codex']);
  });

  it('fails closed for unknown adapter ids', async () => {
    const home = await setupAdapterHome();
    process.env.AGENTICOS_HOME = home;

    const matrix = await loadAgentAdapterMatrix();

    expect(() => getAgentAdapter(matrix, 'missing-agent')).toThrow('Unknown agent adapter "missing-agent".');
  });
});
