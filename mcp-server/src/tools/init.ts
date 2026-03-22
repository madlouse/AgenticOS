import { mkdir, writeFile, access } from 'fs/promises';
import { join } from 'path';
import yaml from 'yaml';
import { loadRegistry, saveRegistry, getAgenticOSHome } from '../utils/registry.js';
import { generateClaudeMd, generateAgentsMd } from '../utils/distill.js';

export async function initProject(args: any): Promise<string> {
  const { name, description = '', path: customPath } = args;
  const id = name.toLowerCase().replace(/\s+/g, '-');

  const projectPath = customPath || join(getAgenticOSHome(), 'projects', id);

  // Check idempotency: does the project already exist on disk or in registry?
  let pathExists = false;
  try {
    await access(join(projectPath, '.project.yaml'));
    pathExists = true;
  } catch {
    pathExists = false;
  }

  const registry = await loadRegistry();
  const existingIdx = registry.projects.findIndex((p) => p.id === id);
  const registryHasId = existingIdx >= 0;

  if (pathExists && registryHasId) {
    // Both exist — project is already fully set up
    registry.active_project = id;
    await saveRegistry(registry);
    return `Project '${name}' already exists at ${projectPath}. Use \`agenticos_switch\` to activate it.`;
  }

  if (pathExists && !registryHasId) {
    // Orphan recovery: files exist but registry entry is missing
    const projectEntry = {
      id,
      name,
      path: projectPath,
      status: 'active' as const,
      created: new Date().toISOString().split('T')[0],
      last_accessed: new Date().toISOString(),
    };
    registry.projects.push(projectEntry);
    registry.active_project = id;
    await saveRegistry(registry);
    return `Re-registered existing project '${name}'.`;
  }

  if (!pathExists && registryHasId) {
    // Stale registry entry: remove it and proceed with fresh creation
    registry.projects.splice(existingIdx, 1);
    await saveRegistry(registry);
  }

  // Normal creation (neither exists, or stale registry was cleaned up)

  // Create directory structure
  await mkdir(join(projectPath, '.context', 'conversations'), { recursive: true });
  await mkdir(join(projectPath, 'knowledge'), { recursive: true });
  await mkdir(join(projectPath, 'tasks'), { recursive: true });
  await mkdir(join(projectPath, 'artifacts'), { recursive: true });

  // Create .project.yaml
  const projectYaml = {
    meta: {
      name,
      id,
      description,
      created: new Date().toISOString().split('T')[0],
      version: '1.0.0',
    },
    agent_context: {
      quick_start: '.context/quick-start.md',
      current_state: '.context/state.yaml',
    },
  };
  await writeFile(join(projectPath, '.project.yaml'), yaml.stringify(projectYaml), 'utf-8');

  // Create state.yaml
  const stateYaml = {
    session: {
      id: `session-${new Date().toISOString().split('T')[0]}-001`,
      started: new Date().toISOString(),
      agent: 'claude-sonnet-4.6',
    },
    current_task: null,
    working_memory: {
      facts: [],
      decisions: [],
      pending: [],
    },
    loaded_context: ['.project.yaml', '.context/quick-start.md'],
  };
  await writeFile(join(projectPath, '.context', 'state.yaml'), yaml.stringify(stateYaml), 'utf-8');

  // Create quick-start.md
  const quickStart = `# ${name} - Quick Start

## Project Overview
${description}

## Current Status
- Created: ${new Date().toISOString().split('T')[0]}
- Status: Active

## Next Steps
1. Define project goals
2. Set up initial tasks
3. Begin development
`;
  await writeFile(join(projectPath, '.context', 'quick-start.md'), quickStart, 'utf-8');

  // Generate Agent instruction files for cross-tool compatibility
  const claudeMd = generateClaudeMd(name, description);
  await writeFile(join(projectPath, 'CLAUDE.md'), claudeMd, 'utf-8');

  const agentsMd = generateAgentsMd(name, description);
  await writeFile(join(projectPath, 'AGENTS.md'), agentsMd, 'utf-8');

  // Update registry — reuse the registry loaded earlier (stale entry already removed if needed)
  const projectEntry = {
    id,
    name,
    path: projectPath,
    status: 'active' as const,
    created: new Date().toISOString().split('T')[0],
    last_accessed: new Date().toISOString(),
  };
  registry.projects.push(projectEntry);
  registry.active_project = id;
  await saveRegistry(registry);

  return `✅ Created project "${name}" at ${projectPath}\n\nProject ID: ${id}\nStatus: Active\n\nUse agenticos_switch to load this project context.`;
}
