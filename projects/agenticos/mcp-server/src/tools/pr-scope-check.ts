import { exec } from 'child_process';
import { promisify } from 'util';
import { persistGuardrailEvidence, type GuardrailPersistenceResult } from '../utils/guardrail-evidence.js';

const execAsync = promisify(exec);

interface PrScopeCheckArgs {
  issue_id?: string;
  repo_path?: string;
  remote_base_branch?: string;
  declared_target_files?: string[];
  expected_issue_scope?: string;
}

interface PrScopeCheckResult {
  status: 'PASS' | 'BLOCK';
  summary: string;
  commit_count: number;
  changed_files: string[];
  unexpected_files: string[];
  unrelated_commit_subjects: string[];
  branch_ancestry_verified: boolean;
  remote_base_branch: string;
  branch_fork_point: string;
  expected_issue_scope: string;
  block_reasons: string[];
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternToRegex(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/');
  const tokens = normalized.match(/\*\*|\*|\.{3}|[^*.]+/g) ?? [];
  const source = tokens
    .map((token) => {
      if (token === '**' || token === '...') {
        return '.*';
      }
      if (token === '*') {
        return '[^/]*';
      }
      return escapeRegex(token);
    })
    .join('');
  return new RegExp(`^${source}$`);
}

function fileMatchesDeclaredScope(file: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const normalizedPattern = pattern.endsWith('/') ? `${pattern}**` : pattern;
    return patternToRegex(normalizedPattern).test(file);
  });
}

function makeBaseResult(remoteBaseBranch: string, expectedIssueScope: string): PrScopeCheckResult {
  return {
    status: 'BLOCK',
    summary: '',
    commit_count: 0,
    changed_files: [],
    unexpected_files: [],
    unrelated_commit_subjects: [],
    branch_ancestry_verified: false,
    remote_base_branch: remoteBaseBranch,
    branch_fork_point: '',
    expected_issue_scope: expectedIssueScope,
    block_reasons: [],
  };
}

export async function runPrScopeCheck(args: PrScopeCheckArgs): Promise<string> {
  const {
    issue_id,
    repo_path,
    remote_base_branch = 'origin/main',
    declared_target_files = [],
    expected_issue_scope = 'unspecified',
  } = args;

  const result = makeBaseResult(remote_base_branch, expected_issue_scope);

  if (!issue_id) {
    result.block_reasons.push('issue_id is required');
  }
  if (!repo_path) {
    result.block_reasons.push('repo_path is required');
  }
  if (declared_target_files.length === 0) {
    result.block_reasons.push('declared_target_files is required');
  }

  if (result.block_reasons.length > 0 || !repo_path || !issue_id || declared_target_files.length === 0) {
    result.summary = result.block_reasons.join('; ');
    result.persistence = await persistGuardrailEvidence({
      command: 'agenticos_pr_scope_check',
      repo_path,
      payload: {
        issue_id: issue_id || null,
        remote_base_branch,
        declared_target_files,
        expected_issue_scope,
        result: {
          status: result.status,
          summary: result.summary,
          commit_count: result.commit_count,
          changed_files: result.changed_files,
          unexpected_files: result.unexpected_files,
          unrelated_commit_subjects: result.unrelated_commit_subjects,
          branch_ancestry_verified: result.branch_ancestry_verified,
          remote_base_branch: result.remote_base_branch,
          branch_fork_point: result.branch_fork_point,
          expected_issue_scope: result.expected_issue_scope,
          block_reasons: result.block_reasons,
        },
      },
    });
    return JSON.stringify(result, null, 2);
  }

  try {
    await runGit(repo_path, `rev-parse ${remote_base_branch}`);
    result.branch_fork_point = await runGit(repo_path, `merge-base HEAD ${remote_base_branch}`);
    result.branch_ancestry_verified = true;
  } catch {
    result.block_reasons.push(`current branch is not comparable to ${remote_base_branch}`);
    result.summary = result.block_reasons.join('; ');
    result.persistence = await persistGuardrailEvidence({
      command: 'agenticos_pr_scope_check',
      repo_path,
      payload: {
        issue_id,
        remote_base_branch,
        declared_target_files,
        expected_issue_scope,
        result: {
          status: result.status,
          summary: result.summary,
          commit_count: result.commit_count,
          changed_files: result.changed_files,
          unexpected_files: result.unexpected_files,
          unrelated_commit_subjects: result.unrelated_commit_subjects,
          branch_ancestry_verified: result.branch_ancestry_verified,
          remote_base_branch: result.remote_base_branch,
          branch_fork_point: result.branch_fork_point,
          expected_issue_scope: result.expected_issue_scope,
          block_reasons: result.block_reasons,
        },
      },
    });
    return JSON.stringify(result, null, 2);
  }

  const subjects = normalizeLines(
    await runGit(repo_path, `log --format=%s ${remote_base_branch}..HEAD`).catch(() => '')
  );
  const changedFiles = normalizeLines(
    await runGit(repo_path, `diff --name-only ${remote_base_branch}...HEAD`).catch(() => '')
  );

  result.commit_count = subjects.length;
  result.changed_files = changedFiles;
  result.unrelated_commit_subjects = subjects.filter((subject) => !subject.includes(`#${issue_id}`));
  result.unexpected_files = changedFiles.filter((file) => !fileMatchesDeclaredScope(file, declared_target_files));

  if (result.unrelated_commit_subjects.length > 0) {
    result.block_reasons.push(`branch includes unrelated commits relative to ${remote_base_branch}`);
  }

  if (result.unexpected_files.length > 0) {
    result.block_reasons.push('changed files escape the declared target scope');
  }

  if (result.block_reasons.length > 0) {
    result.status = 'BLOCK';
    result.summary = result.block_reasons.join('; ');
    result.persistence = await persistGuardrailEvidence({
      command: 'agenticos_pr_scope_check',
      repo_path,
      payload: {
        issue_id,
        remote_base_branch,
        declared_target_files,
        expected_issue_scope,
        result: {
          status: result.status,
          summary: result.summary,
          commit_count: result.commit_count,
          changed_files: result.changed_files,
          unexpected_files: result.unexpected_files,
          unrelated_commit_subjects: result.unrelated_commit_subjects,
          branch_ancestry_verified: result.branch_ancestry_verified,
          remote_base_branch: result.remote_base_branch,
          branch_fork_point: result.branch_fork_point,
          expected_issue_scope: result.expected_issue_scope,
          block_reasons: result.block_reasons,
        },
      },
    });
    return JSON.stringify(result, null, 2);
  }

  result.status = 'PASS';
  result.summary = 'pr scope check passed';
  result.persistence = await persistGuardrailEvidence({
    command: 'agenticos_pr_scope_check',
    repo_path,
    payload: {
      issue_id,
      remote_base_branch,
      declared_target_files,
      expected_issue_scope,
      result: {
        status: result.status,
        summary: result.summary,
        commit_count: result.commit_count,
        changed_files: result.changed_files,
        unexpected_files: result.unexpected_files,
        unrelated_commit_subjects: result.unrelated_commit_subjects,
        branch_ancestry_verified: result.branch_ancestry_verified,
        remote_base_branch: result.remote_base_branch,
        branch_fork_point: result.branch_fork_point,
        expected_issue_scope: result.expected_issue_scope,
        block_reasons: result.block_reasons,
      },
    },
  });
  return JSON.stringify(result, null, 2);
}
