import { describe, expect, it } from 'vitest';
import {
  buildDiscordProjectThreadName,
  parseHermesProjectCommand,
  routeHermesDiscordProjectCommand,
  type AgenticOSProjectRouterAdapter,
  type DiscordThreadAdapter,
} from '../hermes-discord-router.js';

function createHarness(options: {
  tools?: string[];
  ensureStatus?: string;
  ensureAsString?: boolean;
  ensureErrorWithoutMessage?: boolean;
  omitProjectKind?: boolean;
  omitExplicitWorkdir?: boolean;
  omitPath?: boolean;
  existingBinding?: boolean;
  getStatus?: string;
  discordAvailable?: boolean;
  discordThrows?: boolean;
  discordThrowsString?: boolean;
  omitThreadGuild?: boolean;
  omitThreadUrl?: boolean;
  bindStatus?: string;
  bindErrorWithoutMessage?: boolean;
  bindWithoutBinding?: boolean;
  bindAsString?: boolean;
} = {}) {
  const calls: string[] = [];
  const tools = options.tools ?? [
    'agenticos_project_ensure',
    'agenticos_external_thread_get',
    'agenticos_external_thread_bind',
  ];
  const binding = {
    project_id: 'agenticos',
    project_name: 'AgenticOS',
    provider: 'discord' as const,
    guild_id: 'guild',
    channel_id: 'job-channel',
    thread_id: 'thread-agenticos',
    thread_url: 'https://discord.com/channels/guild/job-channel/thread-agenticos',
    default_backend: 'codex' as const,
  };
  const agenticos: AgenticOSProjectRouterAdapter = {
    available_tools: tools,
    async projectEnsure(args) {
      calls.push(`agenticos_project_ensure:${args.project}`);
      if (options.ensureStatus === 'ERROR') {
        const errorPayload = {
          status: 'ERROR',
          code: 'INVALID_INPUT',
          ...(options.ensureErrorWithoutMessage ? {} : { error: 'project name is invalid' }),
          recovery: ['Use a valid project name.'],
        };
        return options.ensureAsString ? JSON.stringify(errorPayload) : errorPayload;
      }
      const payload = {
        status: options.ensureStatus ?? 'ENSURED',
        created: options.ensureStatus === 'CREATED',
        project_id: String(args.project).toLowerCase(),
        name: String(args.project),
        ...(options.omitProjectKind ? {} : { project_kind: 'project' }),
        ...(options.omitPath ? {} : { path: `/workspace/${String(args.project).toLowerCase()}` }),
        ...(options.omitExplicitWorkdir ? {} : { explicit_workdir: `/workspace/${String(args.project).toLowerCase()}` }),
      };
      return options.ensureAsString ? JSON.stringify(payload) : payload;
    },
    async externalThreadGet(args) {
      calls.push(`agenticos_external_thread_get:${args.project}:${args.channel_id}`);
      if (options.getStatus === 'ERROR') {
        return { status: 'ERROR', recovery: ['Repair thread sidecar.'] };
      }
      return options.existingBinding
        ? { status: 'FOUND', binding }
        : { status: 'NOT_FOUND', binding: null };
    },
    async externalThreadBind(args) {
      calls.push(`agenticos_external_thread_bind:${args.project}:${args.thread_id}:${args.default_backend}`);
      if (options.bindStatus === 'ERROR') {
        return {
          status: 'ERROR',
          code: 'INVALID_INPUT',
          ...(options.bindErrorWithoutMessage ? {} : { error: 'thread id rejected' }),
          recovery: ['Pass an opaque Discord thread id.'],
        };
      }
      const payload = {
        status: 'BOUND',
        created: true,
        ...(options.bindWithoutBinding ? {} : { binding: {
          project_id: String(args.project),
          project_name: String(args.project),
          provider: 'discord',
          guild_id: args.guild_id,
          channel_id: args.channel_id,
          thread_id: args.thread_id,
          thread_url: args.thread_url,
          default_backend: args.default_backend,
        } }),
      };
      return options.bindAsString ? JSON.stringify(payload) : payload;
    },
  };
  const discord: DiscordThreadAdapter = {
    available: options.discordAvailable ?? true,
    async ensureProjectThread(args) {
      calls.push(`discord.ensure_project_thread:${args.thread_name}:${args.backend}`);
      if (options.discordThrows) {
        throw new Error('missing Create Public Threads permission');
      }
      if (options.discordThrowsString) {
        throw 'gateway unavailable';
      }
      return {
        ...(options.omitThreadGuild ? {} : { guild_id: args.guild_id }),
        channel_id: args.channel_id,
        thread_id: `thread-${args.project_id}`,
        ...(options.omitThreadUrl ? {} : { thread_url: `https://discord.com/channels/${args.guild_id ?? 'guild'}/${args.channel_id}/thread-${args.project_id}` }),
        created: true,
      };
    },
  };

  return { calls, agenticos, discord };
}

describe('Hermes Discord project router', () => {
  it('parses project commands and defaults to Codex', () => {
    expect(parseHermesProjectCommand('切换到 AgenticOS 项目')).toMatchObject({
      project: 'AgenticOS',
      verb: 'enter_or_create',
      backend: 'codex',
      explicit_backend: false,
    });
    expect(parseHermesProjectCommand('用 Claude Code 切换到 T5T 项目，然后发 PR')).toMatchObject({
      project: 'T5T',
      backend: 'claude_code',
      explicit_backend: true,
    });
    expect(parseHermesProjectCommand('用 Codex 进入 AgenticOS 项目')).toMatchObject({
      project: 'AgenticOS',
      backend: 'codex',
      explicit_backend: true,
    });
    expect(parseHermesProjectCommand('switch to AgenticOS project and run tests')).toMatchObject({
      project: 'AgenticOS',
      backend: 'codex',
    });
    expect(parseHermesProjectCommand('今天帮我记一下这个想法')).toBeNull();
    expect(parseHermesProjectCommand('   ')).toBeNull();
    expect(parseHermesProjectCommand('切换到 项目')).toBeNull();
  });

  it('ignores non-project commands at route time', async () => {
    const harness = createHarness();

    const result = await routeHermesDiscordProjectCommand({
      message: '今天帮我记一下这个想法',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('NOT_PROJECT_COMMAND');
    expect(result.worker.status).toBe('not_applicable');
    expect(harness.calls).toEqual([]);
  });

  it('ensures AgenticOS project before creating and binding a Discord project thread', async () => {
    const harness = createHarness();

    const result = await routeHermesDiscordProjectCommand({
      message: '切换到 AgenticOS 项目',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('ROUTED');
    expect(result.backend).toBe('codex');
    expect(result.thread_url).toBe('https://discord.com/channels/guild/job-channel/thread-agenticos');
    expect(result.worker).toMatchObject({
      status: 'ready_for_dispatch',
      backend: 'codex',
      project_id: 'agenticos',
      explicit_workdir: '/workspace/agenticos',
      thread_id: 'thread-agenticos',
    });
    expect(result.call_order).toEqual([
      'agenticos_project_ensure',
      'agenticos_external_thread_get',
      'discord.ensure_project_thread',
      'agenticos_external_thread_bind',
    ]);
    expect(harness.calls).toEqual([
      'agenticos_project_ensure:AgenticOS',
      'agenticos_external_thread_get:agenticos:job-channel',
      'discord.ensure_project_thread:project/agenticos:codex',
      'agenticos_external_thread_bind:agenticos:thread-agenticos:codex',
    ]);
  });

  it('uses the same ensure path for new projects before Discord thread routing', async () => {
    const harness = createHarness({ ensureStatus: 'CREATED' });

    const result = await routeHermesDiscordProjectCommand({
      message: '新建 T5T 项目',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('ROUTED');
    expect(result.project).toMatchObject({
      status: 'CREATED',
      project_id: 't5t',
      name: 'T5T',
    });
    expect(harness.calls[0]).toBe('agenticos_project_ensure:T5T');
  });

  it('short-circuits Discord work when AgenticOS ensure fails', async () => {
    const harness = createHarness({ ensureStatus: 'ERROR' });

    const result = await routeHermesDiscordProjectCommand({
      message: '切换到 AgenticOS 项目',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('AGENTICOS_ERROR');
    expect(result.worker.status).toBe('blocked');
    expect(result.error).toBe('project name is invalid');
    expect(harness.calls).toEqual(['agenticos_project_ensure:AgenticOS']);
  });

  it('uses a generic ensure failure when AgenticOS omits an error message', async () => {
    const harness = createHarness({
      ensureStatus: 'ERROR',
      ensureErrorWithoutMessage: true,
      ensureAsString: true,
    });

    const result = await routeHermesDiscordProjectCommand({
      message: '切换到 AgenticOS 项目',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('AGENTICOS_ERROR');
    expect(result.error).toBe('AgenticOS project ensure failed.');
  });

  it('degrades to AgenticOS-only routing when Discord is unavailable', async () => {
    const harness = createHarness({ discordAvailable: false });

    const result = await routeHermesDiscordProjectCommand({
      message: '切换到 AgenticOS 项目',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('AGENTICOS_ONLY');
    expect(result.degraded_reason).toBe('Discord routing is not configured or not available.');
    expect(result.worker).toMatchObject({
      status: 'ready_for_dispatch',
      backend: 'codex',
      project_id: 'agenticos',
    });
    expect(harness.calls).toEqual(['agenticos_project_ensure:AgenticOS']);
  });

  it('degrades to AgenticOS-only routing when Discord channel id is missing', async () => {
    const harness = createHarness();

    const result = await routeHermesDiscordProjectCommand({
      message: '切换到 AgenticOS 项目',
      origin: { provider: 'discord', guild_id: 'guild' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('AGENTICOS_ONLY');
    expect(result.degraded_reason).toBe('Discord channel id is missing.');
    expect(harness.calls).toEqual(['agenticos_project_ensure:AgenticOS']);
  });

  it('degrades to AgenticOS-only routing when Discord thread binding tools are missing', async () => {
    const harness = createHarness({ tools: ['agenticos_project_ensure'] });

    const result = await routeHermesDiscordProjectCommand({
      message: '切换到 AgenticOS 项目',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('AGENTICOS_ONLY');
    expect(result.degraded_reason).toContain('agenticos_external_thread_get');
    expect(result.degraded_reason).toContain('agenticos_external_thread_bind');
    expect(result.recovery?.join('\n')).toContain('Do not fall back to cd');
    expect(harness.calls).toEqual(['agenticos_project_ensure:AgenticOS']);
  });

  it('reuses existing thread bindings without creating a new Discord thread', async () => {
    const harness = createHarness({ existingBinding: true });

    const result = await routeHermesDiscordProjectCommand({
      message: '切换到 AgenticOS 项目',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('ROUTED');
    expect(result.binding?.thread_id).toBe('thread-agenticos');
    expect(result.call_order).toEqual([
      'agenticos_project_ensure',
      'agenticos_external_thread_get',
    ]);
    expect(harness.calls).toEqual([
      'agenticos_project_ensure:AgenticOS',
      'agenticos_external_thread_get:agenticos:job-channel',
    ]);
  });

  it('reports lookup failures before creating a Discord thread', async () => {
    const harness = createHarness({ getStatus: 'ERROR' });

    const result = await routeHermesDiscordProjectCommand({
      message: '切换到 AgenticOS 项目',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('THREAD_BINDING_ERROR');
    expect(result.error).toBe('AgenticOS thread lookup failed.');
    expect(result.recovery).toEqual(['Repair thread sidecar.']);
    expect(harness.calls).toEqual([
      'agenticos_project_ensure:AgenticOS',
      'agenticos_external_thread_get:agenticos:job-channel',
    ]);
  });

  it('routes with string MCP payloads and optional Discord metadata omitted', async () => {
    const harness = createHarness({
      ensureAsString: true,
      omitProjectKind: true,
      omitExplicitWorkdir: true,
      omitThreadGuild: true,
      omitThreadUrl: true,
      bindAsString: true,
    });

    const result = await routeHermesDiscordProjectCommand({
      message: '切换到 AgenticOS 项目',
      origin: { provider: 'discord', channel_id: 'job-channel' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('ROUTED');
    expect(result.project).toMatchObject({
      project_kind: 'project',
      explicit_workdir: '/workspace/agenticos',
    });
    expect(result.thread_url).toBeUndefined();
    expect(harness.calls).toEqual([
      'agenticos_project_ensure:AgenticOS',
      'agenticos_external_thread_get:agenticos:job-channel',
      'discord.ensure_project_thread:project/agenticos:codex',
      'agenticos_external_thread_bind:agenticos:thread-agenticos:codex',
    ]);
  });

  it('falls back to project id for workdir and origin guild for binding when optional fields are absent', async () => {
    const harness = createHarness({
      omitExplicitWorkdir: true,
      omitPath: true,
      omitProjectKind: true,
      omitThreadGuild: true,
      omitThreadUrl: true,
    });

    const result = await routeHermesDiscordProjectCommand({
      message: '切换到 AgenticOS 项目',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('ROUTED');
    expect(result.project?.explicit_workdir).toBe('agenticos');
    expect(result.binding).toMatchObject({
      guild_id: 'guild',
      thread_url: undefined,
    });
  });

  it('honors explicit Claude Code while keeping Codex as the default backend', async () => {
    const harness = createHarness();

    const result = await routeHermesDiscordProjectCommand({
      message: '用 Claude Code 切换到 AgenticOS 项目',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('ROUTED');
    expect(result.backend).toBe('claude_code');
    expect(result.worker.backend).toBe('claude_code');
    expect(harness.calls).toContain('discord.ensure_project_thread:project/agenticos:claude_code');
    expect(harness.calls).toContain('agenticos_external_thread_bind:agenticos:thread-agenticos:claude_code');
  });

  it('fails closed with upgrade recovery when AgenticOS project ensure is missing', async () => {
    const harness = createHarness({ tools: ['agenticos_switch'] });

    const result = await routeHermesDiscordProjectCommand({
      message: '切换到 AgenticOS 项目',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('MISSING_AGENTICOS_TOOLS');
    expect(result.degraded_reason).toContain('agenticos_project_ensure');
    expect(result.recovery?.join('\n')).toContain('Do not use cd');
    expect(harness.calls).toEqual([]);
  });

  it('does not create Feishu thread paths and only keeps AgenticOS project context', async () => {
    const harness = createHarness();

    const result = await routeHermesDiscordProjectCommand({
      message: '切换到 AgenticOS 项目',
      origin: { provider: 'feishu', channel_id: 'feishu-chat' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('AGENTICOS_ONLY');
    expect(result.degraded_reason).toBe('Discord project threads are not available on this origin surface.');
    expect(harness.calls).toEqual(['agenticos_project_ensure:AgenticOS']);
  });

  it('blocks worker dispatch when Discord thread creation cannot be recorded in AgenticOS', async () => {
    const harness = createHarness({ bindStatus: 'ERROR' });

    const result = await routeHermesDiscordProjectCommand({
      message: '切换到 AgenticOS 项目',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('THREAD_BINDING_ERROR');
    expect(result.worker).toMatchObject({
      status: 'blocked',
      thread_id: 'thread-agenticos',
    });
    expect(result.error).toBe('thread id rejected');
  });

  it('uses a generic bind failure when AgenticOS omits a bind error message', async () => {
    const harness = createHarness({
      bindStatus: 'ERROR',
      bindErrorWithoutMessage: true,
    });

    const result = await routeHermesDiscordProjectCommand({
      message: '切换到 AgenticOS 项目',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('THREAD_BINDING_ERROR');
    expect(result.error).toBe('AgenticOS thread binding failed after Discord thread creation.');
  });

  it('blocks worker dispatch when AgenticOS bind succeeds without returning a binding', async () => {
    const harness = createHarness({ bindWithoutBinding: true });

    const result = await routeHermesDiscordProjectCommand({
      message: '切换到 AgenticOS 项目',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('THREAD_BINDING_ERROR');
    expect(result.error).toBe('AgenticOS thread binding failed after Discord thread creation.');
  });

  it('blocks worker dispatch when Discord thread creation fails', async () => {
    const harness = createHarness({ discordThrows: true });

    const result = await routeHermesDiscordProjectCommand({
      message: '切换到 AgenticOS 项目',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('THREAD_BINDING_ERROR');
    expect(result.error).toContain('missing Create Public Threads permission');
    expect(result.worker).toMatchObject({
      status: 'blocked',
      project_id: 'agenticos',
      explicit_workdir: '/workspace/agenticos',
    });
    expect(harness.calls).toEqual([
      'agenticos_project_ensure:AgenticOS',
      'agenticos_external_thread_get:agenticos:job-channel',
      'discord.ensure_project_thread:project/agenticos:codex',
    ]);
  });

  it('handles non-Error Discord thread creation failures', async () => {
    const harness = createHarness({ discordThrowsString: true });

    const result = await routeHermesDiscordProjectCommand({
      message: '切换到 AgenticOS 项目',
      origin: { provider: 'discord', guild_id: 'guild', channel_id: 'job-channel' },
      agenticos: harness.agenticos,
      discord: harness.discord,
    });

    expect(result.status).toBe('THREAD_BINDING_ERROR');
    expect(result.error).toContain('gateway unavailable');
  });

  it('uses a stable external project thread name', () => {
    expect(buildDiscordProjectThreadName('AgenticOS')).toBe('project/agenticos');
    expect(buildDiscordProjectThreadName('T5T Topic')).toBe('project/t5t-topic');
  });
});
