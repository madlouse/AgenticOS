import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import yaml from 'yaml';
import { execGit } from './exec-git.js';

/**
 * Single source of truth for two questions that used to be answered by
 * divergent copies across the codebase:
 *
 *  1. "Does this checkout's .project.yaml identity match the registry entry?"
 *     — previously duplicated in project-target.ts and project-resolve.ts
 *       (the #508 divergence: both had to be fixed in lockstep).
 *  2. "What are the git worktree root / common dir / common repo root for a
 *     directory?" — previously open-coded as `git rev-parse --show-toplevel`
 *     + `git rev-parse --git-common-dir` + `dirname` in save.ts, preflight.ts,
 *     edit-guard.ts, branch-bootstrap.ts, issue-bootstrap.ts, pr-scope-check.ts,
 *     canonical-main-guard.ts, and health.ts (the #509 divergence: save and
 *     record resolved the same worktree differently).
 */

export type ManagedProjectIdentityFailureCode = 'unreadable' | 'missing_meta_id' | 'mismatch';

export type ManagedProjectIdentityResult =
  | { ok: true; projectYaml: any }
  | { ok: false; code: ManagedProjectIdentityFailureCode; message: string };

/**
 * Read and verify a managed project's `.project.yaml` identity against its
 * registry id. Identity is proven by `meta.id` alone — the registry `name` is a
 * human display name and may legitimately diverge from `.project.yaml meta.name`
 * (see #508). Returns the parsed YAML on success so callers avoid a second read.
 *
 * Returns a discriminated result rather than throwing so each caller can map
 * the failure onto its own error type (plain Error vs ProjectResolveError)
 * while sharing the exact same checks and messages.
 */
export async function loadAndVerifyManagedProjectIdentity(
  projectYamlPath: string,
  registryProjectId: string,
): Promise<ManagedProjectIdentityResult> {
  let projectYaml: any;
  try {
    projectYaml = yaml.parse(await readFile(projectYamlPath, 'utf-8')) || {};
  } catch {
    return {
      ok: false,
      code: 'unreadable',
      message: `Project identity could not be proven because ${projectYamlPath} is missing or unreadable.`,
    };
  }

  const metaId = projectYaml?.meta?.id;
  if (!metaId) {
    return {
      ok: false,
      code: 'missing_meta_id',
      message: `Project identity could not be proven because ${projectYamlPath} is missing meta.id.`,
    };
  }
  if (metaId !== registryProjectId) {
    return {
      ok: false,
      code: 'mismatch',
      message: `Project identity mismatch: registry id "${registryProjectId}" does not match .project.yaml meta.id "${metaId}".`,
    };
  }

  return { ok: true, projectYaml };
}

export interface GitCheckoutIdentity {
  /** Absolute root of the working tree containing `fromDir` (`git rev-parse --show-toplevel`). */
  worktreeRoot: string;
  /** Absolute path of the shared git common directory (`git rev-parse --git-common-dir`, resolved). */
  commonDir: string;
  /**
   * Absolute root of the canonical repository the common dir belongs to. For an
   * isolated worktree this is the main checkout, NOT `worktreeRoot`. Boundary
   * checks that operate on files inside the working tree must use
   * `worktreeRoot`; repo-binding checks may compare against `commonRepoRoot`.
   */
  commonRepoRoot: string;
}

/**
 * Resolve the git worktree root, common dir, and common repo root for a
 * directory in one place. Returns null when `fromDir` is not inside a git
 * repository (callers treat that as "no git-backed continuity").
 */
export async function resolveGitCheckoutIdentity(fromDir: string): Promise<GitCheckoutIdentity | null> {
  try {
    const { stdout: topLevel } = await execGit(fromDir, ['rev-parse', '--show-toplevel']);
    const worktreeRoot = topLevel.trim();
    const { stdout: commonDirRaw } = await execGit(fromDir, ['rev-parse', '--git-common-dir']);
    const commonDir = resolve(worktreeRoot, commonDirRaw.trim());
    return {
      worktreeRoot,
      commonDir,
      commonRepoRoot: dirname(commonDir),
    };
  } catch {
    return null;
  }
}
