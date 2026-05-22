import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import yaml from 'yaml';
import { getAgenticOSHome } from '../utils/registry.js';
import { resolveManagedProjectTarget } from '../utils/project-target.js';

type ExternalThreadProvider = 'discord';
type ExternalThreadBackend = 'codex' | 'claude_code';

interface ExternalThreadBinding {
  project_id: string;
  project_name: string;
  provider: ExternalThreadProvider;
  guild_id?: string;
  channel_id: string;
  thread_id: string;
  thread_url?: string;
  default_backend?: ExternalThreadBackend;
  created_at: string;
  updated_at: string;
}

interface ExternalThreadStore {
  version: string;
  updated_at: string;
  bindings: ExternalThreadBinding[];
}

interface ThreadBindArgs {
  project?: unknown;
  provider?: unknown;
  guild_id?: unknown;
  channel_id?: unknown;
  thread_id?: unknown;
  thread_url?: unknown;
  default_backend?: unknown;
}

interface ThreadGetArgs {
  project?: unknown;
  provider?: unknown;
  guild_id?: unknown;
  channel_id?: unknown;
}

interface ThreadListArgs {
  project?: unknown;
  provider?: unknown;
}

class ExternalThreadError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function jsonResult(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function nowIso(): string {
  return new Date().toISOString();
}

function errorResult(error: Error): string {
  const message = error.message;
  const code = error instanceof ExternalThreadError ? error.code : 'UNKNOWN';
  return jsonResult({
    status: 'ERROR',
    code,
    error: message,
    recovery: [
      'Use provider="discord" for this MVP.',
      'Pass only opaque Discord ids in guild_id, channel_id, and thread_id; put full URLs only in thread_url.',
    ],
  });
}

function normalizeRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new ExternalThreadError('INVALID_INPUT', `${field} must be a non-empty string.`);
  }
  if (/[\u0000-\u001F\u007F]/.test(value)) {
    throw new ExternalThreadError('INVALID_INPUT', `${field} must not contain control characters.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ExternalThreadError('INVALID_INPUT', `${field} must be a non-empty string.`);
  }
  return trimmed;
}

function normalizeProvider(value: unknown, required: boolean): ExternalThreadProvider | null {
  if ((value === undefined || value === null || value === '') && !required) {
    return null;
  }
  const provider = value === undefined || value === null || value === ''
    ? 'discord'
    : normalizeRequiredString(value, 'provider');
  if (provider !== 'discord') {
    throw new ExternalThreadError('UNSUPPORTED_PROVIDER', `provider "${provider}" is not supported. Discord is the only MVP provider.`);
  }
  return provider;
}

function normalizeExternalId(value: unknown, field: string, required: boolean): string | undefined {
  if ((value === undefined || value === null || value === '') && !required) {
    return undefined;
  }
  const id = normalizeRequiredString(value, field);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(id) || id.includes('/') || id.includes('\\') || id.includes('..')) {
    throw new ExternalThreadError('INVALID_INPUT', `${field} must be an opaque Discord id, not a path or URL.`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new ExternalThreadError('INVALID_INPUT', `${field} may contain only letters, numbers, underscore, or hyphen.`);
  }
  return id;
}

function normalizeThreadUrl(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const raw = normalizeRequiredString(value, 'thread_url');
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ExternalThreadError('INVALID_INPUT', 'thread_url must be a valid http(s) URL.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ExternalThreadError('INVALID_INPUT', 'thread_url must use http or https.');
  }
  if (parsed.username || parsed.password) {
    throw new ExternalThreadError('INVALID_INPUT', 'thread_url must not contain username or password authority.');
  }
  return parsed.toString();
}

function normalizeBackend(value: unknown): ExternalThreadBackend | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const backend = normalizeRequiredString(value, 'default_backend');
  if (backend !== 'codex' && backend !== 'claude_code') {
    throw new ExternalThreadError('INVALID_INPUT', 'default_backend must be "codex" or "claude_code".');
  }
  return backend;
}

function storePath(provider: ExternalThreadProvider): string {
  return join(getAgenticOSHome(), '.agent-workspace', 'integrations', provider, 'thread-bindings.yaml');
}

function emptyStore(): ExternalThreadStore {
  return {
    version: '1.0.0',
    updated_at: nowIso(),
    bindings: [],
  };
}

async function loadStore(provider: ExternalThreadProvider): Promise<ExternalThreadStore> {
  try {
    const parsed = yaml.parse(await readFile(storePath(provider), 'utf-8')) || {};
    return {
      version: typeof parsed.version === 'string' ? parsed.version : '1.0.0',
      updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : nowIso(),
      bindings: Array.isArray(parsed.bindings) ? parsed.bindings : [],
    };
  } catch {
    return emptyStore();
  }
}

async function saveStore(provider: ExternalThreadProvider, store: ExternalThreadStore): Promise<void> {
  const path = storePath(provider);
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(tempPath, yaml.stringify(store), 'utf-8');
  await rename(tempPath, path);
}

async function resolveProject(project: unknown, commandName: string): Promise<{ project_id: string; project_name: string }> {
  const requestedProject = normalizeRequiredString(project, 'project');
  const resolved = await resolveManagedProjectTarget({
    project: requestedProject,
    commandName,
  });
  return {
    project_id: resolved.projectId,
    project_name: resolved.projectName,
  };
}

function sameBinding(a: ExternalThreadBinding, b: ExternalThreadBinding): boolean {
  return a.guild_id === b.guild_id
    && a.channel_id === b.channel_id
    && a.thread_id === b.thread_id
    && a.thread_url === b.thread_url
    && a.default_backend === b.default_backend;
}

function findBindingIndex(store: ExternalThreadStore, projectId: string, provider: ExternalThreadProvider): number {
  return store.bindings.findIndex((binding) => binding.project_id === projectId && binding.provider === provider);
}

function filterBinding(binding: ExternalThreadBinding, args: { guild_id?: string; channel_id?: string }): boolean {
  return (!args.guild_id || binding.guild_id === args.guild_id)
    && (!args.channel_id || binding.channel_id === args.channel_id);
}

export async function runExternalThreadBind(args: ThreadBindArgs = {}): Promise<string> {
  try {
    const provider = normalizeProvider(args.provider, true) as ExternalThreadProvider;
    const project = await resolveProject(args.project, 'agenticos_external_thread_bind');
    const now = nowIso();
    const guildId = normalizeExternalId(args.guild_id, 'guild_id', false);
    const threadUrl = normalizeThreadUrl(args.thread_url);
    const defaultBackend = normalizeBackend(args.default_backend);
    const nextBinding: ExternalThreadBinding = {
      project_id: project.project_id,
      project_name: project.project_name,
      provider,
      ...(guildId ? { guild_id: guildId } : {}),
      channel_id: normalizeExternalId(args.channel_id, 'channel_id', true)!,
      thread_id: normalizeExternalId(args.thread_id, 'thread_id', true)!,
      ...(threadUrl ? { thread_url: threadUrl } : {}),
      ...(defaultBackend ? { default_backend: defaultBackend } : {}),
      created_at: now,
      updated_at: now,
    };
    const store = await loadStore(provider);
    const existingIndex = findBindingIndex(store, project.project_id, provider);
    const existing = existingIndex >= 0 ? store.bindings[existingIndex] : null;

    if (existing && sameBinding(existing, nextBinding)) {
      return jsonResult({
        status: 'BOUND',
        created: false,
        updated: false,
        binding: existing,
        storage: { provider, private_sidecar: storePath(provider) },
      });
    }

    const binding = {
      ...nextBinding,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    if (existingIndex >= 0) {
      store.bindings[existingIndex] = binding;
    } else {
      store.bindings.push(binding);
    }
    store.updated_at = now;
    await saveStore(provider, store);
    return jsonResult({
      status: 'BOUND',
      created: existingIndex < 0,
      updated: existingIndex >= 0,
      binding,
      storage: { provider, private_sidecar: storePath(provider) },
    });
  } catch (error) {
    return errorResult(error as Error);
  }
}

export async function runExternalThreadGet(args: ThreadGetArgs = {}): Promise<string> {
  try {
    const provider = normalizeProvider(args.provider, true) as ExternalThreadProvider;
    const project = await resolveProject(args.project, 'agenticos_external_thread_get');
    const guildId = normalizeExternalId(args.guild_id, 'guild_id', false);
    const channelId = normalizeExternalId(args.channel_id, 'channel_id', false);
    const store = await loadStore(provider);
    const binding = store.bindings.find((candidate) =>
      candidate.project_id === project.project_id &&
      candidate.provider === provider &&
      filterBinding(candidate, { guild_id: guildId, channel_id: channelId })
    ) || null;
    return jsonResult({
      status: binding ? 'FOUND' : 'NOT_FOUND',
      project_id: project.project_id,
      provider,
      binding,
    });
  } catch (error) {
    return errorResult(error as Error);
  }
}

export async function runExternalThreadList(args: ThreadListArgs = {}): Promise<string> {
  try {
    const provider = normalizeProvider(args.provider, false) || 'discord';
    const project = args.project === undefined || args.project === null || args.project === ''
      ? null
      : await resolveProject(args.project, 'agenticos_external_thread_list');
    const store = await loadStore(provider);
    const bindings = store.bindings
      .filter((binding) => !project || binding.project_id === project.project_id)
      .sort((a, b) => a.project_id.localeCompare(b.project_id));
    return jsonResult({
      status: 'OK',
      provider,
      project_id: project?.project_id || null,
      count: bindings.length,
      bindings,
    });
  } catch (error) {
    return errorResult(error as Error);
  }
}
