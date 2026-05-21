import { runHealthCheck } from '../utils/health.js';
import { assessKnowledgeEvolutionHealth } from '../utils/knowledge-evolution-health.js';

export async function runHealth(args: any): Promise<string> {
  const result = await runHealthCheck(args ?? {});
  const knowledgeEvolution = await assessKnowledgeEvolutionHealth({
    projectPath: result.project_path,
    repoPath: args?.repo_path,
    repoSync: result.repo_sync,
  });
  const status = result.status === 'BLOCK'
    ? 'BLOCK'
    : result.status === 'WARN' || knowledgeEvolution.status === 'WARN'
      ? 'WARN'
      : 'PASS';
  return JSON.stringify({
    ...result,
    status,
    gates: [
      ...result.gates,
      {
        gate: 'knowledge_evolution',
        status: knowledgeEvolution.status,
        summary: knowledgeEvolution.summary,
      },
    ],
    knowledge_evolution: knowledgeEvolution,
    recovery_actions: [
      ...(result.recovery_actions ?? []),
      ...knowledgeEvolution.recovery_actions,
    ],
  }, null, 2);
}
