#!/usr/bin/env node

/* v8 ignore start -- process entrypoint; parser behavior is covered in utils tests. */
import { runClaudePreToolCwdHook } from './utils/claude-pwd-hook.js';

let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  const output = runClaudePreToolCwdHook(input);
  if (output) {
    process.stdout.write(output);
  }
});
/* v8 ignore stop */
