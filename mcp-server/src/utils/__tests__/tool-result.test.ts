import { describe, expect, it } from 'vitest';
import {
  buildSwitchWorkdirStructuredContent,
  buildTextToolResult,
  extractToolResultLineValue,
} from '../tool-result.js';

describe('tool-result helpers', () => {
  it('extracts stable machine-readable switch workdirs from text output', () => {
    const text = [
      '✅ Switched to project "AgenticOS"',
      '',
      'project_workdir: /workspace/agenticos',
      'explicit_workdir: /workspace/agenticos',
      'Path: /workspace/agenticos',
    ].join('\n');

    expect(extractToolResultLineValue(text, 'project_workdir')).toBe('/workspace/agenticos');
    expect(buildSwitchWorkdirStructuredContent('agenticos_switch', text)).toEqual({
      command: 'agenticos_switch',
      project_workdir: '/workspace/agenticos',
      explicit_workdir: '/workspace/agenticos',
      workdir: '/workspace/agenticos',
      agent_must_apply_workdir: true,
    });
  });

  it('extracts stable machine-readable switch-out workdirs from text output', () => {
    const text = [
      '✅ Exited AgenticOS project context "AgenticOS"',
      'origin_cwd: /entry/start',
      'target_workdir: /entry/start',
      'explicit_workdir: /entry/start',
    ].join('\n');

    expect(buildSwitchWorkdirStructuredContent('agenticos_switch_out', text)).toEqual({
      command: 'agenticos_switch_out',
      target_workdir: '/entry/start',
      explicit_workdir: '/entry/start',
      workdir: '/entry/start',
      agent_must_apply_workdir: true,
    });
  });

  it('keeps plain text results backward-compatible when no structured fields exist', () => {
    expect(buildSwitchWorkdirStructuredContent('agenticos_switch', '❌ Project not found')).toBeNull();
    expect(buildTextToolResult('hello')).toEqual({
      content: [{ type: 'text', text: 'hello' }],
    });
    expect(buildTextToolResult('hello', { ok: true })).toEqual({
      content: [{ type: 'text', text: 'hello' }],
      structuredContent: { ok: true },
    });
  });
});
