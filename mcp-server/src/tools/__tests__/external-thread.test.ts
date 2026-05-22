import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'yaml';
import { runExternalThreadBind, runExternalThreadGet, runExternalThreadList } from '../external-thread.js';
import * as toolExports from '../index.js';

let previousAgenticosHome: string | undefined;
let home: string;

function parseResult(value: string): any {
  return JSON.parse(value);
}

function sidecarPath(): string {
  return join(home, '.agent-workspace', 'integrations', 'discord', 'thread-bindings.yaml');
}

async function writeRegistry(projects: Array<{ id: string; name: string; path: string }>): Promise<void> {
  await mkdir(join(home, '.agent-workspace'), { recursive: true });
  await writeFile(
    join(home, '.agent-workspace', 'registry.yaml'),
    yaml.stringify({
      version: '1.0.0',
      last_updated: '2026-05-22T00:00:00.000Z',
      active_project: null,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        path: project.path,
        status: 'active',
        created: '2026-05-22',
        last_accessed: '2026-05-22T00:00:00.000Z',
      })),
    }),
    'utf-8',
  );
}

async function seedProject(args: {
  id: string;
  name: string;
  contextPublicationPolicy?: 'local_private' | 'public_distilled';
}): Promise<string> {
  const projectPath = join(home, 'projects', args.id);
  const publicDistilled = args.contextPublicationPolicy === 'public_distilled';
  await mkdir(join(projectPath, '.context'), { recursive: true });
  await mkdir(join(projectPath, 'knowledge'), { recursive: true });
  const projectYaml: any = {
    meta: {
      id: args.id,
      name: args.name,
      created: '2026-05-22',
      version: '1.0.0',
    },
    source_control: publicDistilled
      ? {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
          github_repo: `madlouse/${args.id}`,
          branch_strategy: 'github_flow',
        }
      : {
          topology: 'local_directory_only',
          context_publication_policy: 'local_private',
        },
    ...(publicDistilled ? { execution: { source_repo_roots: ['.'] } } : {}),
    agent_context: {
      quick_start: '.context/quick-start.md',
      current_state: '.context/state.yaml',
      conversations: '.context/conversations/',
      knowledge: 'knowledge/',
      tasks: 'tasks/',
      artifacts: 'artifacts/',
    },
  };
  await writeFile(join(projectPath, '.project.yaml'), yaml.stringify(projectYaml), 'utf-8');
  await writeFile(join(projectPath, '.context', 'state.yaml'), 'state: preserved\n', 'utf-8');
  await writeFile(join(projectPath, '.context', 'quick-start.md'), '# preserved\n', 'utf-8');
  await writeFile(join(projectPath, 'knowledge', 'note.md'), '# knowledge\n', 'utf-8');
  return projectPath;
}

async function snapshotProjectFiles(projectPath: string): Promise<Record<string, string>> {
  const paths = [
    '.project.yaml',
    '.context/state.yaml',
    '.context/quick-start.md',
    'knowledge/note.md',
  ];
  const entries = await Promise.all(
    paths.map(async (relativePath) => [relativePath, await readFile(join(projectPath, relativePath), 'utf-8')] as const),
  );
  return Object.fromEntries(entries);
}

beforeEach(async () => {
  previousAgenticosHome = process.env.AGENTICOS_HOME;
  home = await mkdtemp(join(tmpdir(), 'agenticos-external-thread-'));
  process.env.AGENTICOS_HOME = home;
});

afterEach(async () => {
  if (previousAgenticosHome === undefined) {
    delete process.env.AGENTICOS_HOME;
  } else {
    process.env.AGENTICOS_HOME = previousAgenticosHome;
  }
  await rm(home, { recursive: true, force: true });
});

describe('AgenticOS external thread bindings', () => {
  it('exports external thread tools from the public tools barrel', () => {
    expect(toolExports.runExternalThreadBind).toBe(runExternalThreadBind);
    expect(toolExports.runExternalThreadGet).toBe(runExternalThreadGet);
    expect(toolExports.runExternalThreadList).toBe(runExternalThreadList);
  });

  it('binds, gets, and lists a Discord thread without changing public project files', async () => {
    const projectPath = await seedProject({
      id: 'agenticos',
      name: 'AgenticOS',
      contextPublicationPolicy: 'public_distilled',
    });
    await writeRegistry([{ id: 'agenticos', name: 'AgenticOS', path: projectPath }]);
    const before = await snapshotProjectFiles(projectPath);

    const bind = parseResult(await runExternalThreadBind({
      project: 'agenticos',
      provider: 'discord',
      guild_id: 'guild_123',
      channel_id: 'channel_456',
      thread_id: 'thread_789',
      thread_url: 'https://discord.com/channels/guild_123/channel_456/thread_789',
      default_backend: 'codex',
    }));

    expect(bind.status).toBe('BOUND');
    expect(bind.created).toBe(true);
    expect(bind.updated).toBe(false);
    expect(bind.binding).toMatchObject({
      project_id: 'agenticos',
      project_name: 'AgenticOS',
      provider: 'discord',
      guild_id: 'guild_123',
      channel_id: 'channel_456',
      thread_id: 'thread_789',
      default_backend: 'codex',
    });
    expect(bind.storage.private_sidecar).toBe(sidecarPath());
    expect(await snapshotProjectFiles(projectPath)).toEqual(before);

    const sidecar = await readFile(sidecarPath(), 'utf-8');
    expect(sidecar).toContain('thread_789');
    expect(sidecar).not.toContain('.project.yaml');

    const get = parseResult(await runExternalThreadGet({
      project: 'AgenticOS',
      guild_id: 'guild_123',
      channel_id: 'channel_456',
    }));
    expect(get.status).toBe('FOUND');
    expect(get.binding.thread_id).toBe('thread_789');

    const list = parseResult(await runExternalThreadList({ provider: 'discord' }));
    expect(list.status).toBe('OK');
    expect(list.count).toBe(1);
    expect(list.bindings[0].project_id).toBe('agenticos');
  });

  it('is idempotent for identical binds and updates changed thread metadata', async () => {
    const projectPath = await seedProject({ id: 't5t', name: 'T5T' });
    await writeRegistry([{ id: 't5t', name: 'T5T', path: projectPath }]);

    const first = parseResult(await runExternalThreadBind({
      project: 't5t',
      channel_id: 'channel',
      thread_id: 'thread',
    }));
    const firstSidecar = await readFile(sidecarPath(), 'utf-8');
    const second = parseResult(await runExternalThreadBind({
      project: 't5t',
      channel_id: 'channel',
      thread_id: 'thread',
    }));
    const secondSidecar = await readFile(sidecarPath(), 'utf-8');

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.updated).toBe(false);
    expect(secondSidecar).toBe(firstSidecar);

    const updated = parseResult(await runExternalThreadBind({
      project: 't5t',
      channel_id: 'channel',
      thread_id: 'thread_next',
      default_backend: 'claude_code',
    }));
    expect(updated.created).toBe(false);
    expect(updated.updated).toBe(true);
    expect(updated.binding.created_at).toBe(first.binding.created_at);
    expect(updated.binding.thread_id).toBe('thread_next');
    expect(updated.binding.default_backend).toBe('claude_code');
  });

  it('returns NOT_FOUND for missing or filter-mismatched bindings', async () => {
    const projectPath = await seedProject({ id: 'agenticos', name: 'AgenticOS' });
    await writeRegistry([{ id: 'agenticos', name: 'AgenticOS', path: projectPath }]);

    const missing = parseResult(await runExternalThreadGet({ project: 'agenticos' }));
    expect(missing.status).toBe('NOT_FOUND');
    expect(missing.binding).toBeNull();

    await runExternalThreadBind({
      project: 'agenticos',
      guild_id: 'guild',
      channel_id: 'channel',
      thread_id: 'thread',
    });
    const mismatched = parseResult(await runExternalThreadGet({
      project: 'agenticos',
      guild_id: 'other_guild',
    }));
    expect(mismatched.status).toBe('NOT_FOUND');
  });

  it('lists bindings globally or for one project', async () => {
    const firstPath = await seedProject({ id: 'agenticos', name: 'AgenticOS' });
    const secondPath = await seedProject({ id: 't5t', name: 'T5T' });
    await writeRegistry([
      { id: 'agenticos', name: 'AgenticOS', path: firstPath },
      { id: 't5t', name: 'T5T', path: secondPath },
    ]);

    await runExternalThreadBind({ project: 'agenticos', channel_id: 'channel_a', thread_id: 'thread_a' });
    await runExternalThreadBind({ project: 't5t', channel_id: 'channel_b', thread_id: 'thread_b' });

    const all = parseResult(await runExternalThreadList({}));
    expect(all.count).toBe(2);

    const filtered = parseResult(await runExternalThreadList({ project: 'T5T' }));
    expect(filtered.count).toBe(1);
    expect(filtered.bindings[0].project_id).toBe('t5t');
  });

  it('fails closed for unsupported providers and unsafe ids or urls', async () => {
    const projectPath = await seedProject({ id: 'agenticos', name: 'AgenticOS' });
    await writeRegistry([{ id: 'agenticos', name: 'AgenticOS', path: projectPath }]);

    const nonStringProject = parseResult(await runExternalThreadBind({
      project: 123,
      channel_id: 'channel',
      thread_id: 'thread',
    }));
    expect(nonStringProject.status).toBe('ERROR');
    expect(nonStringProject.error).toContain('project must be a non-empty string');

    const blankChannel = parseResult(await runExternalThreadBind({
      project: 'agenticos',
      channel_id: '   ',
      thread_id: 'thread',
    }));
    expect(blankChannel.status).toBe('ERROR');
    expect(blankChannel.error).toContain('channel_id must be a non-empty string');

    const feishu = parseResult(await runExternalThreadBind({
      project: 'agenticos',
      provider: 'feishu',
      channel_id: 'channel',
      thread_id: 'thread',
    }));
    expect(feishu.status).toBe('ERROR');
    expect(feishu.code).toBe('UNSUPPORTED_PROVIDER');

    const pathId = parseResult(await runExternalThreadBind({
      project: 'agenticos',
      channel_id: '../channel',
      thread_id: 'thread',
    }));
    expect(pathId.status).toBe('ERROR');
    expect(pathId.error).toContain('opaque Discord id');

    const urlId = parseResult(await runExternalThreadBind({
      project: 'agenticos',
      channel_id: 'https://discord.com/channels/a/b',
      thread_id: 'thread',
    }));
    expect(urlId.status).toBe('ERROR');
    expect(urlId.error).toContain('opaque Discord id');

    const control = parseResult(await runExternalThreadGet({
      project: 'agenticos',
      guild_id: 'guild\nid',
    }));
    expect(control.status).toBe('ERROR');
    expect(control.error).toContain('control characters');

    const symbolId = parseResult(await runExternalThreadBind({
      project: 'agenticos',
      channel_id: 'channel',
      thread_id: 'thread!',
    }));
    expect(symbolId.status).toBe('ERROR');
    expect(symbolId.error).toContain('letters, numbers');

    const malformedUrl = parseResult(await runExternalThreadBind({
      project: 'agenticos',
      channel_id: 'channel',
      thread_id: 'thread',
      thread_url: 'not a url',
    }));
    expect(malformedUrl.status).toBe('ERROR');
    expect(malformedUrl.error).toContain('valid http');

    const badUrl = parseResult(await runExternalThreadBind({
      project: 'agenticos',
      channel_id: 'channel',
      thread_id: 'thread',
      thread_url: 'ftp://discord.com/channels/a/b',
    }));
    expect(badUrl.status).toBe('ERROR');
    expect(badUrl.error).toContain('http');

    const authorityUrl = parseResult(await runExternalThreadBind({
      project: 'agenticos',
      channel_id: 'channel',
      thread_id: 'thread',
      thread_url: 'https://user:pass@discord.com/channels/a/b',
    }));
    expect(authorityUrl.status).toBe('ERROR');
    expect(authorityUrl.error).toContain('username');

    const backend = parseResult(await runExternalThreadBind({
      project: 'agenticos',
      channel_id: 'channel',
      thread_id: 'thread',
      default_backend: 'gemini',
    }));
    expect(backend.status).toBe('ERROR');
    expect(backend.error).toContain('default_backend');

    const unknownProject = parseResult(await runExternalThreadGet({ project: 'missing' }));
    expect(unknownProject.status).toBe('ERROR');
    expect(unknownProject.code).toBe('UNKNOWN');

    const unknownProjectList = parseResult(await runExternalThreadList({ project: 'missing' }));
    expect(unknownProjectList.status).toBe('ERROR');
    expect(unknownProjectList.code).toBe('UNKNOWN');
  });

  it('treats an empty or malformed sidecar as an empty binding store', async () => {
    const projectPath = await seedProject({ id: 'agenticos', name: 'AgenticOS' });
    await writeRegistry([{ id: 'agenticos', name: 'AgenticOS', path: projectPath }]);
    await mkdir(join(home, '.agent-workspace', 'integrations', 'discord'), { recursive: true });
    await writeFile(sidecarPath(), '', 'utf-8');

    const emptyList = parseResult(await runExternalThreadList({}));
    expect(emptyList.status).toBe('OK');
    expect(emptyList.count).toBe(0);

    await writeFile(
      sidecarPath(),
      yaml.stringify({ version: 1, updated_at: false, bindings: { project_id: 'agenticos' } }),
      'utf-8',
    );

    const malformedList = parseResult(await runExternalThreadList({}));
    expect(malformedList.status).toBe('OK');
    expect(malformedList.count).toBe(0);
  });
});
