import { existsSync } from 'fs';
import { join } from 'path';
import { getAgenticOSHome } from './registry.js';

function looksLikeProductRoot(candidate: string): boolean {
  return existsSync(join(candidate, '.project.yaml'))
    && existsSync(join(candidate, '.meta'))
    && existsSync(join(candidate, 'mcp-server'));
}

export function resolveAgenticOSProductRoot(anchor = getAgenticOSHome()): string {
  const nested = join(anchor, 'projects', 'agenticos');
  if (looksLikeProductRoot(nested)) {
    return nested;
  }
  if (looksLikeProductRoot(anchor)) {
    return anchor;
  }
  return nested;
}

export function resolveAgenticOSProductPath(...segments: string[]): string {
  return join(resolveAgenticOSProductRoot(), ...segments);
}

export function toCanonicalProductRelativePath(path: string): string {
  return path.startsWith('projects/agenticos/')
    ? path.slice('projects/agenticos/'.length)
    : path;
}
