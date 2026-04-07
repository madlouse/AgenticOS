#!/usr/bin/env node

import { spawn } from 'child_process';
import { runEditGuardCli, type EditGuardCliOptions } from './utils/edit-guard-cli.js';

function callEditGuardViaMcp(options: EditGuardCliOptions, env: Record<string, string | undefined>): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = env.AGENTICOS_MCP_COMMAND || 'agenticos-mcp';
    const extraArgs = env.AGENTICOS_MCP_ARGS_JSON ? JSON.parse(env.AGENTICOS_MCP_ARGS_JSON) : [];
    const server = spawn(command, extraArgs, {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let buffer = '';
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      server.kill();
      fn();
    };

    server.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) continue;

        const msg = JSON.parse(line) as {
          id?: number;
          result?: { content?: Array<{ text?: string }> };
          error?: { message?: string };
        };
        if (msg.id === 1) {
          server.stdin.write(JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
              name: 'agenticos_edit_guard',
              arguments: {
                issue_id: options.issueId,
                task_type: options.taskType,
                repo_path: options.repoPath,
                project_path: options.projectPath || undefined,
                declared_target_files: options.declaredTargetFiles,
              },
            },
          }) + '\n');
          continue;
        }
        if (msg.id === 2) {
          finish(() => resolve(msg.result?.content?.[0]?.text ?? JSON.stringify(msg)));
        }
      }
    });

    server.stderr.on('data', (chunk) => process.stderr.write(chunk));
    server.on('error', (error) => finish(() => reject(error)));
    server.on('exit', (code) => {
      if (!settled) {
        finish(() => reject(new Error(`agenticos-mcp exited with status ${code ?? 'unknown'}`)));
      }
    });

    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'agenticos-edit-guard', version: '1.0.0' },
      },
    }) + '\n');

    setTimeout(() => {
      finish(() => reject(new Error('timed out waiting for agenticos-mcp responses')));
    }, 8000);
  });
}

const exitCode = await runEditGuardCli(process.argv.slice(2), {
  env: process.env,
  stdout(line: string) {
    console.log(line);
  },
  stderr(line: string) {
    console.error(line);
  },
  callEditGuard(options) {
    return callEditGuardViaMcp(options, process.env);
  },
});

process.exit(exitCode);
