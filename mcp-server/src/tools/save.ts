import { exec } from 'child_process';
import { updateClaudeMdState } from '../utils/distill.js';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, isAbsolute, join, relative, resolve } from 'path';
import yaml from 'yaml';
import { resolveManagedProjectTarget } from '../utils/project-target.js';
import { detectCanonicalMainWriteProtection } from '../utils/canonical-main-guard.js';
import { resolveRuntimeReviewSurfacePaths, toProjectAbsoluteRuntimePath } from '../utils/runtime-review-surface.js';
import { resolveContextPolicyPlan } from '../utils/context-policy-plan.js';
import { resolveContinuitySurfacePlan } from '../utils/continuity-surface.js';
import {
  buildConversationRoutingStatusLines,
  detectLegacyTrackedTranscriptStatus,
  resolveConversationRoutingPlan,
} from '../utils/conversation-routing.js';
import { type ProjectYamlSchema } from '../utils/yaml-schemas.js';

async function execCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        const enriched = Object.assign(error, { stdout, stderr });
        reject(enriched);
        return;
      }
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
      });
    });
  });
}

/** Detect git worktree/common repo identity from a directory path */
async function findGitIdentity(fromDir: string): Promise<{ worktreeRoot: string; commonRepoRoot: string } | null> {
  try {
    const { stdout: worktreeStdout } = await execCommand(`git -C "${fromDir}" rev-parse --show-toplevel`);
    const worktreeRoot = worktreeStdout.trim();
    const { stdout: commonDirStdout } = await execCommand(`git -C "${fromDir}" rev-parse --git-common-dir`);
    const commonDir = resolve(worktreeRoot, commonDirStdout.trim());
    return {
      worktreeRoot,
      commonRepoRoot: dirname(commonDir),
    };
  } catch {
    return null;
  }
}

function buildContinuityFailureMessage(projectName: string, reasons: string[]): string {
  return `❌ agenticos_save could not persist tracked continuity for "${projectName}"\n\n${reasons.map((reason) => `- ${reason}`).join('\n')}`;
}

function normalizePath(value: string): string {
  return resolve(value);
}

function normalizeTrackedPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/$/, '');
}

function isLastRecordMarkerPath(pathValue: string): boolean {
  return normalizeTrackedPath(pathValue).endsWith('/.last_record');
}

function toGitRelativePath(gitWorktreeRoot: string, absolutePath: string, options?: { directory?: boolean }): string {
  const relativePath = relative(normalizePath(gitWorktreeRoot), normalizePath(absolutePath)).replace(/\\/g, '/');
  if (!relativePath || relativePath.startsWith('..')) {
    throw new Error(`Path escapes git worktree root: ${absolutePath}`);
  }
  return options?.directory && !relativePath.endsWith('/') ? `${relativePath}/` : relativePath;
}

function resolveDeclaredSourceRepoRoots(projectPath: string, projectYaml: ProjectYamlSchema): string[] {
  if (!Array.isArray(projectYaml?.execution?.source_repo_roots)) {
    return [];
  }

  return Array.from(new Set(
    projectYaml.execution.source_repo_roots
      .filter((value: unknown): value is string => typeof value === 'string')
      .map((value: string) => value.trim())
      .filter((value: string) => value.length > 0)
      .map((value: string) => normalizePath(isAbsolute(value) ? value : join(projectPath, value))),
  ));
}

function normalizeGitHubRepo(value: string): string {
  return value.trim().replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '').toLowerCase();
}

function extractGitHubRepoFromRemoteOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (sshMatch) {
    return normalizeGitHubRepo(sshMatch[1]);
  }

  const httpsMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (httpsMatch) {
    return normalizeGitHubRepo(httpsMatch[1]);
  }

  const sshUrlMatch = trimmed.match(/^ssh:\/\/git@github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (sshUrlMatch) {
    return normalizeGitHubRepo(sshUrlMatch[1]);
  }

  return null;
}

async function validateGitBackedContinuityRepoBinding(args: {
  projectName: string;
  policy: 'private_continuity' | 'public_distilled' | 'local_private';
  projectPath: string;
  projectYaml: ProjectYamlSchema;
  gitWorktreeRoot: string | null;
  gitCommonRepoRoot: string | null;
}): Promise<string[]> {
  const { projectName, policy, projectPath, projectYaml, gitWorktreeRoot, gitCommonRepoRoot } = args;
  const reasons: string[] = [];

  if (!gitWorktreeRoot || !gitCommonRepoRoot) {
    reasons.push(`${policy} requires a git repo root for tracked continuity persistence.`);
    return reasons;
  }

  const declaredSourceRepoRoots = resolveDeclaredSourceRepoRoots(projectPath, projectYaml);
  if (declaredSourceRepoRoots.length === 0) {
    reasons.push(`Project "${projectName}" is marked github_versioned but missing execution.source_repo_roots.`);
    return reasons;
  }

  const normalizedCommonRepoRoot = normalizePath(gitCommonRepoRoot);
  if (!declaredSourceRepoRoots.includes(normalizedCommonRepoRoot)) {
    reasons.push(
      `git common repo root "${gitCommonRepoRoot}" is not one of declared execution.source_repo_roots for "${projectName}": ${declaredSourceRepoRoots.join(', ')}`,
    );
  }

  const declaredGithubRepo = typeof projectYaml?.source_control?.github_repo === 'string'
    ? projectYaml.source_control.github_repo.trim()
    : '';
  if (declaredGithubRepo.length > 0) {
    try {
      const { stdout } = await execCommand(`git -C "${gitWorktreeRoot}" remote get-url origin`);
      const actualGithubRepo = extractGitHubRepoFromRemoteOrigin(stdout);
      const expectedGithubRepo = normalizeGitHubRepo(declaredGithubRepo);
      if (actualGithubRepo !== expectedGithubRepo) {
        reasons.push(
          `git remote origin "${stdout.trim() || 'missing'}" does not match declared source_control.github_repo "${declaredGithubRepo}" for "${projectName}"`,
        );
      }
    } catch (error: any) {
      const detail = (error?.stderr || error?.stdout || error?.message || '').toString().trim() || 'missing';
      reasons.push(
        `git remote origin "${detail}" does not match declared source_control.github_repo "${declaredGithubRepo}" for "${projectName}"`,
      );
    }
  }

  return reasons;
}

async function hasTrackedPublicTranscriptDiffs(gitRoot: string, trackedConversationPath: string): Promise<boolean> {
  const { stdout } = await execCommand(
    `git -C "${gitRoot}" status --porcelain --untracked-files=all -- "${trackedConversationPath}"`,
  );
  return stdout.trim().length > 0;
}

export async function saveState(args: any): Promise<string> {
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').substring(0, 16);
  const { message } = args;
  const commitMessage = message || `Auto-save [${timestamp}]`;
  let resolved;
  try {
    resolved = await resolveManagedProjectTarget({
      project: args.project,
      commandName: 'agenticos_save',
    });
  } catch (error: any) {
    return `❌ ${error.message}`;
  }

  const { project, projectPath, projectYaml, statePath } = resolved;

  // Canonical-main guard: block save on canonical main checkouts to protect the trusted baseline
  const writeProtection = await detectCanonicalMainWriteProtection(projectPath);
  if (writeProtection.blocked) {
    return `❌ agenticos_save blocked for "${project.name}" — git persistence is not allowed on the canonical main checkout.\n\n` +
      `Canonical main checkout: ${writeProtection.reason ?? writeProtection.git_worktree_root}\n` +
      'Recovery:\n' +
      '- use agenticos_record inside the canonical main checkout (runtime surfaces only — does not touch git)\n' +
      '- switch to an isolated issue worktree to commit and push: agenticos_preflight or agenticos_branch_bootstrap\n' +
      '- keep runtime recording out of the canonical main checkout so future issue flow starts from a trusted baseline';
  }

  try {
    // Find git root from the project path (works regardless of AGENTICOS_HOME)
    const gitIdentity = await findGitIdentity(projectPath);
    const gitWorktreeRoot = gitIdentity?.worktreeRoot || null;
    const gitCommonRepoRoot = gitIdentity?.commonRepoRoot || null;

    let contextPolicyPlan;
    try {
      contextPolicyPlan = resolveContextPolicyPlan({
        projectName: project.name,
        projectPath,
        projectYaml,
        repoRoot: gitCommonRepoRoot,
      });
    } catch (error: any) {
      return `❌ ${error.message}`;
    }

    const continuityPlan = contextPolicyPlan.policy !== 'local_private'
      ? resolveContinuitySurfacePlan(contextPolicyPlan, {
        include_claude_state_mirror: true,
        include_agents_guidance: existsSync(`${projectPath}/AGENTS.md`),
      })
      : null;

    if (continuityPlan) {
      const repoBindingReasons = await validateGitBackedContinuityRepoBinding({
        projectName: project.name,
        policy: continuityPlan.policy,
        projectPath,
        projectYaml,
        gitWorktreeRoot,
        gitCommonRepoRoot,
      });
      const continuityFailureReasons = [
        ...continuityPlan.unsupported_reasons,
        ...repoBindingReasons,
      ];

      if (continuityFailureReasons.length > 0) {
        return buildContinuityFailureMessage(project.name, continuityFailureReasons);
      }
    }

    const conversationRoutingPlan = resolveConversationRoutingPlan(contextPolicyPlan);
    const trackedConversationReviewPath = gitWorktreeRoot
      ? toGitRelativePath(
        gitWorktreeRoot,
        join(projectPath, contextPolicyPlan.trackedContextDisplayPaths.conversations),
        { directory: true },
      )
      : contextPolicyPlan.trackedContextDisplayPaths.conversations;
    const legacyTranscriptStatus = contextPolicyPlan.policy === 'public_distilled' && gitWorktreeRoot
      ? await detectLegacyTrackedTranscriptStatus(contextPolicyPlan, {
        tracked_transcript_dirty: await hasTrackedPublicTranscriptDiffs(
          gitWorktreeRoot,
          trackedConversationReviewPath,
        ),
      })
      : await detectLegacyTrackedTranscriptStatus(contextPolicyPlan);

    if (legacyTranscriptStatus === 'tracked_legacy_dirty') {
      return `❌ agenticos_save blocked for "${project.name}"\n\n- tracked raw transcript changes are present under ${contextPolicyPlan.trackedContextDisplayPaths.conversations}\n- public_distilled projects must not publish new raw transcript history from tracked paths`;
    }
    if (legacyTranscriptStatus === 'misconfigured_public_raw_target') {
      return `❌ agenticos_save blocked for "${project.name}"\n\n- public transcript routing is misconfigured\n- raw transcript destination must remain sidecar-only for public_distilled projects`;
    }

    // Update state.yaml only after the continuity plan is known to be supported.
    const stateContent = await readFile(statePath, 'utf-8');
    const state = yaml.parse(stateContent);

    if (!state.session) state.session = {};
    state.session.last_backup = new Date().toISOString();

    await writeFile(statePath, yaml.stringify(state), 'utf-8');

    // Distill state.yaml into CLAUDE.md Current State section
    const claudeMdPath = `${projectPath}/CLAUDE.md`;
    const distillResult = await updateClaudeMdState(claudeMdPath, state, project.name);
    const claudeMdNote = distillResult.created
      ? '\n📝 CLAUDE.md was auto-generated (Project DNA section needs manual enrichment)'
      : '';

    if (!gitWorktreeRoot) {
      return `⚠️ State saved but no git repo found at ${projectPath}\n\nTimestamp: ${state.session.last_backup}${claudeMdNote}`;
    }

    // Project-scoped git: stage policy-aware continuity paths for private repos, otherwise keep runtime-managed paths.
    const gitCmd = `git -C "${gitWorktreeRoot}"`;
    const stagePaths = continuityPlan
      ? [
        toGitRelativePath(gitWorktreeRoot, join(projectPath, contextPolicyPlan.trackedContextDisplayPaths.projectFile)),
        toGitRelativePath(gitWorktreeRoot, join(projectPath, contextPolicyPlan.trackedContextDisplayPaths.quickStart)),
        toGitRelativePath(gitWorktreeRoot, join(projectPath, contextPolicyPlan.trackedContextDisplayPaths.state)),
        ...(continuityPlan.policy === 'private_continuity'
          ? [toGitRelativePath(gitWorktreeRoot, join(projectPath, contextPolicyPlan.trackedContextDisplayPaths.conversations), { directory: true })]
          : []),
        toGitRelativePath(gitWorktreeRoot, join(projectPath, contextPolicyPlan.trackedContextDisplayPaths.knowledge), { directory: true }),
        toGitRelativePath(gitWorktreeRoot, join(projectPath, contextPolicyPlan.trackedContextDisplayPaths.tasks), { directory: true }),
        toGitRelativePath(gitWorktreeRoot, join(projectPath, 'CLAUDE.md')),
        ...(existsSync(`${projectPath}/AGENTS.md`) ? [toGitRelativePath(gitWorktreeRoot, join(projectPath, 'AGENTS.md'))] : []),
      ]
      : resolveRuntimeReviewSurfacePaths(projectPath, projectYaml, {
        include_claude_state_mirror: true,
      }).tracked_review_excluded_paths;
    const filteredStagePaths = stagePaths.filter((trackedPath) => !isLastRecordMarkerPath(trackedPath));
    const stageTargets = filteredStagePaths
      .map((trackedPath) => continuityPlan
        ? `"${trackedPath}"`
        : `"${toProjectAbsoluteRuntimePath(projectPath, trackedPath)}"`)
      .join(' ');

    // Phase 1: git add
    await execCommand(`${gitCmd} add -A -- ${stageTargets}`);

    // Phase 2: git commit
    let committed = false;
    try {
      await execCommand(`${gitCmd} commit -m "${commitMessage}"`);
      committed = true;
    } catch (e: any) {
      const msg = (e.stderr || e.stdout || e.message || '').toString();
      if (msg.includes('nothing to commit')) {
        committed = false; // not an error
      } else {
        return `⚠️ State saved locally but git commit failed\n\nError: ${e.message}\nTimestamp: ${state.session.last_backup}${claudeMdNote}`;
      }
    }

    // Phase 3: git push
    let pushed = false;
    if (committed) {
      try {
        await execCommand(`${gitCmd} push`);
        pushed = true;
      } catch { /* push failure is degraded, not fatal */ }
    }

    // Build structured status
    const phases: string[] = [];
    phases.push('✅ State saved locally');
    if (committed) phases.push('📦 Git commit created');
    else phases.push('📦 No new changes to commit');
    if (pushed) phases.push('☁️ Pushed to remote');
    else if (committed) phases.push('⚠️ Push failed (committed locally, not synced)');

    const recoveryNote = continuityPlan
      ? continuityPlan.policy === 'private_continuity'
        ? pushed
          ? '\nRecovery: full tracked continuity synced for Git-backed restore'
          : committed
            ? '\nRecovery: tracked continuity committed locally; remote sync is still pending'
            : '\nRecovery: tracked continuity contract evaluated; no new continuity changes were committed'
        : pushed
          ? `\nRecovery: distilled continuity synced for Git-backed restore; raw transcripts remain in ${conversationRoutingPlan.raw_conversations_display_dir}`
          : committed
            ? `\nRecovery: distilled continuity committed locally; remote sync is still pending; raw transcripts remain in ${conversationRoutingPlan.raw_conversations_display_dir}`
            : `\nRecovery: distilled continuity contract evaluated; no new continuity changes were committed; raw transcripts remain in ${conversationRoutingPlan.raw_conversations_display_dir}`
      : '';
    const routingNotes = buildConversationRoutingStatusLines(conversationRoutingPlan, legacyTranscriptStatus);
    const routingSuffix = routingNotes.length > 0 ? `\n${routingNotes.join('\n')}` : '';

    return `${phases.join('\n')}\n\nProject: "${project.name}"\nCommit: ${commitMessage}\nTimestamp: ${state.session.last_backup}${claudeMdNote}${recoveryNote}${routingSuffix}`;
  } catch (error: any) {
    return `⚠️ Partial save completed\n\nError: ${error.message}`;
  }
}
