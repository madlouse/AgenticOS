import { describe, expect, it } from 'vitest';
import {
  CLAUDE_PWD_ALIGNMENT_HOOK_COMMAND,
  CLAUDE_PWD_ALIGNMENT_HOOK_MATCHERS,
  extractTargetWorkdirFromClaudeHookPayload,
  extractProjectPathFromClaudeHookPayload,
  getMissingClaudePwdAlignmentHookMatchers,
  hasClaudePwdAlignmentHook,
  inspectClaudePwdAlignmentHook,
  mergeClaudePwdAlignmentHook,
  renderClaudePwdHookResponse,
  runClaudePwdHook,
  resolveClaudePreToolCwdMode,
  runClaudePreToolCwdHook,
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
    expect(getMissingClaudePwdAlignmentHookMatchers({ hooks: { PostToolUse: [{ matcher: 'mcp__agenticos__agenticos_switch', hooks: {} }] } })).toEqual([...CLAUDE_PWD_ALIGNMENT_HOOK_MATCHERS]);
    expect(getMissingClaudePwdAlignmentHookMatchers({ hooks: { PostToolUse: [{ matcher: 'mcp__agenticos__agenticos_switch', hooks: [null] }] } })).toEqual([...CLAUDE_PWD_ALIGNMENT_HOOK_MATCHERS]);
    expect(getMissingClaudePwdAlignmentHookMatchers({ hooks: [] })).toEqual([...CLAUDE_PWD_ALIGNMENT_HOOK_MATCHERS]);
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
          {
            matcher: 'mcp__agenticos__agenticos_switch_out',
            hooks: [{ type: 'command', command: CLAUDE_PWD_ALIGNMENT_HOOK_COMMAND }],
          },
        ],
      },
    })).status).toBe('configured');
  });

  it('merges into empty and existing settings', () => {
    const empty = mergeClaudePwdAlignmentHook(null);
    expect(empty.changed).toBe(true);
    expect(JSON.parse(empty.content).hooks.PostToolUse).toHaveLength(2);

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
    expect(parsed.hooks.PostToolUse).toHaveLength(3);
  });

  it('adds missing switch-out hook to old switch-only settings', () => {
    const switchOnly = JSON.stringify({
      hooks: {
        PostToolUse: [
          {
            matcher: 'mcp__agenticos__agenticos_switch',
            hooks: [{ type: 'command', command: CLAUDE_PWD_ALIGNMENT_HOOK_COMMAND }],
          },
        ],
      },
    });

    const result = mergeClaudePwdAlignmentHook(switchOnly);
    const parsed = JSON.parse(result.content);

    expect(result.changed).toBe(true);
    expect(parsed.hooks.PostToolUse).toHaveLength(2);
    expect(parsed.hooks.PostToolUse[1].matcher).toBe('mcp__agenticos__agenticos_switch_out');
  });

  it('preserves existing configured content and rejects invalid shapes', () => {
    const configured = JSON.stringify({
      hooks: {
        PostToolUse: [
          {
            matcher: 'mcp__agenticos__agenticos_switch',
            hooks: [{ type: 'command', command: CLAUDE_PWD_ALIGNMENT_HOOK_COMMAND }],
          },
          {
            matcher: 'mcp__agenticos__agenticos_switch_out',
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
        project_workdir: ' /tmp/project-workdir ',
        path: '/tmp/fallback',
      },
    })).toBe('/tmp/project-workdir');
    expect(extractProjectPathFromClaudeHookPayload({
      tool_response: {
        explicit_workdir: ' /tmp/explicit ',
        path: '/tmp/fallback',
      },
    })).toBe('/tmp/explicit');

    expect(extractProjectPathFromClaudeHookPayload({
      structuredContent: {
        project_workdir: ' /tmp/structured-project ',
        explicit_workdir: '/tmp/structured-explicit',
      },
      tool_response: {
        content: [
          {
            type: 'text',
            text: 'project_workdir: /tmp/from-text',
          },
        ],
      },
    })).toBe('/tmp/structured-project');

    expect(extractProjectPathFromClaudeHookPayload({
      tool_response: {
        structuredContent: {
          explicit_workdir: ' /tmp/structured-explicit ',
        },
        path: '/tmp/fallback',
      },
    })).toBe('/tmp/structured-explicit');

    expect(extractProjectPathFromClaudeHookPayload({
      tool_response: {
        content: [
          {
            type: 'text',
            text: '✅ Switched to project "AgenticOS"\n\nproject_workdir: /tmp/from-text\nexplicit_workdir: /tmp/explicit-text\nPath: /tmp/fallback\nStatus: active',
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

  it('extracts switch-out target workdirs from Claude hook stdin payloads', () => {
    expect(extractTargetWorkdirFromClaudeHookPayload(null)).toBeNull();
    expect(extractTargetWorkdirFromClaudeHookPayload({ tool_response: null })).toBeNull();
    expect(extractTargetWorkdirFromClaudeHookPayload({ tool_response: { target_workdir: '  ' } })).toBeNull();
    expect(extractTargetWorkdirFromClaudeHookPayload({ tool_response: { content: [{ type: 'text', text: 'origin_cwd: /tmp/origin' }] } })).toBeNull();
    expect(extractTargetWorkdirFromClaudeHookPayload({ tool_response: { target_workdir: ' /tmp/origin ' } })).toBe('/tmp/origin');
    expect(extractTargetWorkdirFromClaudeHookPayload({ tool_response: { explicit_workdir: ' /tmp/explicit-origin ' } })).toBe('/tmp/explicit-origin');
    expect(extractTargetWorkdirFromClaudeHookPayload({
      structuredContent: {
        target_workdir: ' /tmp/structured-origin ',
        explicit_workdir: '/tmp/structured-explicit-origin',
      },
      tool_response: {
        content: [{ type: 'text', text: 'target_workdir: /tmp/from-text' }],
      },
    })).toBe('/tmp/structured-origin');
    expect(extractTargetWorkdirFromClaudeHookPayload({
      tool_response: {
        structuredContent: {
          explicit_workdir: ' /tmp/structured-explicit-origin ',
        },
        content: [{ type: 'text', text: 'target_workdir: /tmp/from-text' }],
      },
    })).toBe('/tmp/structured-explicit-origin');
    expect(extractTargetWorkdirFromClaudeHookPayload({
      tool_response: {
        content: [
          {
            type: 'text',
            text: '✅ Exited AgenticOS project context "AgenticOS"\norigin_cwd: /tmp/origin\ntarget_workdir: /tmp/origin\nexplicit_workdir: /tmp/explicit-origin',
          },
        ],
      },
    })).toBe('/tmp/origin');
  });

  it('renders hook JSON that adds cwd guidance for Claude instead of cd in a child shell', () => {
    const response = renderClaudePwdHookResponse('/tmp/work space');

    expect(response.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    expect(response.hookSpecificOutput.additionalContext).toContain('/tmp/work space');
    expect(response.hookSpecificOutput.additionalContext).toContain("cd '/tmp/work space' && <command>");
    expect(response.hookSpecificOutput.additionalContext).toContain('cwd guidance only');
    expect(response.hookSpecificOutput.additionalContext).toContain('cannot mutate Claude Code parent/session PWD');
  });

  it('renders switch-out restore guidance', () => {
    const response = renderClaudePwdHookResponse('/tmp/origin', 'switch_out');

    expect(response.hookSpecificOutput.additionalContext).toContain('switch-out target workdir');
    expect(response.hookSpecificOutput.additionalContext).toContain("restore workdir per command by prefixing: cd '/tmp/origin' && <command>");
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
    expect(runClaudePwdHook('null')).toBeNull();
    expect(runClaudePwdHook(JSON.stringify({ tool_response: { content: [] } }))).toBeNull();
  });

  it('executes the hook payload parser for switch-out restore JSON', () => {
    const output = runClaudePwdHook(JSON.stringify({
      tool_name: 'mcp__agenticos__agenticos_switch_out',
      tool_response: {
        content: [
          {
            type: 'text',
            text: '✅ Exited AgenticOS project context "AgenticOS"\ntarget_workdir: /tmp/origin',
          },
        ],
      },
    }));

    expect(output).not.toBeNull();
    expect(JSON.parse(output || '{}').hookSpecificOutput.additionalContext).toContain('/tmp/origin');
    expect(JSON.parse(output || '{}').hookSpecificOutput.additionalContext).toContain('switch-out');
  });
});

describe('runClaudePreToolCwdHook (#603)', () => {
  const bashPayload = (command: string) => JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command },
  });

  it('resolveClaudePreToolCwdMode parses env values', () => {
    expect(resolveClaudePreToolCwdMode(undefined)).toBe('off');
    expect(resolveClaudePreToolCwdMode('')).toBe('off');
    expect(resolveClaudePreToolCwdMode('0')).toBe('off');
    expect(resolveClaudePreToolCwdMode('WARN')).toBe('warn');
    expect(resolveClaudePreToolCwdMode(' rewrite ')).toBe('rewrite');
  });

  it('is off by default and returns null even on a mismatch', () => {
    expect(runClaudePreToolCwdHook(bashPayload('ls'), {
      boundProjectPath: '/proj',
      cwd: '/elsewhere',
    })).toBeNull();
  });

  it('ignores non-Bash tools', () => {
    expect(runClaudePreToolCwdHook(
      JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'x' } }),
      { mode: 'rewrite', boundProjectPath: '/proj', cwd: '/elsewhere' },
    )).toBeNull();
  });

  it('no-ops when already aligned (bound == cwd)', () => {
    expect(runClaudePreToolCwdHook(bashPayload('ls'), {
      mode: 'rewrite',
      boundProjectPath: '/proj',
      cwd: '/proj',
    })).toBeNull();
  });

  it('no-ops when no project is bound', () => {
    expect(runClaudePreToolCwdHook(bashPayload('ls'), {
      mode: 'rewrite',
      boundProjectPath: null,
      cwd: '/elsewhere',
    })).toBeNull();
  });

  it('leaves commands that already cd alone', () => {
    expect(runClaudePreToolCwdHook(bashPayload('cd /x && ls'), {
      mode: 'rewrite',
      boundProjectPath: '/proj',
      cwd: '/elsewhere',
    })).toBeNull();
  });

  it('rejects non-absolute bound paths', () => {
    expect(runClaudePreToolCwdHook(bashPayload('ls'), {
      mode: 'rewrite',
      boundProjectPath: 'relative/path',
      cwd: '/elsewhere',
    })).toBeNull();
  });

  it('warn mode adds advisory context without rewriting', () => {
    const out = runClaudePreToolCwdHook(bashPayload('ls'), {
      mode: 'warn',
      boundProjectPath: '/proj dir',
      cwd: '/elsewhere',
    });
    const parsed = JSON.parse(out || '{}');
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(parsed.hookSpecificOutput.additionalContext).toContain("cd '/proj dir'");
    expect(parsed.hookSpecificOutput.permissionDecision).toBeUndefined();
    expect(parsed.hookSpecificOutput.updatedInput).toBeUndefined();
  });

  it('rewrite mode prefixes cd via updatedInput and allows', () => {
    const out = runClaudePreToolCwdHook(bashPayload('npm test'), {
      mode: 'rewrite',
      boundProjectPath: '/proj',
      cwd: '/elsewhere',
    });
    const parsed = JSON.parse(out || '{}');
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(parsed.hookSpecificOutput.updatedInput.command).toBe("cd '/proj' && npm test");
  });

  it('ignores malformed or incomplete payloads', () => {
    expect(runClaudePreToolCwdHook('{bad', {
      mode: 'warn', boundProjectPath: '/proj', cwd: '/x',
    })).toBeNull();
    expect(runClaudePreToolCwdHook(
      JSON.stringify({ tool_name: 'Bash', tool_input: {} }),
      { mode: 'warn', boundProjectPath: '/proj', cwd: '/x' },
    )).toBeNull();
  });
});
