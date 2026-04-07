import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  resolveAgenticOSProductRoot,
  toCanonicalProductRelativePath,
} from '../product-source-root.js';

async function makeWorkspaceHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'agenticos-product-root-workspace-'));
  const productRoot = join(home, 'projects', 'agenticos');
  await mkdir(join(productRoot, '.meta'), { recursive: true });
  await mkdir(join(productRoot, 'mcp-server'), { recursive: true });
  await writeFile(join(productRoot, '.project.yaml'), 'meta:\n  id: agenticos\n', 'utf-8');
  return home;
}

async function makeStandaloneProductRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'agenticos-product-root-standalone-'));
  await mkdir(join(root, '.meta'), { recursive: true });
  await mkdir(join(root, 'mcp-server'), { recursive: true });
  await writeFile(join(root, '.project.yaml'), 'meta:\n  id: agenticos\n', 'utf-8');
  return root;
}

describe('product source root', () => {
  afterEach(() => {
    delete process.env.AGENTICOS_HOME;
  });

  it('prefers nested product roots under workspace home', async () => {
    const home = await makeWorkspaceHome();
    process.env.AGENTICOS_HOME = home;

    expect(resolveAgenticOSProductRoot()).toBe(join(home, 'projects', 'agenticos'));
  });

  it('falls back to standalone product-root checkouts', async () => {
    const root = await makeStandaloneProductRoot();
    process.env.AGENTICOS_HOME = root;

    expect(resolveAgenticOSProductRoot()).toBe(root);
  });

  it('strips the legacy projects/agenticos prefix for standalone-safe canonical paths', () => {
    expect(toCanonicalProductRelativePath('projects/agenticos/mcp-server/src/index.ts'))
      .toBe('mcp-server/src/index.ts');
    expect(toCanonicalProductRelativePath('.meta/templates/.project.yaml'))
      .toBe('.meta/templates/.project.yaml');
  });
});
