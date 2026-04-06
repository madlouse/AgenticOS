#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { homedir } from 'os';
import { runBootstrapCli } from './utils/bootstrap-cli.js';

const exitCode = runBootstrapCli(process.argv.slice(2), {
  env: process.env,
  homeDir: homedir(),
  platform: process.platform,
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
  mkdirp(path: string) {
    mkdirSync(path, { recursive: true });
  },
  readFile(path: string) {
    try {
      return readFileSync(path, 'utf-8');
    } catch {
      return null;
    }
  },
  writeFile(path: string, content: string) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf-8');
  },
  stdout(line: string) {
    console.log(line);
  },
  stderr(line: string) {
    console.error(line);
  },
});

process.exit(exitCode);
