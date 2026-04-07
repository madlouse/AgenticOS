import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import {
  getOfficialBootstrapAgents,
  loadAgentBootstrapMatrix,
} from '../bootstrap-matrix.js';

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

function normalizeDoc(text: string): string {
  return text.toLowerCase().replace(/[`*]/g, '');
}

describe('homebrew bootstrap docs', () => {
  afterEach(() => {
    delete process.env.AGENTICOS_HOME;
  });

  it('keeps the Homebrew-facing docs aligned with the official supported agents and manual bootstrap contract', async () => {
    const root = repoRoot();
    const product = productRoot(root);
    process.env.AGENTICOS_HOME = root;

    const matrix = await loadAgentBootstrapMatrix();
    const agents = getOfficialBootstrapAgents(matrix).map((agent) => agent.label);

    const rootReadme = await readFile(resolve(root, 'README.md'), 'utf-8');
    const tapReadme = await readFile(resolve(product, 'homebrew-tap', 'README.md'), 'utf-8');
    const formula = await readFile(resolve(product, 'homebrew-tap', 'Formula', 'agenticos.rb'), 'utf-8');
    const mcpReadme = await readFile(resolve(product, 'mcp-server', 'README.md'), 'utf-8');

    for (const agent of agents) {
      expect(rootReadme).toContain(agent);
      expect(tapReadme).toContain(agent);
      expect(formula).toContain(agent);
      expect(mcpReadme).toContain(agent);
    }

    for (const doc of [rootReadme, tapReadme, formula, mcpReadme]) {
      const normalized = normalizeDoc(doc);
      expect(normalized).toContain('does not');
      expect(doc).toContain('agenticos_list');
      expect(normalized).toContain('restart');
      expect(doc).toContain('AGENTICOS_HOME');
      expect(doc).toContain('AGENTICOS_HOME="$AGENTICOS_HOME"');
      expect(normalized).not.toContain('seed workspace');
      expect(normalized).not.toContain('default: ~/agenticos');
      expect(normalized).not.toContain('product default: ~/agenticos');
      expect(doc).toContain('claude mcp get agenticos');
      expect(doc).toContain('claude mcp remove agenticos');
      expect(doc).toContain('codex mcp get agenticos');
      expect(doc).toContain('codex mcp remove agenticos');
    }
  });
});
