import { resolveManagedProjectTarget, resolveManagedProjectContextPaths } from '../utils/project-target.js';
import { getEvolutionLogDir, readEvolutionTimeline, renderEvolutionTimelineMarkdown } from '../utils/evolution-log.js';

interface EvolutionTimelineArgs {
  project?: string;
  project_path?: string;
  limit?: number;
  format?: 'markdown' | 'json';
}

/**
 * agenticos_evolution_timeline (#584): human-readable view over the same
 * git-tracked L2 evolution log that deterministic recall reads.
 */
export async function runEvolutionTimeline(args: EvolutionTimelineArgs = {}): Promise<string> {
  let resolved;
  try {
    resolved = await resolveManagedProjectTarget({
      project: args.project,
      projectPath: args.project_path,
      commandName: 'agenticos_evolution_timeline',
    });
  } catch (error: any) {
    return `❌ ${error.message}`;
  }

  const contextPaths = resolveManagedProjectContextPaths(resolved.projectPath, resolved.projectYaml);
  const entries = await readEvolutionTimeline(contextPaths.statePath, { limit: args.limit });
  const source = getEvolutionLogDir(contextPaths.statePath).replace(`${resolved.projectPath}/`, '');

  if (args.format === 'json') {
    return JSON.stringify({
      command: 'agenticos_evolution_timeline',
      project_id: resolved.projectId,
      source,
      entries,
    }, null, 2);
  }

  return renderEvolutionTimelineMarkdown(entries, `Project evolution timeline for ${resolved.projectId}`);
}
