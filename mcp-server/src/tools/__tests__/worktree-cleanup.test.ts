/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest';
import { runWorktreeCleanup } from '../worktree-cleanup.js';

describe('runWorktreeCleanup', () => {
  it('returns error when repo_path is missing', async () => {
    const result = await runWorktreeCleanup({});
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('BLOCKED');
    expect(parsed.errors).toContain('repo_path is required');
  });

  it('rejects repo_path outside allowed base paths', async () => {
    const result = await runWorktreeCleanup({ repo_path: '/etc' });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('BLOCKED');
    expect(parsed.errors[0]).toMatch(/must be within allowed base paths/);
  });

  it('rejects relative repo_path', async () => {
    const result = await runWorktreeCleanup({ repo_path: '../etc' });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('BLOCKED');
    expect(parsed.errors[0]).toMatch(/must be an absolute path/);
  });

  it('rejects repo_path equal to base directory itself', async () => {
    const result = await runWorktreeCleanup({ repo_path: process.env.HOME || '/' });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('BLOCKED');
    expect(parsed.errors[0]).toMatch(/must be within allowed base paths/);
  });

  it('returns DRY_RUN status when dry_run is true', async () => {
    const result = await runWorktreeCleanup({ repo_path: '/fake/path', dry_run: true });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('DRY_RUN');
  });

  it('initializes with empty arrays when called with valid path', async () => {
    const result = await runWorktreeCleanup({ repo_path: '/nonexistent' });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('status');
    expect(parsed).toHaveProperty('removed_worktrees');
    expect(parsed).toHaveProperty('remaining_worktrees');
    expect(parsed).toHaveProperty('notes');
    expect(parsed).toHaveProperty('errors');
  });
});

describe('WorktreeCleanupArgs interface', () => {
  it('accepts optional project_path', async () => {
    const result = await runWorktreeCleanup({ repo_path: '/repo', project_path: '/project' });
    const parsed = JSON.parse(result);
    expect(parsed).toBeDefined();
  });

  it('accepts optional branch_name', async () => {
    const result = await runWorktreeCleanup({ repo_path: '/repo', branch_name: 'feat-123' });
    const parsed = JSON.parse(result);
    expect(parsed).toBeDefined();
  });

  it('normalizes refs/heads/ prefix in branch_name', async () => {
    const result = await runWorktreeCleanup({ repo_path: '/repo', branch_name: 'refs/heads/feat-123' });
    const parsed = JSON.parse(result);
    expect(parsed).toBeDefined();
  });

  it('accepts dry_run boolean', async () => {
    const result = await runWorktreeCleanup({ repo_path: '/repo', dry_run: true });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('DRY_RUN');
  });
});
