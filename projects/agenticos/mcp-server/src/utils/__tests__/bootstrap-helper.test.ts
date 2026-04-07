import { describe, expect, it } from 'vitest';
import {
  detectDefaultShellProfile,
  detectDefaultWorkspace,
  detectWorkspaceCandidates,
  detectSupportedAgents,
  formatCommand,
  mergeCursorMcpConfig,
  parseAgentSelection,
  renderBootstrapCommand,
  upsertAgenticOSEnvExport,
} from '../bootstrap-helper.js';

describe('bootstrap helper', () => {
  it('deduplicates and validates selected agents', () => {
    expect(parseAgentSelection(['codex,cursor', 'codex'])).toEqual(['codex', 'cursor']);
    expect(() => parseAgentSelection(['missing-agent'])).toThrow('Unsupported agent "missing-agent".');
  });

  it('prefers env workspace over detected defaults', () => {
    const selection = detectDefaultWorkspace('/tmp/agenticos-home', () => false, '/Users/tester');
    expect(selection).toEqual({
      workspace: '/tmp/agenticos-home',
      source: 'env',
    });
  });

  it('fails closed when no confirmed workspace exists', () => {
    const selection = detectDefaultWorkspace(
      undefined,
      (path) => path === '/opt/homebrew/var/agenticos',
      '/Users/tester',
    );
    expect(selection).toBeNull();
  });

  it('reports candidate workspace paths without auto-selecting them', () => {
    const candidates = detectWorkspaceCandidates(
      (path) => path === '/opt/homebrew/var/agenticos',
      '/Users/tester',
    );
    expect(candidates).toEqual([
      '/opt/homebrew/var/agenticos',
      '/Users/tester/AgenticOS-workspace',
    ]);
  });

  it('renders explicit AGENTICOS_HOME bootstrap commands', () => {
    const command = renderBootstrapCommand('codex', '/tmp/workspace');
    expect(formatCommand(command)).toContain('AGENTICOS_HOME=/tmp/workspace');
    expect(command.command).toBe('codex');
  });

  it('merges cursor MCP config without dropping other servers', () => {
    const merged = mergeCursorMcpConfig(
      JSON.stringify({
        mcpServers: {
          other: {
            command: 'other-server',
          },
        },
      }),
      '/tmp/workspace',
    );

    const parsed = JSON.parse(merged) as {
      mcpServers: Record<string, { command: string; env?: Record<string, string> }>;
    };

    expect(parsed.mcpServers.other.command).toBe('other-server');
    expect(parsed.mcpServers.agenticos.env?.AGENTICOS_HOME).toBe('/tmp/workspace');
  });

  it('chooses a shell profile from the active shell', () => {
    expect(detectDefaultShellProfile('/bin/zsh', '/Users/tester')).toBe('/Users/tester/.zshrc');
    expect(detectDefaultShellProfile('/bin/bash', '/Users/tester')).toBe('/Users/tester/.bashrc');
    expect(detectDefaultShellProfile(undefined, '/Users/tester')).toBe('/Users/tester/.profile');
  });

  it('upserts AGENTICOS_HOME export idempotently', () => {
    const inserted = upsertAgenticOSEnvExport('# existing\n', '/tmp/workspace');
    expect(inserted).toContain('export AGENTICOS_HOME="/tmp/workspace"');

    const updated = upsertAgenticOSEnvExport(
      '# existing\nexport AGENTICOS_HOME="/old"\n',
      '/tmp/workspace',
    );
    expect(updated).not.toContain('/old');
    expect(updated.match(/export AGENTICOS_HOME=/g)?.length).toBe(1);
  });

  it('detects supported agents from commands and cursor state', () => {
    const detected = detectSupportedAgents(
      (command) => command === 'codex',
      (path) => path === '/Users/tester/.cursor',
      '/Users/tester',
    );

    expect(detected.find((agent) => agent.id === 'codex')?.installed).toBe(true);
    expect(detected.find((agent) => agent.id === 'cursor')?.installed).toBe(true);
    expect(detected.find((agent) => agent.id === 'claude-code')?.installed).toBe(false);
  });
});
