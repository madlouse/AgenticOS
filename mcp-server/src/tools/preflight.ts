import { exec } from 'child_process';
import { promisify } from 'util';
import { persistGuardrailEvidence, type GuardrailPersistenceResult } from '../utils/guardrail-evidence.js';

const execAsync = promisify(exec);

type TaskType = 'discussion_only' | 'analysis_or_doc' | 'implementation' | 'bootstrap';
type WorkspaceType = 'main' | 'isolated_worktree';
type GuardrailStatus = 'PASS' | 'BLOCK' | 'REDIRECT';

interface PreflightArgs {
  issue_id?: string;
  task_type?: TaskType;
  repo_path?: string;
  project_path?: string;
  remote_base_branch?: string;
  declared_target_files?: string[];
  structural_move?: boolean;
  worktree_required?: boolean;
  root_scoped_exceptions?: string[];
  clean_reproducibility_gate?: string[];
}

interface PreflightResult {
  status: GuardrailStatus;
  summary: string;
  repo_identity_confirmed: boolean;
  branch_ancestry_verified: boolean;
  branch_based_on_intended_remote: boolean;
  worktree_ok: boolean;
  scope_ok: boolean;
  reproducibility_gate_defined: boolean;
  block_reasons: string[];
  redirect_actions: string[];
  evidence: {
    current_branch: string;
    current_head: string;
    remote_base_branch: string;
    remote_base_head: string;
    branch_fork_point: string;
    workspace_type: WorkspaceType;
    commit_subjects_since_base: string[];
  };
  persistence?: GuardrailPersistenceResult;
}

async function runGit(repoPath: string, args: string): Promise<string> {
  const { stdout } = await execAsync(`git -C "${repoPath}" ${args}`);
  return stdout.trim();
}

function normalizeLines(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function detectWorkspaceType(repoPath: string): Promise<WorkspaceType> {
  try {
    const output = await runGit(repoPath, 'worktree list --porcelain');
    const worktreeLines = output
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.replace(/^worktree\s+/, '').trim());

    if (worktreeLines.length > 0 && worktreeLines[0] === repoPath) {
      return 'main';
    }
    return 'isolated_worktree';
  } catch {
    return 'main';
  }
}

function finalizeResult(result: PreflightResult): PreflightResult {
  if (result.block_reasons.length > 0) {
    result.status = 'BLOCK';
    result.summary = result.block_reasons.join('; ');
    return result;
  }

  if (result.redirect_actions.length > 0) {
    result.status = 'REDIRECT';
    result.summary = result.redirect_actions.join('; ');
    return result;
  }

  result.status = 'PASS';
  result.summary = 'preflight passed';
  return result;
}

function makeBaseResult(remoteBaseBranch: string): PreflightResult {
  return {
    status: 'BLOCK',
    summary: '',
    repo_identity_confirmed: false,
    branch_ancestry_verified: false,
    branch_based_on_intended_remote: false,
    worktree_ok: false,
    scope_ok: false,
    reproducibility_gate_defined: false,
    block_reasons: [],
    redirect_actions: [],
    evidence: {
      current_branch: '',
      current_head: '',
      remote_base_branch: remoteBaseBranch,
      remote_base_head: '',
      branch_fork_point: '',
      workspace_type: 'main',
      commit_subjects_since_base: [],
    },
  };
}

export async function runPreflight(args: PreflightArgs): Promise<string> {
  const {
    issue_id,
    task_type = 'discussion_only',
    repo_path,
    project_path,
    remote_base_branch = 'origin/main',
    declared_target_files = [],
    structural_move = false,
    worktree_required = task_type === 'implementation',
    root_scoped_exceptions = ['.github/'],
    clean_reproducibility_gate = [],
  } = args;

  const result = makeBaseResult(remote_base_branch);

  if (!repo_path) {
    result.block_reasons.push('repo_path is required');
    return JSON.stringify(finalizeResult(result), null, 2);
  }

  if (task_type === 'implementation' && !issue_id) {
    result.block_reasons.push('issue_id is required for implementation work');
  }

  if (task_type === 'implementation' && declared_target_files.length === 0) {
    result.block_reasons.push('declared_target_files is required for implementation work');
  }

  try {
    const gitRoot = await runGit(repo_path, 'rev-parse --show-toplevel');
    result.repo_identity_confirmed = gitRoot.length > 0;
    result.evidence.current_branch = await runGit(repo_path, 'rev-parse --abbrev-ref HEAD');
    result.evidence.current_head = await runGit(repo_path, 'rev-parse HEAD');
    result.evidence.remote_base_head = await runGit(repo_path, `rev-parse ${remote_base_branch}`);
    result.evidence.branch_fork_point = await runGit(repo_path, `merge-base HEAD ${remote_base_branch}`);
    result.branch_ancestry_verified = true;
    result.evidence.workspace_type = await detectWorkspaceType(repo_path);
  } catch {
    result.block_reasons.push('failed to resolve git repository identity or remote base');
    const finalized = finalizeResult(result);
    finalized.persistence = await persistGuardrailEvidence({
      command: 'agenticos_preflight',
      repo_path,
      project_path,
      payload: {
        issue_id: issue_id || null,
        project_path: project_path || null,
        task_type,
        declared_target_files,
        structural_move,
        worktree_required,
        root_scoped_exceptions,
        clean_reproducibility_gate,
        result: finalized,
      },
    });
    return JSON.stringify(finalized, null, 2);
  }

  if (worktree_required) {
    const branchIsProtected = result.evidence.current_branch === 'main' || result.evidence.current_branch === remote_base_branch;
    if (branchIsProtected || result.evidence.workspace_type === 'main') {
      result.redirect_actions.push('create an isolated issue branch/worktree before implementation');
    } else {
      result.worktree_ok = true;
    }
  } else {
    result.worktree_ok = true;
  }

  if (task_type === 'implementation') {
    const subjectsRaw = await runGit(repo_path, `log --format=%s ${remote_base_branch}..HEAD`).catch(() => '');
    const subjects = normalizeLines(subjectsRaw);
    result.evidence.commit_subjects_since_base = subjects;

    if (subjects.length > 0) {
      const issueMarker = issue_id ? `#${issue_id}` : '';
      const unrelatedSubjects = subjects.filter((subject) => !issueMarker || !subject.includes(issueMarker));
      if (unrelatedSubjects.length > 0) {
        result.block_reasons.push(`branch includes unrelated commits relative to ${remote_base_branch}`);
      } else {
        result.branch_based_on_intended_remote = true;
      }
    } else {
      result.branch_based_on_intended_remote = true;
    }

    if (structural_move) {
      const hasGithubException = root_scoped_exceptions.includes('.github/');
      if (!hasGithubException) {
        result.block_reasons.push('structural_move requires a root-scoped exception entry for .github/');
      }

      if (clean_reproducibility_gate.length === 0) {
        result.block_reasons.push('structural_move requires a clean_reproducibility_gate');
      } else {
        result.reproducibility_gate_defined = true;
      }
    } else {
      result.reproducibility_gate_defined = clean_reproducibility_gate.length > 0 || !structural_move;
    }

    result.scope_ok = declared_target_files.length > 0;
  } else {
    result.branch_based_on_intended_remote = true;
    result.scope_ok = true;
    result.reproducibility_gate_defined = true;
  }

  const finalized = finalizeResult(result);
  finalized.persistence = await persistGuardrailEvidence({
    command: 'agenticos_preflight',
    repo_path,
    project_path,
    payload: {
      issue_id: issue_id || null,
      project_path: project_path || null,
      task_type,
      declared_target_files,
      structural_move,
      worktree_required,
      root_scoped_exceptions,
      clean_reproducibility_gate,
      result: {
        status: finalized.status,
        summary: finalized.summary,
        repo_identity_confirmed: finalized.repo_identity_confirmed,
        branch_ancestry_verified: finalized.branch_ancestry_verified,
        branch_based_on_intended_remote: finalized.branch_based_on_intended_remote,
        worktree_ok: finalized.worktree_ok,
        scope_ok: finalized.scope_ok,
        reproducibility_gate_defined: finalized.reproducibility_gate_defined,
        block_reasons: finalized.block_reasons,
        redirect_actions: finalized.redirect_actions,
        evidence: finalized.evidence,
      },
    },
  });
  return JSON.stringify(finalized, null, 2);
}
