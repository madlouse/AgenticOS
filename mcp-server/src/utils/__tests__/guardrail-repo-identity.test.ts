import { describe, expect, it } from 'vitest';
import { validateGuardrailRepoIdentity } from '../guardrail-repo-identity.js';

describe('validateGuardrailRepoIdentity', () => {
  it('passes when the git worktree root is declared directly', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'agenticos',
      projectYamlPath: '/workspace/worktrees/issue/.project.yaml',
      declaredSourceRepoRoots: ['/workspace/worktrees/issue'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/worktrees/issue',
      gitCommonRepoRoot: '/workspace/projects/agenticos',
    });

    expect(result.ok).toBe(true);
    expect(result.matchedBy).toBe('git_worktree_root');
  });

  it('passes when the worktree root is nested under a declared source repo root', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'agenticos',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredSourceRepoRoots: ['/workspace/source'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/source/worktrees/issue-268',
      gitCommonRepoRoot: '/external/shared-git-root',
    });

    expect(result.ok).toBe(true);
    expect(result.matchedBy).toBe('git_worktree_root');
    expect(result.matchedDeclaredRoot).toBe('/workspace/source');
  });

  it('fails when neither the worktree root nor the common repo root is declared', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'agenticos',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredSourceRepoRoots: ['/workspace/source'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/other/worktree',
      gitCommonRepoRoot: '/workspace/other/common',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('neither git worktree root');
  });
});
