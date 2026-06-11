import { execGit } from './exec-git.js';
import { detectCanonicalMainWriteProtection } from './canonical-main-guard.js';
import {
  matchesRuntimeReviewExcludedPath,
  resolveRuntimeReviewSurfacePaths,
} from './runtime-review-surface.js';

/**
 * Canonical-main drift guard (G4 / #556).
 *
 * The canonical-main write protection already blocks `agenticos_save` commits on
 * the primary `main` checkout, but nothing surfaces the two ways the trusted
 * baseline silently erodes:
 *   1. local `main` falling behind `origin/main` (a stale baseline), and
 *   2. real development artifacts accumulating uncommitted on the main checkout
 *      (work that belongs in an isolated issue worktree).
 *
 * This assessment is prompt-first and read-only: it never pulls and never
 * discards. It only surfaces actionable warnings on switch/status.
 */

export interface CanonicalMainDriftAssessment {
  /** True only for the primary worktree currently on `main` (the canonical baseline). */
  applies: boolean;
  /** Commits local `main` is behind `origin/main`. 0 when in sync or undeterminable. */
  behind_count: number;
  /** Whether origin/main could be compared at all (false ⇒ behind_count not proven). */
  compared_against_origin: boolean;
  /** Non-runtime tracked/working-tree paths dirty on the main checkout (real changes). */
  real_change_paths: string[];
}

const EMPTY: CanonicalMainDriftAssessment = {
  applies: false,
  behind_count: 0,
  compared_against_origin: false,
  real_change_paths: [],
};

/** Extract the affected path from a `git status --porcelain` line (handles renames). */
function parsePorcelainPaths(output: string): string[] {
  const paths: string[] = [];
  for (const rawLine of output.split('\n')) {
    if (rawLine.trim().length === 0) continue;
    // Porcelain v1: 'XY <path>' or 'R  <old> -> <new>'.
    const body = rawLine.slice(3);
    const renameIdx = body.indexOf(' -> ');
    const path = renameIdx >= 0 ? body.slice(renameIdx + 4) : body;
    const trimmed = path.trim().replace(/^"(.*)"$/, '$1');
    if (trimmed.length > 0) paths.push(trimmed);
  }
  return paths;
}

export async function assessCanonicalMainDrift(params: {
  repoPath: string;
  projectPath: string;
  projectYaml: any;
}): Promise<CanonicalMainDriftAssessment> {
  let guard;
  try {
    guard = await detectCanonicalMainWriteProtection(params.repoPath);
  } catch {
    return EMPTY;
  }

  // Only the primary worktree on `main` is the canonical baseline; isolated issue
  // worktrees are expected to be dirty and on feature branches.
  if (!(guard.current_branch === 'main' && guard.workspace_type === 'main')) {
    return EMPTY;
  }

  const repoRoot = guard.git_worktree_root ?? params.repoPath;

  // Behind-origin. Best-effort fetch first so the count reflects the real remote;
  // on failure (offline/unauthed) fall back to the last-fetched origin/main ref.
  await execGit(repoRoot, ['fetch', '--quiet', 'origin', 'main'], { allowFailure: true, timeout: 8000 });
  let behindCount = 0;
  let comparedAgainstOrigin = false;
  const behind = await execGit(repoRoot, ['rev-list', '--count', 'main..origin/main'], {
    allowFailure: true,
    timeout: 10000,
  });
  if (behind.ok) {
    const parsed = parseInt(behind.stdout.trim(), 10);
    if (Number.isFinite(parsed)) {
      behindCount = parsed;
      comparedAgainstOrigin = true;
    }
  }

  // Real (non-runtime) working-tree changes. Runtime/continuity surfaces are
  // classified the same way pr_scope_check does, so the two stay consistent.
  let realChangePaths: string[] = [];
  const status = await execGit(repoRoot, ['status', '--porcelain', '--untracked-files=all'], {
    allowFailure: true,
    timeout: 15000,
  });
  if (status.ok) {
    const changed = parsePorcelainPaths(status.stdout);
    if (changed.length > 0) {
      let excluded: string[] = [];
      try {
        const surfaces = resolveRuntimeReviewSurfacePaths(params.projectPath, params.projectYaml, {
          include_claude_state_mirror: true,
          repo_root: repoRoot,
        });
        excluded = [...surfaces.tracked_review_excluded_paths, ...surfaces.sidecar_only_paths];
      } catch {
        excluded = [];
      }
      realChangePaths = changed.filter((path) => !matchesRuntimeReviewExcludedPath(path, excluded));
    }
  }

  return {
    applies: true,
    behind_count: behindCount,
    compared_against_origin: comparedAgainstOrigin,
    real_change_paths: realChangePaths,
  };
}

export function buildCanonicalMainDriftStatusLines(assessment: CanonicalMainDriftAssessment): string[] {
  if (!assessment.applies) return [];
  const lines: string[] = [];

  if (assessment.behind_count > 0) {
    lines.push(
      `⚠️ Canonical main drift: local main is ${assessment.behind_count} commit(s) behind origin/main — ` +
        'pull before relying on it as the trusted baseline.',
    );
  }

  if (assessment.real_change_paths.length > 0) {
    lines.push(
      `⚠️ Real changes on canonical main (${assessment.real_change_paths.length}) — move them to an ` +
        'isolated issue worktree; the canonical main checkout must stay a clean trusted baseline:',
    );
    const shown = assessment.real_change_paths.slice(0, 5);
    for (const path of shown) lines.push(`   - ${path}`);
    const remaining = assessment.real_change_paths.length - shown.length;
    if (remaining > 0) lines.push(`   - …and ${remaining} more`);
  }

  return lines;
}
