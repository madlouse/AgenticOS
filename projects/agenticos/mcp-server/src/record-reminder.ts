#!/usr/bin/env node

import { existsSync, statSync } from 'fs';
import { basename, dirname, join } from 'path';
import { runRecordReminderCli } from './utils/record-reminder-cli.js';

const exitCode = runRecordReminderCli(process.argv.slice(2), {
  cwd() {
    return process.cwd();
  },
  nowSeconds() {
    return Math.floor(Date.now() / 1000);
  },
  fileExists(path: string) {
    return existsSync(path);
  },
  fileMtimeSeconds(path: string) {
    return Math.floor(statSync(path).mtimeMs / 1000);
  },
  dirname,
  basename,
  join,
  stdout(line: string) {
    console.log(line);
  },
  stderr(line: string) {
    console.error(line);
  },
});

process.exit(exitCode);
