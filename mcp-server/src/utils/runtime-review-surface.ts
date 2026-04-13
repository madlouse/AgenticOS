import { basename, join, relative } from 'path';
import { resolveContextPolicyPlan } from './context-policy-plan.js';
import { resolveManagedProjectContextPaths } from './project-target.js';

export interface RuntimeReviewSurfacePaths {
  tracked_review_excluded_paths: string[];
  sidecar_only_paths: string[];
  private_transcript_blocked_paths: string[];
}

interface ResolveRuntimeReviewSurfaceOptions {
  include_claude_state_mirror?: boolean;
  repo_root?: string | null;
  fail_closed_on_context_policy_error?: boolean;
}

function normalizeRelativePathFromBase(basePath: string, absolutePath: string, treatAsDirectory = false): string {
  const relativePath = relative(basePath, absolutePath).replace(/\\/g, '/');
  if (!relativePath || relativePath.startsWith('..')) {
    throw new Error(`Runtime review surface path escapes comparison root: ${absolutePath}`);
  }
  return treatAsDirectory && !relativePath.endsWith('/') ? `${relativePath}/` : relativePath;
}

function normalizeCandidatePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function resolveRuntimeReviewSurfacePaths(
  projectPath: string,
  projectYaml: any,
  options: ResolveRuntimeReviewSurfaceOptions = {},
): RuntimeReviewSurfacePaths {
  const comparisonRoot = options.repo_root || projectPath;
  let contextPolicyPlan;
  try {
    contextPolicyPlan = resolveContextPolicyPlan({
      projectName: projectYaml?.meta?.name || basename(projectPath),
      projectPath,
      projectYaml,
      repoRoot: options.repo_root || null,
    });
  } catch (error) {
    if (options.fail_closed_on_context_policy_error) {
      throw error;
    }
    const contextPaths = resolveManagedProjectContextPaths(projectPath, projectYaml);
    const tracked = new Set<string>([
      normalizeRelativePathFromBase(comparisonRoot, contextPaths.statePath),
      normalizeRelativePathFromBase(comparisonRoot, contextPaths.markerPath),
      normalizeRelativePathFromBase(comparisonRoot, contextPaths.conversationsDir, true),
    ]);

    if (options.include_claude_state_mirror) {
      tracked.add('CLAUDE.md');
    }

    return {
      tracked_review_excluded_paths: Array.from(tracked),
      sidecar_only_paths: [
        '.private/conversations/',
        '.meta/transcripts/',
      ],
      private_transcript_blocked_paths: [
        '.private/conversations/',
        '.meta/transcripts/',
      ],
    };
  }
  const tracked = new Set<string>([
    normalizeRelativePathFromBase(comparisonRoot, contextPolicyPlan.trackedContextPaths.state),
    normalizeRelativePathFromBase(comparisonRoot, contextPolicyPlan.trackedContextPaths.lastRecord),
  ]);
  const sidecarOnlyPaths = contextPolicyPlan.sidecarOnlyPaths.map((path) =>
    normalizeRelativePathFromBase(comparisonRoot, path, true),
  );
  const privateTranscriptBlockedPaths = new Set<string>(sidecarOnlyPaths);

  if (contextPolicyPlan.policy === 'private_continuity' || contextPolicyPlan.policy === 'local_private') {
    tracked.add(normalizeRelativePathFromBase(comparisonRoot, contextPolicyPlan.trackedContextPaths.conversations, true));
  } else {
    privateTranscriptBlockedPaths.add(
      normalizeRelativePathFromBase(comparisonRoot, contextPolicyPlan.trackedContextPaths.conversations, true),
    );
  }

  if (options.include_claude_state_mirror) {
    tracked.add('CLAUDE.md');
  }

  return {
    tracked_review_excluded_paths: Array.from(tracked),
    sidecar_only_paths: sidecarOnlyPaths,
    private_transcript_blocked_paths: Array.from(privateTranscriptBlockedPaths),
  };
}

export function matchesRuntimeReviewExcludedPath(filePath: string, trackedPaths: string[]): boolean {
  const normalizedFile = normalizeCandidatePath(filePath);
  return trackedPaths.some((trackedPath) => {
    const normalizedTracked = normalizeCandidatePath(trackedPath);
    if (normalizedTracked.endsWith('/')) {
      return normalizedFile === normalizedTracked.slice(0, -1) || normalizedFile.startsWith(normalizedTracked);
    }
    return normalizedFile === normalizedTracked;
  });
}

export function toProjectAbsoluteRuntimePath(projectPath: string, trackedPath: string): string {
  return join(projectPath, trackedPath.replace(/\/$/, ''));
}
