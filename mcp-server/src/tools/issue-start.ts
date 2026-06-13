import { runPreflight } from './preflight.js';
import { runBranchBootstrap } from './branch-bootstrap.js';
import { runIssueBootstrap } from './issue-bootstrap.js';
import { runEditGuard } from './edit-guard.js';

/**
 * Orchestration entrypoint for the mandatory issue-start guardrail chain (#519).
 *
 * The chain preflight → branch_bootstrap → issue_bootstrap → preflight → edit_guard
 * is order-sensitive (especially the *second* preflight, which must run inside the
 * new worktree after issue_bootstrap). Driving it by hand is easy to get wrong. This
 * tool runs the fixed sequence in one call, threads the created worktree forward,
 * and stops at the first failing step with the aggregated evidence. The individual
 * guardrail tools remain available for advanced/manual use.
 */

type GuardrailTaskType = 'discussion_only' | 'analysis_or_doc' | 'implementation' | 'bugfix' | 'bootstrap';

export interface IssueStartArgs {
  issue_id?: string;
  slug?: string;
  repo_path?: string;
  issue_title?: string;
  task_type?: GuardrailTaskType;
  branch_type?: string;
  declared_target_files?: string[];
  issue_body?: string;
  labels?: string[];
  linked_artifacts?: string[];
  remote_base_branch?: string;
  project_path?: string;
  /** Force-run (true) or skip (false) the edit_guard step. Defaults to running it when declared_target_files are provided. */
  run_edit_guard?: boolean;
}

interface StepRecord {
  step: 'preflight' | 'branch_bootstrap' | 'issue_bootstrap' | 'edit_guard';
  repo_path?: string;
  status: string;
  note?: string;
}

function parseToolResult(raw: string): Record<string, any> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { status: 'UNKNOWN', raw };
  } catch {
    // A sub-tool returned a non-JSON message (e.g. a fail-fast error string).
    return { status: 'ERROR', raw };
  }
}

function defaultBranchType(taskType: GuardrailTaskType): string {
  if (taskType === 'bugfix') return 'fix';
  if (taskType === 'bootstrap') return 'chore';
  return 'feat';
}

function blocked(summary: string, reasons: unknown, steps: StepRecord[]): string {
  const blockReasons = Array.isArray(reasons) ? reasons.filter((r) => typeof r === 'string') : [];
  return JSON.stringify({
    command: 'agenticos_issue_start',
    status: 'BLOCKED',
    summary,
    block_reasons: blockReasons,
    steps,
  }, null, 2);
}

export async function runIssueStart(args: IssueStartArgs): Promise<string> {
  const issueId = (args.issue_id ?? '').trim();
  const slug = (args.slug ?? '').trim();
  const repoPath = (args.repo_path ?? '').trim();
  const issueTitle = (args.issue_title ?? '').trim();
  const taskType: GuardrailTaskType = args.task_type ?? 'implementation';
  const branchType = (args.branch_type ?? defaultBranchType(taskType)).trim();
  const declaredTargetFiles = Array.isArray(args.declared_target_files) ? args.declared_target_files : [];
  const projectPath = args.project_path;
  const remoteBaseBranch = args.remote_base_branch;

  const missing: string[] = [];
  if (!issueId) missing.push('issue_id');
  if (!slug) missing.push('slug');
  if (!repoPath) missing.push('repo_path');
  if (!issueTitle) missing.push('issue_title');
  if (missing.length > 0) {
    return blocked(`missing required input(s): ${missing.join(', ')}`, [], []);
  }

  const steps: StepRecord[] = [];

  // Step 1: preflight on the source checkout (expected REDIRECT on canonical main).
  const pf1 = parseToolResult(await runPreflight({
    task_type: taskType,
    repo_path: repoPath,
    issue_id: issueId,
    declared_target_files: declaredTargetFiles,
    project_path: projectPath,
    remote_base_branch: remoteBaseBranch,
    worktree_required: true,
  }));
  steps.push({ step: 'preflight', repo_path: repoPath, status: pf1.status });
  if (pf1.status === 'BLOCK') {
    return blocked('source preflight blocked', pf1.block_reasons, steps);
  }

  // Resolve the worktree to operate in.
  let worktreePath = repoPath;
  let branchName: string | undefined = pf1.evidence?.current_branch;

  if (pf1.status === 'REDIRECT') {
    // Step 2: create the issue branch + isolated worktree.
    const bb = parseToolResult(await runBranchBootstrap({
      issue_id: issueId,
      slug,
      repo_path: repoPath,
      branch_type: branchType,
      project_path: projectPath,
      remote_base_branch: remoteBaseBranch,
    }));
    steps.push({ step: 'branch_bootstrap', status: bb.status, repo_path: bb.worktree_path });
    if (bb.status !== 'CREATED' || typeof bb.worktree_path !== 'string') {
      return blocked('branch bootstrap did not create a worktree', bb.block_reasons, steps);
    }
    worktreePath = bb.worktree_path;
    branchName = bb.branch_name;
  } else {
    // Already inside an isolated worktree — skip branch creation.
    steps[0].note = 'source checkout already passed preflight; skipped branch_bootstrap';
  }

  // Step 3: record issue-start evidence inside the worktree. The orchestration is
  // itself the clear-equivalent reset + startup load, so those flags are asserted.
  const ib = parseToolResult(await runIssueBootstrap({
    issue_id: issueId,
    issue_title: issueTitle,
    issue_body: args.issue_body,
    labels: args.labels,
    linked_artifacts: args.linked_artifacts,
    repo_path: worktreePath,
    project_path: projectPath,
    context_reset_performed: true,
    project_hot_load_performed: true,
    issue_payload_attached: true,
  }));
  steps.push({ step: 'issue_bootstrap', repo_path: worktreePath, status: ib.status });
  if (ib.status !== 'RECORDED') {
    return blocked('issue bootstrap was not recorded', ib.block_reasons, steps);
  }
  const startupContextPaths: string[] = Array.isArray(ib.startup_context_paths) ? ib.startup_context_paths : [];
  const recalled: unknown[] = Array.isArray(ib.recalled) ? ib.recalled : [];

  // Step 4: rerun preflight inside the worktree — this must now PASS.
  const pf2 = parseToolResult(await runPreflight({
    task_type: taskType,
    repo_path: worktreePath,
    issue_id: issueId,
    declared_target_files: declaredTargetFiles,
    project_path: projectPath,
    remote_base_branch: remoteBaseBranch,
    worktree_required: true,
  }));
  steps.push({ step: 'preflight', repo_path: worktreePath, status: pf2.status });
  if (pf2.status !== 'PASS') {
    return blocked('worktree preflight did not pass', pf2.block_reasons ?? pf2.redirect_actions, steps);
  }

  // Step 5 (optional): edit_guard, when the target files are already known.
  const wantEditGuard = args.run_edit_guard ?? declaredTargetFiles.length > 0;
  let editGuard = 'NOT_REQUESTED';
  if (wantEditGuard) {
    if (declaredTargetFiles.length === 0) {
      editGuard = 'SKIPPED';
      steps.push({ step: 'edit_guard', repo_path: worktreePath, status: 'SKIPPED', note: 'no declared_target_files provided' });
    } else {
      const eg = parseToolResult(await runEditGuard({
        repo_path: worktreePath,
        task_type: taskType,
        issue_id: issueId,
        declared_target_files: declaredTargetFiles,
        project_path: projectPath,
        remote_base_branch: remoteBaseBranch,
      }));
      editGuard = eg.status;
      steps.push({ step: 'edit_guard', repo_path: worktreePath, status: eg.status });
      if (eg.status !== 'PASS') {
        return blocked('edit guard did not pass', eg.block_reasons, steps);
      }
    }
  }

  const nextActions: string[] = [];
  nextActions.push('load startup context from startup_context_paths');
  if (recalled.length > 0) {
    nextActions.push('review recalled (related prior decisions/knowledge) before editing');
  }
  if (editGuard === 'PASS') {
    nextActions.push(`begin implementation edits in ${worktreePath}`);
  } else {
    nextActions.push('call agenticos_edit_guard with your declared_target_files immediately before editing');
  }
  nextActions.push('before PR creation: agenticos_pr_scope_check');

  return JSON.stringify({
    command: 'agenticos_issue_start',
    status: 'READY',
    summary: `issue ${issueId} ready in an isolated worktree`,
    worktree_path: worktreePath,
    branch_name: branchName,
    edit_guard: editGuard,
    startup_context_paths: startupContextPaths,
    recalled,
    steps,
    next_actions: nextActions,
  }, null, 2);
}
