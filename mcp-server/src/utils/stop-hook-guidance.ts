export const OPTIONAL_STOP_HOOK_SNIPPET = [
  '{',
  '  "command": "agenticos-record-reminder",',
  '  "timeout": 5,',
  '  "type": "command"',
  '}',
] as const;

export const STOP_HOOK_MIGRATION_BULLETS = [
  'Optional local stop-hook reminders should call `agenticos-record-reminder`, not a source-checkout `tools/record-reminder.sh` path.',
  'If migrating from a legacy source-checkout hook, replace `bash /path/to/tools/record-reminder.sh` with the installed `agenticos-record-reminder` command.',
] as const;

export function renderStopHookSnippet(indent: string = ''): string {
  return OPTIONAL_STOP_HOOK_SNIPPET.map((line) => `${indent}${line}`).join('\n');
}

export function renderOptionalStopHookSection(): string {
  return [
    '## Optional Stop-Hook Reminder',
    '',
    'If your runtime supports local stop hooks or command reminders, the preferred installed command is:',
    '',
    '```json',
    renderStopHookSnippet(),
    '```',
    '',
    'This remains an optional local reminder layer rather than a canonical guardrail.',
    '',
  ].join('\n');
}
