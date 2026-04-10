import { describe, expect, it } from 'vitest';
import { validateContextPublicationPolicy } from '../project-contract.js';

describe('validateContextPublicationPolicy', () => {
  it('accepts local_private for local_directory_only projects', () => {
    expect(validateContextPublicationPolicy('Local Project', {
      source_control: {
        topology: 'local_directory_only',
        context_publication_policy: 'local_private',
      },
    })).toEqual({ ok: true, policy: 'local_private' });
  });

  it('accepts private_continuity for github_versioned projects', () => {
    expect(validateContextPublicationPolicy('Private Repo', {
      source_control: {
        topology: 'github_versioned',
        context_publication_policy: 'private_continuity',
      },
    })).toEqual({ ok: true, policy: 'private_continuity' });
  });

  it('rejects local_private for github_versioned projects', () => {
    const result = validateContextPublicationPolicy('Public Repo', {
      source_control: {
        topology: 'github_versioned',
        context_publication_policy: 'local_private',
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('github_versioned');
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
});
