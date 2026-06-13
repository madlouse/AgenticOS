import { resolveManagedProjectTarget, resolveManagedProjectContextPaths } from '../utils/project-target.js';
import { recallContext, renderRecallMarkdown } from '../utils/recall.js';

interface RecallArgs {
  query?: string;
  issue_id?: string;
  project?: string;
  project_path?: string;
  limit?: number;
  format?: 'markdown' | 'json';
}

/**
 * agenticos_recall (#582 / L3): deterministic context recall over the project's
 * evolution log + knowledge docs. Operator-facing markdown by default (this is
 * also the #584 P1 slice — a human can ask "what's related to X"); the same
 * function powers the automatic cold-start injection in agenticos_issue_bootstrap.
 */
export async function runRecall(args: RecallArgs = {}): Promise<string> {
  let resolved;
  try {
    resolved = await resolveManagedProjectTarget({
      project: args.project,
      projectPath: args.project_path,
      commandName: 'agenticos_recall',
    });
  } catch (error: any) {
    return `❌ ${error.message}`;
  }

  const contextPaths = resolveManagedProjectContextPaths(resolved.projectPath, resolved.projectYaml);
  const candidates = await recallContext({
    statePath: contextPaths.statePath,
    knowledgeDir: contextPaths.knowledgeDir,
    knowledgeDisplayDir: contextPaths.knowledgeDir.replace(`${resolved.projectPath}/`, ''),
    issueId: args.issue_id,
    query: args.query,
    limit: args.limit,
  });

  if (args.format === 'json') {
    return JSON.stringify({
      command: 'agenticos_recall',
      project_id: resolved.projectId,
      query: args.query ?? null,
      issue_id: args.issue_id ?? null,
      recalled: candidates,
    }, null, 2);
  }

  const heading = args.issue_id
    ? `Recalled context for #${String(args.issue_id).replace(/^#/, '')}`
    : args.query
      ? `Recalled context for "${args.query}"`
      : 'Recalled context';
  return renderRecallMarkdown(candidates, heading);
}
