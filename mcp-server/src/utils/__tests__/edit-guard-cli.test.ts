import { describe, expect, it, vi } from 'vitest';
import { runEditGuardCli } from '../edit-guard-cli.js';

describe('edit guard cli', () => {
  it('prints help', async () => {
    const stdout: string[] = [];
    const exitCode = await runEditGuardCli(['--help'], {
      env: {},
      stdout: (line) => stdout.push(line),
      stderr: vi.fn(),
      callEditGuard: vi.fn(),
    });

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('agenticos-edit-guard');
  });

  it('requires AGENTICOS_HOME', async () => {
    const stderr: string[] = [];
    const exitCode = await runEditGuardCli(
      ['--repo-path', '/repo', '--issue-id', '113', '--declared-target-file', 'README.md'],
      {
        env: {},
        stdout: vi.fn(),
        stderr: (line) => stderr.push(line),
        callEditGuard: vi.fn(),
      },
    );

    expect(exitCode).toBe(64);
    expect(stderr.join('\n')).toContain('AGENTICOS_HOME is required');
  });

  it('returns 0 when edit guard passes', async () => {
    const stdout: string[] = [];
    const exitCode = await runEditGuardCli(
      ['--repo-path', '/repo', '--issue-id', '113', '--declared-target-file', 'README.md'],
      {
        env: { AGENTICOS_HOME: '/workspace' },
        stdout: (line) => stdout.push(line),
        stderr: vi.fn(),
        callEditGuard: vi.fn(async () => JSON.stringify({ status: 'PASS' })),
      },
    );

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('"PASS"');
  });

  it('returns 2 when edit guard blocks', async () => {
    const exitCode = await runEditGuardCli(
      ['--repo-path', '/repo', '--issue-id', '113', '--declared-target-file', 'README.md'],
      {
        env: { AGENTICOS_HOME: '/workspace' },
        stdout: vi.fn(),
        stderr: vi.fn(),
        callEditGuard: vi.fn(async () => JSON.stringify({ status: 'BLOCK' })),
      },
    );

    expect(exitCode).toBe(2);
  });
});
