import { readFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'yaml';
import { getAgenticOSHome } from './registry.js';

export interface AgentAdapterEntry {
  agent_id: string;
  support_tier: 'official' | 'experimental';
  adapter_file: string;
  adapter_family: string;
  required_runtime_guidance: string[];
}

export interface AgentAdapterMatrix {
  version: number;
  primary_policy_surface: string;
  adapters: AgentAdapterEntry[];
}

export async function loadAgentAdapterMatrix(): Promise<AgentAdapterMatrix> {
  const matrixPath = join(
    getAgenticOSHome(),
    'projects',
    'agenticos',
    '.meta',
    'bootstrap',
    'agent-adapter-matrix.yaml',
  );
  const content = await readFile(matrixPath, 'utf-8');
  return yaml.parse(content) as AgentAdapterMatrix;
}

export function getOfficialAgentAdapters(matrix: AgentAdapterMatrix): AgentAdapterEntry[] {
  return matrix.adapters.filter((adapter) => adapter.support_tier === 'official');
}

export function getAgentAdapter(matrix: AgentAdapterMatrix, agentId: string): AgentAdapterEntry {
  const match = matrix.adapters.find((adapter) => adapter.agent_id === agentId);
  if (!match) {
    throw new Error(`Unknown agent adapter "${agentId}".`);
  }
  return match;
}
