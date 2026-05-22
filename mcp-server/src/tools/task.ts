import { mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import yaml from 'yaml';
import { validateProjectKind, type ProjectKind } from '../utils/project-contract.js';
import { resolveManagedProjectContextPaths, resolveManagedProjectTarget } from '../utils/project-target.js';

type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'done' | 'canceled';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

interface TaskRef {
  type: string;
  uri: string;
  title?: string;
  visibility?: 'public' | 'private' | 'restricted';
}

interface TaskSource {
  kind: string;
  origin: string;
  source_id?: string;
  dedupe_key?: string;
}

interface AgenticOSTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  source: TaskSource;
  acceptance_criteria: string[];
  refs: TaskRef[];
  created_at: string;
  updated_at: string;
  description?: string;
  labels?: string[];
  blocked_reason?: string;
  closed_at?: string;
  related_tasks?: string[];
}

interface TaskCommandContext {
  project_id: string;
  project_name: string;
  project_kind: ProjectKind;
  tasks_dir: string;
  state_path: string;
}

const TASK_STATUSES = new Set<TaskStatus>(['open', 'in_progress', 'blocked', 'done', 'canceled']);
const CLOSE_STATUSES = new Set<TaskStatus>(['done', 'canceled']);
const PRIORITIES = new Set<TaskPriority>(['low', 'medium', 'high', 'urgent']);
const SOURCE_KINDS = new Set(['user', 'hermes', 'codex', 'claude_code', 'agenticos_mcp', 'github', 'manual']);
const SOURCE_ORIGINS = new Set(['chat', 'mcp', 'github_issue', 'gbrain', 'capture', 'manual', 'import']);
const REF_VISIBILITIES = new Set(['public', 'private', 'restricted']);
const SECRET_PATTERNS = [
  /\b(?:api[_-]?key|token|password|secret|private[_-]?key)\s*[:=]\s*["']?[^"'\s]+/i,
  /\bsk-[a-z0-9]{20,}\b/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

function jsonResult(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeTaskId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, '')
    .replace(/\s+/g, ' ');
}

function hasSecretLikeValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return SECRET_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasSecretLikeValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => hasSecretLikeValue(item));
  }
  return false;
}

function ensureStringArray(value: unknown, field: string, errors: string[]): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${field} must be a non-empty array of strings`);
    return [];
  }

  const values = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (values.length !== value.length || values.length === 0) {
    errors.push(`${field} must contain only non-empty strings`);
  }
  return values;
}

function normalizeSource(value: unknown, errors: string[]): TaskSource {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const kind = typeof source.kind === 'string' ? source.kind.trim() : 'manual';
  const origin = typeof source.origin === 'string' ? source.origin.trim() : 'manual';

  if (!SOURCE_KINDS.has(kind)) {
    errors.push('source.kind must be one of user, hermes, codex, claude_code, agenticos_mcp, github, manual');
  }
  if (!SOURCE_ORIGINS.has(origin)) {
    errors.push('source.origin must be one of chat, mcp, github_issue, gbrain, capture, manual, import');
  }

  const normalized: TaskSource = { kind, origin };
  if (typeof source.source_id === 'string' && source.source_id.trim()) {
    normalized.source_id = source.source_id.trim();
  }
  if (typeof source.dedupe_key === 'string' && source.dedupe_key.trim()) {
    normalized.dedupe_key = source.dedupe_key.trim();
  }
  return normalized;
}

function normalizeRefs(value: unknown, errors: string[]): TaskRef[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push('refs must be an array');
    return [];
  }

  const refs: TaskRef[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      errors.push('refs entries must be objects');
      continue;
    }
    const ref = item as Record<string, unknown>;
    const type = typeof ref.type === 'string' ? ref.type.trim() : '';
    const uri = typeof ref.uri === 'string' ? ref.uri.trim() : '';
    const visibility = typeof ref.visibility === 'string' ? ref.visibility.trim() : undefined;
    if (!type || !uri) {
      errors.push('refs entries require type and uri');
      continue;
    }
    if (visibility !== undefined && !REF_VISIBILITIES.has(visibility)) {
      errors.push('refs.visibility must be public, private, or restricted');
      continue;
    }
    refs.push({
      type,
      uri,
      ...(typeof ref.title === 'string' && ref.title.trim() ? { title: ref.title.trim() } : {}),
      ...(visibility ? { visibility: visibility as TaskRef['visibility'] } : {}),
    });
  }
  return refs;
}

function deriveDedupeKey(task: Pick<AgenticOSTask, 'title' | 'source' | 'refs'>): string {
  if (task.source.dedupe_key) {
    return task.source.dedupe_key;
  }
  const refs = [...task.refs]
    .sort((a, b) => `${a.type}:${a.uri}`.localeCompare(`${b.type}:${b.uri}`))
    .map((ref) => `${ref.type}:${ref.uri}`)
    .join('|');
  return [normalizeText(task.title), task.source.kind, task.source.origin, refs].join('|');
}

function validateProjectKindOrThrow(projectName: string, projectYaml: any): ProjectKind {
  const validation = validateProjectKind(projectName, projectYaml);
  if (!validation.ok) {
    throw new Error(validation.message);
  }
  return validation.project_kind;
}

async function resolveTaskContext(args: any): Promise<TaskCommandContext> {
  const resolved = await resolveManagedProjectTarget({
    project: args?.project,
    projectPath: args?.project_path,
    commandName: 'agenticos_task',
  });
  const contextPaths = resolveManagedProjectContextPaths(resolved.projectPath, resolved.projectYaml);
  return {
    project_id: resolved.projectId,
    project_name: resolved.projectName,
    project_kind: validateProjectKindOrThrow(resolved.projectName, resolved.projectYaml),
    tasks_dir: contextPaths.tasksDir,
    state_path: resolved.statePath,
  };
}

function taskPath(context: TaskCommandContext, taskId: string): string {
  return join(context.tasks_dir, `${taskId}.yaml`);
}

async function readTaskFile(path: string): Promise<AgenticOSTask | null> {
  try {
    return yaml.parse(await readFile(path, 'utf-8')) as AgenticOSTask || null;
  } catch {
    return null;
  }
}

async function listTaskFiles(context: TaskCommandContext): Promise<AgenticOSTask[]> {
  let entries: string[];
  try {
    entries = await readdir(context.tasks_dir);
  } catch {
    return [];
  }

  const tasks: AgenticOSTask[] = [];
  for (const entry of entries.filter((item) => item.endsWith('.yaml')).sort()) {
    const task = await readTaskFile(join(context.tasks_dir, entry));
    if (task) {
      tasks.push(task);
    }
  }
  return tasks;
}

async function readState(statePath: string): Promise<any> {
  try {
    return yaml.parse(await readFile(statePath, 'utf-8')) || {};
  } catch {
    return {};
  }
}

function taskNextStep(task: AgenticOSTask): string | null {
  return task.acceptance_criteria[0] || null;
}

async function syncState(context: TaskCommandContext, task: AgenticOSTask): Promise<void> {
  const state = await readState(context.state_path);
  if (CLOSE_STATUSES.has(task.status)) {
    if (state.current_task?.id === task.id) {
      state.current_task = null;
    }
    if (state.resume?.task_id === task.id) {
      delete state.resume;
    }
  } else {
    state.resume = {
      task_id: task.id,
      reason: `Continue ${task.title}`,
      updated_at: task.updated_at,
    };
    if (task.status === 'in_progress' || state.current_task?.id === task.id) {
      state.current_task = {
        id: task.id,
        title: task.title,
        status: task.status,
        updated: task.updated_at,
        next_step: taskNextStep(task),
      };
    }
  }
  await mkdir(dirname(context.state_path), { recursive: true });
  await writeFile(context.state_path, yaml.stringify(state), 'utf-8');
}

function buildTaskFromCreateArgs(args: any, now: string): { task?: AgenticOSTask; errors: string[] } {
  const errors: string[] = [];
  const title = typeof args?.title === 'string' ? args.title.trim() : '';
  if (!title) {
    errors.push('title is required');
  }

  const rawTaskId = typeof args?.id === 'string' && args.id.trim() ? args.id : title;
  const taskId = sanitizeTaskId(rawTaskId);
  if (!taskId) {
    errors.push('id or title must contain at least one alphanumeric character');
  }

  const status = typeof args?.status === 'string' && args.status.trim() ? args.status.trim() : 'open';
  if (!TASK_STATUSES.has(status as TaskStatus)) {
    errors.push('status must be one of open, in_progress, blocked, done, canceled');
  }

  const priority = typeof args?.priority === 'string' && args.priority.trim() ? args.priority.trim() : 'medium';
  if (!PRIORITIES.has(priority as TaskPriority)) {
    errors.push('priority must be one of low, medium, high, urgent');
  }

  const acceptanceCriteria = ensureStringArray(args?.acceptance_criteria, 'acceptance_criteria', errors);
  const source = normalizeSource(args?.source, errors);
  const refs = normalizeRefs(args?.refs, errors);
  const description = typeof args?.description === 'string' && args.description.trim() ? args.description.trim() : undefined;
  const labels = args?.labels === undefined ? undefined : ensureStringArray(args.labels, 'labels', errors);

  if (status === 'blocked' && !(typeof args?.blocked_reason === 'string' && args.blocked_reason.trim())) {
    errors.push('blocked_reason is required when status is blocked');
  }

  const blockedReason = typeof args?.blocked_reason === 'string' && args.blocked_reason.trim() ? args.blocked_reason.trim() : undefined;
  if (hasSecretLikeValue({ rawTaskId, title, source, refs, description, acceptanceCriteria, labels, blockedReason })) {
    errors.push('task input appears to contain raw secret material; store a safe reference instead');
  }

  if (errors.length > 0) {
    return { errors };
  }

  const task: AgenticOSTask = {
    id: taskId,
    title,
    status: status as TaskStatus,
    priority: priority as TaskPriority,
    source,
    acceptance_criteria: acceptanceCriteria,
    refs,
    created_at: now,
    updated_at: now,
    ...(description ? { description } : {}),
    ...(labels && labels.length > 0 ? { labels } : {}),
    ...(blockedReason ? { blocked_reason: blockedReason } : {}),
  };
  if (CLOSE_STATUSES.has(task.status)) {
    task.closed_at = now;
  }
  return { task, errors };
}

function isClosedTask(task: AgenticOSTask): boolean {
  return CLOSE_STATUSES.has(task.status);
}

function matchingDuplicateTasks(tasks: AgenticOSTask[], task: AgenticOSTask): AgenticOSTask[] {
  const dedupeKey = deriveDedupeKey(task);
  return tasks.filter((candidate) => (
    candidate.id === task.id || deriveDedupeKey(candidate) === dedupeKey
  ));
}

function findActiveDuplicateTask(tasks: AgenticOSTask[], task: AgenticOSTask): AgenticOSTask | null {
  return matchingDuplicateTasks(tasks, task).find((candidate) => !isClosedTask(candidate)) || null;
}

function findClosedDuplicateTasks(tasks: AgenticOSTask[], task: AgenticOSTask): AgenticOSTask[] {
  return matchingDuplicateTasks(tasks, task).filter((candidate) => isClosedTask(candidate));
}

function deriveAvailableTaskId(tasks: AgenticOSTask[], preferredId: string): string | null {
  const usedIds = new Set(tasks.map((task) => task.id));
  if (!usedIds.has(preferredId)) {
    return preferredId;
  }

  const base = preferredId.slice(0, 72).replace(/-+$/g, '');
  for (let index = 2; index <= 100; index += 1) {
    const suffix = `-${index}`;
    const candidateBase = base.slice(0, 80 - suffix.length).replace(/-+$/g, '');
    const candidate = `${candidateBase}${suffix}`;
    if (!usedIds.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

function taskResponse(status: string, context: TaskCommandContext, task: AgenticOSTask, extra: Record<string, unknown> = {}): string {
  return jsonResult({
    status,
    project_id: context.project_id,
    project_kind: context.project_kind,
    task_path: taskPath(context, task.id),
    state_path: context.state_path,
    task,
    ...extra,
  });
}

function errorResponse(errors: string[]): string {
  return jsonResult({ status: 'ERROR', errors });
}

export async function runTaskCreate(args: any = {}): Promise<string> {
  try {
    const context = await resolveTaskContext(args);
    const built = buildTaskFromCreateArgs(args, nowIso());
    if (!built.task) {
      return errorResponse(built.errors);
    }
    await mkdir(context.tasks_dir, { recursive: true });
    const existingTasks = await listTaskFiles(context);
    const existing = findActiveDuplicateTask(existingTasks, built.task);
    if (existing) {
      await syncState(context, existing);
      return taskResponse('EXISTING', context, existing, { duplicate: true });
    }
    const closedDuplicates = findClosedDuplicateTasks(existingTasks, built.task);
    if (closedDuplicates.length > 0) {
      const nextId = deriveAvailableTaskId(existingTasks, built.task.id);
      if (!nextId) {
        return errorResponse([
          `matching closed task(s) found (${closedDuplicates.map((task) => task.id).join(', ')}) but a safe follow-up id could not be derived; pass an explicit id or reopen manually`,
        ]);
      }
      const relatedTaskIds = [...new Set(closedDuplicates.map((task) => task.id))];
      if (hasSecretLikeValue(relatedTaskIds)) {
        return errorResponse(['matching closed task id appears to contain secret material; pass a safe explicit id and reference the closed task manually']);
      }
      built.task.id = nextId;
      built.task.related_tasks = relatedTaskIds;
    }
    await writeFile(taskPath(context, built.task.id), yaml.stringify(built.task), 'utf-8');
    await syncState(context, built.task);
    return taskResponse('CREATED', context, built.task);
  } catch (error: any) {
    return errorResponse([error.message || 'failed to create task']);
  }
}

function applyTaskUpdates(existing: AgenticOSTask, args: any, now: string): { task?: AgenticOSTask; errors: string[] } {
  const errors: string[] = [];
  const next: AgenticOSTask = { ...existing, updated_at: now };

  if (args.title !== undefined) {
    if (typeof args.title !== 'string' || !args.title.trim()) {
      errors.push('title must be a non-empty string');
    } else {
      next.title = args.title.trim();
    }
  }
  if (args.status !== undefined) {
    const status = typeof args.status === 'string' ? args.status.trim() : '';
    if (!TASK_STATUSES.has(status as TaskStatus)) {
      errors.push('status must be one of open, in_progress, blocked, done, canceled');
    } else {
      next.status = status as TaskStatus;
    }
  }
  if (args.priority !== undefined) {
    const priority = typeof args.priority === 'string' ? args.priority.trim() : '';
    if (!PRIORITIES.has(priority as TaskPriority)) {
      errors.push('priority must be one of low, medium, high, urgent');
    } else {
      next.priority = priority as TaskPriority;
    }
  }
  if (args.acceptance_criteria !== undefined) {
    next.acceptance_criteria = ensureStringArray(args.acceptance_criteria, 'acceptance_criteria', errors);
  }
  if (args.source !== undefined) {
    next.source = normalizeSource(args.source, errors);
  }
  if (args.refs !== undefined) {
    next.refs = normalizeRefs(args.refs, errors);
  }
  if (args.description !== undefined) {
    next.description = typeof args.description === 'string' && args.description.trim() ? args.description.trim() : undefined;
  }
  if (args.labels !== undefined) {
    const labels = ensureStringArray(args.labels, 'labels', errors);
    next.labels = labels.length > 0 ? labels : undefined;
  }
  if (args.blocked_reason !== undefined) {
    next.blocked_reason = typeof args.blocked_reason === 'string' && args.blocked_reason.trim() ? args.blocked_reason.trim() : undefined;
  }

  if (next.status === 'blocked' && !next.blocked_reason) {
    errors.push('blocked_reason is required when status is blocked');
  }
  if (CLOSE_STATUSES.has(next.status) && !next.closed_at) {
    next.closed_at = now;
  }
  if (!CLOSE_STATUSES.has(next.status)) {
    delete next.closed_at;
  }
  if (hasSecretLikeValue(next)) {
    errors.push('task input appears to contain raw secret material; store a safe reference instead');
  }

  return errors.length > 0 ? { errors } : { task: next, errors };
}

function requestedTaskId(args: any): string {
  return sanitizeTaskId(typeof args?.task_id === 'string' && args.task_id.trim() ? args.task_id : String(args?.id || ''));
}

export async function runTaskUpdate(args: any = {}): Promise<string> {
  try {
    const context = await resolveTaskContext(args);
    const taskId = requestedTaskId(args);
    if (!taskId) {
      return errorResponse(['task_id is required']);
    }
    const existing = await readTaskFile(taskPath(context, taskId));
    if (!existing) {
      return errorResponse([`task "${taskId}" not found`]);
    }
    const updated = applyTaskUpdates(existing, args, nowIso());
    if (!updated.task) {
      return errorResponse(updated.errors);
    }
    await writeFile(taskPath(context, updated.task.id), yaml.stringify(updated.task), 'utf-8');
    await syncState(context, updated.task);
    return taskResponse('UPDATED', context, updated.task);
  } catch (error: any) {
    return errorResponse([error.message || 'failed to update task']);
  }
}

export async function runTaskList(args: any = {}): Promise<string> {
  try {
    const context = await resolveTaskContext(args);
    const statusFilter = typeof args?.status === 'string' && args.status.trim() ? args.status.trim() : null;
    if (statusFilter && !TASK_STATUSES.has(statusFilter as TaskStatus)) {
      return errorResponse(['status must be one of open, in_progress, blocked, done, canceled']);
    }
    const tasks = (await listTaskFiles(context))
      .filter((task) => !statusFilter || task.status === statusFilter)
      .sort((a, b) => a.id.localeCompare(b.id));
    return jsonResult({
      status: 'OK',
      project_id: context.project_id,
      project_kind: context.project_kind,
      tasks_dir: context.tasks_dir,
      count: tasks.length,
      tasks,
    });
  } catch (error: any) {
    return errorResponse([error.message || 'failed to list tasks']);
  }
}

export async function runTaskClose(args: any = {}): Promise<string> {
  const status = typeof args?.status === 'string' && args.status.trim() ? args.status.trim() : 'done';
  if (!CLOSE_STATUSES.has(status as TaskStatus)) {
    return errorResponse(['close status must be done or canceled']);
  }
  return runTaskUpdate({
    ...args,
    status,
  });
}
