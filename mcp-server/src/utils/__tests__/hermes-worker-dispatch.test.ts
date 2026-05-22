import { describe, expect, it } from 'vitest';
import {
  buildWorkerPrompt,
  dispatchHermesProjectWorker,
  getWorkerCommand,
  resolveWorkerBackend,
  type WorkerDispatchDeps,
  type WorkerSessionRecord,
} from '../hermes-worker-dispatch.js';
import type { HermesProjectRouteResult, HermesThreadBinding } from '../hermes-discord-router.js';

function binding(overrides: Partial<HermesThreadBinding> = {}): HermesThreadBinding {
  return {
    project_id: 'agenticos',
    project_name: 'AgenticOS',
    provider: 'discord',
    guild_id: 'guild',
    channel_id: 'job-channel',
    thread_id: 'thread-agenticos',
    thread_url: 'https://discord.com/channels/guild/job-channel/thread-agenticos',
    default_backend: 'codex',
    ...overrides,
  };
}

function routedRoute(overrides: Partial<HermesProjectRouteResult> = {}): HermesProjectRouteResult {
  return {
    status: 'ROUTED',
    backend: 'codex',
    project: {
      status: 'ENSURED',
      project_id: 'agenticos',
      name: 'AgenticOS',
      project_kind: 'project',
      path: '/workspace/agenticos',
      explicit_workdir: '/workspace/agenticos',
    },
    binding: binding(),
    thread_url: 'https://discord.com/channels/guild/job-channel/thread-agenticos',
    call_order: ['agenticos_project_ensure', 'agenticos_external_thread_get'],
    worker: {
      status: 'ready_for_dispatch',
      backend: 'codex',
      project_id: 'agenticos',
      explicit_workdir: '/workspace/agenticos',
      thread_id: 'thread-agenticos',
    },
    ...overrides,
  };
}

function createDeps(options: {
  availableCommands?: string[];
  messageId?: string;
  handle?: { session_id: string; process_id: number; log_path?: string };
} = {}) {
  const calls: string[] = [];
  const records: WorkerSessionRecord[] = [];
  const messages: string[] = [];
  const availableCommands = new Set(options.availableCommands ?? ['codex', 'claude']);
  const deps: WorkerDispatchDeps = {
    commandExists(command) {
      calls.push(`command_exists:${command}`);
      return availableCommands.has(command);
    },
    async startWorker(args) {
      calls.push(`start:${args.backend}:${args.command}:${args.project_id}:${args.thread_id}:${args.explicit_workdir}`);
      messages.push(args.prompt);
      return options.handle ?? {
        session_id: 'worker-session-1',
        process_id: 4242,
        log_path: '/tmp/agenticos-worker.log',
      };
    },
    async recordWorkerSession(record) {
      calls.push(`record:${record.backend}:${record.session_id}:${record.process_id}`);
      records.push(record);
    },
    async postThreadMessage(args) {
      calls.push(`post:${args.binding.thread_id}`);
      messages.push(args.content);
      return { message_id: options.messageId ?? 'discord-message-1' };
    },
    now() {
      calls.push('now');
      return '2026-05-22T08:00:00.000Z';
    },
  };
  return { calls, records, messages, deps };
}

describe('Hermes worker backend dispatch', () => {
  it('resolves Codex by default and honors explicit backend aliases', () => {
    expect(resolveWorkerBackend(undefined)).toEqual({ ok: true, backend: 'codex' });
    expect(resolveWorkerBackend(null, 'claude_code')).toEqual({ ok: true, backend: 'claude_code' });
    expect(resolveWorkerBackend('', 'codex')).toEqual({ ok: true, backend: 'codex' });
    expect(resolveWorkerBackend('Codex')).toEqual({ ok: true, backend: 'codex' });
    expect(resolveWorkerBackend('Claude Code')).toEqual({ ok: true, backend: 'claude_code' });
    expect(resolveWorkerBackend('Claude-Agent')).toEqual({ ok: true, backend: 'claude_code' });
    expect(resolveWorkerBackend('claude')).toEqual({ ok: true, backend: 'claude_code' });
  });

  it('fails closed for invalid backend values', () => {
    expect(resolveWorkerBackend('gemini')).toMatchObject({
      ok: false,
      error: 'Unsupported worker backend: gemini.',
      recovery: ['Use backend "codex" or "claude_code".'],
    });
    expect(resolveWorkerBackend(42)).toMatchObject({
      ok: false,
      error: 'Unsupported worker backend: 42.',
    });
  });

  it('maps worker backends to local commands', () => {
    expect(getWorkerCommand('codex')).toBe('codex');
    expect(getWorkerCommand('claude_code')).toBe('claude');
  });

  it('builds a prompt that preserves AgenticOS identity and rejects cd as switching', () => {
    const prompt = buildWorkerPrompt({
      backend: 'codex',
      project_id: 'agenticos',
      project_name: 'AgenticOS',
      explicit_workdir: '/workspace/agenticos',
      thread_id: 'thread-agenticos',
      thread_url: 'https://discord.com/thread',
      user_task: '修复 issue 并发 PR',
    });

    expect(prompt).toContain('Backend: codex');
    expect(prompt).toContain('AgenticOS project: AgenticOS (agenticos)');
    expect(prompt).toContain('Explicit workdir: /workspace/agenticos');
    expect(prompt).toContain('Discord thread: thread-agenticos (https://discord.com/thread)');
    expect(prompt).toContain('Use AgenticOS MCP as the source of truth');
    expect(prompt).toContain('Do not treat shell cd, raw directory search, or git branch detection as project switching.');
    expect(prompt).toContain('修复 issue 并发 PR');
  });

  it('starts Codex by default, records worker metadata, and posts progress to the thread', async () => {
    const harness = createDeps();

    const result = await dispatchHermesProjectWorker({
      route: routedRoute(),
      user_task: '完成 issue',
      legacy_session_agent: 'claude-sonnet-4.6',
      deps: harness.deps,
    });

    expect(result.status).toBe('STARTED');
    expect(result.backend).toBe('codex');
    expect(result.command).toBe('codex');
    expect(result.session).toMatchObject({
      project_id: 'agenticos',
      project_name: 'AgenticOS',
      provider: 'discord',
      thread_id: 'thread-agenticos',
      thread_url: 'https://discord.com/channels/guild/job-channel/thread-agenticos',
      backend: 'codex',
      command: 'codex',
      session_id: 'worker-session-1',
      process_id: 4242,
      log_path: '/tmp/agenticos-worker.log',
      status: 'running',
      started_at: '2026-05-22T08:00:00.000Z',
    });
    expect(result.thread_message_id).toBe('discord-message-1');
    expect(harness.records).toHaveLength(1);
    expect(harness.calls).toEqual([
      'command_exists:codex',
      'start:codex:codex:agenticos:thread-agenticos:/workspace/agenticos',
      'now',
      'record:codex:worker-session-1:4242',
      'post:thread-agenticos',
    ]);
    expect(harness.messages[0]).toContain('Backend: codex');
    expect(harness.messages[1]).toContain('Worker started: codex');
  });

  it('uses explicit Claude Code when requested', async () => {
    const harness = createDeps();

    const result = await dispatchHermesProjectWorker({
      route: routedRoute({ backend: 'codex' }),
      user_task: '处理任务',
      requested_backend: 'Claude Code',
      deps: harness.deps,
    });

    expect(result.status).toBe('STARTED');
    expect(result.backend).toBe('claude_code');
    expect(result.command).toBe('claude');
    expect(harness.calls).toContain('command_exists:claude');
    expect(harness.calls).toContain('start:claude_code:claude:agenticos:thread-agenticos:/workspace/agenticos');
  });

  it('uses persisted route backend when no explicit override is supplied', async () => {
    const harness = createDeps();

    const result = await dispatchHermesProjectWorker({
      route: routedRoute({
        backend: undefined,
        binding: binding({ default_backend: 'claude_code', thread_url: undefined }),
      }),
      user_task: '处理任务',
      deps: harness.deps,
    });

    expect(result.status).toBe('STARTED');
    expect(result.backend).toBe('claude_code');
    expect(result.session).toMatchObject({
      backend: 'claude_code',
      command: 'claude',
    });
    expect(result.session?.thread_url).toBeUndefined();
  });

  it('falls back to Codex when route and binding have no backend metadata', async () => {
    const harness = createDeps();

    const result = await dispatchHermesProjectWorker({
      route: routedRoute({
        backend: undefined,
        binding: binding({ default_backend: undefined }),
      }),
      user_task: '处理任务',
      deps: harness.deps,
    });

    expect(result.status).toBe('STARTED');
    expect(result.backend).toBe('codex');
    expect(result.command).toBe('codex');
  });

  it('starts without optional log path or thread url', async () => {
    const harness = createDeps({
      handle: {
        session_id: 'worker-session-2',
        process_id: 5000,
      },
    });

    const result = await dispatchHermesProjectWorker({
      route: routedRoute({
        binding: binding({ thread_url: undefined }),
      }),
      user_task: '处理任务',
      deps: harness.deps,
    });

    expect(result.status).toBe('STARTED');
    expect(result.session?.log_path).toBeUndefined();
    expect(result.session?.thread_url).toBeUndefined();
    expect(harness.messages[1]).not.toContain('Logs:');
  });

  it('blocks invalid explicit backend and reports recovery to the thread', async () => {
    const harness = createDeps();

    const result = await dispatchHermesProjectWorker({
      route: routedRoute(),
      user_task: '处理任务',
      requested_backend: 'gemini',
      deps: harness.deps,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.error).toBe('Unsupported worker backend: gemini.');
    expect(result.thread_message_id).toBe('discord-message-1');
    expect(harness.calls).toEqual(['post:thread-agenticos']);
    expect(harness.messages[0]).toContain('Worker blocked: Unsupported worker backend: gemini.');
  });

  it('blocks when the selected backend command is missing without recording a worker session', async () => {
    const harness = createDeps({ availableCommands: ['codex'] });

    const result = await dispatchHermesProjectWorker({
      route: routedRoute(),
      user_task: '处理任务',
      requested_backend: 'claude_code',
      deps: harness.deps,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.backend).toBe('claude_code');
    expect(result.command).toBe('claude');
    expect(result.error).toBe('claude_code worker backend is selected, but command "claude" is not available.');
    expect(harness.records).toEqual([]);
    expect(harness.calls).toEqual([
      'command_exists:claude',
      'post:thread-agenticos',
    ]);
  });

  it('blocks before worker startup when route is not a Discord project thread', async () => {
    const harness = createDeps();

    const result = await dispatchHermesProjectWorker({
      route: routedRoute({ status: 'AGENTICOS_ONLY', binding: undefined }),
      user_task: '处理任务',
      deps: harness.deps,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.error).toBe('Worker dispatch requires a routed AgenticOS project and Discord thread binding.');
    expect(result.recovery).toEqual(['Run AgenticOS project ensure and Discord project thread routing before starting a worker.']);
    expect(harness.calls).toEqual([]);
  });

  it('blocks when project identity or explicit workdir is incomplete', async () => {
    const harness = createDeps();

    const result = await dispatchHermesProjectWorker({
      route: routedRoute({
        project: {
          status: 'ENSURED',
          project_id: 'agenticos',
          name: 'AgenticOS',
        },
      }),
      user_task: '处理任务',
      deps: harness.deps,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.error).toBe('Worker dispatch requires a routed AgenticOS project and Discord thread binding.');
    expect(harness.calls).toEqual([]);
  });
});
