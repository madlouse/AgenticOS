import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';
import { realpathSync } from 'fs';

/**
 * Detect whether the current process was invoked directly as the entry point.
 *
 * DETECTION LOGIC:
 * Node.js sets import.meta.url to the absolute resolved path of the running script.
 * However, when invoked through a symlink (e.g. Homebrew's bin/ directory), argv[1]
 * retains the symlink path while import.meta.url is resolved to the real file.
 *
 * To compare them symmetrically, we resolve symlinks on BOTH sides:
 *   - argv[1] → realpathSync() → resolved absolute path
 *   - import.meta.url → fileURLToPath() → absolute path, then realpathSync()
 *
 * This handles all Homebrew installation paths:
 *   /opt/homebrew/bin/agenticos-mcp  (symlink chain → Cellar build/index.js)
 *   /usr/local/bin/agenticos-mcp      (symlink chain → Cellar build/index.js)
 *
 * Previously only argv[1] was resolved, leaving import.meta.url as a potential
 * asymmetry in edge cases. Both sides are now resolved for full symmetry.
 */
export function isDirectExecution(argv: string[] = process.argv, moduleUrl: string = import.meta.url): boolean {
  const entry = argv[1];
  if (!entry) {
    return false;
  }
  // Resolve symlinks in argv[1] (Homebrew bin/ symlink chain)
  let resolvedEntry: string;
  try {
    resolvedEntry = realpathSync(entry);
  } catch {
    resolvedEntry = entry;
  }
  // Also resolve symlinks in moduleUrl for symmetry
  // (import.meta.url is already resolved, but realpathSync is harmless)
  let resolvedModuleUrl: string;
  try {
    resolvedModuleUrl = realpathSync(fileURLToPath(moduleUrl));
  } catch {
    resolvedModuleUrl = fileURLToPath(moduleUrl);
  }
  return pathToFileURL(resolvedEntry).href === pathToFileURL(resolvedModuleUrl).href;
}

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
    '  agenticos-config --validate',
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