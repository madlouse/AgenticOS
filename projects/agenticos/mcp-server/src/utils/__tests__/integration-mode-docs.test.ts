import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import {
  getPrimaryIntegrationMode,
  loadIntegrationModeMatrix,
} from '../integration-matrix.js';

function repoRoot(): string {
  return resolve(process.cwd(), '..', '..', '..');
}

describe('integration mode docs', () => {
  afterEach(() => {
    delete process.env.AGENTICOS_HOME;
  });

  it('keeps README, MCP README, and ROADMAP aligned with the primary/fallback decision', async () => {
    const root = repoRoot();
    process.env.AGENTICOS_HOME = root;

    const matrix = await loadIntegrationModeMatrix();
    const primary = getPrimaryIntegrationMode(matrix);

    const rootReadme = await readFile(resolve(root, 'README.md'), 'utf-8');
    const mcpReadme = await readFile(resolve(root, 'projects', 'agenticos', 'mcp-server', 'README.md'), 'utf-8');
    const roadmap = await readFile(resolve(root, 'ROADMAP.md'), 'utf-8');

    for (const doc of [rootReadme, mcpReadme, roadmap]) {
      expect(doc).toContain(primary.label);
      expect(doc).toContain('CLI Wrapper');
      expect(doc).toContain('Skills-only Guidance');
    }
  });
});
