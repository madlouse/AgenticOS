import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'yaml';
import { spawnMcpServer, type McpSession } from './fixtures/mcp-session.js';

interface TaskToolResult {
  status: string;
  project_id?: string;
  project_kind?: 'topic' | 'project';
  task_path?: string;
  state_path?: string;
  duplicate?: boolean;
  errors?: string[];
  task?: {
    id: string;
    title: string;
    status: string;
    priority: string;
    closed_at?: string;
  };
}

function toolText(result: { content: Array<{ type: string; text: string }> }): string {
  expect(result.content).toHaveLength(1);
  expect(result.content[0]).toMatchObject({ type: 'text' });
  return result.content[0].text;
}

function readYamlFile(path: string): any {
  return yaml.parse(readFileSync(path, 'utf-8'));
}

describe('durable topic task MCP smoke flow', () => {
  let agenticosHome: string;
  let session: McpSession;

  beforeEach(async () => {
    agenticosHome = await mkdtemp(join(tmpdir(), 'agenticos-topic-smoke-'));
    session = spawnMcpServer([], {
      env: {
        AGENTICOS_HOME: agenticosHome,
      },
    });
    await session.sendInitialize({ name: 'durable-topic-smoke', version: '1.0.0' });
    session.sendInitializedNotification();
    const tools = await session.sendToolsList();
    expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      'agenticos_task_create',
      'agenticos_task_list',
      'agenticos_task_close',
    ]));
  }, 45000);

  afterEach(() => {
    session.kill();
    rmSync(agenticosHome, { recursive: true, force: true });
  });

  async function callText(name: string, args: Record<string, unknown> = {}): Promise<string> {
    return toolText(await session.sendToolCall(name, args));
  }

  async function callJson(name: string, args: Record<string, unknown> = {}): Promise<TaskToolResult> {
    return JSON.parse(await callText(name, args)) as TaskToolResult;
  }

  async function initProject(name: string, projectKind: 'topic' | 'project'): Promise<string> {
    const projectPath = join(agenticosHome, 'projects', name.toLowerCase().replace(/\s+/g, '-'));
    mkdirSync(projectPath, { recursive: true });
    const text = await callText('agenticos_init', {
      name,
      path: projectPath,
      project_kind: projectKind,
      topology: 'local_directory_only',
    });
    expect(text).toContain(`Project Kind: ${projectKind}`);
    return projectPath;
  }

  it('creates, deduplicates, and closes a Hermes-style durable topic task through MCP', async () => {
    const topicPath = await initProject('Hermes Sleep Topic', 'topic');

    const created = await callJson('agenticos_task_create', {
      project: 'hermes-sleep-topic',
      id: 'sleep-experiment',
      title: 'Sleep Experiment',
      status: 'in_progress',
      priority: 'high',
      source: {
        kind: 'hermes',
        origin: 'chat',
        source_id: 'hermes-message-1',
        dedupe_key: 'hermes:sleep:experiment',
      },
      acceptance_criteria: ['The next sleep experiment is captured as an actionable task'],
      refs: [{ type: 'gbrain', uri: 'gbrain://topics/sleep', visibility: 'private' }],
    });

    expect(created.status).toBe('CREATED');
    expect(created.project_kind).toBe('topic');
    expect(created.task).toMatchObject({
      id: 'sleep-experiment',
      title: 'Sleep Experiment',
      status: 'in_progress',
      priority: 'high',
    });
    expect(created.task_path).toBe(join(topicPath, 'tasks', 'sleep-experiment.yaml'));
    expect(readYamlFile(created.task_path!).source.kind).toBe('hermes');

    const stateAfterCreate = readYamlFile(join(topicPath, '.context', 'state.yaml'));
    expect(stateAfterCreate.current_task).toMatchObject({
      id: 'sleep-experiment',
      status: 'in_progress',
      next_step: 'The next sleep experiment is captured as an actionable task',
    });
    expect(stateAfterCreate.resume.task_id).toBe('sleep-experiment');

    const duplicate = await callJson('agenticos_task_create', {
      project: 'hermes-sleep-topic',
      title: 'Sleep Experiment, repeated prompt',
      source: {
        kind: 'hermes',
        origin: 'chat',
        dedupe_key: 'hermes:sleep:experiment',
      },
      acceptance_criteria: ['A repeated prompt must not create a second task'],
    });

    expect(duplicate.status).toBe('EXISTING');
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.task?.id).toBe('sleep-experiment');
    expect(readdirSync(join(topicPath, 'tasks')).filter((entry) => entry.endsWith('.yaml'))).toEqual(['sleep-experiment.yaml']);

    const closed = await callJson('agenticos_task_close', {
      project: 'hermes-sleep-topic',
      task_id: 'sleep-experiment',
    });

    expect(closed.status).toBe('UPDATED');
    expect(closed.task).toMatchObject({
      id: 'sleep-experiment',
      status: 'done',
    });
    expect(closed.task?.closed_at).toBeTruthy();
    expect(readYamlFile(join(topicPath, 'tasks', 'sleep-experiment.yaml')).status).toBe('done');

    const stateAfterClose = readYamlFile(join(topicPath, '.context', 'state.yaml'));
    expect(stateAfterClose.current_task).toBeNull();
    expect(stateAfterClose.resume).toBeUndefined();
  }, 45000);

  it('routes topic and project tasks by project_kind', async () => {
    const topicPath = await initProject('Hermes Finance Topic', 'topic');
    const projectPath = await initProject('Agentic CI API', 'project');

    const topicTask = await callJson('agenticos_task_create', {
      project: 'hermes-finance-topic',
      title: 'Review household budget',
      acceptance_criteria: ['Budget topic has an active follow-up task'],
    });
    expect(topicTask.status).toBe('CREATED');
    expect(topicTask.project_kind).toBe('topic');
    expect(topicTask.task_path).toBe(join(topicPath, 'tasks', 'review-household-budget.yaml'));

    const projectTask = await callJson('agenticos_task_create', {
      project: 'agentic-ci-api',
      title: 'Add CI retry policy',
      acceptance_criteria: ['Repository project has an implementation task'],
    });
    expect(projectTask.status).toBe('CREATED');
    expect(projectTask.project_kind).toBe('project');
    expect(projectTask.task_path).toBe(join(projectPath, 'tasks', 'add-ci-retry-policy.yaml'));
  }, 45000);

  it('does not claim success when project context is unavailable or secret-looking input is rejected', async () => {
    const noProject = await callJson('agenticos_task_create', {
      title: 'Create without project',
      acceptance_criteria: ['This must not be reported as success'],
    });
    expect(noProject.status).toBe('ERROR');
    expect(noProject.errors?.join(' ')).toContain('No project provided');
    expect(existsSync(join(agenticosHome, 'projects'))).toBe(false);

    const topicPath = await initProject('Hermes Secret Topic', 'topic');
    const failedSwitch = await callText('agenticos_switch', { project: 'missing-topic' });
    expect(failedSwitch).toContain('not found');

    const afterFailedSwitch = await callJson('agenticos_task_create', {
      title: 'Create after failed switch',
      acceptance_criteria: ['A failed switch must not bind context'],
    });
    expect(afterFailedSwitch.status).toBe('ERROR');
    expect(afterFailedSwitch.errors?.join(' ')).toContain('No project provided');

    const secret = await callJson('agenticos_task_create', {
      project: 'hermes-secret-topic',
      title: 'Store token=abc123',
      acceptance_criteria: ['Raw secret material must not be written'],
    });
    expect(secret.status).toBe('ERROR');
    expect(secret.errors?.join(' ')).toContain('secret');

    const taskFiles = readdirSync(join(topicPath, 'tasks')).filter((entry) => entry.endsWith('.yaml'));
    expect(taskFiles).toEqual([]);
  }, 45000);
});
