import { describe, expect, it } from 'vitest';
import {
  resolveRuntimeReviewComparisonRoot,
  resolveRuntimeReviewSurfacePaths,
} from '../runtime-review-surface.js';

describe('resolveRuntimeReviewComparisonRoot', () => {
  it('returns managed project path when repo root is omitted', () => {
    expect(resolveRuntimeReviewComparisonRoot('/repo/projects/app')).toBe('/repo/projects/app');
  });

  it('returns repo root when project path equals repo root', () => {
    expect(resolveRuntimeReviewComparisonRoot('/repo', '/repo')).toBe('/repo');
  });

  it('returns repo root when project path is nested inside the repo', () => {
    expect(resolveRuntimeReviewComparisonRoot('/repo/projects/app', '/repo')).toBe('/repo');
  });

  it('returns managed project path when repo root is an external worktree', () => {
    expect(
      resolveRuntimeReviewComparisonRoot('/repo/projects/app', '/repo/worktrees/issue-482'),
    ).toBe('/repo/projects/app');
  });
});

describe('runtime review surface', () => {
  it('keeps tracked conversations in runtime-managed paths for private continuity', () => {
    const result = resolveRuntimeReviewSurfacePaths('/workspace/private-project', {
      meta: { name: 'Private Project' },
      source_control: {
        topology: 'github_versioned',
        context_publication_policy: 'private_continuity',
      },
    });

    expect(result.tracked_review_excluded_paths).toContain('.context/conversations/');
    expect(result.private_transcript_blocked_paths).toContain('.private/conversations/');
  });

  it('excludes the evolution-log dir as runtime-managed continuity (#580)', () => {
    const result = resolveRuntimeReviewSurfacePaths('/workspace/private-project', {
      meta: { name: 'Private Project' },
      source_control: {
        topology: 'github_versioned',
        context_publication_policy: 'private_continuity',
      },
    });

    expect(result.tracked_review_excluded_paths).toContain('.context/evolution-log/');
  });

  it('treats tracked conversations as blocked raw transcript paths for public_distilled', () => {
    const result = resolveRuntimeReviewSurfacePaths('/workspace/public-project', {
      meta: { name: 'Public Project' },
      source_control: {
        topology: 'github_versioned',
        context_publication_policy: 'public_distilled',
      },
    });

    expect(result.tracked_review_excluded_paths).not.toContain('.context/conversations/');
    expect(result.private_transcript_blocked_paths).toContain('.context/conversations/');
    expect(result.private_transcript_blocked_paths).toContain('.private/conversations/');
  });

  it('resolves nested-project review paths relative to the git repo root when provided', () => {
    const result = resolveRuntimeReviewSurfacePaths('/workspace/repo/projects/app', {
      meta: { name: 'Nested Public Project' },
      source_control: {
        topology: 'github_versioned',
        context_publication_policy: 'public_distilled',
      },
      agent_context: {
        current_state: 'runtime/state.yaml',
        conversations: 'runtime/conversations/',
        last_record_marker: 'runtime/.last_record',
      },
    }, {
      repo_root: '/workspace/repo',
    });

    expect(result.tracked_review_excluded_paths).toContain('projects/app/runtime/state.yaml');
    expect(result.private_transcript_blocked_paths).toContain('projects/app/runtime/conversations/');
    expect(result.private_transcript_blocked_paths).toContain('projects/app/.private/conversations/');
  });

  it('fails closed when strict context-policy resolution is requested', () => {
    expect(() => resolveRuntimeReviewSurfacePaths('/workspace/project', {
      meta: { name: 'Broken Project' },
    }, {
      fail_closed_on_context_policy_error: true,
    })).toThrow();
  });

  it('uses managed project root for surface comparison when repo_root is an external worktree', () => {
    const result = resolveRuntimeReviewSurfacePaths('/repo/projects/agenticos', {
      meta: { name: 'AgenticOS' },
      source_control: {
        topology: 'github_versioned',
        context_publication_policy: 'private_continuity',
      },
      agent_context: {
        current_state: 'standards/.context/state.yaml',
        conversations: 'standards/.context/conversations/',
        last_record_marker: 'standards/.context/.last_record',
      },
    }, {
      repo_root: '/repo/worktrees/issue-482',
    });

    expect(result.tracked_review_excluded_paths).toContain('standards/.context/state.yaml');
    expect(result.tracked_review_excluded_paths).toContain('standards/.context/conversations/');
  });

  it('falls back to managed context paths when context policy resolution fails', () => {
    const result = resolveRuntimeReviewSurfacePaths('/workspace/fallback-project', {
      meta: { name: 'Fallback Project' },
    }, {
      repo_root: '/workspace/fallback-project',
      include_claude_state_mirror: true,
    });

    expect(result.tracked_review_excluded_paths).toContain('.context/state.yaml');
    expect(result.tracked_review_excluded_paths).toContain('CLAUDE.md');
    expect(result.sidecar_only_paths).toContain('.private/conversations/');
  });

  it('uses the project directory basename when meta.name is missing', () => {
    const result = resolveRuntimeReviewSurfacePaths('/workspace/my-project', {
      source_control: {
        topology: 'local_directory_only',
        context_publication_policy: 'local_private',
      },
    }, {
      include_claude_state_mirror: true,
    });

    expect(result.tracked_review_excluded_paths).toContain('.context/state.yaml');
  });

  it('throws when fallback context paths escape the comparison root', () => {
    expect(() => resolveRuntimeReviewSurfacePaths('/workspace/project', {
      meta: { name: 'Broken Project' },
      source_control: {
        topology: 'github_versioned',
        context_publication_policy: 'bad-policy',
      },
      agent_context: {
        current_state: '../../escape/state.yaml',
        conversations: '../../escape/conversations/',
        last_record_marker: '../../escape/.last_record',
      },
    }, {
      repo_root: '/workspace/other',
    })).toThrow('Runtime review surface path escapes comparison root');
  });
});
