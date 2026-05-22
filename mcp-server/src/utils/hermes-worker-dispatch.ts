import type {
  HermesDiscordBackend,
  HermesProjectRouteResult,
  HermesThreadBinding,
} from './hermes-discord-router.js';

export type HermesWorkerDispatchStatus = 'STARTED' | 'BLOCKED';

export interface BackendResolution {
  ok: boolean;
  backend?: HermesDiscordBackend;
  error?: string;
  recovery?: string[];
}

export interface WorkerProcessHandle {
  session_id: string;
  process_id: number;
  log_path?: string;
}

export interface WorkerSessionRecord {
  project_id: string;
  project_name: string;
  provider: 'discord';
  thread_id: string;
  thread_url?: string;
  backend: HermesDiscordBackend;
  command: string;
  session_id: string;
  process_id: number;
  log_path?: string;
  status: 'running';
  started_at: string;
}

export interface WorkerDispatchDeps {
  commandExists(command: string): boolean;
  startWorker(args: {
    backend: HermesDiscordBackend;
    command: string;
    prompt: string;
    explicit_workdir: string;
    project_id: string;
    thread_id: string;
  }): Promise<WorkerProcessHandle>;
  recordWorkerSession(record: WorkerSessionRecord): Promise<void>;
  postThreadMessage(args: {
    binding: HermesThreadBinding;
    content: string;
  }): Promise<{ message_id: string }>;
  now(): string;
}

export interface HermesWorkerDispatchRequest {
  route: HermesProjectRouteResult;
  user_task: string;
  requested_backend?: unknown;
  legacy_session_agent?: unknown;
  deps: WorkerDispatchDeps;
}

export interface HermesWorkerDispatchResult {
  status: HermesWorkerDispatchStatus;
  backend?: HermesDiscordBackend;
  command?: string;
  prompt?: string;
  session?: WorkerSessionRecord;
  thread_message_id?: string;
  error?: string;
  recovery?: string[];
}

const BACKEND_COMMANDS: Record<HermesDiscordBackend, string> = {
  codex: 'codex',
  claude_code: 'claude',
};

export function resolveWorkerBackend(
  requestedBackend: unknown,
  fallbackBackend: HermesDiscordBackend = 'codex',
): BackendResolution {
  if (requestedBackend === undefined || requestedBackend === null || requestedBackend === '') {
    return { ok: true, backend: fallbackBackend };
  }

  if (typeof requestedBackend !== 'string') {
    return invalidBackend(String(requestedBackend));
  }

  const normalized = requestedBackend.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'codex') {
    return { ok: true, backend: 'codex' };
  }
  if (normalized === 'claude' || normalized === 'claude_code' || normalized === 'claude_agent') {
    return { ok: true, backend: 'claude_code' };
  }
  return invalidBackend(requestedBackend);
}

export function getWorkerCommand(backend: HermesDiscordBackend): string {
  return BACKEND_COMMANDS[backend];
}

export function buildWorkerPrompt(args: {
  backend: HermesDiscordBackend;
  project_id: string;
  project_name: string;
  explicit_workdir: string;
  thread_id: string;
  thread_url?: string;
  user_task: string;
}): string {
  return [
    `Backend: ${args.backend}`,
    `AgenticOS project: ${args.project_name} (${args.project_id})`,
    `Explicit workdir: ${args.explicit_workdir}`,
    `Discord thread: ${args.thread_id}${args.thread_url ? ` (${args.thread_url})` : ''}`,
    '',
    'Use AgenticOS MCP as the source of truth for project identity, status, tasks, and guardrails.',
    'Use the explicit workdir for filesystem tool calls after AgenticOS project identity is confirmed.',
    'Do not treat shell cd, raw directory search, or git branch detection as project switching.',
    '',
    'User task:',
    args.user_task,
  ].join('\n');
}

export async function dispatchHermesProjectWorker(
  request: HermesWorkerDispatchRequest,
): Promise<HermesWorkerDispatchResult> {
  const route = request.route;
  const routeProblem = validateRoutedProject(route);
  if (routeProblem) return routeProblem;

  const binding = route.binding!;
  const project = route.project!;
  const fallbackBackend = route.backend ?? binding.default_backend ?? 'codex';
  const resolvedBackend = resolveWorkerBackend(request.requested_backend, fallbackBackend);
  if (!resolvedBackend.ok || !resolvedBackend.backend) {
    const blocked = blockedResult(resolvedBackend.error!, resolvedBackend.recovery!);
    const message = await request.deps.postThreadMessage({
      binding,
      content: renderBlockedWorkerMessage(blocked.error!, blocked.recovery!),
    });
    return { ...blocked, thread_message_id: message.message_id };
  }

  const backend = resolvedBackend.backend;
  const command = getWorkerCommand(backend);
  if (!request.deps.commandExists(command)) {
    const blocked = blockedResult(
      `${backend} worker backend is selected, but command "${command}" is not available.`,
      [`Install ${command} or choose a backend that is available on this machine.`],
    );
    const message = await request.deps.postThreadMessage({
      binding,
      content: renderBlockedWorkerMessage(blocked.error!, blocked.recovery!),
    });
    return { ...blocked, backend, command, thread_message_id: message.message_id };
  }

  const prompt = buildWorkerPrompt({
    backend,
    project_id: project.project_id!,
    project_name: project.name!,
    explicit_workdir: project.explicit_workdir!,
    thread_id: binding.thread_id,
    thread_url: binding.thread_url,
    user_task: request.user_task,
  });
  const handle = await request.deps.startWorker({
    backend,
    command,
    prompt,
    explicit_workdir: project.explicit_workdir!,
    project_id: project.project_id!,
    thread_id: binding.thread_id,
  });
  const session: WorkerSessionRecord = {
    project_id: project.project_id!,
    project_name: project.name!,
    provider: 'discord',
    thread_id: binding.thread_id,
    ...(binding.thread_url ? { thread_url: binding.thread_url } : {}),
    backend,
    command,
    session_id: handle.session_id,
    process_id: handle.process_id,
    ...(handle.log_path ? { log_path: handle.log_path } : {}),
    status: 'running',
    started_at: request.deps.now(),
  };
  await request.deps.recordWorkerSession(session);
  const message = await request.deps.postThreadMessage({
    binding,
    content: renderStartedWorkerMessage(session),
  });

  return {
    status: 'STARTED',
    backend,
    command,
    prompt,
    session,
    thread_message_id: message.message_id,
  };
}

function validateRoutedProject(route: HermesProjectRouteResult): HermesWorkerDispatchResult | null {
  if (route.status !== 'ROUTED' || !route.binding || !route.project?.project_id || !route.project.name || !route.project.explicit_workdir) {
    return blockedResult(
      'Worker dispatch requires a routed AgenticOS project and Discord thread binding.',
      ['Run AgenticOS project ensure and Discord project thread routing before starting a worker.'],
    );
  }
  return null;
}

function invalidBackend(value: string): BackendResolution {
  return {
    ok: false,
    error: `Unsupported worker backend: ${value}.`,
    recovery: ['Use backend "codex" or "claude_code".'],
  };
}

function blockedResult(error: string, recovery: string[]): HermesWorkerDispatchResult {
  return {
    status: 'BLOCKED',
    error,
    recovery,
  };
}

function renderBlockedWorkerMessage(error: string, recovery: string[]): string {
  return [
    `Worker blocked: ${error}`,
    `Recovery: ${recovery.join(' ')}`,
  ].join('\n');
}

function renderStartedWorkerMessage(session: WorkerSessionRecord): string {
  return [
    `Worker started: ${session.backend}`,
    `Session: ${session.session_id}`,
    `Process: ${session.process_id}`,
    ...(session.log_path ? [`Logs: ${session.log_path}`] : []),
  ].join('\n');
}
