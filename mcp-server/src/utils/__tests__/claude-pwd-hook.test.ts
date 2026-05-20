import { describe, expect, it } from 'vitest';
import {
  hasClaudePwdAlignmentHook,
  inspectClaudePwdAlignmentHook,
  mergeClaudePwdAlignmentHook,
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
            hooks: [{ type: 'command', command: 'cd "$(jq -r .tool_response.path)"' }],
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
            hooks: [{ type: 'command', command: 'cd "$(jq -r .tool_response.path)"' }],
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
});
