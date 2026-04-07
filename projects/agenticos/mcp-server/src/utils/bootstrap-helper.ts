import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export type SupportedAgentId = 'claude-code' | 'codex' | 'cursor' | 'gemini-cli';

export interface DetectedAgent {
  id: SupportedAgentId;
  label: string;
  installed: boolean;
  detection_hint: string;
}

export interface BootstrapCommandPlan {
  command: string;
  args: string[];
}

export function detectDefaultShellProfile(
  shellPath: string | undefined,
  userHome: string = homedir(),
): string {
  const shell = shellPath?.trim() || '';
  if (shell.endsWith('/zsh')) {
    return join(userHome, '.zshrc');
  }
  if (shell.endsWith('/bash')) {
    return join(userHome, '.bashrc');
  }
  return join(userHome, '.profile');
}

export function parseAgentSelection(rawValues: string[]): SupportedAgentId[] {
  const parsed = rawValues
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  const seen = new Set<SupportedAgentId>();
  for (const value of parsed) {
    if (!isSupportedAgentId(value)) {
      throw new Error(`Unsupported agent "${value}".`);
    }
    seen.add(value);
  }
  return [...seen];
}

export function isSupportedAgentId(value: string): value is SupportedAgentId {
  return value === 'claude-code'
    || value === 'codex'
    || value === 'cursor'
    || value === 'gemini-cli';
}

export function detectDefaultWorkspace(
  envHome: string | undefined,
  fileExists: (path: string) => boolean = existsSync,
  userHome: string = homedir(),
): { workspace: string; source: 'env' } | null {
  const trimmedEnv = envHome?.trim();
  if (trimmedEnv) {
    return {
      workspace: trimmedEnv,
      source: 'env',
    };
  }

  return null;
}

export function detectWorkspaceCandidates(
  fileExists: (path: string) => boolean = existsSync,
  userHome: string = homedir(),
  preferredLocalRoot?: string,
): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const pushCandidate = (value: string | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    candidates.push(trimmed);
  };

  pushCandidate(preferredLocalRoot);

  for (const candidate of ['/opt/homebrew/var/agenticos', '/usr/local/var/agenticos']) {
    if (fileExists(candidate)) {
      pushCandidate(candidate);
    }
  }
  pushCandidate(join(userHome, 'AgenticOS-workspace'));
  return candidates;
}

export function detectSupportedAgents(
  commandExists: (command: string) => boolean,
  fileExists: (path: string) => boolean = existsSync,
  userHome: string = homedir(),
): DetectedAgent[] {
  return [
    {
      id: 'claude-code',
      label: 'Claude Code',
      installed: commandExists('claude'),
      detection_hint: 'detected via `claude` on PATH',
    },
    {
      id: 'codex',
      label: 'Codex',
      installed: commandExists('codex'),
      detection_hint: 'detected via `codex` on PATH',
    },
    {
      id: 'cursor',
      label: 'Cursor',
      installed: commandExists('cursor-agent')
        || fileExists(join(userHome, '.cursor'))
        || fileExists('/Applications/Cursor.app'),
      detection_hint: 'detected via `cursor-agent`, ~/.cursor, or /Applications/Cursor.app',
    },
    {
      id: 'gemini-cli',
      label: 'Gemini CLI',
      installed: commandExists('gemini'),
      detection_hint: 'detected via `gemini` on PATH',
    },
  ];
}

export function renderBootstrapCommand(
  agentId: SupportedAgentId,
  workspace: string,
): BootstrapCommandPlan {
  switch (agentId) {
    case 'claude-code':
      return {
        command: 'claude',
        args: [
          'mcp',
          'add',
          '--transport',
          'stdio',
          '--scope',
          'user',
          '-e',
          `AGENTICOS_HOME=${workspace}`,
          'agenticos',
          '--',
          'agenticos-mcp',
        ],
      };
    case 'codex':
      return {
        command: 'codex',
        args: [
          'mcp',
          'add',
          '--env',
          `AGENTICOS_HOME=${workspace}`,
          'agenticos',
          '--',
          'agenticos-mcp',
        ],
      };
    case 'gemini-cli':
      return {
        command: 'gemini',
        args: [
          'mcp',
          'add',
          '-s',
          'user',
          '-e',
          `AGENTICOS_HOME=${workspace}`,
          'agenticos',
          'agenticos-mcp',
        ],
      };
    case 'cursor':
      throw new Error('Cursor bootstrap uses JSON config mutation, not a CLI command.');
  }
}

export function renderRepairRemoveCommand(agentId: SupportedAgentId): BootstrapCommandPlan | null {
  switch (agentId) {
    case 'claude-code':
      return {
        command: 'claude',
        args: ['mcp', 'remove', 'agenticos', '-s', 'user'],
      };
    case 'codex':
      return {
        command: 'codex',
        args: ['mcp', 'remove', 'agenticos'],
      };
    case 'gemini-cli':
      return {
        command: 'gemini',
        args: ['mcp', 'remove', '-s', 'user', 'agenticos'],
      };
    case 'cursor':
      return null;
  }
}

export function renderCursorConfigSnippet(workspace: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        agenticos: {
          command: 'agenticos-mcp',
          args: [],
          env: {
            AGENTICOS_HOME: workspace,
          },
        },
      },
    },
    null,
    2,
  );
}

export function mergeCursorMcpConfig(existingContent: string | null, workspace: string): string {
  const parsed = existingContent?.trim()
    ? JSON.parse(existingContent) as { mcpServers?: Record<string, unknown> }
    : {};

  const mcpServers = (parsed.mcpServers && typeof parsed.mcpServers === 'object')
    ? { ...parsed.mcpServers }
    : {};

  mcpServers.agenticos = {
    command: 'agenticos-mcp',
    args: [],
    env: {
      AGENTICOS_HOME: workspace,
    },
  };

  return JSON.stringify(
    {
      ...parsed,
      mcpServers,
    },
    null,
    2,
  ) + '\n';
}

export function formatCommand(plan: BootstrapCommandPlan): string {
  return [plan.command, ...plan.args]
    .map((segment) => quoteShellSegment(segment))
    .join(' ');
}

export function upsertAgenticOSEnvExport(profileContent: string | null, workspace: string): string {
  const exportLine = `export AGENTICOS_HOME="${workspace}"`;
  const normalized = (profileContent || '').replace(/\r\n/g, '\n');
  const lines = normalized.length > 0 ? normalized.split('\n') : [];
  const nextLines: string[] = [];
  let replaced = false;

  for (const line of lines) {
    if (line.startsWith('export AGENTICOS_HOME=')) {
      if (!replaced) {
        nextLines.push(exportLine);
        replaced = true;
      }
      continue;
    }
    nextLines.push(line);
  }

  if (!replaced) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== '') {
      nextLines.push('');
    }
    nextLines.push(exportLine);
  }

  return nextLines.join('\n').replace(/\n*$/, '\n');
}

function quoteShellSegment(segment: string): string {
  if (segment === '--') return segment;
  if (/^[A-Za-z0-9_./:=+-]+$/.test(segment)) return segment;
  return `'${segment.replace(/'/g, `'\"'\"'`)}'`;
}
