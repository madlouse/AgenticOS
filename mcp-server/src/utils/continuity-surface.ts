import { join } from 'path';
import { type ContextPolicyPlan, toRepoRelativePath } from './context-policy-plan.js';

export interface ContinuitySurfacePlan {
  policy: ContextPolicyPlan['policy'];
  tracked_continuity_paths: string[];
  excluded_paths: string[];
  required_guidance_paths: string[];
  optional_guidance_paths: string[];
  unsupported_reasons: string[];
}

interface ResolveContinuitySurfaceOptions {
  include_claude_state_mirror?: boolean;
  include_agents_guidance?: boolean;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

function toProjectRelativePath(projectRoot: string, absolutePath: string, directory = false): string {
  const repoRelative = absolutePath
    .replace(projectRoot.replace(/\\/g, '/'), '')
    .replace(/^\/+/, '')
    .replace(/\\/g, '/');

  if (!repoRelative) {
    throw new Error(`Path escapes project root: ${absolutePath}`);
  }

  return directory && !repoRelative.endsWith('/') ? `${repoRelative}/` : repoRelative;
}

function resolveExcludedPaths(plan: ContextPolicyPlan): string[] {
  const excluded = [
    plan.trackedContextDisplayPaths.lastRecord,
    '.private/conversations/',
    '.meta/transcripts/',
    'node_modules/',
    'coverage/',
  ];

  if (plan.repoRoot) {
    try {
      excluded[0] = toRepoRelativePath(plan.repoRoot, plan.trackedContextPaths.lastRecord);
    } catch {
      excluded[0] = plan.trackedContextDisplayPaths.lastRecord;
    }
  }

  return uniq(excluded);
}

export function resolveContinuitySurfacePlan(
  plan: ContextPolicyPlan,
  options: ResolveContinuitySurfaceOptions = {},
): ContinuitySurfacePlan {
  const unsupportedReasons: string[] = [];

  if (plan.policy !== 'private_continuity') {
    return {
      policy: plan.policy,
      tracked_continuity_paths: [],
      excluded_paths: resolveExcludedPaths(plan),
      required_guidance_paths: [],
      optional_guidance_paths: [],
      unsupported_reasons: unsupportedReasons,
    };
  }

  if (!plan.repoRoot) {
    unsupportedReasons.push('private_continuity requires a git repo root for tracked continuity persistence.');
  }

  const trackedContinuity = new Set<string>();
  const optionalGuidance = new Set<string>();

  const addTrackedPath = (label: string, absolutePath: string, directory = false) => {
    if (!plan.repoRoot) {
      return;
    }
    try {
      trackedContinuity.add(toRepoRelativePath(plan.repoRoot, absolutePath, { directory }));
    } catch {
      unsupportedReasons.push(`${label} path escapes repo root: ${absolutePath}`);
    }
  };

  addTrackedPath('.project.yaml', plan.trackedContextPaths.projectFile);
  addTrackedPath('quick-start', plan.trackedContextPaths.quickStart);
  addTrackedPath('state', plan.trackedContextPaths.state);
  addTrackedPath('conversations', plan.trackedContextPaths.conversations, true);
  addTrackedPath('knowledge', plan.trackedContextPaths.knowledge, true);
  addTrackedPath('tasks', plan.trackedContextPaths.tasks, true);

  if (options.include_claude_state_mirror !== false) {
    const claudePath = join(plan.projectRoot, 'CLAUDE.md');
    if (plan.repoRoot) {
      try {
        optionalGuidance.add(toRepoRelativePath(plan.repoRoot, claudePath));
      } catch {
        unsupportedReasons.push(`CLAUDE.md path escapes repo root: ${claudePath}`);
      }
    } else {
      optionalGuidance.add(toProjectRelativePath(plan.projectRoot, claudePath));
    }
  }

  if (options.include_agents_guidance) {
    const agentsPath = join(plan.projectRoot, 'AGENTS.md');
    if (plan.repoRoot) {
      try {
        optionalGuidance.add(toRepoRelativePath(plan.repoRoot, agentsPath));
      } catch {
        unsupportedReasons.push(`AGENTS.md path escapes repo root: ${agentsPath}`);
      }
    } else {
      optionalGuidance.add(toProjectRelativePath(plan.projectRoot, agentsPath));
    }
  }

  for (const violation of plan.repoBoundaryViolations) {
    const isRequiredViolation = violation.startsWith('.project.yaml')
      || violation.startsWith('quick-start')
      || violation.startsWith('state')
      || violation.startsWith('conversations')
      || violation.startsWith('knowledge')
      || violation.startsWith('tasks');
    if (isRequiredViolation) {
      unsupportedReasons.push(violation);
    }
  }

  return {
    policy: plan.policy,
    tracked_continuity_paths: uniq(Array.from(trackedContinuity)),
    excluded_paths: resolveExcludedPaths(plan),
    required_guidance_paths: [],
    optional_guidance_paths: uniq(Array.from(optionalGuidance)),
    unsupported_reasons: uniq(unsupportedReasons),
  };
}
