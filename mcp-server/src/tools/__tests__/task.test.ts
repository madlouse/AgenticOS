import { beforeEach, describe, expect, it, vi } from 'vitest';
import yaml from 'yaml';

const fsMock = vi.hoisted(() => ({
  files: new Map<string, string>(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  writeFile: vi.fn(),
}));
const projectTargetMock = vi.hoisted(() => ({
  resolveManagedProjectTarget: vi.fn(),
  resolveManagedProjectContextPaths: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  mkdir: fsMock.mkdir,
  readFile: fsMock.readFile,
  readdir: fsMock.readdir,
  writeFile: fsMock.writeFile,
}));

vi.mock('../../utils/project-target.js', () => ({
  resolveManagedProjectTarget: projectTargetMock.resolveManagedProjectTarget,
  resolveManagedProjectContextPaths: projectTargetMock.resolveManagedProjectContextPaths,
}));

import { runTaskClose, runTaskCreate, runTaskList, runTaskUpdate } from '../task.js';

const projectPath = '/workspace/projects/topic';
const tasksDir = `${projectPath}/tasks`;
const statePath = `${projectPath}/.context/state.yaml`;

function parseResult(value: string): any {
  return JSON.parse(value);
}

function parseYamlFile(path: string): any {
  return yaml.parse(fsMock.files.get(path) || '{}');
}

function seedTask(task: any): void {
  fsMock.files.set(`${tasksDir}/${task.id}.yaml`, yaml.stringify(task));
}

beforeEach(() => {
  vi.clearAllMocks();
  fsMock.files.clear();
  projectTargetMock.resolveManagedProjectTarget.mockResolvedValue({
    projectId: 'topic',
    projectName: 'Topic',
    projectPath,
    projectYaml: {
      meta: { id: 'topic', name: 'Topic' },
      source_control: { topology: 'local_directory_only' },
    },
    statePath,
  });
  projectTargetMock.resolveManagedProjectContextPaths.mockReturnValue({
    tasksDir,
  });
  fsMock.mkdir.mockResolvedValue(undefined);
  fsMock.readFile.mockImplementation(async (path: string) => {
    if (!fsMock.files.has(path)) {
      throw new Error(`ENOENT: ${path}`);
    }
    return fsMock.files.get(path);
  });
  fsMock.readdir.mockImplementation(async (path: string) => {
    if (path !== tasksDir) {
      throw new Error(`ENOENT: ${path}`);
    }
    return [...fsMock.files.keys()]
      .filter((filePath) => filePath.startsWith(`${tasksDir}/`))
      .map((filePath) => filePath.slice(`${tasksDir}/`.length));
  });
  fsMock.writeFile.mockImplementation(async (path: string, content: string) => {
    fsMock.files.set(path, content);
  });
});

describe('AgenticOS task MCP API', () => {
  it('creates a task file and resume state with default project kind', async () => {
    const result = parseResult(await runTaskCreate({
      title: 'Research sleep routine',
      acceptance_criteria: ['Capture the next experiment'],
      source: { kind: 'hermes', origin: 'chat', dedupe_key: 'sleep-routine' },
      refs: [{ type: 'gbrain', uri: 'gbrain://topic/sleep', visibility: 'private' }],
    }));

    expect(result.status).toBe('CREATED');
    expect(result.project_kind).toBe('project');
    expect(result.task.id).toBe('research-sleep-routine');
    expect(result.task_path).toBe(`${tasksDir}/research-sleep-routine.yaml`);
    expect(fsMock.mkdir).toHaveBeenCalledWith(tasksDir, { recursive: true });
    expect(fsMock.mkdir).toHaveBeenCalledWith(`${projectPath}/.context`, { recursive: true });
    expect(parseYamlFile(`${tasksDir}/research-sleep-routine.yaml`).source.kind).toBe('hermes');
    expect(parseYamlFile(statePath).resume.task_id).toBe('research-sleep-routine');
    expect(parseYamlFile(statePath).current_task).toBeUndefined();
  });

  it('creates an in-progress topic task and synchronizes current_task', async () => {
    projectTargetMock.resolveManagedProjectTarget.mockResolvedValueOnce({
      projectId: 'topic',
      projectName: 'Topic',
      projectPath,
      projectYaml: { agenticos: { project_kind: 'topic' } },
      statePath,
    });

    const result = parseResult(await runTaskCreate({
      id: '#Sleep/Plan',
      title: 'Sleep Plan',
      status: 'in_progress',
      priority: 'high',
      acceptance_criteria: ['Pick the next experiment'],
      source: { kind: 'codex', origin: 'mcp' },
      labels: ['personal'],
    }));

    expect(result.status).toBe('CREATED');
    expect(result.project_kind).toBe('topic');
    expect(result.task.id).toBe('sleep-plan');
    expect(result.task.priority).toBe('high');
    expect(parseYamlFile(statePath).current_task).toMatchObject({
      id: 'sleep-plan',
      title: 'Sleep Plan',
      status: 'in_progress',
      next_step: 'Pick the next experiment',
    });
  });

  it('returns an existing duplicate task without overwriting it', async () => {
    const existing = {
      id: 'sleep-plan',
      title: 'Sleep Plan',
      status: 'open',
      priority: 'medium',
      source: { kind: 'hermes', origin: 'chat', dedupe_key: 'same-key' },
      acceptance_criteria: ['Existing criterion'],
      refs: [],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    seedTask(existing);

    const result = parseResult(await runTaskCreate({
      title: 'Different title',
      acceptance_criteria: ['New criterion'],
      source: { kind: 'hermes', origin: 'chat', dedupe_key: 'same-key' },
    }));

    expect(result.status).toBe('EXISTING');
    expect(result.duplicate).toBe(true);
    expect(result.task.title).toBe('Sleep Plan');
    expect(parseYamlFile(`${tasksDir}/sleep-plan.yaml`).acceptance_criteria).toEqual(['Existing criterion']);
  });

  it('rejects invalid create payloads and secret-looking input', async () => {
    const missingCriteria = parseResult(await runTaskCreate({ title: 'No criteria' }));
    expect(missingCriteria.status).toBe('ERROR');
    expect(missingCriteria.errors.join(' ')).toContain('acceptance_criteria');

    const secret = parseResult(await runTaskCreate({
      title: 'Store token=abc123',
      acceptance_criteria: ['Persist safely'],
    }));
    expect(secret.status).toBe('ERROR');
    expect(secret.errors.join(' ')).toContain('secret');

    const secretId = parseResult(await runTaskCreate({
      id: 'token=abc123',
      title: 'Safe title',
      acceptance_criteria: ['Persist safely'],
    }));
    expect(secretId.status).toBe('ERROR');
    expect(secretId.errors.join(' ')).toContain('secret');
  });

  it('rejects invalid source, refs, status, priority, labels, and blocked tasks without a reason', async () => {
    const result = parseResult(await runTaskCreate({
      title: 'Bad task',
      status: 'waiting',
      priority: 'later',
      source: { kind: 'robot', origin: 'unknown' },
      refs: [{ type: 'note' }, 'bad-ref'],
      labels: ['ok', 3],
      acceptance_criteria: ['Check it'],
    }));

    expect(result.status).toBe('ERROR');
    expect(result.errors.join(' ')).toContain('status');
    expect(result.errors.join(' ')).toContain('priority');
    expect(result.errors.join(' ')).toContain('source.kind');
    expect(result.errors.join(' ')).toContain('source.origin');
    expect(result.errors.join(' ')).toContain('refs entries');
    expect(result.errors.join(' ')).toContain('labels');

    const blocked = parseResult(await runTaskCreate({
      title: 'Blocked task',
      status: 'blocked',
      acceptance_criteria: ['Needs input'],
    }));
    expect(blocked.status).toBe('ERROR');
    expect(blocked.errors.join(' ')).toContain('blocked_reason');
  });

  it('updates a task and refreshes current state', async () => {
    seedTask({
      id: 'sleep-plan',
      title: 'Sleep Plan',
      status: 'open',
      priority: 'medium',
      source: { kind: 'manual', origin: 'manual' },
      acceptance_criteria: ['Old'],
      refs: [],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });

    const result = parseResult(await runTaskUpdate({
      task_id: 'sleep-plan',
      title: 'Sleep Plan v2',
      status: 'in_progress',
      priority: 'urgent',
      acceptance_criteria: ['New step'],
      refs: [{ type: 'knowledge', uri: 'knowledge/sleep.md', title: 'Sleep', visibility: 'public' }],
      description: 'Short context',
      labels: ['health'],
    }));

    expect(result.status).toBe('UPDATED');
    expect(result.task.title).toBe('Sleep Plan v2');
    expect(result.task.priority).toBe('urgent');
    expect(parseYamlFile(statePath).current_task.title).toBe('Sleep Plan v2');
    expect(parseYamlFile(`${tasksDir}/sleep-plan.yaml`).refs[0].uri).toBe('knowledge/sleep.md');
  });

  it('rejects invalid updates and missing task ids', async () => {
    const missingId = parseResult(await runTaskUpdate({}));
    expect(missingId.status).toBe('ERROR');
    expect(missingId.errors.join(' ')).toContain('task_id');

    const missingTask = parseResult(await runTaskUpdate({ task_id: 'missing' }));
    expect(missingTask.status).toBe('ERROR');
    expect(missingTask.errors.join(' ')).toContain('not found');

    seedTask({
      id: 'sleep-plan',
      title: 'Sleep Plan',
      status: 'open',
      priority: 'medium',
      source: { kind: 'manual', origin: 'manual' },
      acceptance_criteria: ['Old'],
      refs: [],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    const invalid = parseResult(await runTaskUpdate({
      task_id: 'sleep-plan',
      title: '',
      status: 'blocked',
      priority: 'later',
      acceptance_criteria: [],
      source: { kind: 'bad', origin: 'bad' },
      refs: { uri: 'nope' },
      description: '',
      labels: [],
    }));

    expect(invalid.status).toBe('ERROR');
    expect(invalid.errors.join(' ')).toContain('title');
    expect(invalid.errors.join(' ')).toContain('priority');
    expect(invalid.errors.join(' ')).toContain('blocked_reason');
    expect(invalid.errors.join(' ')).toContain('refs');
  });

  it('lists tasks and filters by status', async () => {
    seedTask({
      id: 'a-open',
      title: 'A',
      status: 'open',
      priority: 'medium',
      source: { kind: 'manual', origin: 'manual' },
      acceptance_criteria: ['A'],
      refs: [],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    seedTask({
      id: 'b-done',
      title: 'B',
      status: 'done',
      priority: 'medium',
      source: { kind: 'manual', origin: 'manual' },
      acceptance_criteria: ['B'],
      refs: [],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      closed_at: '2026-01-02T00:00:00.000Z',
    });
    fsMock.files.set(`${tasksDir}/ignored.txt`, 'ignore');

    const all = parseResult(await runTaskList({}));
    expect(all.status).toBe('OK');
    expect(all.count).toBe(2);

    const open = parseResult(await runTaskList({ status: 'open' }));
    expect(open.count).toBe(1);
    expect(open.tasks[0].id).toBe('a-open');

    const invalid = parseResult(await runTaskList({ status: 'waiting' }));
    expect(invalid.status).toBe('ERROR');
  });

  it('closes a task and clears matching current and resume state', async () => {
    seedTask({
      id: 'sleep-plan',
      title: 'Sleep Plan',
      status: 'in_progress',
      priority: 'medium',
      source: { kind: 'manual', origin: 'manual' },
      acceptance_criteria: ['Finish'],
      refs: [],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    fsMock.files.set(statePath, yaml.stringify({
      current_task: { id: 'sleep-plan', title: 'Sleep Plan', status: 'in_progress' },
      resume: { task_id: 'sleep-plan' },
    }));

    const result = parseResult(await runTaskClose({ task_id: 'sleep-plan' }));

    expect(result.status).toBe('UPDATED');
    expect(result.task.status).toBe('done');
    expect(result.task.closed_at).toBeTruthy();
    expect(parseYamlFile(statePath).current_task).toBeNull();
    expect(parseYamlFile(statePath).resume).toBeUndefined();

    const invalid = parseResult(await runTaskClose({ task_id: 'sleep-plan', status: 'open' }));
    expect(invalid.status).toBe('ERROR');
  });

  it('returns structured errors for project resolution and invalid project_kind', async () => {
    projectTargetMock.resolveManagedProjectTarget.mockRejectedValueOnce(new Error('No project provided'));
    expect(parseResult(await runTaskList({})).errors[0]).toContain('No project provided');

    projectTargetMock.resolveManagedProjectTarget.mockResolvedValueOnce({
      projectId: 'topic',
      projectName: 'Topic',
      projectPath,
      projectYaml: { agenticos: { project_kind: 'workflow' } },
      statePath,
    });
    const invalidKind = parseResult(await runTaskCreate({
      title: 'Task',
      acceptance_criteria: ['Do it'],
    }));
    expect(invalidKind.status).toBe('ERROR');
    expect(invalidKind.errors[0]).toContain('agenticos.project_kind');
  });
});
