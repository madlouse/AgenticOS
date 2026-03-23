import { readFile } from 'fs/promises';
import { join } from 'path';
import { loadRegistry } from '../utils/registry.js';

export async function getProjectContext(): Promise<string> {
  const registry = await loadRegistry();

  if (!registry.active_project) {
    return '# No Active Project\n\nUse `agenticos_switch` to activate a project.';
  }

  const project = registry.projects.find((p) => p.id === registry.active_project);
  if (!project) {
    return '# Error\n\nActive project not found in registry.';
  }

  try {
    const projectYaml = await readFile(join(project.path, '.project.yaml'), 'utf-8');
    const quickStart = await readFile(join(project.path, '.context', 'quick-start.md'), 'utf-8');
    const state = await readFile(join(project.path, '.context', 'state.yaml'), 'utf-8');

    return `# ${project.name}\n\n## Project Configuration\n\`\`\`yaml\n${projectYaml}\`\`\`\n\n## Quick Start\n${quickStart}\n\n## Current State\n\`\`\`yaml\n${state}\`\`\``;
  } catch (error: any) {
    return `# Error Loading Context\n\n${error.message}`;
  }
}
