import { describe, expect, it } from 'vitest';
import { validateGuardrailRepoIdentity } from '../guardrail-repo-identity.js';

describe('validateGuardrailRepoIdentity', () => {
  it('passes when the git worktree root is declared directly', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'agenticos',
      projectYamlPath: '/workspace/worktrees/issue/.project.yaml',
      declaredGithubRepo: 'madlouse/AgenticOS',
      declaredSourceRepoRoots: ['/workspace/worktrees/issue'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/worktrees/issue',
      gitCommonRepoRoot: '/workspace/projects/agenticos',
      gitRemoteOrigin: 'git@github.com:madlouse/AgenticOS.git',
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

  it('passes when only the git common repo root is declared and the remote matches', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'agenticos',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredGithubRepo: 'madlouse/AgenticOS',
      declaredSourceRepoRoots: ['/workspace/source'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/source/worktrees/issue-268',
      gitCommonRepoRoot: '/workspace/source',
      gitRemoteOrigin: 'https://github.com/madlouse/AgenticOS.git',
    });

    expect(result.ok).toBe(true);
    expect(result.matchedBy).toBe('git_common_repo_root');
    expect(result.matchedDeclaredRoot).toBe('/workspace/source');
  });

  it('fails when the git worktree root is only under the derived project-scoped root but the common repo root is undeclared', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'agenticos',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredGithubRepo: 'madlouse/AgenticOS',
      declaredSourceRepoRoots: ['/workspace/projects/agenticos'],
      sourceRepoRootsDeclared: true,
      expectedWorktreeRoot: '/workspace/worktrees/agenticos',
      gitWorktreeRoot: '/workspace/worktrees/agenticos/agenticos-297-scope',
      gitCommonRepoRoot: '/external/shared-root',
      gitRemoteOrigin: 'https://github.com/madlouse/AgenticOS.git',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('derived project worktree root');
    expect(result.message).toContain('/external/shared-root');
  });

  it('fails when the worktree root matches but the remote points at a different github repo', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'agenticos',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredGithubRepo: 'madlouse/AgenticOS',
      declaredSourceRepoRoots: ['/workspace/source'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/source/worktrees/issue-268',
      gitCommonRepoRoot: '/external/shared-git-root',
      gitRemoteOrigin: 'git@github.com:wrong/repo.git',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('does not match declared source_control.github_repo');
  });

  it('fails when the declared worktree root matches but the remote origin is missing', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'agenticos',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredGithubRepo: 'madlouse/AgenticOS',
      declaredSourceRepoRoots: ['/workspace/source'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/source/worktrees/issue-268',
      gitCommonRepoRoot: '/external/shared-git-root',
      gitRemoteOrigin: '',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('git remote origin "missing"');
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

  it('fails closed when execution.source_repo_roots is missing', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'agenticos',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredSourceRepoRoots: [],
      sourceRepoRootsDeclared: false,
      gitWorktreeRoot: '/workspace/worktrees/agenticos/issue-1',
      gitCommonRepoRoot: '/workspace/projects/agenticos',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('missing execution.source_repo_roots');
  });

  it('accepts ssh-style remote URLs when the declared common repo root matches', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'agenticos',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredGithubRepo: 'madlouse/AgenticOS',
      declaredSourceRepoRoots: ['/workspace/projects/agenticos'],
      sourceRepoRootsDeclared: true,
      expectedWorktreeRoot: '/workspace/worktrees/agenticos',
      gitWorktreeRoot: '/workspace/projects/agenticos/worktrees/issue-1',
      gitCommonRepoRoot: '/workspace/projects/agenticos',
      gitRemoteOrigin: 'ssh://git@github.com/madlouse/AgenticOS.git',
    });

    expect(result.ok).toBe(true);
    expect(result.matchedBy).toBe('git_common_repo_root');
  });

  it('fails when the common repo root matches but the remote origin is missing', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'agenticos',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredGithubRepo: 'madlouse/AgenticOS',
      declaredSourceRepoRoots: ['/workspace/projects/agenticos'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/other/worktree',
      gitCommonRepoRoot: '/workspace/projects/agenticos',
      gitRemoteOrigin: '',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('does not match declared source_control.github_repo');
  });

  it('fails when the remote origin is not a recognized GitHub URL', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'agenticos',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredGithubRepo: 'madlouse/AgenticOS',
      declaredSourceRepoRoots: ['/workspace/source'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/source/worktrees/issue-268',
      gitCommonRepoRoot: '/external/shared-root',
      gitRemoteOrigin: 'file:///tmp/local.git',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('does not match declared source_control.github_repo');
  });
});
