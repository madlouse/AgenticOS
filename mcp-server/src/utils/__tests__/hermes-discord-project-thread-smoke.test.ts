import { describe, expect, it } from 'vitest';
import {
  routeHermesDiscordProjectCommand,
  type AgenticOSProjectRouterAdapter,
  type DiscordThreadAdapter,
} from '../hermes-discord-router.js';
import {
  dispatchHermesProjectWorker,
  type WorkerDispatchDeps,
  type WorkerSessionRecord,
} from '../hermes-worker-dispatch.js';

describe('Hermes Discord project thread smoke flow', () => {
  it('routes a project command into a Discord thread, binds it, starts the selected worker, and posts progress to the thread', async () => {
    const calls: string[] = [];
    const records: WorkerSessionRecord[] = [];
    const threadMessages: Array<{ thread_id: string; content: string }> = [];
    const agenticos: AgenticOSProjectRouterAdapter = {
      available_tools: [
        'agenticos_project_ensure',
        'agenticos_external_thread_get',
        'agenticos_external_thread_bind',
      ],
      async projectEnsure(args) {
        calls.push(`agenticos_project_ensure:${args.project}`);
        return {
          status: 'ENSURED',
          project_id: 'agenticos',
          name: 'AgenticOS',
          project_kind: 'project',
          path: '/workspace/agenticos',
          explicit_workdir: '/workspace/agenticos',
        };
      },
      async externalThreadGet(args) {
        calls.push(`agenticos_external_thread_get:${args.project}:${args.channel_id}`);
        return { status: 'NOT_FOUND', binding: null };
      },
      async externalThreadBind(args) {
        calls.push(`agenticos_external_thread_bind:${args.project}:${args.thread_id}:${args.default_backend}`);
        return {
          status: 'BOUND',
          binding: {
            project_id: 'agenticos',
            project_name: 'AgenticOS',
            provider: 'discord',
            guild_id: args.guild_id,
            channel_id: args.channel_id,
            thread_id: args.thread_id,
            thread_url: args.thread_url,
            default_backend: args.default_backend,
          },
        };
      },
    };
    const discord: DiscordThreadAdapter = {
      available: true,
      async ensureProjectThread(args) {
        calls.push(`discord_thread:${args.thread_name}:${args.backend}`);
        return {
          guild_id: args.guild_id,
          channel_id: args.channel_id,
          thread_id: 'thread-agenticos',
          thread_url: 'https://discord.com/channels/guild/job-channel/thread-agenticos',
        };
      },
    };
    const workerDeps: WorkerDispatchDeps = {
      commandExists(command) {
        calls.push(`command_exists:${command}`);
        return command === 'claude';
      },
      async startWorker(args) {
        calls.push(`start_worker:${args.backend}:${args.command}:${args.explicit_workdir}`);
        expect(args.prompt).toContain('Use AgenticOS MCP as the source of truth');
        expect(args.prompt).toContain('Explicit workdir: /workspace/agenticos');
        return {
          session_id: 'worker-session-1',
          process_id: 20260522,
          log_path: '/tmp/agenticos-worker.log',
        };
      },
      async recordWorkerSession(record) {
        calls.push(`record_worker:${record.backend}:${record.session_id}:${record.process_id}`);
        records.push(record);
      },
      async postThreadMessage(args) {
        calls.push(`post_thread:${args.binding.thread_id}`);
        threadMessages.push({
          thread_id: args.binding.thread_id,
          content: args.content,
        });
        return { message_id: 'discord-message-1' };
      },
      now() {
        return '2026-05-22T09:00:00.000Z';
      },
    };

    const route = await routeHermesDiscordProjectCommand({
      message: '用 Claude Code 切换到 AgenticOS 项目，然后修复 issue',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos,
      discord,
    });
    const dispatch = await dispatchHermesProjectWorker({
      route,
      user_task: '修复 issue 并发 PR',
      deps: workerDeps,
    });

    expect(route.status).toBe('ROUTED');
    expect(route.backend).toBe('claude_code');
    expect(route.thread_url).toBe('https://discord.com/channels/guild/job-channel/thread-agenticos');
    expect(dispatch.status).toBe('STARTED');
    expect(dispatch.backend).toBe('claude_code');
    expect(records).toEqual([expect.objectContaining({
      project_id: 'agenticos',
      backend: 'claude_code',
      command: 'claude',
      thread_id: 'thread-agenticos',
      session_id: 'worker-session-1',
      process_id: 20260522,
    })]);
    expect(threadMessages).toEqual([{
      thread_id: 'thread-agenticos',
      content: expect.stringContaining('Worker started: claude_code'),
    }]);
    expect(calls).toEqual([
      'agenticos_project_ensure:AgenticOS',
      'agenticos_external_thread_get:agenticos:job-channel',
      'discord_thread:project/agenticos:claude_code',
      'agenticos_external_thread_bind:agenticos:thread-agenticos:claude_code',
      'command_exists:claude',
      'start_worker:claude_code:claude:/workspace/agenticos',
      'record_worker:claude_code:worker-session-1:20260522',
      'post_thread:thread-agenticos',
    ]);
  });

  it('keeps project ensure working when Discord is unavailable and does not claim thread or worker success', async () => {
    const calls: string[] = [];
    const agenticos: AgenticOSProjectRouterAdapter = {
      available_tools: ['agenticos_project_ensure'],
      async projectEnsure(args) {
        calls.push(`agenticos_project_ensure:${args.project}`);
        return {
          status: 'ENSURED',
          project_id: 'agenticos',
          name: 'AgenticOS',
          project_kind: 'project',
          path: '/workspace/agenticos',
          explicit_workdir: '/workspace/agenticos',
        };
      },
      async externalThreadGet() {
        calls.push('unexpected_get');
        return { status: 'NOT_FOUND', binding: null };
      },
      async externalThreadBind() {
        calls.push('unexpected_bind');
        return { status: 'BOUND' };
      },
    };

    const route = await routeHermesDiscordProjectCommand({
      message: '切换到 AgenticOS 项目',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos,
      discord: { available: false, async ensureProjectThread() { throw new Error('should not run'); } },
    });

    expect(route.status).toBe('AGENTICOS_ONLY');
    expect(route.project?.project_id).toBe('agenticos');
    expect(route.degraded_reason).toBe('Discord routing is not configured or not available.');
    expect(route.worker).toMatchObject({
      status: 'ready_for_dispatch',
      backend: 'codex',
      project_id: 'agenticos',
    });
    expect(calls).toEqual(['agenticos_project_ensure:AgenticOS']);
  });
});
