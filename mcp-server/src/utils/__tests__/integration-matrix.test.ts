import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'yaml';
import {
  getIntegrationMode,
  getPrimaryIntegrationMode,
  loadIntegrationModeMatrix,
} from '../integration-matrix.js';

async function setupIntegrationHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'agenticos-integration-matrix-'));
  const bootstrapDir = join(home, 'projects', 'agenticos', '.meta', 'bootstrap');
  await mkdir(bootstrapDir, { recursive: true });
  await writeFile(
    join(bootstrapDir, 'integration-mode-matrix.yaml'),
    yaml.stringify({
      version: 1,
      primary_mode: 'mcp-native',
      modes: [
        {
          id: 'mcp-native',
          label: 'MCP-native',
          status: 'canonical',
          when_to_use: 'default',
          capabilities: ['full'],
          limitations: ['bootstrap'],
          non_goals: ['none'],
        },
        {
          id: 'skills-only',
          label: 'Skills-only Guidance',
          status: 'experimental',
          when_to_use: 'research',
          capabilities: ['guidance'],
          limitations: ['no tools'],
          non_goals: ['not official'],
        },
      ],
    }),
    'utf-8',
  );
  return home;
}

describe('integration matrix', () => {
  afterEach(() => {
    delete process.env.AGENTICOS_HOME;
  });

  it('loads the integration mode matrix', async () => {
    const home = await setupIntegrationHome();
    process.env.AGENTICOS_HOME = home;

    const matrix = await loadIntegrationModeMatrix();

    expect(matrix.version).toBe(1);
    expect(matrix.primary_mode).toBe('mcp-native');
    expect(matrix.modes.map((mode) => mode.id)).toEqual(['mcp-native', 'skills-only']);
  });

  it('returns both primary and non-primary modes', async () => {
    const home = await setupIntegrationHome();
    process.env.AGENTICOS_HOME = home;

    const matrix = await loadIntegrationModeMatrix();

    expect(getPrimaryIntegrationMode(matrix).status).toBe('canonical');
    expect(getIntegrationMode(matrix, 'skills-only').status).toBe('experimental');
  });

  it('fails closed for unknown mode ids', async () => {
    const home = await setupIntegrationHome();
    process.env.AGENTICOS_HOME = home;

    const matrix = await loadIntegrationModeMatrix();

    expect(() => getIntegrationMode(matrix, 'cli-wrapper')).toThrow(
      'Unknown integration mode "cli-wrapper".',
    );
  });
});
