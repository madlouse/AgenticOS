import { shellQuote, validatePathSecurity } from './session-context.js';

export const CLAUDE_SETTINGS_PATH = '.claude/settings.json';
export const CLAUDE_PWD_ALIGNMENT_HOOK_MATCHER = 'mcp__agenticos__agenticos_switch';
export const CLAUDE_PWD_ALIGNMENT_HOOK_COMMAND = 'agenticos-claude-pwd-hook';

export type ClaudePwdHookStatus = 'configured' | 'missing' | 'unset' | 'unavailable';

export interface ClaudePwdHookInspection {
  status: ClaudePwdHookStatus;
  detail: string;
}

export interface ClaudePwdHookMergeResult {
  changed: boolean;
  content: string;
}

export interface ClaudePostToolUseHookResponse {
  hookSpecificOutput: {
    hookEventName: 'PostToolUse';
    additionalContext: string;
  };
}

const CLAUDE_PWD_ALIGNMENT_HOOK_ENTRY = {
  matcher: CLAUDE_PWD_ALIGNMENT_HOOK_MATCHER,
  hooks: [
    {
      type: 'command',
      command: CLAUDE_PWD_ALIGNMENT_HOOK_COMMAND,
      shell: 'bash',
      timeout: 5,
    },
  ],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseSettings(content: string): unknown {
  return JSON.parse(content);
}

function extractTextContent(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!isRecord(entry)) return null;
      return typeof entry.text === 'string' ? entry.text : null;
    })
    .filter((entry): entry is string => entry !== null);
}

export function extractProjectPathFromClaudeHookPayload(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const toolResponse = payload.tool_response;
  if (!isRecord(toolResponse)) return null;

  if (typeof toolResponse.path === 'string' && toolResponse.path.trim()) {
    return toolResponse.path.trim();
  }

  const contentText = extractTextContent(toolResponse.content).join('\n');
  const match = contentText.match(/^Path:\s*(.+)$/m);
  return match?.[1]?.trim() || null;
}

export function renderClaudePwdHookResponse(projectPath: string): ClaudePostToolUseHookResponse {
  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: [
        `AgenticOS switched project path: ${projectPath}`,
        'Use this path as the explicit workdir for subsequent filesystem operations.',
        'This hook provides cwd guidance only; it cannot mutate a parent shell PWD.',
        `If the client shell PWD differs, run: cd ${shellQuote(projectPath)}`,
      ].join('\n'),
    },
  };
}

export function runClaudePwdHook(input: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input || '{}');
  } catch {
    return null;
  }

  const projectPath = extractProjectPathFromClaudeHookPayload(parsed);
  if (!projectPath) return null;
  if (!validatePathSecurity(projectPath).valid) return null;

  return `${JSON.stringify(renderClaudePwdHookResponse(projectPath))}\n`;
}

export function hasClaudePwdAlignmentHook(settings: unknown): boolean {
  if (!isRecord(settings)) return false;
  const hooks = settings.hooks;
  if (!isRecord(hooks)) return false;
  const postToolUse = hooks.PostToolUse;
  if (!Array.isArray(postToolUse)) return false;

  return postToolUse.some((entry) => {
    if (!isRecord(entry)) return false;
    const matcher = entry.matcher;
    if (typeof matcher !== 'string' || !matcher.includes('agenticos_switch')) {
      return false;
    }
    const nestedHooks = entry.hooks;
    if (!Array.isArray(nestedHooks)) return false;
    return nestedHooks.some((hook) => {
      if (!isRecord(hook)) return false;
      return hook.type === 'command'
        && typeof hook.command === 'string'
        && hook.command.trim() === CLAUDE_PWD_ALIGNMENT_HOOK_COMMAND;
    });
  });
}

export function inspectClaudePwdAlignmentHook(settingsContent: string | null): ClaudePwdHookInspection {
  if (settingsContent === null) {
    return {
      status: 'missing',
      detail: 'Claude Code settings file is missing.',
    };
  }

  try {
    const parsed = parseSettings(settingsContent);
    return hasClaudePwdAlignmentHook(parsed)
      ? {
        status: 'configured',
        detail: 'Detected PostToolUse hook for agenticos_switch cwd guidance.',
      }
      : {
        status: 'unset',
        detail: 'Claude Code settings exist but no agenticos_switch cwd guidance hook was detected.',
      };
  } catch {
    return {
      status: 'unavailable',
      detail: 'Claude Code settings could not be parsed as JSON.',
    };
  }
}

export function mergeClaudePwdAlignmentHook(settingsContent: string | null): ClaudePwdHookMergeResult {
  const parsed = settingsContent?.trim()
    ? parseSettings(settingsContent)
    : {};

  if (!isRecord(parsed)) {
    throw new Error('Claude Code settings must be a JSON object.');
  }

  if (hasClaudePwdAlignmentHook(parsed)) {
    const configuredContent = settingsContent as string;
    return {
      changed: false,
      content: configuredContent.endsWith('\n') ? configuredContent : `${configuredContent}\n`,
    };
  }

  const hooks = parsed.hooks === undefined
    ? {}
    : parsed.hooks;
  if (!isRecord(hooks)) {
    throw new Error('Claude Code settings hooks must be a JSON object.');
  }

  const postToolUse = hooks.PostToolUse === undefined
    ? []
    : hooks.PostToolUse;
  if (!Array.isArray(postToolUse)) {
    throw new Error('Claude Code settings hooks.PostToolUse must be an array.');
  }

  const next = {
    ...parsed,
    hooks: {
      ...hooks,
      PostToolUse: [
        ...postToolUse,
        CLAUDE_PWD_ALIGNMENT_HOOK_ENTRY,
      ],
    },
  };

  return {
    changed: true,
    content: `${JSON.stringify(next, null, 2)}\n`,
  };
}
