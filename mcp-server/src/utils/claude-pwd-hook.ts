export const CLAUDE_SETTINGS_PATH = '.claude/settings.json';
export const CLAUDE_PWD_ALIGNMENT_HOOK_MATCHER = 'mcp__agenticos__agenticos_switch';
export const CLAUDE_PWD_ALIGNMENT_HOOK_COMMAND = 'cd "$(echo \'$ARGUMENTS\' | jq -r \'.tool_response.path // empty\' 2>/dev/null)" 2>/dev/null || true';

export type ClaudePwdHookStatus = 'configured' | 'missing' | 'unset' | 'unavailable';

export interface ClaudePwdHookInspection {
  status: ClaudePwdHookStatus;
  detail: string;
}

export interface ClaudePwdHookMergeResult {
  changed: boolean;
  content: string;
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
        && hook.command.includes('tool_response.path');
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
        detail: 'Detected PostToolUse hook for agenticos_switch PWD alignment.',
      }
      : {
        status: 'unset',
        detail: 'Claude Code settings exist but no agenticos_switch PWD alignment hook was detected.',
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
    return {
      changed: false,
      content: settingsContent?.endsWith('\n') ? settingsContent : `${settingsContent || '{}'}\n`,
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
