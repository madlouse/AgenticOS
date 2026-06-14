import { shellQuote, validatePathSecurity } from './session-context.js';
import { restoreSessionBinding } from './session-binding-store.js';

export const CLAUDE_SETTINGS_PATH = '.claude/settings.json';
export const CLAUDE_PWD_ALIGNMENT_HOOK_MATCHER = 'mcp__agenticos__agenticos_switch';
export const CLAUDE_SWITCH_OUT_PWD_ALIGNMENT_HOOK_MATCHER = 'mcp__agenticos__agenticos_switch_out';
export const CLAUDE_PWD_ALIGNMENT_HOOK_MATCHERS = [
  CLAUDE_PWD_ALIGNMENT_HOOK_MATCHER,
  CLAUDE_SWITCH_OUT_PWD_ALIGNMENT_HOOK_MATCHER,
] as const;
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

function buildClaudePwdAlignmentHookEntry(matcher: string) {
  return {
    matcher,
    hooks: [
      {
        type: 'command',
        command: CLAUDE_PWD_ALIGNMENT_HOOK_COMMAND,
        shell: 'bash',
        timeout: 5,
      },
    ],
  };
}

const CLAUDE_PWD_ALIGNMENT_HOOK_ENTRIES = CLAUDE_PWD_ALIGNMENT_HOOK_MATCHERS.map(
  buildClaudePwdAlignmentHookEntry,
);

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

function findNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const direct = value[key];
  if (isRecord(direct)) return direct;
  return null;
}

export function extractProjectPathFromClaudeHookPayload(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const toolResponse = payload.tool_response;
  if (!isRecord(toolResponse)) return null;

  const structuredContent = findNestedRecord(payload, 'structuredContent')
    || findNestedRecord(toolResponse, 'structuredContent')
    || findNestedRecord(payload, 'structured_content')
    || findNestedRecord(toolResponse, 'structured_content');
  if (typeof structuredContent?.project_workdir === 'string' && structuredContent.project_workdir.trim()) {
    return structuredContent.project_workdir.trim();
  }

  if (typeof structuredContent?.explicit_workdir === 'string' && structuredContent.explicit_workdir.trim()) {
    return structuredContent.explicit_workdir.trim();
  }

  if (typeof toolResponse.project_workdir === 'string' && toolResponse.project_workdir.trim()) {
    return toolResponse.project_workdir.trim();
  }

  if (typeof toolResponse.explicit_workdir === 'string' && toolResponse.explicit_workdir.trim()) {
    return toolResponse.explicit_workdir.trim();
  }

  if (typeof toolResponse.path === 'string' && toolResponse.path.trim()) {
    return toolResponse.path.trim();
  }

  const contentText = extractTextContent(toolResponse.content).join('\n');
  const match = contentText.match(/^project_workdir:\s*(.+)$/m)
    || contentText.match(/^explicit_workdir:\s*(.+)$/m)
    || contentText.match(/^Path:\s*(.+)$/m);
  return match?.[1]?.trim() || null;
}

export function extractTargetWorkdirFromClaudeHookPayload(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const toolResponse = payload.tool_response;
  if (!isRecord(toolResponse)) return null;

  const structuredContent = findNestedRecord(payload, 'structuredContent')
    || findNestedRecord(toolResponse, 'structuredContent')
    || findNestedRecord(payload, 'structured_content')
    || findNestedRecord(toolResponse, 'structured_content');
  if (typeof structuredContent?.target_workdir === 'string' && structuredContent.target_workdir.trim()) {
    return structuredContent.target_workdir.trim();
  }

  if (typeof structuredContent?.explicit_workdir === 'string' && structuredContent.explicit_workdir.trim()) {
    return structuredContent.explicit_workdir.trim();
  }

  if (typeof toolResponse.target_workdir === 'string' && toolResponse.target_workdir.trim()) {
    return toolResponse.target_workdir.trim();
  }

  if (typeof toolResponse.explicit_workdir === 'string' && toolResponse.explicit_workdir.trim()) {
    return toolResponse.explicit_workdir.trim();
  }

  const contentText = extractTextContent(toolResponse.content).join('\n');
  const match = contentText.match(/^target_workdir:\s*(.+)$/m)
    || contentText.match(/^explicit_workdir:\s*(.+)$/m);
  return match?.[1]?.trim() || null;
}

function isSwitchOutHookPayload(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  const toolName = payload.tool_name;
  return typeof toolName === 'string' && toolName.includes('agenticos_switch_out');
}

function matcherMatchesExpected(matcher: string, expectedMatcher: string): boolean {
  return matcher.trim() === expectedMatcher;
}

export function renderClaudePwdHookResponse(
  targetPath: string,
  action: 'switch' | 'switch_out' = 'switch',
): ClaudePostToolUseHookResponse {
  const label = action === 'switch_out'
    ? 'AgenticOS switch-out target workdir'
    : 'AgenticOS switched project path';
  const commandAction = action === 'switch_out' ? 'restore workdir' : 'enter project workdir';
  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: [
        `${label}: ${targetPath}`,
        'Apply this path as the explicit workdir for subsequent filesystem operations.',
        'This hook provides cwd guidance only; it cannot mutate Claude Code parent/session PWD.',
        `For Bash, ${commandAction} per command by prefixing: cd ${shellQuote(targetPath)} && <command>`,
        'For file/edit tools, use absolute paths rooted at this workdir when tool-specific workdir is unavailable.',
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

  const action = isSwitchOutHookPayload(parsed) ? 'switch_out' : 'switch';
  const targetPath = action === 'switch_out'
    ? extractTargetWorkdirFromClaudeHookPayload(parsed)
    : extractProjectPathFromClaudeHookPayload(parsed);
  if (!targetPath) return null;
  if (!validatePathSecurity(targetPath).valid) return null;

  return `${JSON.stringify(renderClaudePwdHookResponse(targetPath, action))}\n`;
}

export function hasClaudePwdAlignmentHook(settings: unknown): boolean {
  return getMissingClaudePwdAlignmentHookMatchers(settings).length === 0;
}

export function getMissingClaudePwdAlignmentHookMatchers(settings: unknown): string[] {
  if (!isRecord(settings)) return [...CLAUDE_PWD_ALIGNMENT_HOOK_MATCHERS];
  const hooks = settings.hooks;
  if (!isRecord(hooks)) return [...CLAUDE_PWD_ALIGNMENT_HOOK_MATCHERS];
  const postToolUse = hooks.PostToolUse;
  if (!Array.isArray(postToolUse)) return [...CLAUDE_PWD_ALIGNMENT_HOOK_MATCHERS];

  return CLAUDE_PWD_ALIGNMENT_HOOK_MATCHERS.filter((expectedMatcher) => !postToolUse.some((entry) => {
    if (!isRecord(entry)) return false;
    const matcher = entry.matcher;
    if (typeof matcher !== 'string' || !matcherMatchesExpected(matcher, expectedMatcher)) {
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
  }));
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
    const missingMatchers = getMissingClaudePwdAlignmentHookMatchers(parsed);
    return missingMatchers.length === 0
      ? {
        status: 'configured',
        detail: 'Detected PostToolUse hooks for agenticos_switch and agenticos_switch_out cwd guidance.',
      }
      : {
        status: 'unset',
        detail: `Claude Code settings exist but missing cwd guidance hook(s): ${missingMatchers.join(', ')}.`,
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

  const missingMatchers = getMissingClaudePwdAlignmentHookMatchers(parsed);
  if (missingMatchers.length === 0) {
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
        ...CLAUDE_PWD_ALIGNMENT_HOOK_ENTRIES.filter((entry) => missingMatchers.includes(entry.matcher)),
      ],
    },
  };

  return {
    changed: true,
    content: `${JSON.stringify(next, null, 2)}\n`,
  };
}

export type ClaudePreToolCwdMode = 'off' | 'warn' | 'rewrite';

/**
 * Opt-in PreToolUse cwd-alignment for the Claude Code Bash tool (#603).
 *
 * Off unless AGENTICOS_CLAUDE_PRETOOL_CWD is set to `warn` or `rewrite`, so
 * existing installs are unaffected. `warn` adds advisory context; `rewrite`
 * transparently prefixes the command with a cd into the bound project using a
 * PreToolUse `updatedInput` (supported in Claude Code v2.0.10+).
 */
export function resolveClaudePreToolCwdMode(
  raw: string | undefined = process.env.AGENTICOS_CLAUDE_PRETOOL_CWD,
): ClaudePreToolCwdMode {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'warn') return 'warn';
  if (value === 'rewrite') return 'rewrite';
  return 'off';
}

export interface ClaudePreToolCwdHookOptions {
  mode?: ClaudePreToolCwdMode;
  /** Injected bound-project path; defaults to the persisted session binding. */
  boundProjectPath?: string | null;
  /** Injected cwd; defaults to process.cwd(). */
  cwd?: string;
}

/**
 * Resolve the bound project from the runtime session-binding sidecar. The hook
 * runs in the same environment as the MCP process (so resolveSessionKey()
 * reconstructs the same key), making the lookup deterministic from a foreign
 * process. Returns null when nothing is bound or persistence is unavailable.
 */
function resolveBoundProjectPath(options: ClaudePreToolCwdHookOptions): string | null {
  if (options.boundProjectPath !== undefined) return options.boundProjectPath;
  return restoreSessionBinding()?.projectPath ?? null;
}

export function runClaudePreToolCwdHook(
  input: string,
  options: ClaudePreToolCwdHookOptions = {},
): string | null {
  const mode = options.mode ?? resolveClaudePreToolCwdMode();
  if (mode === 'off') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(input || '{}');
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  // Built-in Bash tool only; never touch MCP tools or file/edit tools.
  if (parsed.tool_name !== 'Bash') return null;
  const toolInput = parsed.tool_input;
  if (!isRecord(toolInput) || typeof toolInput.command !== 'string') return null;
  const command = toolInput.command;

  const boundProjectPath = resolveBoundProjectPath(options);
  if (!boundProjectPath || !validatePathSecurity(boundProjectPath).valid) return null;

  const cwd = options.cwd ?? process.cwd();
  if (boundProjectPath === cwd) return null; // already aligned; nothing to do

  // Conservative: leave commands that already manage their own directory alone.
  if (/^\s*cd(\s|$)/.test(command)) return null;

  if (mode === 'warn') {
    return `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: [
          `AgenticOS: session is bound to ${boundProjectPath} but the shell cwd differs.`,
          `Prefix this command with: cd ${shellQuote(boundProjectPath)} && <command> (or use absolute paths).`,
        ].join('\n'),
      },
    })}\n`;
  }

  const updatedInput = { ...toolInput, command: `cd ${shellQuote(boundProjectPath)} && ${command}` };
  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: `AgenticOS aligned the shell cwd to the bound project ${boundProjectPath}.`,
      updatedInput,
    },
  })}\n`;
}
