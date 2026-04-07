import { describe, expect, it, vi } from 'vitest';
import { findProjectDir, runRecordReminderCli } from '../record-reminder-cli.js';

function createDeps(existingPaths: string[] = [], mtimes: Record<string, number> = {}) {
  const pathSet = new Set(existingPaths);
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    stdout,
    stderr,
    deps: {
      cwd: () => '/workspace/projects/demo/tasks',
      nowSeconds: () => 1000,
      fileExists: (path: string) => pathSet.has(path),
      fileMtimeSeconds: (path: string) => mtimes[path] ?? 0,
      dirname: (path: string) => path.replace(/\/[^/]+$/, '') || '/',
      basename: (path: string) => path.split('/').filter(Boolean).at(-1) || '',
      join: (...parts: string[]) => parts.join('/').replace(/\/+/g, '/'),
      stdout: (line: string) => stdout.push(line),
      stderr: (line: string) => stderr.push(line),
    },
  };
}

describe('record reminder cli', () => {
  it('finds the nearest project directory', () => {
    const harness = createDeps(['/workspace/projects/demo/.project.yaml']);
    expect(findProjectDir('/workspace/projects/demo/tasks', harness.deps)).toBe('/workspace/projects/demo');
  });

  it('does nothing when no project is found', () => {
    const harness = createDeps();
    const exitCode = runRecordReminderCli([], harness.deps);

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual([]);
  });

  it('does nothing when the last record marker is recent', () => {
    const marker = '/workspace/projects/demo/.context/.last_record';
    const harness = createDeps(
      ['/workspace/projects/demo/.project.yaml', marker],
      { [marker]: 950 },
    );

    const exitCode = runRecordReminderCli([], harness.deps);

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual([]);
  });

  it('prints a reminder when the marker is missing or stale', () => {
    const harness = createDeps(['/workspace/projects/demo/.project.yaml']);
    const exitCode = runRecordReminderCli([], harness.deps);

    expect(exitCode).toBe(0);
    expect(harness.stdout.join('\n')).toContain('agenticos_record');
    expect(harness.stdout.join('\n')).toContain('demo');
  });
});
