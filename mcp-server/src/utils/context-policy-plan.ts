import { join, relative, resolve } from 'path';
import {
  resolveManagedProjectContextDisplayPaths,
  resolveManagedProjectContextPaths,
  type ManagedProjectContextDisplayPaths,
  type ManagedProjectContextPaths,
} from './agent-context-paths.js';
import {
  type ContextPublicationPolicy,
  validateContextPublicationPolicy,
} from './project-contract.js';

export interface ContextPolicyPlan {
  policy: ContextPublicationPolicy;
  projectRoot: string;
  repoRoot: string | null;
  trackedContextPaths: {
    projectFile: string;
    quickStart: string;
    state: string;
    conversations: string;
    knowledge: string;
    tasks: string;
    lastRecord: string;
    artifacts: string;
  };
  trackedContextDisplayPaths: {
    projectFile: string;
    quickStart: string;
    state: string;
    conversations: string;
    knowledge: string;
    tasks: string;
    lastRecord: string;
    artifacts: string;
  };
  rawConversationsDir: string;
  trackedConversationsDir: string | null;
  sidecarOnlyPaths: string[];
  projectBoundaryViolations: string[];
  repoBoundaryViolations: string[];
}

interface ResolveContextPolicyPlanArgs {
  projectName: string;
  projectPath: string;
  projectYaml: any;
  repoRoot?: string | null;
}

function normalizePath(value: string): string {
  return resolve(value);
}

function isWithinRoot(rootPath: string, candidatePath: string): boolean {
  const normalizedRoot = normalizePath(rootPath);
  const normalizedCandidate = normalizePath(candidatePath);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`);
}

function collectRepoBoundaryViolations(
  repoRoot: string | null,
  trackedContextPaths: ContextPolicyPlan['trackedContextPaths'],
  rawConversationsDir: string,
  trackedConversationsDir: string | null,
): string[] {
  if (!repoRoot) {
    return [];
  }

  const candidates: Array<[string, string | null]> = [
    ['.project.yaml', trackedContextPaths.projectFile],
    ['quick-start', trackedContextPaths.quickStart],
    ['state', trackedContextPaths.state],
    ['conversations', trackedContextPaths.conversations],
    ['knowledge', trackedContextPaths.knowledge],
    ['tasks', trackedContextPaths.tasks],
    ['last_record', trackedContextPaths.lastRecord],
    ['artifacts', trackedContextPaths.artifacts],
    ['raw_conversations', rawConversationsDir],
    ['tracked_conversations', trackedConversationsDir],
  ];

  return candidates
    .filter(([, candidatePath]) => candidatePath && !isWithinRoot(repoRoot, candidatePath))
    .map(([label, candidatePath]) => `${label} path escapes repo root: ${candidatePath}`);
}

function collectProjectBoundaryViolations(
  projectRoot: string,
  trackedContextPaths: ContextPolicyPlan['trackedContextPaths'],
  rawConversationsDir: string,
  trackedConversationsDir: string | null,
): string[] {
  const candidates: Array<[string, string | null]> = [
    ['.project.yaml', trackedContextPaths.projectFile],
    ['quick-start', trackedContextPaths.quickStart],
    ['state', trackedContextPaths.state],
    ['conversations', trackedContextPaths.conversations],
    ['knowledge', trackedContextPaths.knowledge],
    ['tasks', trackedContextPaths.tasks],
    ['last_record', trackedContextPaths.lastRecord],
    ['artifacts', trackedContextPaths.artifacts],
    ['raw_conversations', rawConversationsDir],
    ['tracked_conversations', trackedConversationsDir],
  ];

  return candidates
    .filter(([, candidatePath]) => candidatePath && !isWithinRoot(projectRoot, candidatePath))
    .map(([label, candidatePath]) => `${label} path escapes project root: ${candidatePath}`);
}

export function toRepoRelativePath(repoRoot: string, absolutePath: string, options?: { directory?: boolean }): string {
  const normalizedRoot = normalizePath(repoRoot);
  const normalizedAbsolute = normalizePath(absolutePath);
  const relativePath = relative(normalizedRoot, normalizedAbsolute).replace(/\\/g, '/');

  if (!relativePath || relativePath.startsWith('..')) {
    throw new Error(`Path escapes repo root: ${absolutePath}`);
  }

  return options?.directory && !relativePath.endsWith('/') ? `${relativePath}/` : relativePath;
}

export function resolveContextPolicyPlan(args: ResolveContextPolicyPlanArgs): ContextPolicyPlan {
  const { projectName, projectPath, projectYaml } = args;
  const validation = validateContextPublicationPolicy(projectName, projectYaml);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const projectRoot = normalizePath(projectPath);
  const repoRoot = args.repoRoot ? normalizePath(args.repoRoot) : null;
  const displayPaths: ManagedProjectContextDisplayPaths = resolveManagedProjectContextDisplayPaths(projectYaml);
  const absolutePaths: ManagedProjectContextPaths = resolveManagedProjectContextPaths(projectRoot, projectYaml);
  const projectFile = join(projectRoot, '.project.yaml');

  const rawConversationsDir = validation.policy === 'public_distilled'
    ? join(projectRoot, '.private', 'conversations')
    : absolutePaths.conversationsDir;
  const trackedConversationsDir = validation.policy === 'public_distilled'
    ? null
    : absolutePaths.conversationsDir;

  const trackedContextPaths = {
    projectFile,
    quickStart: absolutePaths.quickStartPath,
    state: absolutePaths.statePath,
    conversations: absolutePaths.conversationsDir,
    knowledge: absolutePaths.knowledgeDir,
    tasks: absolutePaths.tasksDir,
    lastRecord: absolutePaths.markerPath,
    artifacts: absolutePaths.artifactsDir,
  };

  const trackedContextDisplayPaths = {
    projectFile: '.project.yaml',
    quickStart: displayPaths.quickStartPath,
    state: displayPaths.statePath,
    conversations: displayPaths.conversationsDir,
    knowledge: displayPaths.knowledgeDir,
    tasks: displayPaths.tasksDir,
    lastRecord: displayPaths.markerPath,
    artifacts: displayPaths.artifactsDir,
  };

  return {
    policy: validation.policy,
    projectRoot,
    repoRoot,
    trackedContextPaths,
    trackedContextDisplayPaths,
    rawConversationsDir,
    trackedConversationsDir,
    sidecarOnlyPaths: [
      join(projectRoot, '.private', 'conversations'),
      join(projectRoot, '.meta', 'transcripts'),
    ],
    projectBoundaryViolations: collectProjectBoundaryViolations(
      projectRoot,
      trackedContextPaths,
      rawConversationsDir,
      trackedConversationsDir,
    ),
    repoBoundaryViolations: collectRepoBoundaryViolations(
      repoRoot,
      trackedContextPaths,
      rawConversationsDir,
      trackedConversationsDir,
    ),
  };
}
