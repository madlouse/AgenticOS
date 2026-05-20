#!/usr/bin/env node

import { runClaudePwdHook } from './utils/claude-pwd-hook.js';

let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  const output = runClaudePwdHook(input);
  if (output) {
    process.stdout.write(output);
  }
});

