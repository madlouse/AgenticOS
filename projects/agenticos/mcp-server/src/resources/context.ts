import { readFile } from 'fs/promises';
import { resolveManagedProjectTarget } from '../utils/project-target.js';

export async function getProjectContext(): Promise<string> {
  let resolved;
  try {
    resolved = await resolveManagedProjectTarget({
      commandName: 'agenticos://context/current',
    });
  } catch (error: any) {
    return `# Error\n\n${error.message}`;
  }

  try {
    const projectYaml = await readFile(resolved.projectYamlPath, 'utf-8');
    const quickStart = await readFile(resolved.quickStartPath, 'utf-8');
    const state = await readFile(resolved.statePath, 'utf-8');

    return `# ${resolved.projectName}\n\nProject ID: ${resolved.projectId}\nProject Path: ${resolved.projectPath}\n\n## Project Configuration\n\`\`\`yaml\n${projectYaml}\`\`\`\n\n## Quick Start\n${quickStart}\n\n## Current State\n\`\`\`yaml\n${state}\`\`\``;
  } catch (error: any) {
    return `# Error Loading Context\n\n${error.message}`;
  }
}
