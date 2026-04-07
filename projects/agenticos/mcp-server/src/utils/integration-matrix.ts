import { readFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'yaml';
import { resolveAgenticOSProductRoot } from './product-source-root.js';

export interface IntegrationModeEntry {
  id: string;
  label: string;
  status: 'canonical' | 'supported-fallback' | 'limited-fallback' | 'experimental';
  when_to_use: string;
  capabilities: string[];
  limitations: string[];
  non_goals: string[];
}

export interface IntegrationModeMatrix {
  version: number;
  primary_mode: string;
  modes: IntegrationModeEntry[];
}

export async function loadIntegrationModeMatrix(): Promise<IntegrationModeMatrix> {
  const matrixPath = join(
    resolveAgenticOSProductRoot(),
    '.meta',
    'bootstrap',
    'integration-mode-matrix.yaml',
  );
  const content = await readFile(matrixPath, 'utf-8');
  return yaml.parse(content) as IntegrationModeMatrix;
}

export function getIntegrationMode(
  matrix: IntegrationModeMatrix,
  modeId: string,
): IntegrationModeEntry {
  const match = matrix.modes.find((mode) => mode.id === modeId);
  if (!match) {
    throw new Error(`Unknown integration mode "${modeId}".`);
  }
  return match;
}

export function getPrimaryIntegrationMode(
  matrix: IntegrationModeMatrix,
): IntegrationModeEntry {
  return getIntegrationMode(matrix, matrix.primary_mode);
}
