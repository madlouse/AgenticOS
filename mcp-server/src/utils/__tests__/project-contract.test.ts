import { describe, expect, it } from 'vitest';
import {
  buildArchivedReferenceMessage,
  buildProjectTopologyInitializationMessage,
  defaultReviewSystemForProvider,
  getArchiveContract,
  getSourceControlContract,
  isArchivedReferenceProject,
  isGitBackedTopology,
  isSupportedGitBranchStrategy,
  isValidContextPublicationPolicy,
  isValidGitRepositoryProvider,
  isValidGitReviewSystem,
  validateContextPublicationPolicy,
  validateManagedProjectTopology,
  validateProjectKind,
  normalizeRepositorySlug,
  resolveSourceControlRepository,
} from '../project-contract.js';

describe('git repository contract helpers', () => {
  it('normalizes and validates git-backed repository fields', () => {
    expect(isValidContextPublicationPolicy('public_distilled')).toBe(true);
    expect(isValidContextPublicationPolicy('secret')).toBe(false);
    expect(isGitBackedTopology('git_versioned')).toBe(true);
    expect(isGitBackedTopology('local_directory_only')).toBe(false);
    expect(normalizeRepositorySlug('/Group/Sub/Repo.git')).toBe('group/sub/repo');
    expect(isValidGitRepositoryProvider('gitee')).toBe(true);
    expect(isValidGitRepositoryProvider('bitbucket')).toBe(false);
    expect(isValidGitReviewSystem('merge_request')).toBe(true);
    expect(isValidGitReviewSystem('patch_queue')).toBe(false);
    expect(defaultReviewSystemForProvider('gitlab')).toBe('merge_request');
    expect(defaultReviewSystemForProvider('generic')).toBe('none');
    expect(defaultReviewSystemForProvider('gitee')).toBe('pull_request');
    expect(isSupportedGitBranchStrategy('issue_branch_review_merge')).toBe(true);
    expect(isSupportedGitBranchStrategy('github_flow')).toBe(true);
    expect(isSupportedGitBranchStrategy('trunk')).toBe(false);
  });

  it('resolves explicit, legacy, invalid, and missing repository contracts', () => {
    expect(resolveSourceControlRepository(null)).toBeNull();
    expect(resolveSourceControlRepository({
      repository: {
        provider: 'GITEE',
        slug: 'Owner/Repo.git',
        default_base_branch: 'origin/main',
        review_system: 'pull_request',
      },
    })).toEqual({
      provider: 'gitee',
      remote: 'origin',
      slug: 'owner/repo',
      default_base_branch: 'origin/main',
      review_system: 'pull_request',
    });
    expect(resolveSourceControlRepository({
      repository: {
        provider: 'generic',
        remote: '   ',
        default_base_branch: '   ',
        review_system: 'invalid',
      },
    })).toEqual({
      provider: 'generic',
      remote: 'origin',
      slug: null,
      default_base_branch: null,
      review_system: 'none',
    });
    expect(resolveSourceControlRepository({
      repository: {
        provider: 'bitbucket',
        slug: 'owner/repo',
      },
      github_repo: 'Legacy/Repo',
    })).toEqual({
      provider: 'github',
      remote: 'origin',
      slug: 'legacy/repo',
      default_base_branch: null,
      review_system: 'pull_request',
    });
    expect(resolveSourceControlRepository({
      repository: {
        provider: 'bitbucket',
      },
    })).toBeNull();
  });
});

describe('validateContextPublicationPolicy', () => {
  it('accepts local_private for local_directory_only projects', () => {
    expect(validateContextPublicationPolicy('Local Project', {
      source_control: {
        topology: 'local_directory_only',
        context_publication_policy: 'local_private',
      },
    })).toEqual({ ok: true, policy: 'local_private' });
  });

  it('infers local_private for legacy local_directory_only projects when policy is missing', () => {
    expect(validateContextPublicationPolicy('Legacy Local Project', {
      source_control: {
        topology: 'local_directory_only',
      },
    })).toEqual({ ok: true, policy: 'local_private' });
  });

  it('rejects explicit blank publication policy for local_directory_only projects', () => {
    const result = validateContextPublicationPolicy('Blank Policy', {
      source_control: {
        topology: 'local_directory_only',
        context_publication_policy: '   ',
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('context_publication_policy');
    }
  });

  it('accepts private_continuity for github_versioned projects', () => {
    expect(validateContextPublicationPolicy('Private Repo', {
      source_control: {
        topology: 'github_versioned',
        context_publication_policy: 'private_continuity',
      },
    })).toEqual({ ok: true, policy: 'private_continuity' });
  });

  it('accepts private_continuity for git_versioned projects', () => {
    expect(validateContextPublicationPolicy('Git Repo', {
      source_control: {
        topology: 'git_versioned',
        context_publication_policy: 'private_continuity',
      },
    })).toEqual({ ok: true, policy: 'private_continuity' });
  });

  it('rejects local_private for git-backed projects', () => {
    const result = validateContextPublicationPolicy('Public Repo', {
      source_control: {
        topology: 'git_versioned',
        context_publication_policy: 'local_private',
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('git_versioned');
      expect(result.message).toContain('private_continuity');
    }
  });

  it('rejects missing publication policy', () => {
    const result = validateContextPublicationPolicy('Missing Policy', {
      source_control: {
        topology: 'github_versioned',
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('context_publication_policy');
    }
  });

  it('rejects publication validation when topology is missing', () => {
    const result = validateContextPublicationPolicy('Missing Topology', {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('source_control.topology');
    }
  });
});

describe('validateProjectKind', () => {
  it('defaults missing agenticos.project_kind to project', () => {
    expect(validateProjectKind('Legacy Project', {})).toEqual({ ok: true, project_kind: 'project' });
  });

  it('defaults missing project_kind on an agenticos object to project', () => {
    expect(validateProjectKind('AgenticOS Block', {
      agenticos: { owner: 'agenticos' },
    })).toEqual({ ok: true, project_kind: 'project' });
  });

  it('defaults non-object agenticos metadata to project', () => {
    expect(validateProjectKind('Legacy AgenticOS Block', {
      agenticos: 'legacy',
    })).toEqual({ ok: true, project_kind: 'project' });
  });

  it('accepts topic and project values', () => {
    expect(validateProjectKind('Topic Project', {
      agenticos: { project_kind: 'topic' },
    })).toEqual({ ok: true, project_kind: 'topic' });

    expect(validateProjectKind('Engineering Project', {
      agenticos: { project_kind: 'project' },
    })).toEqual({ ok: true, project_kind: 'project' });
  });

  it('trims valid project_kind values', () => {
    expect(validateProjectKind('Trimmed Topic', {
      agenticos: { project_kind: ' topic ' },
    })).toEqual({ ok: true, project_kind: 'topic' });
  });

  it('rejects unsupported project_kind values', () => {
    const result = validateProjectKind('Bad Project', {
      agenticos: { project_kind: 'workflow' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('agenticos.project_kind');
      expect(result.message).toContain('topic');
      expect(result.message).toContain('project');
    }
  });

  it('rejects non-string project_kind values', () => {
    const result = validateProjectKind('Bad Project', {
      agenticos: { project_kind: 42 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('42');
    }
  });
});

describe('archive project contract', () => {
  it('returns archive contracts only when the contract is an object', () => {
    expect(getArchiveContract({ archive_contract: { kind: 'archived_reference' } })).toEqual({ kind: 'archived_reference' });
    expect(getArchiveContract({})).toBeNull();
    expect(getArchiveContract({ archive_contract: 'archived' })).toBeNull();
  });

  it('detects archived reference projects by registry status and contract fields', () => {
    expect(isArchivedReferenceProject({}, 'archived')).toBe(true);
    expect(isArchivedReferenceProject({})).toBe(false);
    expect(isArchivedReferenceProject({ archive_contract: { kind: 'archived_reference' } })).toBe(true);
    expect(isArchivedReferenceProject({ archive_contract: { managed_project: false } })).toBe(true);
    expect(isArchivedReferenceProject({ archive_contract: { execution_mode: 'reference_only' } })).toBe(true);
    expect(isArchivedReferenceProject({ archive_contract: { kind: 'active' } })).toBe(false);
  });

  it('builds archived reference messages with and without replacements', () => {
    expect(buildArchivedReferenceMessage('Old Project')).toContain('Old Project');
    expect(buildArchivedReferenceMessage('Old Project')).not.toContain('Use "');
    expect(buildArchivedReferenceMessage('Old Project', 'New Project')).toContain('Use "New Project" instead');
  });
});

describe('managed project topology contract', () => {
  it('returns source control contracts only when the contract is an object', () => {
    expect(getSourceControlContract({ source_control: { topology: 'local_directory_only' } })).toEqual({ topology: 'local_directory_only' });
    expect(getSourceControlContract({})).toBeNull();
    expect(getSourceControlContract({ source_control: 'local_directory_only' })).toBeNull();
  });

  it('builds topology initialization guidance', () => {
    expect(buildProjectTopologyInitializationMessage('Legacy Project')).toContain('normalize_existing=true');
  });

  it('validates local_directory_only topology', () => {
    expect(validateManagedProjectTopology('Local Project', {
      source_control: { topology: 'local_directory_only' },
    })).toEqual({ ok: true, topology: 'local_directory_only' });
  });

  it('rejects missing topology', () => {
    const result = validateManagedProjectTopology('Legacy Project', {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('has not completed');
    }
  });

  it('rejects github_versioned topology without github_repo', () => {
    const result = validateManagedProjectTopology('Repo Project', {
      source_control: { topology: 'github_versioned' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('github_repo');
    }
  });

  it('rejects github_versioned topology without github_flow branch strategy', () => {
    const result = validateManagedProjectTopology('Repo Project', {
      source_control: {
        topology: 'github_versioned',
        github_repo: 'madlouse/repo-project',
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('branch_strategy');
    }
  });

  it('rejects github_versioned topology without source repo roots', () => {
    const result = validateManagedProjectTopology('Repo Project', {
      source_control: {
        topology: 'github_versioned',
        github_repo: 'madlouse/repo-project',
        branch_strategy: 'github_flow',
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('source_repo_roots');
    }
  });

  it('accepts github_versioned topology with at least one non-empty string source repo root', () => {
    expect(validateManagedProjectTopology('Repo Project', {
      source_control: {
        topology: 'github_versioned',
        github_repo: 'madlouse/repo-project',
        branch_strategy: 'github_flow',
      },
      execution: {
        source_repo_roots: [' ', 7, '.'],
      },
    })).toEqual({ ok: true, topology: 'github_versioned' });
  });

  it('accepts canonical git_versioned topology for GitLab repositories', () => {
    expect(validateManagedProjectTopology('GitLab Repo', {
      source_control: {
        topology: 'git_versioned',
        repository: {
          provider: 'gitlab',
          remote: 'origin',
          slug: 'group/subgroup/repo',
          review_system: 'merge_request',
        },
        branch_strategy: 'issue_branch_review_merge',
      },
      execution: {
        source_repo_roots: ['.'],
      },
    })).toEqual({ ok: true, topology: 'git_versioned' });
  });

  it('accepts generic git_versioned topology without a repository slug', () => {
    expect(validateManagedProjectTopology('Generic Repo', {
      source_control: {
        topology: 'git_versioned',
        repository: {
          provider: 'generic',
          remote: 'origin',
          review_system: 'none',
        },
        branch_strategy: 'issue_branch_review_merge',
      },
      execution: {
        source_repo_roots: ['.'],
      },
    })).toEqual({ ok: true, topology: 'git_versioned' });
  });

  it('rejects git_versioned topology without repository metadata', () => {
    const result = validateManagedProjectTopology('Missing Repository', {
      source_control: {
        topology: 'git_versioned',
        branch_strategy: 'issue_branch_review_merge',
      },
      execution: {
        source_repo_roots: ['.'],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('source_control.repository.provider');
    }
  });

  it('rejects git_versioned provider repositories without a slug', () => {
    const result = validateManagedProjectTopology('Missing Slug', {
      source_control: {
        topology: 'git_versioned',
        repository: {
          provider: 'gitlab',
          remote: 'origin',
        },
        branch_strategy: 'issue_branch_review_merge',
      },
      execution: {
        source_repo_roots: ['.'],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('source_control.repository.slug');
    }
  });

  it('rejects unsupported topology values', () => {
    const result = validateManagedProjectTopology('Repo Project', {
      source_control: { topology: 'workspace' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('unsupported');
    }
  });
});
