import { mkdir, readFile, writeFile } from 'fs/promises';
import { basename, dirname, join } from 'path';
import yaml from 'yaml';
import {
  resolveManagedProjectContextDisplayPaths,
  resolveManagedProjectContextPaths,
} from './agent-context-paths.js';
import { resolveConversationRoutingPlan } from './conversation-routing.js';
import { resolveContextPolicyPlan } from './context-policy-plan.js';

export interface EntrySurfaceRefreshArgs {
  project_path: string;
  project_name?: string;
  project_description?: string;
  issue_id?: string;
  summary: string;
  status: string;
  current_focus: string;
  current_task_title?: string;
  current_task_status?: string;
  facts?: string[];
  decisions?: string[];
  pending?: string[];
  report_paths?: string[];
  recommended_entry_documents?: string[];
}

export interface EntrySurfaceRefreshResult {
  command: 'agenticos_refresh_entry_surfaces';
  status: 'REFRESHED';
  project_path: string;
  project_name: string;
  refreshed_at: string;
  issue_id: string | null;
  quick_start_path: string;
  state_path: string;
  report_paths: string[];
  recommended_entry_documents: string[];
}

interface ResolvedProjectIdentity {
  projectName: string;
  projectDescription: string;
  projectYaml: any;
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function uniqueOrdered(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
}

async function readProjectIdentity(projectPath: string, args: EntrySurfaceRefreshArgs): Promise<ResolvedProjectIdentity> {
  try {
    const parsed = yaml.parse(await readFile(join(projectPath, '.project.yaml'), 'utf-8')) as any;
    return {
      projectName: args.project_name || parsed?.meta?.name || basename(projectPath),
      projectDescription: args.project_description || parsed?.meta?.description || '',
      projectYaml: parsed || {},
    };
  } catch {
    return {
      projectName: args.project_name || basename(projectPath),
      projectDescription: args.project_description || '',
      projectYaml: {},
    };
  }
}

async function readState(statePath: string): Promise<any> {
  try {
    return yaml.parse(await readFile(statePath, 'utf-8')) || {};
  } catch {
    return {};
  }
}

function buildQuickStart(
  args: EntrySurfaceRefreshArgs,
  identity: ResolvedProjectIdentity,
  refreshedAt: string,
  projectPath: string,
  contextPaths: ReturnType<typeof resolveManagedProjectContextDisplayPaths>,
): string {
  const pending = normalizeList(args.pending);
  const facts = normalizeList(args.facts);
  const reportPaths = normalizeList(args.report_paths);
  const recommendedDocs = normalizeList(args.recommended_entry_documents);
  const overview = identity.projectDescription || args.summary;
  const lastAction = args.issue_id
    ? `Issue #${args.issue_id} merged — ${args.summary}`
    : args.summary;
  const resumeHere = pending[0] || args.current_focus;

  const lines: string[] = [
    `# ${identity.projectName} - Quick Start`,
    '',
    '## Project Overview',
    '',
    overview,
    '',
    '## Current Status',
    '',
    `- **Status**: ${args.status}`,
    `- **Last Action**: ${lastAction}`,
    `- **Current Focus**: ${args.current_focus}`,
    `- **Resume Here**: ${resumeHere}`,
    `- **Refreshed At**: ${refreshedAt}`,
    '',
    '## Key Facts',
  ];

  if (facts.length > 0) {
    for (const fact of facts.slice(0, 5)) {
      lines.push(`- ${fact}`);
    }
  } else {
    lines.push('- No key facts recorded');
  }

  if (reportPaths.length > 0) {
    lines.push('', '## Latest Landed Reports', '');
    for (const reportPath of reportPaths) {
      lines.push(`- ${reportPath}`);
    }
  }

  if (recommendedDocs.length > 0) {
    lines.push('', '## Recommended Entry Documents', '');
    recommendedDocs.forEach((doc, index) => {
      lines.push(`${index + 1}. ${doc}`);
    });
  }

  let conversationLayerLine = `- Conversation history surface: \`${contextPaths.conversationsDir}\``;
  try {
    const routingPlan = resolveConversationRoutingPlan(resolveContextPolicyPlan({
      projectName: identity.projectName,
      projectPath,
      projectYaml: identity.projectYaml,
    }));
    if (routingPlan.policy === 'public_distilled') {
      conversationLayerLine = `- Conversation history contract: tracked surface \`${contextPaths.conversationsDir}\`; raw transcripts route to \`${routingPlan.raw_conversations_display_dir}\``;
    }
  } catch {}

  lines.push(
    '',
    '## Canonical Layers',
    `- Operational state: \`${contextPaths.statePath}\``,
    conversationLayerLine,
    `- Durable knowledge: \`${contextPaths.knowledgeDir}\``,
    `- Execution plans: \`${contextPaths.tasksDir}\``,
    `- Deliverables: \`${contextPaths.artifactsDir}\``,
  );

  return `${lines.join('\n')}\n`;
}

function buildState(
  args: EntrySurfaceRefreshArgs,
  existingState: any,
  refreshedAt: string,
  contextPaths: ReturnType<typeof resolveManagedProjectContextDisplayPaths>,
): any {
  const facts = normalizeList(args.facts);
  const decisions = normalizeList(args.decisions);
  const pending = normalizeList(args.pending);
  const reportPaths = normalizeList(args.report_paths);
  const recommendedDocs = normalizeList(args.recommended_entry_documents);

  const state = existingState;
  state.session = state.session || {};
  if (!state.session.id) {
    state.session.id = `entry-refresh-${refreshedAt.substring(0, 10)}`;
  }
  if (!state.session.started) {
    state.session.started = refreshedAt;
  }
  if (!state.session.agent) {
    state.session.agent = 'agenticos-entry-refresh';
  }
  state.session.last_backup = refreshedAt;
  state.session.last_entry_surface_refresh = refreshedAt;

  state.current_task = {
    ...(state.current_task || {}),
    title: args.current_task_title || args.current_focus,
    status: args.current_task_status || 'pending',
    next_step: pending[0] || args.current_focus,
    updated: refreshedAt,
  };

  state.working_memory = state.working_memory || {};
  state.working_memory.facts = facts;
  state.working_memory.decisions = decisions;
  state.working_memory.pending = pending;

  state.loaded_context = uniqueOrdered([
    '.project.yaml',
    contextPaths.quickStartPath,
    ...reportPaths,
    ...recommendedDocs,
  ]);

  state.entry_surface_refresh = {
    refreshed_at: refreshedAt,
    issue_id: args.issue_id || null,
    summary: args.summary,
    status: args.status,
    current_focus: args.current_focus,
    report_paths: reportPaths,
    recommended_entry_documents: recommendedDocs,
  };

  return state;
}

export async function refreshEntrySurfaces(args: EntrySurfaceRefreshArgs): Promise<EntrySurfaceRefreshResult> {
  if (!args?.project_path) {
    throw new Error('project_path is required.');
  }
  if (!args?.summary?.trim()) {
    throw new Error('summary is required.');
  }
  if (!args?.status?.trim()) {
    throw new Error('status is required.');
  }
  if (!args?.current_focus?.trim()) {
    throw new Error('current_focus is required.');
  }

  const refreshedAt = new Date().toISOString();
  const projectPath = args.project_path;
  const identity = await readProjectIdentity(projectPath, args);
  const configuredPaths = resolveManagedProjectContextPaths(projectPath, identity.projectYaml);
  const displayPaths = resolveManagedProjectContextDisplayPaths(identity.projectYaml);
  const quickStartPath = configuredPaths.quickStartPath;
  const statePath = configuredPaths.statePath;

  await mkdir(dirname(quickStartPath), { recursive: true });
  await mkdir(dirname(statePath), { recursive: true });

  const existingState = await readState(statePath);
  const nextState = buildState(args, existingState, refreshedAt, displayPaths);
  const nextQuickStart = buildQuickStart(args, identity, refreshedAt, projectPath, displayPaths);

  await writeFile(quickStartPath, nextQuickStart, 'utf-8');
  await writeFile(statePath, yaml.stringify(nextState), 'utf-8');

  return {
    command: 'agenticos_refresh_entry_surfaces',
    status: 'REFRESHED',
    project_path: projectPath,
    project_name: identity.projectName,
    refreshed_at: refreshedAt,
    issue_id: args.issue_id || null,
    quick_start_path: quickStartPath,
    state_path: statePath,
    report_paths: normalizeList(args.report_paths),
    recommended_entry_documents: normalizeList(args.recommended_entry_documents),
  };
}
