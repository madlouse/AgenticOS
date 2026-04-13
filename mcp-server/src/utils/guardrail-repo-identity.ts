import { resolve, sep } from 'path';

interface ValidateGuardrailRepoIdentityArgs {
  projectId: string;
  projectYamlPath: string;
  declaredSourceRepoRoots: string[];
  sourceRepoRootsDeclared: boolean;
  gitWorktreeRoot: string;
  gitCommonRepoRoot: string;
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

export function validateGuardrailRepoIdentity(args: ValidateGuardrailRepoIdentityArgs): GuardrailRepoIdentityResult {
  const {
    projectId,
    projectYamlPath,
    declaredSourceRepoRoots,
    sourceRepoRootsDeclared,
    gitWorktreeRoot,
    gitCommonRepoRoot,
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
  if (worktreeMatch) {
    return {
      ok: true,
      matchedBy: 'git_worktree_root',
      matchedDeclaredRoot: worktreeMatch,
      message: null,
    };
  }

  const commonRepoMatch = normalizedDeclaredRoots.find((root) => pathIsWithinDeclaredRoot(gitCommonRepoRoot, root));
  if (commonRepoMatch) {
    return {
      ok: true,
      matchedBy: 'git_common_repo_root',
      matchedDeclaredRoot: commonRepoMatch,
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
