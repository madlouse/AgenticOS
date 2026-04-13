import {
  renderConfigAuditResult,
  runConfigAudit,
  type ConfigAuditDeps,
} from './config-audit.js';

export interface ConfigCliDeps extends ConfigAuditDeps {
  stdout(line: string): void;
  stderr(line: string): void;
}

export function buildHelpLines(): string[] {
  return [
    'agenticos-config — audit AgenticOS workspace configuration',
    '',
    'Usage:',
    '  agenticos-config [--show|--validate] [--scope <all|runtime|mcp|homebrew>] [--help]',
    '',
    'Behavior:',
    '  --show      Print detected configuration sources and values (default).',
    '  --validate  Fail when detected sources disagree on AGENTICOS_HOME.',
    '  --scope     Limit the audit to runtime, MCP config, or Homebrew hints.',
  ];
}

export function parseCliArgs(argv: string[]): { help: boolean; action?: 'show' | 'validate'; scope?: string } {
  const parsed: { help: boolean; action?: 'show' | 'validate'; scope?: string } = { help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      case '--show':
        parsed.action = 'show';
        break;
      case '--validate':
        parsed.action = 'validate';
        break;
      case '--scope': {
        const value = argv[index + 1];
        if (!value) throw new Error('--scope requires a value.');
        parsed.scope = value;
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

export function runConfigCli(argv: string[], deps: ConfigCliDeps): number {
  try {
    const parsed = parseCliArgs(argv);
    if (parsed.help) {
      for (const line of buildHelpLines()) deps.stdout(line);
      return 0;
    }

    const result = runConfigAudit(
      {
        action: parsed.action,
        scope: parsed.scope,
      },
      deps,
    );

    for (const line of renderConfigAuditResult(result).split('\n')) {
      deps.stdout(line);
    }
    return result.status === 'PASS' ? 0 : 1;
  } catch (error) {
    deps.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
