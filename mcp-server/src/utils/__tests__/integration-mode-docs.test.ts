import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import {
  getPrimaryIntegrationMode,
  loadIntegrationModeMatrix,
} from '../integration-matrix.js';

function repoRoot(): string {
  const standalone = resolve(process.cwd(), '..');
  return existsSync(resolve(standalone, '.project.yaml'))
    ? standalone
    : resolve(process.cwd(), '..', '..', '..');
}

function productRoot(root: string): string {
  const nested = resolve(root, 'projects', 'agenticos');
  return existsSync(resolve(nested, '.project.yaml')) ? nested : root;
}

describe('integration mode docs', () => {
  afterEach(() => {
    delete process.env.AGENTICOS_HOME;
  });

  it('keeps README, MCP README, and ROADMAP aligned with the primary/fallback decision', async () => {
    const root = repoRoot();
    const product = productRoot(root);
    process.env.AGENTICOS_HOME = root;

    const matrix = await loadIntegrationModeMatrix();
    const primary = getPrimaryIntegrationMode(matrix);

    const rootReadme = await readFile(resolve(root, 'README.md'), 'utf-8');
    const mcpReadme = await readFile(resolve(product, 'mcp-server', 'README.md'), 'utf-8');
    const roadmap = await readFile(resolve(root, 'ROADMAP.md'), 'utf-8');

    for (const doc of [rootReadme, mcpReadme, roadmap]) {
      expect(doc).toContain(primary.label);
      expect(doc).toContain('CLI Wrapper');
      expect(doc).toContain('Skills-only Guidance');
    }
  });
});
