import { describe, expect, it } from 'vitest';
import { buildHelpLines, isDirectExecution, resolveCliPrelude } from '../mcp-server-cli.js';

describe('mcp server cli helpers', () => {
  it('builds help text without generic mcp.json guidance', () => {
    const lines = buildHelpLines('0.4.3');
    const output = lines.join('\n');

    expect(output).toContain('agenticos-mcp — AgenticOS MCP Server v0.4.3');
    expect(output).toContain('AGENTICOS_HOME  Workspace root (required)');
    expect(output).toContain('agenticos-bootstrap --help');
    expect(output).toContain('Claude Code: claude mcp add --transport stdio --scope user');
    expect(output).toContain('~/.cursor/mcp.json');
    expect(output).not.toContain('Configure in your AI tool\'s mcp.json');
  });

  it('returns version output when --version is requested', () => {
    expect(resolveCliPrelude(['node', 'agenticos-mcp', '--version'], '0.4.3')).toEqual({
      exitCode: 0,
      lines: ['0.4.3'],
    });
    expect(resolveCliPrelude(['node', 'agenticos-mcp', '-v'], '0.4.3')).toEqual({
      exitCode: 0,
      lines: ['0.4.3'],
    });
  });

  it('returns help output when --help is requested', () => {
    const prelude = resolveCliPrelude(['node', 'agenticos-mcp', '--help'], '0.4.3');

    expect(prelude?.exitCode).toBe(0);
    expect(prelude?.lines.join('\n')).toContain('Manual registration examples:');
  });

  it('returns null when startup should continue into the server', () => {
    expect(resolveCliPrelude(['node', 'agenticos-mcp'], '0.4.3')).toBeNull();
  });

  it('detects direct execution only for the module entry path', () => {
    expect(isDirectExecution(
      ['node', '/tmp/index.js'],
      'file:///tmp/index.js',
    )).toBe(true);
    expect(isDirectExecution(
      ['node', '/tmp/other.js'],
      'file:///tmp/index.js',
    )).toBe(false);
    expect(isDirectExecution([], 'file:///tmp/index.js')).toBe(false);
  });
});
