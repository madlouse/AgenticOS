import { readFile } from 'fs/promises';
import yaml from 'yaml';
import { listCasesAcrossProjects, listCasesForProject, normalizeCaseFilterType, normalizeCaseType, parseCaseTags, recordCaseKnowledge, renderCaseListMarkdown, type CaseProjectTarget } from '../utils/case-knowledge.js';
import { loadRegistry } from '../utils/registry.js';
import { resolveManagedProjectTarget } from '../utils/project-target.js';
import { validateManagedProjectTopology } from '../utils/project-contract.js';

function toCaseProjectTarget(resolved: Awaited<ReturnType<typeof resolveManagedProjectTarget>>): CaseProjectTarget {
  return {
    projectId: resolved.projectId,
    projectName: resolved.projectName,
    projectPath: resolved.projectPath,
    projectYaml: resolved.projectYaml,
  };
}

async function resolveAllProjectTargets(): Promise<CaseProjectTarget[]> {
  const registry = await loadRegistry();
  const targets: CaseProjectTarget[] = [];

  for (const project of registry.projects) {
    if (project.status !== 'active') {
      continue;
    }

    try {
      const projectYaml = yaml.parse(await readFile(`${project.path}/.project.yaml`, 'utf-8')) || {};
      const topologyValidation = validateManagedProjectTopology(project.name, projectYaml);
      if (!topologyValidation.ok) {
        continue;
      }

      targets.push({
        projectId: project.id,
        projectName: project.name,
        projectPath: project.path,
        projectYaml,
      });
    } catch {
      continue;
    }
  }

  return targets;
}

export async function runRecordCase(args: any): Promise<string> {
  if (args?.project === 'all') {
    return '❌ agenticos_record_case does not support project="all". Pass a specific project or bind the session first.';
  }

  let resolved;
  try {
    resolved = await resolveManagedProjectTarget({
      project: args?.project,
      commandName: 'agenticos_record_case',
    });
  } catch (error: any) {
    return `❌ ${error.message}`;
  }

  const entry = await recordCaseKnowledge(toCaseProjectTarget(resolved), {
    type: normalizeCaseType(args?.type),
    title: args?.title,
    trigger: args?.trigger,
    behavior: args?.behavior,
    rootCause: args?.rootCause ?? args?.root_cause,
    impact: args?.impact,
    workaround: args?.workaround,
    prevention: args?.prevention,
    tags: parseCaseTags(args?.tags),
    timestamp: args?.timestamp,
  });

  return JSON.stringify({
    command: 'agenticos_record_case',
    status: 'RECORDED',
    project_id: entry.projectId,
    project_name: entry.projectName,
    project_path: entry.projectPath,
    case: {
      type: entry.type,
      title: entry.title,
      timestamp: entry.timestamp,
      tags: entry.tags,
      file_path: entry.filePath,
      relative_path: entry.relativePath,
    },
  }, null, 2);
}

export async function runListCases(args: any): Promise<string> {
  const type = normalizeCaseFilterType(args?.type);
  const tags = parseCaseTags(args?.tags);

  if (args?.project === 'all') {
    const targets = await resolveAllProjectTargets();
    const entries = await listCasesAcrossProjects(targets, { type, tags });
    return renderCaseListMarkdown(entries, 'Matching Cases Across Projects');
  }

  let resolved;
  try {
    resolved = await resolveManagedProjectTarget({
      project: args?.project,
      commandName: 'agenticos_list_cases',
    });
  } catch (error: any) {
    return `# Error\n\n${error.message}`;
  }

  const project = toCaseProjectTarget(resolved);
  const entries = await listCasesForProject(project, { type, tags });
  return renderCaseListMarkdown(entries, `Matching Cases for ${project.projectName}`);
}
