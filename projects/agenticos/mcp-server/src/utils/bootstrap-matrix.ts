import { readFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'yaml';
import { getAgenticOSHome } from './registry.js';

export interface AgentBootstrapEntry {
  id: string;
  label: string;
  support_tier: 'official' | 'experimental';
  transport: string;
  canonical_bootstrap_method: string;
  canonical_config_location: string;
  bootstrap_command?: string;
  bootstrap_snippet?: string;
  verification: string[];
  transport_debug: string[];
  routing_debug: string[];
}

export interface AgentBootstrapMatrix {
  version: number;
  primary_integration_mode: string;
  supported_agents: AgentBootstrapEntry[];
  experimental_agents?: AgentBootstrapEntry[];
}

export async function loadAgentBootstrapMatrix(): Promise<AgentBootstrapMatrix> {
  const matrixPath = join(
    getAgenticOSHome(),
    'projects',
    'agenticos',
    '.meta',
    'bootstrap',
    'agent-bootstrap-matrix.yaml',
  );
  const content = await readFile(matrixPath, 'utf-8');
  return yaml.parse(content) as AgentBootstrapMatrix;
}

export function getBootstrapAgent(
  matrix: AgentBootstrapMatrix,
  agentId: string,
): AgentBootstrapEntry {
  const match = [...matrix.supported_agents, ...(matrix.experimental_agents || [])]
    .find((agent) => agent.id === agentId);

  if (!match) {
    throw new Error(`Unknown bootstrap agent "${agentId}".`);
  }

  return match;
}
