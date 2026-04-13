import { exec } from 'child_process';
import { updateClaudeMdState } from '../utils/distill.js';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import yaml from 'yaml';
import { resolveManagedProjectTarget } from '../utils/project-target.js';
import { resolveRuntimeReviewSurfacePaths, toProjectAbsoluteRuntimePath } from '../utils/runtime-review-surface.js';
import { resolveContextPolicyPlan, toRepoRelativePath } from '../utils/context-policy-plan.js';
import { resolveContinuitySurfacePlan } from '../utils/continuity-surface.js';
import {
  buildConversationRoutingStatusLines,
  detectLegacyTrackedTranscriptStatus,
  resolveConversationRoutingPlan,
} from '../utils/conversation-routing.js';

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

/** Detect git root from a directory path */
async function findGitRoot(fromDir: string): Promise<string | null> {
  try {
    const { stdout } = await execCommand(`git -C "${fromDir}" rev-parse --show-toplevel`);
    return stdout.trim();
  } catch {
    return null;
  }
}

function toRepoAbsolutePath(repoRoot: string, trackedPath: string): string {
  return join(repoRoot, trackedPath.replace(/\/$/, ''));
}

function buildContinuityFailureMessage(projectName: string, reasons: string[]): string {
  return `❌ agenticos_save could not persist tracked continuity for "${projectName}"\n\n${reasons.map((reason) => `- ${reason}`).join('\n')}`;
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

  try {
    // Find git root from the project path (works regardless of AGENTICOS_HOME)
    const gitRoot = await findGitRoot(projectPath);

    let contextPolicyPlan;
    try {
      contextPolicyPlan = resolveContextPolicyPlan({
        projectName: project.name,
        projectPath,
        projectYaml,
        repoRoot: gitRoot,
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

    if (continuityPlan && continuityPlan.unsupported_reasons.length > 0) {
      return buildContinuityFailureMessage(project.name, continuityPlan.unsupported_reasons);
    }

    const conversationRoutingPlan = resolveConversationRoutingPlan(contextPolicyPlan);
    const trackedConversationReviewPath = gitRoot
      ? toRepoRelativePath(gitRoot, contextPolicyPlan.trackedContextPaths.conversations, { directory: true })
      : contextPolicyPlan.trackedContextDisplayPaths.conversations;
    const legacyTranscriptStatus = contextPolicyPlan.policy === 'public_distilled' && gitRoot
      ? await detectLegacyTrackedTranscriptStatus(contextPolicyPlan, {
        tracked_transcript_dirty: await hasTrackedPublicTranscriptDiffs(
          gitRoot,
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

    if (!gitRoot) {
      return `⚠️ State saved but no git repo found at ${projectPath}\n\nTimestamp: ${state.session.last_backup}${claudeMdNote}`;
    }

    // Project-scoped git: stage policy-aware continuity paths for private repos, otherwise keep runtime-managed paths.
    const gitCmd = `git -C "${gitRoot}"`;
    const stagePaths = continuityPlan
      ? [
        ...continuityPlan.tracked_continuity_paths,
        ...continuityPlan.optional_guidance_paths,
      ]
      : resolveRuntimeReviewSurfacePaths(projectPath, projectYaml, {
        include_claude_state_mirror: true,
      }).tracked_review_excluded_paths;
    const stageTargets = stagePaths
      .map((trackedPath) => continuityPlan
        ? `"${toRepoAbsolutePath(gitRoot, trackedPath)}"`
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
        ? '\nRecovery: full tracked continuity staged for Git-backed restore'
        : `\nRecovery: distilled continuity staged for Git-backed restore; raw transcripts remain in ${conversationRoutingPlan.raw_conversations_display_dir}`
      : '';
    const routingNotes = buildConversationRoutingStatusLines(conversationRoutingPlan, legacyTranscriptStatus);
    const routingSuffix = routingNotes.length > 0 ? `\n${routingNotes.join('\n')}` : '';

    return `${phases.join('\n')}\n\nProject: "${project.name}"\nCommit: ${commitMessage}\nTimestamp: ${state.session.last_backup}${claudeMdNote}${recoveryNote}${routingSuffix}`;
  } catch (error: any) {
    return `⚠️ Partial save completed\n\nError: ${error.message}`;
  }
}
