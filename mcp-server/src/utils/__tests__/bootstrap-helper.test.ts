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
  renderRepairRemoveCommand,
  upsertAgenticOSEnvExport,
} from '../bootstrap-helper.js';

describe('bootstrap helper', () => {
  it('deduplicates and validates selected agents', () => {
    expect(parseAgentSelection(['codex,cursor', 'codex', 'hermes-agent'])).toEqual(['codex', 'cursor', 'hermes-agent']);
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
      '/Users/tester/dev/AgenticOS',
    );
    expect(candidates).toEqual([
      '/Users/tester/dev/AgenticOS',
      '/opt/homebrew/var/agenticos',
      '/Users/tester/AgenticOS-workspace',
    ]);
  });

  it('deduplicates blank and repeated workspace candidates', () => {
    const candidates = detectWorkspaceCandidates(
      (path) => path === '/opt/homebrew/var/agenticos',
      '/Users/tester',
      ' /opt/homebrew/var/agenticos ',
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

  it('renders Claude Code bootstrap with server name before options', () => {
    const command = renderBootstrapCommand('claude-code', '/tmp/workspace');
    expect(command.command).toBe('claude');
    expect(command.args).toEqual([
      'mcp',
      'add',
      'agenticos',
      '-s',
      'user',
      '-e',
      'AGENTICOS_HOME=/tmp/workspace',
      '--',
      'agenticos-mcp',
    ]);
    expect(formatCommand(command)).toBe('claude mcp add agenticos -s user -e AGENTICOS_HOME=/tmp/workspace -- agenticos-mcp');
  });

  it('renders Gemini bootstrap and repair commands', () => {
    expect(formatCommand(renderBootstrapCommand('gemini-cli', '/tmp/workspace'))).toBe(
      'gemini mcp add -s user -e AGENTICOS_HOME=/tmp/workspace agenticos agenticos-mcp',
    );
    expect(formatCommand(renderRepairRemoveCommand('gemini-cli')!)).toBe(
      'gemini mcp remove -s user agenticos',
    );
  });

  it('reports Cursor bootstrap as config-only', () => {
    expect(() => renderBootstrapCommand('cursor', '/tmp/workspace')).toThrow(
      'Cursor bootstrap uses JSON config mutation',
    );
    expect(renderRepairRemoveCommand('cursor')).toBeNull();
  });

  it('reports Hermes Agent bootstrap as no MCP registration CLI', () => {
    expect(() => renderBootstrapCommand('hermes-agent', '/tmp/workspace')).toThrow(
      'Hermes Agent bootstrap does not use an MCP registration CLI',
    );
    expect(renderRepairRemoveCommand('hermes-agent')).toBeNull();
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
    expect(upsertAgenticOSEnvExport(null, '/tmp/workspace')).toBe(
      'export AGENTICOS_HOME="/tmp/workspace"\n',
    );

    const inserted = upsertAgenticOSEnvExport('# existing\n', '/tmp/workspace');
    expect(inserted).toContain('export AGENTICOS_HOME="/tmp/workspace"');

    const insertedAfterNonBlank = upsertAgenticOSEnvExport('# existing', '/tmp/workspace');
    expect(insertedAfterNonBlank).toBe('# existing\n\nexport AGENTICOS_HOME="/tmp/workspace"\n');

    const updated = upsertAgenticOSEnvExport(
      '# existing\nexport AGENTICOS_HOME="/old"\n',
      '/tmp/workspace',
    );
    expect(updated).not.toContain('/old');
    expect(updated.match(/export AGENTICOS_HOME=/g)?.length).toBe(1);
  });

  it('detects supported agents from commands and cursor state', () => {
    const detected = detectSupportedAgents(
      (command) => command === 'codex' || command === 'hermes-gateway',
      (path) => path === '/Users/tester/.cursor' || path === '/Users/tester/.hermes',
      '/Users/tester',
    );

    expect(detected.find((agent) => agent.id === 'codex')?.installed).toBe(true);
    expect(detected.find((agent) => agent.id === 'cursor')?.installed).toBe(true);
    expect(detected.find((agent) => agent.id === 'hermes-agent')?.installed).toBe(true);
    expect(detected.find((agent) => agent.id === 'claude-code')?.installed).toBe(false);
  });

  it('quotes shell segments only when needed', () => {
    expect(formatCommand({
      command: 'agenticos-bootstrap',
      args: ['--workspace', '/tmp/Agentic OS', "--label=Bob's"],
    })).toBe('agenticos-bootstrap --workspace \'/tmp/Agentic OS\' \'--label=Bob\'"\'"\'s\'');
  });
});
