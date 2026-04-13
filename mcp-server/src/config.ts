#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { runConfigCli } from './utils/config-cli.js';

const exitCode = runConfigCli(process.argv.slice(2), {
  env: process.env,
  homeDir: homedir(),
  platform: process.platform,
  shellPath: process.env.SHELL,
  nowIso() {
    return new Date().toISOString();
  },
  commandExists(command: string) {
    const result = spawnSync('which', [command], { stdio: 'ignore' });
    return result.status === 0;
  },
  runCommand(command: string, args: string[], failOnError: boolean) {
    const result = spawnSync(command, args, { encoding: 'utf-8' });
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    const detail = output || result.error?.message || `${command} exited with status ${result.status ?? 'unknown'}`;
    if (result.status !== 0 && failOnError) {
      return { ok: false, detail };
    }
    return { ok: result.status === 0, detail };
  },
  readFile(path: string) {
    try {
      return readFileSync(path, 'utf-8');
    } catch {
      return null;
    }
  },
  pathExists(path: string) {
    return existsSync(path);
  },
  stdout(line: string) {
    console.log(line);
  },
  stderr(line: string) {
    console.error(line);
  },
});

process.exit(exitCode);
