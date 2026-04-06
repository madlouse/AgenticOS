import { describe, expect, it } from 'vitest';
import yaml from 'yaml';
import { runBootstrapCli } from '../bootstrap-cli.js';

function createDeps() {
  const files = new Map<string, string>();
  const commands: Array<{ command: string; args: string[]; failOnError: boolean }> = [];
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    files,
    commands,
    stdout,
    stderr,
    deps: {
      env: {},
      homeDir: '/Users/tester',
      platform: 'darwin',
      nowIso() {
        return '2026-04-03T09:00:00.000Z';
      },
      commandExists(command: string) {
        return ['codex', 'claude', 'gemini', 'cursor-agent'].includes(command);
      },
      runCommand(command: string, args: string[], failOnError: boolean) {
        commands.push({ command, args, failOnError });
        const joined = [command, ...args].join(' ');
        if (joined === 'launchctl getenv AGENTICOS_HOME') {
          return { ok: true, detail: '/tmp/workspace' };
        }
        if (joined === 'codex mcp get agenticos') {
          return { ok: true, detail: 'env: AGENTICOS_HOME=/tmp/workspace' };
        }
        if (joined === 'gemini mcp list') {
          return { ok: true, detail: 'agenticos' };
        }
        if (joined === 'claude mcp get agenticos') {
          return { ok: true, detail: 'AGENTICOS_HOME=/tmp/workspace' };
        }
        return { ok: true, detail: 'ok' };
      },
      mkdirp() {},
      readFile(path: string) {
        return files.get(path) ?? null;
      },
      writeFile(path: string, content: string) {
        files.set(path, content);
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

describe('bootstrap cli', () => {
  it('applies codex bootstrap and persists shell env', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      [
        '--workspace',
        '/tmp/workspace',
        '--agent',
        'codex',
        '--persist-shell-env',
        '--shell-profile',
        '/Users/tester/.zshrc',
        '--apply',
      ],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.commands.map((entry) => [entry.command, ...entry.args].join(' '))).toEqual([
      'codex mcp remove agenticos',
      'codex mcp add --env AGENTICOS_HOME=/tmp/workspace agenticos -- agenticos-mcp',
      'codex mcp get agenticos',
    ]);
    expect(harness.files.get('/Users/tester/.zshrc')).toContain('export AGENTICOS_HOME="/tmp/workspace"');
    const bootstrapState = yaml.parse(harness.files.get('/tmp/workspace/.agent-workspace/bootstrap-state.yaml') || '');
    expect(bootstrapState.mode).toBe('apply');
    expect(bootstrapState.selected_agents).toEqual(['codex']);
    expect(bootstrapState.successful_agents).toEqual(['codex']);
    expect(bootstrapState.status).toBe('success');
    expect(harness.stdout.some((line) => line.includes('OK codex'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('OK shell-profile'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('OK bootstrap-state'))).toBe(true);
  });

  it('writes cursor MCP config during apply', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      [
        '--workspace',
        '/tmp/workspace',
        '--agent',
        'cursor',
        '--apply',
      ],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    const content = harness.files.get('/Users/tester/.cursor/mcp.json');
    expect(content).toContain('"agenticos"');
    expect(content).toContain('/tmp/workspace');
  });

  it('prints dry-run plan without mutating files', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--persist-shell-env'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.commands).toHaveLength(0);
    expect(harness.files.size).toBe(0);
    expect(harness.stdout.some((line) => line.includes('shell-profile'))).toBe(true);
  });

  it('applies launchctl persistence on macOS when requested', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--persist-launchctl-env', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.commands.map((entry) => [entry.command, ...entry.args].join(' '))).toContain(
      'launchctl setenv AGENTICOS_HOME /tmp/workspace',
    );
    expect(harness.commands.map((entry) => [entry.command, ...entry.args].join(' '))).toContain(
      'launchctl getenv AGENTICOS_HOME',
    );
    expect(harness.stdout.some((line) => line.includes('OK launchctl'))).toBe(true);
  });

  it('fails launchctl persistence on non-macos platforms', () => {
    const harness = createDeps();
    harness.deps.platform = 'linux';

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--persist-launchctl-env', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.some((line) => line.includes('FAIL launchctl'))).toBe(true);
  });

  it('verifies codex, shell profile, and launchctl state without mutating', () => {
    const harness = createDeps();
    harness.files.set('/Users/tester/.zshrc', 'export AGENTICOS_HOME="/tmp/workspace"\n');

    const exitCode = runBootstrapCli(
      [
        '--workspace',
        '/tmp/workspace',
        '--agent',
        'codex',
        '--persist-shell-env',
        '--persist-launchctl-env',
        '--shell-profile',
        '/Users/tester/.zshrc',
        '--verify',
      ],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.files.get('/Users/tester/.zshrc')).toBe('export AGENTICOS_HOME="/tmp/workspace"\n');
    expect(harness.stdout.some((line) => line.includes('OK codex'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('OK shell-profile'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('OK launchctl'))).toBe(true);
    expect(harness.files.has('/tmp/workspace/.agent-workspace/bootstrap-state.yaml')).toBe(false);
  });

  it('fails verification when codex points at a different workspace', () => {
    const harness = createDeps();
    harness.deps.runCommand = (command: string, args: string[], failOnError: boolean) => {
      harness.commands.push({ command, args, failOnError });
      const joined = [command, ...args].join(' ');
      if (joined === 'codex mcp get agenticos') {
        return { ok: true, detail: 'env: AGENTICOS_HOME=/tmp/other-workspace' };
      }
      return { ok: true, detail: 'ok' };
    };

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--verify'],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.some((line) => line.includes('FAIL codex: env: AGENTICOS_HOME=/tmp/other-workspace'))).toBe(true);
  });

  it('fails verification when the expected shell profile export is missing', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      [
        '--workspace',
        '/tmp/workspace',
        '--agent',
        'codex',
        '--persist-shell-env',
        '--shell-profile',
        '/Users/tester/.zshrc',
        '--verify',
      ],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.some((line) => line.includes('FAIL shell-profile'))).toBe(true);
  });

  it('enables apply, shell persistence, and launchctl persistence in first-run mode on macOS', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--first-run'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.commands.map((entry) => [entry.command, ...entry.args].join(' '))).toContain(
      'launchctl setenv AGENTICOS_HOME /tmp/workspace',
    );
    expect(harness.files.get('/Users/tester/.profile')).toContain('export AGENTICOS_HOME="/tmp/workspace"');
    expect(harness.stdout.some((line) => line.includes('OK shell-profile'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('OK launchctl'))).toBe(true);
  });

  it('rejects combining first-run with verify', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--first-run', '--verify'],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stderr.some((line) => line.includes('--first-run cannot be combined with --verify.'))).toBe(true);
  });
});
