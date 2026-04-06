import { readFile } from 'fs/promises';
import yaml from 'yaml';
import { resolveManagedProjectTarget } from '../utils/project-target.js';
import { extractLatestIssueBootstrap } from '../utils/guardrail-evidence.js';

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
    const parsedState = (yaml.parse(state) || {}) as Record<string, unknown>;
    const latestBootstrap = extractLatestIssueBootstrap(parsedState as any);
    const bootstrapSection = latestBootstrap
      ? `## Latest Issue Bootstrap\n- Issue: #${latestBootstrap.issue_id || 'unknown'}\n- Title: ${latestBootstrap.issue_title || 'Untitled issue'}\n- Recorded: ${latestBootstrap.recorded_at || 'unknown'}\n- Branch: ${latestBootstrap.current_branch || 'unknown'}\n- Startup surfaces: ${(latestBootstrap.startup_context_paths || []).length}\n- Additional context: ${(latestBootstrap.additional_context || []).length}\n\n`
      : '## Latest Issue Bootstrap\nNo issue bootstrap evidence recorded.\n\n';

    return `# ${resolved.projectName}\n\nProject ID: ${resolved.projectId}\nProject Path: ${resolved.projectPath}\n\n## Project Configuration\n\`\`\`yaml\n${projectYaml}\`\`\`\n\n## Quick Start\n${quickStart}\n\n${bootstrapSection}## Current State\n\`\`\`yaml\n${state}\`\`\``;
  } catch (error: any) {
    return `# Error Loading Context\n\n${error.message}`;
  }
}
