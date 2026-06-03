import { describe, expect, it } from 'vitest';
import {
  inspectHermesDiscordReadiness,
  renderHermesDiscordReadinessLines,
} from '../integration-readiness.js';

function createDeps() {
  const files = new Map<string, string>();
  const commands = new Set<string>();
  const env: Record<string, string | undefined> = {};

  return {
    files,
    commands,
    env,
    deps: {
      env,
      homeDir: '/Users/tester',
      commandExists(command: string) {
        return commands.has(command);
      },
      readFile(path: string) {
        return files.get(path) ?? null;
      },
    },
  };
}

describe('optional Discord channel readiness', () => {
  it('skips Hermes and Discord checks without failing core readiness when Hermes is absent', () => {
    const harness = createDeps();

    const result = inspectHermesDiscordReadiness(harness.deps, {
      workspace: '/tmp/workspace',
    });

    expect(result.ok).toBe(true);
    expect(result.required).toBe(false);
    expect(result.checks.find((check) => check.id === 'hermes_runtime')?.marker).toBe('SKIP');
    expect(result.checks.find((check) => check.id === 'discord_config')?.marker).toBe('SKIP');
    expect(renderHermesDiscordReadinessLines(result).join('\n')).toContain('--verify-hermes-discord');
  });

  it('warns when Hermes is present but Discord routing is not configured', () => {
    const harness = createDeps();
    harness.commands.add('hermes-gateway');

    const result = inspectHermesDiscordReadiness(harness.deps, {
      workspace: '/tmp/workspace',
    });

    expect(result.ok).toBe(true);
    expect(result.checks.find((check) => check.id === 'hermes_runtime')?.marker).toBe('OK');
    expect(result.checks.find((check) => check.id === 'hermes_gateway')?.marker).toBe('WARN');
    expect(result.checks.find((check) => check.id === 'discord_config')?.marker).toBe('WARN');
  });

  it('detects Hermes from local config when no Hermes command is on PATH', () => {
    const harness = createDeps();
    harness.files.set('/Users/tester/.hermes/config.yaml', 'gateway: true\n');

    const result = inspectHermesDiscordReadiness(harness.deps);

    expect(result.checks.find((check) => check.id === 'hermes_runtime')).toMatchObject({
      marker: 'OK',
      detail: 'Hermes detected via /Users/tester/.hermes/config.yaml.',
    });
  });

  it('passes when Hermes gateway, Discord config, and thread bindings are present', () => {
    const harness = createDeps();
    harness.commands.add('hermes');
    harness.env.HERMES_GATEWAY_URL = 'http://127.0.0.1:8787';
    harness.env.DISCORD_APP_ID = 'app-id';
    harness.env.DISCORD_BOT_TOKEN = 'secret-token';
    harness.files.set('/tmp/workspace/.agent-workspace/integrations/discord/thread-bindings.yaml', 'bindings:\n  - project_id: agenticos\n');

    const result = inspectHermesDiscordReadiness(harness.deps, {
      required: true,
      workspace: '/tmp/workspace',
    });
    const rendered = renderHermesDiscordReadinessLines(result).join('\n');

    expect(result.ok).toBe(true);
    expect(result.checks.every((check) => check.marker === 'OK')).toBe(true);
    expect(rendered).toContain('Restart Hermes gateway');
    expect(rendered).not.toContain('secret-token');
  });

  it('fails only when Discord channel routing is explicitly required', () => {
    const harness = createDeps();
    harness.commands.add('hermes-agent');
    harness.env.DISCORD_PUBLIC_KEY = 'public-key-only';

    const result = inspectHermesDiscordReadiness(harness.deps, {
      required: true,
      workspace: '/tmp/workspace',
    });

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.id === 'hermes_runtime')?.marker).toBe('OK');
    expect(result.checks.find((check) => check.id === 'hermes_gateway')?.marker).toBe('FAIL');
    expect(result.checks.find((check) => check.id === 'discord_config')?.marker).toBe('FAIL');
    expect(result.checks.find((check) => check.id === 'discord_thread_bindings')?.marker).toBe('FAIL');
  });

  it('treats command detection failures as absent optional Hermes commands', () => {
    const harness = createDeps();
    harness.deps.commandExists = () => {
      throw new Error('PATH lookup failed');
    };

    const result = inspectHermesDiscordReadiness(harness.deps);

    expect(result.ok).toBe(true);
    expect(result.checks.find((check) => check.id === 'hermes_runtime')?.marker).toBe('SKIP');
  });
});
