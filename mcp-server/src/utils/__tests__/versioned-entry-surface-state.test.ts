import { describe, expect, it } from 'vitest';
import { assessVersionedEntrySurfaceState } from '../versioned-entry-surface-state.js';

describe('assessVersionedEntrySurfaceState', () => {
  it('is not applicable for non-github-versioned projects', () => {
    const result = assessVersionedEntrySurfaceState({
      projectYaml: {
        source_control: {
          topology: 'local_directory_only',
        },
      },
      state: {},
      projectPath: '/project',
    });

    expect(result.applies).toBe(false);
    expect(result.freshness).toBe('not_applicable');
    expect(result.status).toBe('PASS');
  });

  it('marks github-versioned state stale when committed snapshot still points at issue-branch work', () => {
    const result = assessVersionedEntrySurfaceState({
      projectYaml: {
        source_control: {
          topology: 'github_versioned',
        },
      },
      state: {
        current_task: { status: 'in_progress' },
        entry_surface_refresh: { status: 'in_progress', refreshed_at: '2026-04-10T10:58:11.098Z' },
        issue_bootstrap: {
          latest: {
            current_branch: 'fix/260-stop-active-project-drift-and-main-state-pollution',
            workspace_type: 'isolated_worktree',
            repo_path: '/tmp/worktrees/issue-260',
          },
        },
      },
      projectPath: '/project',
    });

    expect(result.applies).toBe(true);
    expect(result.freshness).toBe('stale');
    expect(result.status).toBe('WARN');
    expect(result.reasons).toEqual([
      'current_task is still marked in_progress in committed state',
      'entry_surface_refresh still reports in_progress in committed state',
      'issue bootstrap still points at non-main branch "fix/260-stop-active-project-drift-and-main-state-pollution"',
      'issue bootstrap still points at an isolated worktree snapshot',
      'issue bootstrap repo_path still points at "/tmp/worktrees/issue-260" instead of the canonical project root',
    ]);
  });

  it('marks github-versioned state unproven when no explicit refresh metadata exists', () => {
    const result = assessVersionedEntrySurfaceState({
      projectYaml: {
        source_control: {
          topology: 'github_versioned',
        },
      },
      state: {},
      projectPath: '/project',
    });

    expect(result.applies).toBe(true);
    expect(result.freshness).toBe('unproven');
    expect(result.status).toBe('WARN');
    expect(result.reasons).toEqual(['entry surfaces do not yet have explicit refresh metadata']);
  });

  it('marks github-versioned state fresh when refresh metadata exists and no stale signals are present', () => {
    const result = assessVersionedEntrySurfaceState({
      projectYaml: {
        source_control: {
          topology: 'github_versioned',
        },
      },
      state: {
        session: {
          last_entry_surface_refresh: '2026-04-15T00:00:00.000Z',
        },
        current_task: {
          status: 'completed',
        },
        entry_surface_refresh: {
          status: 'completed',
          refreshed_at: '2026-04-15T00:00:00.000Z',
        },
        issue_bootstrap: {
          latest: {
            current_branch: 'main',
            workspace_type: 'main',
            repo_path: '/project',
          },
        },
      },
      projectPath: '/project',
    });

    expect(result.applies).toBe(true);
    expect(result.freshness).toBe('fresh');
    expect(result.status).toBe('PASS');
    expect(result.reasons).toEqual([]);
  });

  it('normalizes blank string fields to null and keeps freshness unproven without metadata', () => {
    const result = assessVersionedEntrySurfaceState({
      projectYaml: {
        source_control: {
          topology: 'github_versioned',
        },
      },
      state: {
        current_task: {
          status: '   ',
        },
        entry_surface_refresh: {
          status: '   ',
          refreshed_at: '   ',
        },
        issue_bootstrap: {
          latest: {
            current_branch: '   ',
            workspace_type: '   ',
            repo_path: '   ',
          },
        },
        session: {
          last_entry_surface_refresh: '   ',
        },
      },
      projectPath: '/project',
    });

    expect(result.freshness).toBe('unproven');
    expect(result.reasons).toEqual(['entry surfaces do not yet have explicit refresh metadata']);
    expect(result.details).toEqual({
      topology: 'github_versioned',
      refresh_status: null,
      has_refresh_metadata: false,
      current_task_status: null,
      issue_bootstrap_branch: null,
      issue_bootstrap_workspace_type: null,
      issue_bootstrap_repo_path: null,
    });
  });
});
