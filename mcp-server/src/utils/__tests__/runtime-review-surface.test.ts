import { describe, expect, it } from 'vitest';
import { resolveRuntimeReviewSurfacePaths } from '../runtime-review-surface.js';

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
});
