import { join, relative } from 'path';
import { resolveManagedProjectContextPaths } from './project-target.js';

export interface RuntimeReviewSurfacePaths {
  tracked_review_excluded_paths: string[];
  sidecar_only_paths: string[];
}

interface ResolveRuntimeReviewSurfaceOptions {
  include_claude_state_mirror?: boolean;
}

function normalizeRepoRelativePath(projectPath: string, absolutePath: string, treatAsDirectory = false): string {
  const relativePath = relative(projectPath, absolutePath).replace(/\\/g, '/');
  if (!relativePath || relativePath.startsWith('..')) {
    throw new Error(`Runtime review surface path escapes project root: ${absolutePath}`);
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
  const contextPaths = resolveManagedProjectContextPaths(projectPath, projectYaml);
  const tracked = new Set<string>([
    normalizeRepoRelativePath(projectPath, contextPaths.statePath),
    normalizeRepoRelativePath(projectPath, contextPaths.markerPath),
    normalizeRepoRelativePath(projectPath, contextPaths.conversationsDir, true),
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
