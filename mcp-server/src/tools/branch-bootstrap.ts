import { access, mkdir } from 'fs/promises';
import { basename, join } from 'path';
import { gitText } from '../utils/exec-git.js';
import { resolveGitCheckoutIdentity } from '../utils/checkout-identity.js';
import { persistGuardrailEvidence, type GuardrailPersistenceResult } from '../utils/guardrail-evidence.js';
import { getAgenticOSHome } from '../utils/registry.js';
import { resolveGuardrailProjectTarget } from '../utils/repo-boundary.js';
import { validateGuardrailRepoIdentity } from '../utils/guardrail-repo-identity.js';
import { resolveProjectWorktreeRoot } from '../utils/worktree-topology.js';
import { isGitBackedTopology } from '../utils/project-contract.js';

interface BranchBootstrapArgs {
  issue_id?: string;
  branch_type?: string;
  slug?: string;
  repo_path?: string;
  project_path?: string;
  remote_base_branch?: string;
  worktree_root?: string;
}

interface BranchBootstrapResult {
  status: 'CREATED' | 'BLOCK';
  branch_name: string;
  base_commit: string;
  worktree_path: string;
  sanitized_issue_id: string;
  sanitized_branch_type: string;
  notes: string[];
  block_reasons: string[];
  persistence?: GuardrailPersistenceResult;
}

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function makeBaseResult(): BranchBootstrapResult {
  return {
    status: 'BLOCK',
    branch_name: '',
    base_commit: '',
    worktree_path: '',
    sanitized_issue_id: '',
    sanitized_branch_type: '',
    notes: [],
    block_reasons: [],
  };
}

export async function runBranchBootstrap(args: BranchBootstrapArgs): Promise<string> {
  const {
    issue_id,
    branch_type = 'feat',
    slug,
    repo_path,
    project_path,
    remote_base_branch = 'origin/main',
    worktree_root,
  } = args;

  const result = makeBaseResult();

  if (!issue_id) {
    result.block_reasons.push('issue_id is required');
  }
  if (!slug) {
    result.block_reasons.push('slug is required');
  }
  if (!repo_path) {
    result.block_reasons.push('repo_path is required');
  }

  if (result.block_reasons.length > 0 || !slug || !repo_path || !issue_id) {
    result.persistence = await persistGuardrailEvidence({
      command: 'agenticos_branch_bootstrap',
      repo_path,
      project_path,
      payload: {
        issue_id: issue_id || null,
        project_path: project_path || null,
        branch_type,
        slug: slug || null,
        remote_base_branch,
        requested_worktree_root: worktree_root || null,
        result: {
          status: result.status,
          branch_name: result.branch_name,
          base_commit: result.base_commit,
          worktree_path: result.worktree_path,
          notes: result.notes,
          block_reasons: result.block_reasons,
        },
      },
    });
    return JSON.stringify(result, null, 2);
  }

  const sanitizedIssueId = sanitizeSegment(issue_id);
  const sanitizedBranchType = sanitizeSegment(branch_type);
  const sanitizedSlug = sanitizeSegment(slug);
  result.sanitized_issue_id = sanitizedIssueId;
  result.sanitized_branch_type = sanitizedBranchType;
  if (!sanitizedIssueId) {
    result.block_reasons.push('issue_id must contain at least one alphanumeric character');
  }
  if (!sanitizedBranchType) {
    result.block_reasons.push('branch_type must contain at least one alphanumeric character');
  }
  if (!sanitizedSlug) {
    result.block_reasons.push('slug must contain at least one alphanumeric character');
  }
  if (result.block_reasons.length > 0) {
    result.persistence = await persistGuardrailEvidence({
      command: 'agenticos_branch_bootstrap',
      repo_path,
      project_path,
      payload: {
        issue_id,
        project_path: project_path || null,
        branch_type,
        slug,
        remote_base_branch,
        requested_worktree_root: worktree_root,
        result: {
          status: result.status,
          branch_name: result.branch_name,
          base_commit: result.base_commit,
          worktree_path: result.worktree_path,
          notes: result.notes,
          block_reasons: result.block_reasons,
        },
      },
    });
    return JSON.stringify(result, null, 2);
  }
  if (sanitizedIssueId !== issue_id) {
    result.notes.push(`sanitized issue_id "${issue_id}" to "${sanitizedIssueId}"`);
  }
  if (sanitizedBranchType !== branch_type) {
    result.notes.push(`sanitized branch_type "${branch_type}" to "${sanitizedBranchType}"`);
  }

  const projectResolution = await resolveGuardrailProjectTarget({
    commandName: 'agenticos_branch_bootstrap',
    repoPath: repo_path,
    projectPath: project_path,
  });
  const targetProject = projectResolution.targetProject;
  if (!targetProject) {
    result.block_reasons.push(...projectResolution.resolutionErrors);
  }

  const rootResolution = targetProject
    && targetProject.expectedWorktreeRoot
    ? resolveProjectWorktreeRoot({
        agenticosHome: getAgenticOSHome(),
        projectId: targetProject.id,
        requestedWorktreeRoot: worktree_root,
      })
    : null;
  if (rootResolution?.mismatchReason) {
    result.block_reasons.push(rootResolution.mismatchReason);
  }

  let gitCommonRepoRoot: string | null = null;
  let gitRemoteOrigin: string | null = null;
  let effectiveWorktreeRoot: string | null = rootResolution?.effectiveWorktreeRoot || null;
  let expectedWorktreeRoot: string | null = rootResolution?.expectedWorktreeRoot || null;
  let deprecatedOverrideUsed = rootResolution?.deprecatedOverrideUsed || false;
  if (!isGitBackedTopology(targetProject?.topology)) {
    result.block_reasons.push('agenticos_branch_bootstrap requires a git_versioned managed project (legacy github_versioned is accepted)');
  }
  if (targetProject && !effectiveWorktreeRoot) {
    result.block_reasons.push(`target project "${targetProject.id}" is missing a derived project-scoped worktree root`);
  }
  if (deprecatedOverrideUsed && worktree_root) {
    result.notes.push(`accepted deprecated worktree_root override because it matched the derived project-scoped root: ${expectedWorktreeRoot}`);
  }

  if (result.block_reasons.length > 0) {
    result.persistence = await persistGuardrailEvidence({
      command: 'agenticos_branch_bootstrap',
      repo_path,
      project_path: targetProject?.path || project_path,
      payload: {
        issue_id,
        target_project_id: targetProject?.id || null,
        active_project: projectResolution.activeProjectId,
        git_common_repo_root: gitCommonRepoRoot,
        git_remote_origin: gitRemoteOrigin,
        branch_type,
        slug,
        remote_base_branch,
        requested_worktree_root: worktree_root || null,
        expected_worktree_root: expectedWorktreeRoot,
        effective_worktree_root: effectiveWorktreeRoot,
        deprecated_override_used: deprecatedOverrideUsed,
        result: {
          status: result.status,
          branch_name: result.branch_name,
          base_commit: result.base_commit,
          worktree_path: result.worktree_path,
          notes: result.notes,
          block_reasons: result.block_reasons,
        },
      },
    });
    return JSON.stringify(result, null, 2);
  }
  const managedTargetProject = targetProject as NonNullable<typeof targetProject>;
  const worktreeRoot = effectiveWorktreeRoot as string;

  try {
    const checkout = await resolveGitCheckoutIdentity(repo_path);
    if (!checkout) {
      throw new Error('failed to resolve git checkout identity');
    }
    const gitWorktreeRoot = checkout.worktreeRoot;
    gitCommonRepoRoot = checkout.commonRepoRoot;
    gitRemoteOrigin = await gitText(repo_path, ['config', '--get', 'remote.origin.url']).catch(() => '');
    const repoName = sanitizeSegment(basename(gitCommonRepoRoot)) || sanitizeSegment(basename(repo_path)) || 'repo';

    result.branch_name = `${sanitizedBranchType}/${sanitizedIssueId}-${sanitizedSlug}`;
    result.worktree_path = join(worktreeRoot, `${repoName}-${sanitizedIssueId}-${sanitizedSlug}`);
    result.base_commit = await gitText(repo_path, ['rev-parse', remote_base_branch]);

    const repoIdentity = validateGuardrailRepoIdentity({
      projectId: managedTargetProject.id,
      projectYamlPath: managedTargetProject.projectYamlPath,
      declaredGithubRepo: managedTargetProject.githubRepo,
      declaredRepository: managedTargetProject.repository,
      declaredSourceRepoRoots: managedTargetProject.sourceRepoRoots,
      sourceRepoRootsDeclared: managedTargetProject.sourceRepoRootsDeclared,
      expectedWorktreeRoot: managedTargetProject.expectedWorktreeRoot,
      gitWorktreeRoot,
      gitCommonRepoRoot,
      gitRemoteOrigin,
    });
    if (!repoIdentity.ok && repoIdentity.message) {
      result.block_reasons.push(repoIdentity.message);
      result.notes.push(`declared source repo roots: ${managedTargetProject.sourceRepoRoots.join(', ')}`);
    }
  } catch {
    result.block_reasons.push(`failed to resolve remote base ${remote_base_branch}`);
    result.persistence = await persistGuardrailEvidence({
      command: 'agenticos_branch_bootstrap',
      repo_path,
      project_path: managedTargetProject.path,
      payload: {
        issue_id,
        target_project_id: managedTargetProject.id,
        active_project: projectResolution.activeProjectId,
        git_common_repo_root: gitCommonRepoRoot,
        git_remote_origin: gitRemoteOrigin,
        branch_type,
        slug,
        remote_base_branch,
        requested_worktree_root: worktree_root || null,
        expected_worktree_root: expectedWorktreeRoot,
        effective_worktree_root: effectiveWorktreeRoot,
        deprecated_override_used: deprecatedOverrideUsed,
        result: {
          status: result.status,
          branch_name: result.branch_name,
          base_commit: result.base_commit,
          worktree_path: result.worktree_path,
          notes: result.notes,
          block_reasons: result.block_reasons,
        },
      },
    });
    return JSON.stringify(result, null, 2);
  }

  try {
    await gitText(repo_path, ['show-ref', '--verify', '--quiet', `refs/heads/${result.branch_name}`]);
    result.block_reasons.push(`branch already exists: ${result.branch_name}`);
  } catch {
    // Expected when the branch does not yet exist.
  }

  if (await pathExists(result.worktree_path)) {
    result.block_reasons.push(`worktree path already exists: ${result.worktree_path}`);
  }

  if (result.block_reasons.length > 0) {
    result.persistence = await persistGuardrailEvidence({
      command: 'agenticos_branch_bootstrap',
      repo_path,
      project_path: managedTargetProject.path,
      payload: {
        issue_id,
        target_project_id: managedTargetProject.id,
        active_project: projectResolution.activeProjectId,
        git_common_repo_root: gitCommonRepoRoot,
        git_remote_origin: gitRemoteOrigin,
        branch_type,
        slug,
        remote_base_branch,
        requested_worktree_root: worktree_root || null,
        expected_worktree_root: expectedWorktreeRoot,
        effective_worktree_root: effectiveWorktreeRoot,
        deprecated_override_used: deprecatedOverrideUsed,
        result: {
          status: result.status,
          branch_name: result.branch_name,
          base_commit: result.base_commit,
          worktree_path: result.worktree_path,
          notes: result.notes,
          block_reasons: result.block_reasons,
        },
      },
    });
    return JSON.stringify(result, null, 2);
  }

  try {
    await mkdir(worktreeRoot, { recursive: true });
    await gitText(
      repo_path,
      ['worktree', 'add', result.worktree_path, '-b', result.branch_name, result.base_commit],
    );
  } catch (error) {
    result.block_reasons.push(error instanceof Error ? error.message : 'failed to create isolated worktree');
    result.persistence = await persistGuardrailEvidence({
      command: 'agenticos_branch_bootstrap',
      repo_path,
      project_path: managedTargetProject.path,
      payload: {
        issue_id,
        target_project_id: managedTargetProject.id,
        active_project: projectResolution.activeProjectId,
        git_common_repo_root: gitCommonRepoRoot,
        git_remote_origin: gitRemoteOrigin,
        branch_type,
        slug,
        remote_base_branch,
        requested_worktree_root: worktree_root || null,
        expected_worktree_root: expectedWorktreeRoot,
        effective_worktree_root: effectiveWorktreeRoot,
        deprecated_override_used: deprecatedOverrideUsed,
        result: {
          status: result.status,
          branch_name: result.branch_name,
          base_commit: result.base_commit,
          worktree_path: result.worktree_path,
          notes: result.notes,
          block_reasons: result.block_reasons,
        },
      },
    });
    return JSON.stringify(result, null, 2);
  }

  result.status = 'CREATED';
  result.notes.push(`created branch ${result.branch_name} from ${remote_base_branch}`);
  result.notes.push(`created isolated worktree at ${result.worktree_path}`);
  result.persistence = await persistGuardrailEvidence({
    command: 'agenticos_branch_bootstrap',
    repo_path,
    project_path: managedTargetProject.path,
    payload: {
      issue_id,
      target_project_id: managedTargetProject.id,
      active_project: projectResolution.activeProjectId,
      git_common_repo_root: gitCommonRepoRoot,
      git_remote_origin: gitRemoteOrigin,
      branch_type,
      slug,
      remote_base_branch,
      requested_worktree_root: worktree_root || null,
      expected_worktree_root: expectedWorktreeRoot,
      effective_worktree_root: effectiveWorktreeRoot,
      deprecated_override_used: deprecatedOverrideUsed,
      result: {
        status: result.status,
        branch_name: result.branch_name,
        base_commit: result.base_commit,
        worktree_path: result.worktree_path,
        notes: result.notes,
        block_reasons: result.block_reasons,
      },
    },
  });
  return JSON.stringify(result, null, 2);
}
