import { execGit } from './exec-git.js';

/**
 * Commit-hygiene surfacing for tracked continuity (G2 / #555).
 *
 * Full-mode `agenticos_record` writes `.context/state.yaml` and `CLAUDE.md` but
 * never commits — recording is the no-git path. When `agenticos_save` is not
 * subsequently called, the worktree is left with uncommitted continuity: state
 * is written but not durable. Across many parallel worktrees this becomes a
 * persistent dirty trail (observed in the hermes-agent-kit inspection). These
 * helpers detect that condition so the record response can flag it explicitly.
 */

export interface ContinuitySurface {
  /** Absolute path to the continuity file just written. */
  absPath: string;
  /** Operator-facing relative label (e.g. ".context/state.yaml", "CLAUDE.md"). */
  displayPath: string;
}

/**
 * Return the subset of the given continuity surfaces that are uncommitted
 * (modified, added, or untracked) in the working tree at `repoPath`.
 *
 * Uses `git status --porcelain` per path. A non-zero exit (e.g. the checkout is
 * not a git repository) is treated as "cannot prove dirty" and the path is
 * omitted rather than throwing — surfacing must never break the record flow.
 */
export async function detectUncommittedContinuity(
  repoPath: string,
  surfaces: ContinuitySurface[],
): Promise<string[]> {
  const uncommitted: string[] = [];
  for (const surface of surfaces) {
    const { ok, stdout } = await execGit(
      repoPath,
      ['status', '--porcelain', '--untracked-files=all', '--', surface.absPath],
      { allowFailure: true, timeout: 10000 },
    );
    if (ok && stdout.trim().length > 0) {
      uncommitted.push(surface.displayPath);
    }
  }
  return uncommitted;
}

/**
 * Render the governance note shown after a full-mode record when continuity is
 * written but uncommitted. Returns null when nothing is uncommitted so callers
 * can append unconditionally. This is a prompt, never an auto-commit.
 */
export function buildUncommittedContinuityNote(uncommittedDisplayPaths: string[]): string | null {
  if (uncommittedDisplayPaths.length === 0) return null;
  const list = uncommittedDisplayPaths.map((path) => `   - ${path}`).join('\n');
  return (
    '\n⚠️ Tracked continuity is written but NOT committed:\n' +
    `${list}\n` +
    '   Run agenticos_save to persist it to git — until then this continuity is not durable.\n'
  );
}
