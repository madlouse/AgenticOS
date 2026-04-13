import { describe, expect, it } from 'vitest';
import { buildHelpLines, runConfigCli } from '../config-cli.js';

function createDeps() {
  const files = new Map<string, string>();
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    stdout,
    stderr,
    deps: {
      env: {} as Record<string, string | undefined>,
      homeDir: '/Users/tester',
      platform: 'darwin',
      shellPath: '/bin/zsh',
      nowIso() {
        return '2026-04-13T13:50:00.000Z';
      },
      commandExists(command: string) {
        return command === 'launchctl';
      },
      runCommand() {
        return { ok: true, detail: '/tmp/workspace' };
      },
      readFile(path: string) {
        return files.get(path) ?? null;
      },
      pathExists() {
        return false;
      },
      stdout(line: string) {
        stdout.push(line);
      },
      stderr(line: string) {
        stderr.push(line);
      },
    },
  };
}

describe('config cli', () => {
  it('prints help output', () => {
    const lines = buildHelpLines();

    expect(lines[0]).toContain('agenticos-config');
    expect(lines.join('\n')).toContain('--validate');
    expect(lines.join('\n')).toContain('--scope <all|runtime|mcp|homebrew>');
  });

  it('prints help output through the cli runner', () => {
    const harness = createDeps();

    const exitCode = runConfigCli(['-h'], harness.deps);

    expect(exitCode).toBe(0);
    expect(harness.stdout.join('\n')).toContain('agenticos-config');
  });

  it('accepts the long help flag as well', () => {
    const harness = createDeps();

    const exitCode = runConfigCli(['--help'], harness.deps);

    expect(exitCode).toBe(0);
    expect(harness.stdout.join('\n')).toContain('Usage:');
  });

  it('returns success for aligned configuration in show mode', () => {
    const harness = createDeps();
    harness.deps.env.AGENTICOS_HOME = '/tmp/workspace';
    harness.deps.readFile = (path: string) => path === '/Users/tester/.zshrc'
      ? 'export AGENTICOS_HOME="/tmp/workspace"\n'
      : null;

    const exitCode = runConfigCli(['--show', '--scope', 'runtime'], harness.deps);

    expect(exitCode).toBe(0);
    expect(harness.stdout.join('\n')).toContain('Status: PASS');
    expect(harness.stderr).toHaveLength(0);
  });

  it('returns failure for drift in validate mode', () => {
    const harness = createDeps();
    harness.deps.env.AGENTICOS_HOME = '/tmp/workspace';
    harness.deps.readFile = (path: string) => path === '/Users/tester/.zshrc'
      ? 'export AGENTICOS_HOME="/tmp/other"\n'
      : null;

    const exitCode = runConfigCli(['--validate', '--scope', 'runtime'], harness.deps);

    expect(exitCode).toBe(1);
    expect(harness.stdout.join('\n')).toContain('Discrepancies:');
    expect(harness.stdout.join('\n')).toContain('/Users/tester/.zshrc');
  });

  it('returns failure for unknown arguments', () => {
    const harness = createDeps();

    const exitCode = runConfigCli(['--nope'], harness.deps);

    expect(exitCode).toBe(1);
    expect(harness.stderr.join('\n')).toContain('Unknown argument');
  });

  it('returns failure when scope is missing a value', () => {
    const harness = createDeps();

    const exitCode = runConfigCli(['--scope'], harness.deps);

    expect(exitCode).toBe(1);
    expect(harness.stderr.join('\n')).toContain('--scope requires a value.');
  });

  it('stringifies non-Error exceptions from output handlers', () => {
    const harness = createDeps();
    harness.deps.env.AGENTICOS_HOME = '/tmp/workspace';
    harness.deps.readFile = (path: string) => path === '/Users/tester/.zshrc'
      ? 'export AGENTICOS_HOME="/tmp/workspace"\n'
      : null;
    harness.deps.stdout = () => {
      throw 'boom';
    };

    const exitCode = runConfigCli(['--show', '--scope', 'runtime'], harness.deps);

    expect(exitCode).toBe(1);
    expect(harness.stderr.join('\n')).toContain('boom');
  });
});
