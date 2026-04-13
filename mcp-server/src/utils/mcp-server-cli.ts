import { pathToFileURL } from 'url';

export function buildHelpLines(version: string): string[] {
  return [
    `agenticos-mcp — AgenticOS MCP Server v${version}`,
    '',
    'Usage: agenticos-mcp [--version] [--help]',
    '',
    'Runs as a stdio MCP server.',
    '',
    'Prerequisites:',
    '  AGENTICOS_HOME  Workspace root (required)',
    '',
    'Recommended setup:',
    '  agenticos-bootstrap --workspace "$AGENTICOS_HOME" --first-run',
    '  agenticos-bootstrap --help',
    '',
    'Manual registration examples:',
    '  Claude Code: claude mcp add --transport stdio --scope user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp',
    '  Codex:       codex mcp add --env AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp',
    '  Cursor:      add `agenticos` to ~/.cursor/mcp.json with env.AGENTICOS_HOME',
    '  Gemini CLI:  gemini mcp add -s user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos agenticos-mcp',
  ];
}

export function resolveCliPrelude(argv: string[], version: string): { exitCode: number; lines: string[] } | null {
  if (argv.includes('--version') || argv.includes('-v')) {
    return {
      exitCode: 0,
      lines: [version],
    };
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    return {
      exitCode: 0,
      lines: buildHelpLines(version),
    };
  }
  return null;
}

export function isDirectExecution(argv: string[] = process.argv, moduleUrl: string = import.meta.url): boolean {
  const entry = argv[1];
  if (!entry) {
    return false;
  }

  return pathToFileURL(entry).href === moduleUrl;
}
