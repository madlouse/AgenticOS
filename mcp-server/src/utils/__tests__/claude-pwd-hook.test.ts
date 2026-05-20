import { describe, expect, it } from 'vitest';
import {
  CLAUDE_PWD_ALIGNMENT_HOOK_COMMAND,
  extractProjectPathFromClaudeHookPayload,
  hasClaudePwdAlignmentHook,
  inspectClaudePwdAlignmentHook,
  mergeClaudePwdAlignmentHook,
  renderClaudePwdHookResponse,
  runClaudePwdHook,
} from '../claude-pwd-hook.js';

describe('claude-pwd-hook', () => {
  it('rejects non-object and malformed hook structures', () => {
    expect(hasClaudePwdAlignmentHook(null)).toBe(false);
    expect(hasClaudePwdAlignmentHook([])).toBe(false);
    expect(hasClaudePwdAlignmentHook({ hooks: [] })).toBe(false);
    expect(hasClaudePwdAlignmentHook({ hooks: { PostToolUse: {} } })).toBe(false);
    expect(hasClaudePwdAlignmentHook({ hooks: { PostToolUse: [null] } })).toBe(false);
    expect(hasClaudePwdAlignmentHook({ hooks: { PostToolUse: [{ matcher: 1 }] } })).toBe(false);
    expect(hasClaudePwdAlignmentHook({ hooks: { PostToolUse: [{ matcher: 'other', hooks: [] }] } })).toBe(false);
    expect(hasClaudePwdAlignmentHook({ hooks: { PostToolUse: [{ matcher: 'agenticos_switch', hooks: {} }] } })).toBe(false);
    expect(hasClaudePwdAlignmentHook({ hooks: { PostToolUse: [{ matcher: 'agenticos_switch', hooks: [null] }] } })).toBe(false);
    expect(hasClaudePwdAlignmentHook({ hooks: { PostToolUse: [{ matcher: 'agenticos_switch', hooks: [{ type: 'command', command: 1 }] }] } })).toBe(false);
  });

  it('inspects missing, configured, unset, and invalid settings content', () => {
    expect(inspectClaudePwdAlignmentHook(null).status).toBe('missing');
    expect(inspectClaudePwdAlignmentHook('{bad json').status).toBe('unavailable');
    expect(inspectClaudePwdAlignmentHook('{}').status).toBe('unset');
    expect(inspectClaudePwdAlignmentHook(JSON.stringify({
      hooks: {
        PostToolUse: [
          {
            matcher: 'mcp__agenticos__agenticos_switch',
            hooks: [{ type: 'command', command: CLAUDE_PWD_ALIGNMENT_HOOK_COMMAND }],
          },
        ],
      },
    })).status).toBe('configured');
  });

  it('merges into empty and existing settings', () => {
    const empty = mergeClaudePwdAlignmentHook(null);
    expect(empty.changed).toBe(true);
    expect(JSON.parse(empty.content).hooks.PostToolUse).toHaveLength(1);

    const existing = mergeClaudePwdAlignmentHook(JSON.stringify({
      env: { AGENTICOS_HOME: '/workspace' },
      hooks: {
        PostToolUse: [
          { matcher: 'other', hooks: [{ type: 'command', command: 'true' }] },
        ],
      },
    }));
    const parsed = JSON.parse(existing.content);
    expect(parsed.env.AGENTICOS_HOME).toBe('/workspace');
    expect(parsed.hooks.PostToolUse).toHaveLength(2);
  });

  it('preserves existing configured content and rejects invalid shapes', () => {
    const configured = JSON.stringify({
      hooks: {
        PostToolUse: [
          {
            matcher: 'mcp__agenticos__agenticos_switch',
            hooks: [{ type: 'command', command: CLAUDE_PWD_ALIGNMENT_HOOK_COMMAND }],
          },
        ],
      },
    });
    const result = mergeClaudePwdAlignmentHook(configured);
    expect(result.changed).toBe(false);
    expect(result.content).toBe(`${configured}\n`);

    const newlineResult = mergeClaudePwdAlignmentHook(`${configured}\n`);
    expect(newlineResult.changed).toBe(false);
    expect(newlineResult.content).toBe(`${configured}\n`);

    expect(() => mergeClaudePwdAlignmentHook('[]')).toThrow('Claude Code settings must be a JSON object.');
    expect(() => mergeClaudePwdAlignmentHook(JSON.stringify({ hooks: [] }))).toThrow('hooks must be a JSON object.');
    expect(() => mergeClaudePwdAlignmentHook(JSON.stringify({ hooks: { PostToolUse: {} } }))).toThrow('hooks.PostToolUse must be an array.');
  });

  it('treats legacy shell snippets as missing so bootstrap can repair them', () => {
    expect(hasClaudePwdAlignmentHook({
      hooks: {
        PostToolUse: [
          {
            matcher: 'mcp__agenticos__agenticos_switch',
            hooks: [{ type: 'command', command: 'cd "$(echo \'$ARGUMENTS\' | jq -r \'.tool_response.path // empty\')"' }],
          },
        ],
      },
    })).toBe(false);
  });

  it('extracts switched project paths from Claude hook stdin payloads', () => {
    expect(extractProjectPathFromClaudeHookPayload(null)).toBeNull();
    expect(extractProjectPathFromClaudeHookPayload({ tool_response: null })).toBeNull();
    expect(extractProjectPathFromClaudeHookPayload({ tool_response: { path: '  ' } })).toBeNull();

    expect(extractProjectPathFromClaudeHookPayload({
      tool_response: {
        path: ' /tmp/project ',
      },
    })).toBe('/tmp/project');

    expect(extractProjectPathFromClaudeHookPayload({
      tool_response: {
        content: [
          {
            type: 'text',
            text: '✅ Switched to project "AgenticOS"\n\nPath: /tmp/from-text\nStatus: active',
          },
        ],
      },
    })).toBe('/tmp/from-text');

    expect(extractProjectPathFromClaudeHookPayload({
      tool_response: {
        content: [
          null,
          { type: 'text' },
          { type: 'text', text: 'Status: active' },
        ],
      },
    })).toBeNull();
  });

  it('renders hook JSON that adds cwd guidance for Claude instead of cd in a child shell', () => {
    const response = renderClaudePwdHookResponse('/tmp/work space');

    expect(response.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    expect(response.hookSpecificOutput.additionalContext).toContain('/tmp/work space');
    expect(response.hookSpecificOutput.additionalContext).toContain("cd '/tmp/work space'");
    expect(response.hookSpecificOutput.additionalContext).toContain('cwd guidance only');
  });

  it('does not render hook output for unsafe project paths', () => {
    const output = runClaudePwdHook(JSON.stringify({
      tool_name: 'mcp__agenticos__agenticos_switch',
      tool_response: {
        path: '/tmp/project\nINJECT',
      },
    }));

    expect(output).toBeNull();
  });

  it('executes the hook payload parser against realistic stdin JSON', () => {
    const output = runClaudePwdHook(JSON.stringify({
      tool_name: 'mcp__agenticos__agenticos_switch',
      tool_response: {
        content: [
          {
            type: 'text',
            text: '✅ Switched to project "AgenticOS"\n\nPath: /tmp/agenticos\nStatus: active',
          },
        ],
      },
    }));

    expect(output).not.toBeNull();
    expect(JSON.parse(output || '{}').hookSpecificOutput.additionalContext).toContain('/tmp/agenticos');
    expect(runClaudePwdHook('{bad json')).toBeNull();
    expect(runClaudePwdHook('')).toBeNull();
    expect(runClaudePwdHook(JSON.stringify({ tool_response: { content: [] } }))).toBeNull();
  });
});
