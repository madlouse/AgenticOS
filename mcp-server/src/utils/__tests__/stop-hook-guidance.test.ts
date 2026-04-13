import { describe, expect, it } from 'vitest';
import {
  OPTIONAL_STOP_HOOK_SNIPPET,
  renderOptionalStopHookSection,
  renderStopHookSnippet,
  STOP_HOOK_MIGRATION_BULLETS,
} from '../stop-hook-guidance.js';

describe('stop hook guidance', () => {
  it('defines the installed stop-hook snippet', () => {
    expect(OPTIONAL_STOP_HOOK_SNIPPET.join('\n')).toContain('"command": "agenticos-record-reminder"');
    expect(OPTIONAL_STOP_HOOK_SNIPPET.join('\n')).toContain('"timeout": 5');
    expect(OPTIONAL_STOP_HOOK_SNIPPET.join('\n')).not.toContain('record-reminder.sh');
  });

  it('defines migration bullets that replace the legacy script path', () => {
    const combined = STOP_HOOK_MIGRATION_BULLETS.join('\n');

    expect(combined).toContain('agenticos-record-reminder');
    expect(combined).toContain('tools/record-reminder.sh');
  });

  it('renders the snippet without indentation by default', () => {
    expect(renderStopHookSnippet()).toBe([
      '{',
      '  "command": "agenticos-record-reminder",',
      '  "timeout": 5,',
      '  "type": "command"',
      '}',
    ].join('\n'));
  });

  it('renders the snippet with caller-provided indentation', () => {
    expect(renderStopHookSnippet('    ')).toBe([
      '    {',
      '      "command": "agenticos-record-reminder",',
      '      "timeout": 5,',
      '      "type": "command"',
      '    }',
    ].join('\n'));
  });

  it('renders the optional stop-hook section with the installed command snippet', () => {
    const section = renderOptionalStopHookSection();

    expect(section).toContain('## Optional Stop-Hook Reminder');
    expect(section).toContain('preferred installed command');
    expect(section).toContain('"command": "agenticos-record-reminder"');
    expect(section).toContain('optional local reminder layer');
  });
});
