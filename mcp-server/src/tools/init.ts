import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import yaml from 'yaml';
import { loadRegistry, saveRegistry } from '../utils/registry.js';

export async function initProject(args: any): Promise<string> {
  const { name, description = '', path: customPath } = args;
  const id = name.toLowerCase().replace(/\s+/g, '-');

  const projectPath = customPath || join(homedir(), 'AgenticOS', 'projects', id);

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

  // Update registry
  const registry = await loadRegistry();
  registry.projects.push({
    id,
    name,
    path: projectPath,
    status: 'active',
    created: new Date().toISOString().split('T')[0],
    last_accessed: new Date().toISOString(),
  });
  registry.active_project = id;
  await saveRegistry(registry);

  return `✅ Created project "${name}" at ${projectPath}\n\nProject ID: ${id}\nStatus: Active\n\nUse agenticos_switch to load this project context.`;
}
