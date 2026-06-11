import { resolve, sep } from 'path';
import {
  normalizeRepositoryHost,
  normalizeRepositorySlug,
  type GitRepositoryContract,
} from './project-contract.js';

interface ValidateGuardrailRepoIdentityArgs {
  projectId: string;
  projectYamlPath: string;
  declaredGithubRepo?: string | null;
  declaredRepository?: GitRepositoryContract | null;
  declaredSourceRepoRoots: string[];
  sourceRepoRootsDeclared: boolean;
  expectedWorktreeRoot?: string | null;
  gitWorktreeRoot: string;
  gitCommonRepoRoot: string;
  gitRemoteOrigin?: string | null;
}

export interface GuardrailRepoIdentityResult {
  ok: boolean;
  matchedBy: 'git_worktree_root' | 'git_common_repo_root' | null;
  matchedDeclaredRoot: string | null;
  message: string | null;
}

function normalizePath(value: string): string {
  return resolve(value);
}

function pathIsWithinDeclaredRoot(candidatePath: string, declaredRoot: string): boolean {
  const normalizedCandidate = normalizePath(candidatePath);
  const normalizedRoot = normalizePath(declaredRoot);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}

function legacyGithubRepository(githubRepo: string): GitRepositoryContract {
  return {
    provider: 'github',
    host: null,
    remote: 'origin',
    slug: normalizeRepositorySlug(githubRepo),
    default_base_branch: null,
    review_system: 'pull_request',
  };
}

function hostForProvider(provider: GitRepositoryContract['provider']): string | null {
  if (provider === 'github') return 'github.com';
  if (provider === 'gitlab') return 'gitlab.com';
  if (provider === 'gitee') return 'gitee.com';
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractRepositorySlugFromRemoteOrigin(
  value: string,
  provider: GitRepositoryContract['provider'],
  declaredHost?: string | null,
): string | null {
  const normalizedDeclaredHost = declaredHost ? normalizeRepositoryHost(declaredHost) : null;
  const host = normalizedDeclaredHost || hostForProvider(provider);
  if (!host) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const escapedHost = escapeRegExp(host);

  // ssh:// URLs must match before the scp-style form: in
  // ssh://git@host:2222/group/repo.git the scp pattern would otherwise read
  // "2222/group/repo" as the slug.
  const sshUrlMatch = trimmed.match(new RegExp(`^ssh://[^@\\s]+@${escapedHost}(?::\\d+)?/(.+?)(?:\\.git)?$`, 'i'));
  if (sshUrlMatch) {
    return normalizeRepositorySlug(sshUrlMatch[1]);
  }

  const httpsMatch = trimmed.match(new RegExp(`^https?://${escapedHost}(?::\\d+)?/(.+?)(?:\\.git)?$`, 'i'));
  if (httpsMatch) {
    return normalizeRepositorySlug(httpsMatch[1]);
  }

  const scpMatch = trimmed.match(new RegExp(`^[^@/\\s]+@${escapedHost}:(.+?)(?:\\.git)?$`, 'i'));
  if (scpMatch) {
    return normalizeRepositorySlug(scpMatch[1]);
  }

  return null;
}

function repositoryMismatchMessage(args: {
  projectId: string;
  gitRemoteOrigin?: string | null;
  declaredGithubRepo?: string | null;
  repository: GitRepositoryContract;
}): string {
  if (args.declaredGithubRepo) {
    return `git remote origin "${args.gitRemoteOrigin || 'missing'}" does not match declared source_control.github_repo "${args.declaredGithubRepo}" for target project "${args.projectId}"`;
  }
  const hostSuffix = args.repository.host ? ` (host ${args.repository.host})` : '';
  return `git remote origin "${args.gitRemoteOrigin || 'missing'}" does not match declared source_control.repository ${args.repository.provider}:${args.repository.slug || '(no slug)'}${hostSuffix} for target project "${args.projectId}"`;
}

function validateRepositoryRemote(args: {
  projectId: string;
  declaredGithubRepo?: string | null;
  repository: GitRepositoryContract | null;
  gitRemoteOrigin?: string | null;
}): string | null {
  const { repository } = args;
  if (!repository || repository.provider === 'generic') {
    return null;
  }
  const expectedSlug = repository.slug ? normalizeRepositorySlug(repository.slug) : null;
  const actualSlug = extractRepositorySlugFromRemoteOrigin(args.gitRemoteOrigin || '', repository.provider, repository.host);
  if (!expectedSlug || actualSlug !== expectedSlug) {
    return repositoryMismatchMessage({
      projectId: args.projectId,
      declaredGithubRepo: args.declaredGithubRepo,
      repository,
      gitRemoteOrigin: args.gitRemoteOrigin,
    });
  }
  return null;
}

export function validateGuardrailRepoIdentity(args: ValidateGuardrailRepoIdentityArgs): GuardrailRepoIdentityResult {
  const {
    projectId,
    projectYamlPath,
    declaredGithubRepo,
    declaredRepository,
    declaredSourceRepoRoots,
    sourceRepoRootsDeclared,
    expectedWorktreeRoot,
    gitWorktreeRoot,
    gitCommonRepoRoot,
    gitRemoteOrigin,
  } = args;

  if (!sourceRepoRootsDeclared || declaredSourceRepoRoots.length === 0) {
    return {
      ok: false,
      matchedBy: null,
      matchedDeclaredRoot: null,
      message: `target project "${projectId}" is missing execution.source_repo_roots in ${projectYamlPath}`,
    };
  }

  const normalizedDeclaredRoots = declaredSourceRepoRoots.map((root) => normalizePath(root));
  const implicitWorktreeRoot = expectedWorktreeRoot ? normalizePath(expectedWorktreeRoot) : null;
  const declaredWorktreeMatch = normalizedDeclaredRoots.find((root) => pathIsWithinDeclaredRoot(gitWorktreeRoot, root));
  const implicitWorktreeMatch = implicitWorktreeRoot && pathIsWithinDeclaredRoot(gitWorktreeRoot, implicitWorktreeRoot)
    ? implicitWorktreeRoot
    : undefined;
  const commonRepoMatch = normalizedDeclaredRoots.find((root) => pathIsWithinDeclaredRoot(gitCommonRepoRoot, root));
  const repository = declaredRepository || (declaredGithubRepo ? legacyGithubRepository(declaredGithubRepo) : null);
  if (commonRepoMatch) {
    const remoteMismatch = validateRepositoryRemote({
      projectId,
      declaredGithubRepo,
      repository,
      gitRemoteOrigin,
    });
    if (remoteMismatch) {
      return {
        ok: false,
        matchedBy: null,
        matchedDeclaredRoot: null,
        message: remoteMismatch,
      };
    }
    return {
      ok: true,
      matchedBy: 'git_common_repo_root',
      matchedDeclaredRoot: commonRepoMatch,
      message: null,
    };
  }

  if (declaredWorktreeMatch) {
    const remoteMismatch = validateRepositoryRemote({
      projectId,
      declaredGithubRepo,
      repository,
      gitRemoteOrigin,
    });
    if (remoteMismatch) {
      return {
        ok: false,
        matchedBy: null,
        matchedDeclaredRoot: null,
        message: remoteMismatch,
      };
    }
  }

  if (declaredWorktreeMatch) {
    return {
      ok: true,
      matchedBy: 'git_worktree_root',
      matchedDeclaredRoot: declaredWorktreeMatch,
      message: null,
    };
  }

  if (implicitWorktreeMatch) {
    return {
      ok: false,
      matchedBy: null,
      matchedDeclaredRoot: null,
      message: `git worktree root "${gitWorktreeRoot}" is under the derived project worktree root "${implicitWorktreeMatch}", but git common repo root "${gitCommonRepoRoot}" is not declared for target project "${projectId}"`,
    };
  }

  return {
    ok: false,
    matchedBy: null,
    matchedDeclaredRoot: null,
    message: `neither git worktree root "${gitWorktreeRoot}" nor git common repo root "${gitCommonRepoRoot}" is declared for target project "${projectId}"`,
  };
}
