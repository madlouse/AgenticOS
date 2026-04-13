import { resolve, sep } from 'path';

interface ValidateGuardrailRepoIdentityArgs {
  projectId: string;
  projectYamlPath: string;
  declaredGithubRepo?: string | null;
  declaredSourceRepoRoots: string[];
  sourceRepoRootsDeclared: boolean;
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

export function validateGuardrailRepoIdentity(args: ValidateGuardrailRepoIdentityArgs): GuardrailRepoIdentityResult {
  const {
    projectId,
    projectYamlPath,
    declaredGithubRepo,
    declaredSourceRepoRoots,
    sourceRepoRootsDeclared,
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
  const worktreeMatch = normalizedDeclaredRoots.find((root) => pathIsWithinDeclaredRoot(gitWorktreeRoot, root));
  const commonRepoMatch = normalizedDeclaredRoots.find((root) => pathIsWithinDeclaredRoot(gitCommonRepoRoot, root));
  if (commonRepoMatch) {
    if (declaredGithubRepo) {
      const expectedRepo = normalizeGitHubRepo(declaredGithubRepo);
      const actualRepo = extractGitHubRepoFromRemoteOrigin(gitRemoteOrigin || '');
      if (actualRepo !== expectedRepo) {
        return {
          ok: false,
          matchedBy: null,
          matchedDeclaredRoot: null,
          message: `git remote origin "${gitRemoteOrigin || 'missing'}" does not match declared source_control.github_repo "${declaredGithubRepo}" for target project "${projectId}"`,
        };
      }
    }
    return {
      ok: true,
      matchedBy: 'git_common_repo_root',
      matchedDeclaredRoot: commonRepoMatch,
      message: null,
    };
  }

  if (worktreeMatch && declaredGithubRepo) {
    const expectedRepo = normalizeGitHubRepo(declaredGithubRepo);
    const actualRepo = extractGitHubRepoFromRemoteOrigin(gitRemoteOrigin || '');
    if (actualRepo !== expectedRepo) {
      return {
        ok: false,
        matchedBy: null,
        matchedDeclaredRoot: null,
        message: `git remote origin "${gitRemoteOrigin || 'missing'}" does not match declared source_control.github_repo "${declaredGithubRepo}" for target project "${projectId}"`,
      };
    }
  }

  if (worktreeMatch) {
    return {
      ok: true,
      matchedBy: 'git_worktree_root',
      matchedDeclaredRoot: worktreeMatch,
      message: null,
    };
  }

  return {
    ok: false,
    matchedBy: null,
    matchedDeclaredRoot: null,
    message: `neither git worktree root "${gitWorktreeRoot}" nor git common repo root "${gitCommonRepoRoot}" is declared for target project "${projectId}"`,
  };
}
