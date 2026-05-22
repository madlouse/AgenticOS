export type HermesDiscordBackend = 'codex' | 'claude_code';
export type HermesExternalProvider = 'discord' | 'feishu' | 'unknown';

export interface ParsedHermesProjectCommand {
  project: string;
  verb: 'enter_or_create';
  backend: HermesDiscordBackend;
  explicit_backend: boolean;
}

export interface HermesProjectEnsurePayload {
  status: string;
  project_id?: string;
  name?: string;
  project_kind?: string;
  explicit_workdir?: string;
  path?: string;
  error?: string;
  code?: string;
  recovery?: string[];
}

interface HermesEnsuredProject extends HermesProjectEnsurePayload {
  project_id: string;
  name: string;
  project_kind: string;
  explicit_workdir: string;
}

export interface HermesThreadBinding {
  project_id: string;
  project_name?: string;
  provider: 'discord';
  guild_id?: string;
  channel_id: string;
  thread_id: string;
  thread_url?: string;
  default_backend?: HermesDiscordBackend;
}

export interface HermesThreadGetPayload {
  status: string;
  binding?: HermesThreadBinding | null;
  error?: string;
  code?: string;
  recovery?: string[];
}

export interface HermesThreadBindPayload {
  status: string;
  binding?: HermesThreadBinding;
  error?: string;
  code?: string;
  recovery?: string[];
}

export interface DiscordProjectThread {
  guild_id?: string;
  channel_id: string;
  thread_id: string;
  thread_url?: string;
  created?: boolean;
}

export interface DiscordThreadAdapter {
  available: boolean;
  ensureProjectThread(args: {
    guild_id?: string;
    channel_id: string;
    thread_name: string;
    project_id: string;
    project_name: string;
    project_kind: string;
    backend: HermesDiscordBackend;
  }): Promise<DiscordProjectThread>;
}

export interface AgenticOSProjectRouterAdapter {
  available_tools: readonly string[];
  projectEnsure(args: Record<string, unknown>): Promise<unknown>;
  externalThreadGet(args: Record<string, unknown>): Promise<unknown>;
  externalThreadBind(args: Record<string, unknown>): Promise<unknown>;
}

export interface HermesProjectRouteRequest {
  message: string;
  origin: {
    provider?: HermesExternalProvider;
    guild_id?: string;
    channel_id?: string;
  };
  agenticos: AgenticOSProjectRouterAdapter;
  discord?: DiscordThreadAdapter;
}

export type HermesProjectRouteStatus =
  | 'NOT_PROJECT_COMMAND'
  | 'MISSING_AGENTICOS_TOOLS'
  | 'AGENTICOS_ERROR'
  | 'AGENTICOS_ONLY'
  | 'THREAD_BINDING_ERROR'
  | 'ROUTED';

export interface HermesProjectRouteResult {
  status: HermesProjectRouteStatus;
  parsed?: ParsedHermesProjectCommand;
  project?: HermesProjectEnsurePayload;
  backend?: HermesDiscordBackend;
  binding?: HermesThreadBinding;
  thread_url?: string;
  degraded_reason?: string;
  error?: string;
  recovery?: string[];
  call_order: string[];
  worker: {
    backend?: HermesDiscordBackend;
    status: 'not_applicable' | 'ready_for_dispatch' | 'blocked';
    project_id?: string;
    explicit_workdir?: string;
    thread_id?: string;
  };
}

const REQUIRED_PROJECT_TOOL = 'agenticos_project_ensure';
const REQUIRED_THREAD_TOOLS = [
  'agenticos_external_thread_get',
  'agenticos_external_thread_bind',
] as const;

export function parseHermesProjectCommand(message: string): ParsedHermesProjectCommand | null {
  const normalized = message.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;

  const backend = detectBackend(normalized);
  const project = extractProjectName(normalized);
  if (!project) return null;

  return {
    project,
    verb: 'enter_or_create',
    backend: backend.value,
    explicit_backend: backend.explicit,
  };
}

export async function routeHermesDiscordProjectCommand(
  request: HermesProjectRouteRequest,
): Promise<HermesProjectRouteResult> {
  const callOrder: string[] = [];
  const parsed = parseHermesProjectCommand(request.message);
  if (!parsed) {
    return {
      status: 'NOT_PROJECT_COMMAND',
      call_order: callOrder,
      worker: { status: 'not_applicable' },
    };
  }

  const toolSet = new Set(request.agenticos.available_tools);
  if (!toolSet.has(REQUIRED_PROJECT_TOOL)) {
    return blockedForMissingTools(parsed, callOrder, [REQUIRED_PROJECT_TOOL]);
  }

  callOrder.push(REQUIRED_PROJECT_TOOL);
  const ensured = parsePayload<HermesProjectEnsurePayload>(await request.agenticos.projectEnsure({
    project: parsed.project,
    name: parsed.project,
    project_kind: 'project',
    topology: 'local_directory_only',
    context_publication_policy: 'local_private',
  }));

  if (ensured.status === 'ERROR' || !ensured.project_id || !ensured.name) {
    return {
      status: 'AGENTICOS_ERROR',
      parsed,
      project: ensured,
      backend: parsed.backend,
      error: ensured.error || 'AgenticOS project ensure failed.',
      recovery: ensured.recovery,
      call_order: callOrder,
      worker: { status: 'blocked', backend: parsed.backend },
    };
  }

  const project = normalizeEnsuredProject(ensured);
  const canUseDiscord = request.origin.provider === 'discord'
    && Boolean(request.origin.channel_id)
    && request.discord?.available === true;
  if (!canUseDiscord) {
    return {
      status: 'AGENTICOS_ONLY',
      parsed,
      project,
      backend: parsed.backend,
      degraded_reason: buildDiscordDegradedReason(request),
      recovery: [
        'Use Discord for project cockpit threads.',
        'Keep using the ensured AgenticOS project context when Discord is not configured.',
      ],
      call_order: callOrder,
      worker: {
        status: 'ready_for_dispatch',
        backend: parsed.backend,
        project_id: project.project_id,
        explicit_workdir: project.explicit_workdir,
      },
    };
  }

  const missingThreadTools = REQUIRED_THREAD_TOOLS.filter((tool) => !toolSet.has(tool));
  if (missingThreadTools.length > 0) {
    return {
      status: 'AGENTICOS_ONLY',
      parsed,
      project,
      backend: parsed.backend,
      degraded_reason: `AgenticOS MCP is missing ${missingThreadTools.join(', ')}.`,
      recovery: [
        'Upgrade AgenticOS and restart the agent so Hermes can bind Discord project threads.',
        'Do not fall back to cd, raw filesystem search, or agenticos_switch as a lookup substitute.',
      ],
      call_order: callOrder,
      worker: {
        status: 'ready_for_dispatch',
        backend: parsed.backend,
        project_id: project.project_id,
        explicit_workdir: project.explicit_workdir,
      },
    };
  }

  const threadLookupArgs = {
    project: project.project_id,
    provider: 'discord',
    ...(request.origin.guild_id ? { guild_id: request.origin.guild_id } : {}),
    channel_id: request.origin.channel_id,
  };
  callOrder.push('agenticos_external_thread_get');
  const existing = parsePayload<HermesThreadGetPayload>(await request.agenticos.externalThreadGet(threadLookupArgs));

  if (existing.status === 'FOUND' && existing.binding) {
    return routedResult({
      parsed,
      project,
      backend: parsed.backend,
      binding: existing.binding,
      callOrder,
    });
  }
  if (existing.status === 'ERROR') {
    return {
      status: 'THREAD_BINDING_ERROR',
      parsed,
      project,
      backend: parsed.backend,
      error: existing.error || 'AgenticOS thread lookup failed.',
      recovery: existing.recovery,
      call_order: callOrder,
      worker: {
        status: 'blocked',
        backend: parsed.backend,
        project_id: project.project_id,
        explicit_workdir: project.explicit_workdir,
      },
    };
  }

  callOrder.push('discord.ensure_project_thread');
  let thread: DiscordProjectThread;
  try {
    thread = await request.discord!.ensureProjectThread({
      ...(request.origin.guild_id ? { guild_id: request.origin.guild_id } : {}),
      channel_id: request.origin.channel_id!,
      thread_name: buildDiscordProjectThreadName(project.project_id),
      project_id: project.project_id,
      project_name: project.name,
      project_kind: project.project_kind,
      backend: parsed.backend,
    });
  } catch (error) {
    return {
      status: 'THREAD_BINDING_ERROR',
      parsed,
      project,
      backend: parsed.backend,
      error: `Discord thread creation failed: ${error instanceof Error ? error.message : String(error)}`,
      recovery: [
        'Confirm Discord bot permissions and channel access.',
        'Retry after the Hermes Discord gateway reports healthy.',
      ],
      call_order: callOrder,
      worker: {
        status: 'blocked',
        backend: parsed.backend,
        project_id: project.project_id,
        explicit_workdir: project.explicit_workdir,
      },
    };
  }

  callOrder.push('agenticos_external_thread_bind');
  const bind = parsePayload<HermesThreadBindPayload>(await request.agenticos.externalThreadBind({
    project: project.project_id,
    provider: 'discord',
    ...(thread.guild_id || request.origin.guild_id ? { guild_id: thread.guild_id || request.origin.guild_id } : {}),
    channel_id: thread.channel_id,
    thread_id: thread.thread_id,
    ...(thread.thread_url ? { thread_url: thread.thread_url } : {}),
    default_backend: parsed.backend,
  }));

  if (bind.status === 'ERROR' || !bind.binding) {
    return {
      status: 'THREAD_BINDING_ERROR',
      parsed,
      project,
      backend: parsed.backend,
      error: bind.error || 'AgenticOS thread binding failed after Discord thread creation.',
      recovery: bind.recovery,
      call_order: callOrder,
      worker: {
        status: 'blocked',
        backend: parsed.backend,
        project_id: project.project_id,
        explicit_workdir: project.explicit_workdir,
        thread_id: thread.thread_id,
      },
    };
  }

  return routedResult({
    parsed,
    project,
    backend: parsed.backend,
    binding: bind.binding,
    callOrder,
  });
}

export function buildDiscordProjectThreadName(projectId: string): string {
  return `project/${projectId.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`;
}

function detectBackend(message: string): { value: HermesDiscordBackend; explicit: boolean } {
  if (/\bclaude(?:\s+code|\s+agent)?\b/i.test(message) || /Claude\s*(?:Code|Agent)?/i.test(message)) {
    return { value: 'claude_code', explicit: true };
  }
  if (/\bcodex\b/i.test(message)) {
    return { value: 'codex', explicit: true };
  }
  return { value: 'codex', explicit: false };
}

function extractProjectName(message: string): string | null {
  const patterns = [
    /(?:用\s*(?:Claude\s*Code|Claude\s*Agent|Codex)\s*)?(?:切换到|进入|打开|新建|创建)\s+(.+?)(?:\s*(?:项目|topic|Topic))?(?:\s*(?:并|然后|，|,|。|$).*)?$/i,
    /(?:switch|enter|open|create)\s+(?:to\s+)?(.+?)(?:\s+project|\s+topic)?(?:\s+(?:and|then)\s+.*)?$/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match) continue;
    const project = cleanupProjectName(match[1]);
    if (project) return project;
  }

  return null;
}

function cleanupProjectName(value: string): string | null {
  const cleaned = value
    .replace(/^(?:用\s*)?(?:Claude\s*Code|Claude\s*Agent|Codex)\s*/i, '')
    .replace(/\s*(?:项目|topic|Topic)$/i, '')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function parsePayload<T>(value: unknown): T {
  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }
  return value as T;
}

function normalizeEnsuredProject(project: HermesProjectEnsurePayload): HermesEnsuredProject {
  return {
    ...project,
    project_id: project.project_id!,
    name: project.name!,
    project_kind: project.project_kind || 'project',
    explicit_workdir: project.explicit_workdir || project.path || project.project_id!,
  };
}

function blockedForMissingTools(
  parsed: ParsedHermesProjectCommand,
  callOrder: string[],
  missingTools: readonly string[],
): HermesProjectRouteResult {
  return {
    status: 'MISSING_AGENTICOS_TOOLS',
    parsed,
    backend: parsed.backend,
    degraded_reason: `AgenticOS MCP is missing ${missingTools.join(', ')}.`,
    recovery: [
      'Upgrade AgenticOS and restart the agent so Hermes can resolve projects through MCP.',
      'Do not use cd, raw filesystem search, or agenticos_switch as a lookup substitute.',
    ],
    call_order: callOrder,
    worker: { status: 'blocked', backend: parsed.backend },
  };
}

function buildDiscordDegradedReason(request: HermesProjectRouteRequest): string {
  if (request.origin.provider && request.origin.provider !== 'discord') {
    return 'Discord project threads are not available on this origin surface.';
  }
  if (!request.origin.channel_id) {
    return 'Discord channel id is missing.';
  }
  return 'Discord routing is not configured or not available.';
}

function routedResult(args: {
  parsed: ParsedHermesProjectCommand;
  project: HermesProjectEnsurePayload;
  backend: HermesDiscordBackend;
  binding: HermesThreadBinding;
  callOrder: string[];
}): HermesProjectRouteResult {
  return {
    status: 'ROUTED',
    parsed: args.parsed,
    project: args.project,
    backend: args.backend,
    binding: args.binding,
    thread_url: args.binding.thread_url,
    call_order: args.callOrder,
    worker: {
      status: 'ready_for_dispatch',
      backend: args.backend,
      project_id: args.project.project_id,
      explicit_workdir: args.project.explicit_workdir,
      thread_id: args.binding.thread_id,
    },
  };
}
