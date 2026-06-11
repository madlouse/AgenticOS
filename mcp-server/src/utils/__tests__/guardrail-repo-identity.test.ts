import { describe, expect, it } from 'vitest';
import { extractRepositorySlugFromRemoteOrigin, validateGuardrailRepoIdentity } from '../guardrail-repo-identity.js';

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

  it('passes when a gitlab repository slug matches an https remote', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'gitlab-project',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredRepository: {
        provider: 'gitlab',
        host: null,
        remote: 'origin',
        slug: 'group/subgroup/repo',
        default_base_branch: 'origin/main',
        review_system: 'merge_request',
      },
      declaredSourceRepoRoots: ['/workspace/source'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/source/worktrees/issue-490',
      gitCommonRepoRoot: '/workspace/source',
      gitRemoteOrigin: 'https://gitlab.com/group/subgroup/repo.git',
    });

    expect(result.ok).toBe(true);
    expect(result.matchedBy).toBe('git_common_repo_root');
  });

  it('fails when a gitee repository slug does not match the remote', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'gitee-project',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredRepository: {
        provider: 'gitee',
        host: null,
        remote: 'origin',
        slug: 'owner/expected',
        default_base_branch: null,
        review_system: 'pull_request',
      },
      declaredSourceRepoRoots: ['/workspace/source'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/source/worktrees/issue-490',
      gitCommonRepoRoot: '/workspace/source',
      gitRemoteOrigin: 'git@gitee.com:owner/actual.git',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('source_control.repository gitee:owner/expected');
  });

  it('passes generic repositories using local git root proof only', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'generic-project',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredRepository: {
        provider: 'generic',
        host: null,
        remote: 'origin',
        slug: null,
        default_base_branch: null,
        review_system: 'none',
      },
      declaredSourceRepoRoots: ['/workspace/source'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/source/worktrees/issue-490',
      gitCommonRepoRoot: '/workspace/source',
      gitRemoteOrigin: 'file:///tmp/repo.git',
    });

    expect(result.ok).toBe(true);
  });

  it('passes local root proof when no repository metadata is declared', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'local-project',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredSourceRepoRoots: ['/workspace/source'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/source',
      gitCommonRepoRoot: '/workspace/source',
      gitRemoteOrigin: 'file:///tmp/repo.git',
    });

    expect(result.ok).toBe(true);
    expect(result.matchedBy).toBe('git_common_repo_root');
  });

  it('fails provider-specific repository validation when the declared slug is missing', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'gitlab-project',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredRepository: {
        provider: 'gitlab',
        host: null,
        remote: 'origin',
        slug: null,
        default_base_branch: null,
        review_system: 'merge_request',
      },
      declaredSourceRepoRoots: ['/workspace/source'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/source',
      gitCommonRepoRoot: '/workspace/source',
      gitRemoteOrigin: 'https://gitlab.com/group/repo.git',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('source_control.repository gitlab:(no slug)');
  });

  it('formats missing remotes for provider-specific repository mismatches', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'gitee-project',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredRepository: {
        provider: 'gitee',
        host: null,
        remote: 'origin',
        slug: 'owner/repo',
        default_base_branch: null,
        review_system: 'pull_request',
      },
      declaredSourceRepoRoots: ['/workspace/source'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/source',
      gitCommonRepoRoot: '/workspace/source',
      gitRemoteOrigin: '',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('git remote origin "missing"');
    expect(result.message).toContain('source_control.repository gitee:owner/repo');
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

  it('passes when a self-hosted gitlab host matches an scp-style remote', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'hermes-360teams',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredRepository: {
        provider: 'gitlab',
        host: 'gitlab.daikuan.qihoo.net',
        remote: 'origin',
        slug: 'huangjianting-jk/hermes-360teams',
        default_base_branch: 'main',
        review_system: 'merge_request',
      },
      declaredSourceRepoRoots: ['/workspace/source'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/source',
      gitCommonRepoRoot: '/workspace/source',
      gitRemoteOrigin: 'git@gitlab.daikuan.qihoo.net:huangjianting-jk/hermes-360teams.git',
    });

    expect(result.ok).toBe(true);
    expect(result.matchedBy).toBe('git_common_repo_root');
  });

  it('passes when a self-hosted gitlab host matches an ssh remote with a non-standard port', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'hermes-360teams',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredRepository: {
        provider: 'gitlab',
        host: 'gitlab.daikuan.qihoo.net',
        remote: 'origin',
        slug: 'huangjianting-jk/hermes-360teams',
        default_base_branch: 'main',
        review_system: 'merge_request',
      },
      declaredSourceRepoRoots: ['/workspace/source'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/source',
      gitCommonRepoRoot: '/workspace/source',
      gitRemoteOrigin: 'ssh://git@gitlab.daikuan.qihoo.net:2222/huangjianting-jk/hermes-360teams.git',
    });

    expect(result.ok).toBe(true);
    expect(result.matchedBy).toBe('git_common_repo_root');
  });

  it('passes when a self-hosted host matches an https remote with a port', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'hermes-360teams',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredRepository: {
        provider: 'gitlab',
        host: 'gitlab.daikuan.qihoo.net',
        remote: 'origin',
        slug: 'huangjianting-jk/hermes-360teams',
        default_base_branch: 'main',
        review_system: 'merge_request',
      },
      declaredSourceRepoRoots: ['/workspace/source'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/source',
      gitCommonRepoRoot: '/workspace/source',
      gitRemoteOrigin: 'https://gitlab.daikuan.qihoo.net:8443/huangjianting-jk/hermes-360teams.git',
    });

    expect(result.ok).toBe(true);
    expect(result.matchedBy).toBe('git_common_repo_root');
  });

  it('fails when the declared self-hosted host does not match the remote host', () => {
    const result = validateGuardrailRepoIdentity({
      projectId: 'hermes-360teams',
      projectYamlPath: '/workspace/project/.project.yaml',
      declaredRepository: {
        provider: 'gitlab',
        host: 'gitlab.daikuan.qihoo.net',
        remote: 'origin',
        slug: 'huangjianting-jk/hermes-360teams',
        default_base_branch: 'main',
        review_system: 'merge_request',
      },
      declaredSourceRepoRoots: ['/workspace/source'],
      sourceRepoRootsDeclared: true,
      gitWorktreeRoot: '/workspace/source',
      gitCommonRepoRoot: '/workspace/source',
      gitRemoteOrigin: 'git@gitlab.com:huangjianting-jk/hermes-360teams.git',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('source_control.repository gitlab:huangjianting-jk/hermes-360teams (host gitlab.daikuan.qihoo.net)');
  });

  it('extracts provider-specific repository slugs from common remote URL formats', () => {
    expect(extractRepositorySlugFromRemoteOrigin('git@gitlab.com:group/sub/repo.git', 'gitlab')).toBe('group/sub/repo');
    expect(extractRepositorySlugFromRemoteOrigin('https://gitee.com/owner/repo.git', 'gitee')).toBe('owner/repo');
    expect(extractRepositorySlugFromRemoteOrigin('ssh://git@github.com/owner/repo.git', 'github')).toBe('owner/repo');
    expect(extractRepositorySlugFromRemoteOrigin('file:///tmp/repo.git', 'generic')).toBeNull();
  });

  it('extracts repository slugs from self-hosted remotes when a host is declared', () => {
    expect(extractRepositorySlugFromRemoteOrigin('git@gitlab.daikuan.qihoo.net:group/repo.git', 'gitlab', 'gitlab.daikuan.qihoo.net')).toBe('group/repo');
    expect(extractRepositorySlugFromRemoteOrigin('ssh://git@gitlab.daikuan.qihoo.net:2222/group/repo.git', 'gitlab', 'gitlab.daikuan.qihoo.net')).toBe('group/repo');
    expect(extractRepositorySlugFromRemoteOrigin('https://gitlab.daikuan.qihoo.net:8443/group/repo.git', 'gitlab', 'gitlab.daikuan.qihoo.net')).toBe('group/repo');
    expect(extractRepositorySlugFromRemoteOrigin('https://gitlab.daikuan.qihoo.net/group/repo', 'gitlab', 'GitLab.Daikuan.Qihoo.Net')).toBe('group/repo');
    // declared host replaces the provider default instead of widening it
    expect(extractRepositorySlugFromRemoteOrigin('git@gitlab.com:group/repo.git', 'gitlab', 'gitlab.daikuan.qihoo.net')).toBeNull();
  });

  it('does not misread an ssh URL port as part of the repository slug', () => {
    expect(extractRepositorySlugFromRemoteOrigin('ssh://git@github.com:22/owner/repo.git', 'github')).toBe('owner/repo');
  });
});
