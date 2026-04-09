import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'yaml';
import { refreshEntrySurfaces } from '../entry-surface-refresh.js';
import { runEntrySurfaceRefresh } from '../../tools/entry-surface-refresh.js';

async function setupProjectRoot(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'agenticos-entry-refresh-'));
  await mkdir(join(projectRoot, '.context'), { recursive: true });
  return projectRoot;
}

describe('entry surface refresh', () => {
  afterEach(() => {
    delete process.env.AGENTICOS_HOME;
  });

  it('refreshes quick-start and state deterministically from structured merged-work inputs', async () => {
    const projectRoot = await setupProjectRoot();
    await writeFile(
      join(projectRoot, '.project.yaml'),
      yaml.stringify({
        meta: {
          name: 'Standards',
          description: 'Canonical standards area inside AgenticOS.',
        },
      }),
      'utf-8',
    );
    await writeFile(
      join(projectRoot, '.context', 'state.yaml'),
      yaml.stringify({
        session: { id: 'session-1', started: '2026-03-24T00:00:00.000Z', agent: 'codex' },
        guardrail_evidence: { last_command: 'agenticos_preflight' },
      }),
      'utf-8',
    );

    const result = await refreshEntrySurfaces({
      project_path: projectRoot,
      issue_id: '99',
      summary: 'Defined deterministic entry-surface refresh automation.',
      status: 'active',
      current_focus: 'Implement the next health command issue',
      current_task_status: 'pending',
      facts: ['Entry surfaces now refresh from structured merge results'],
      decisions: ['Avoid freeform AI summarization for live entry surfaces'],
      pending: ['Implement #97'],
      report_paths: [
        'knowledge/canonical-sync-contract-2026-03-25.md',
        'knowledge/entry-surface-refresh-design-2026-03-25.md',
        'knowledge/entry-surface-refresh-design-2026-03-25.md',
      ],
      recommended_entry_documents: [
        'knowledge/canonical-sync-contract-2026-03-25.md',
        'knowledge/canonical-sync-implementation-report-2026-03-25.md',
      ],
    });

    expect(result.status).toBe('REFRESHED');
    expect(result.project_name).toBe('Standards');
    expect(result.issue_id).toBe('99');
    expect(result.report_paths).toEqual([
      'knowledge/canonical-sync-contract-2026-03-25.md',
      'knowledge/entry-surface-refresh-design-2026-03-25.md',
      'knowledge/entry-surface-refresh-design-2026-03-25.md',
    ]);

    const quickStart = await readFile(join(projectRoot, '.context', 'quick-start.md'), 'utf-8');
    expect(quickStart).toContain('# Standards - Quick Start');
    expect(quickStart).toContain('Canonical standards area inside AgenticOS.');
    expect(quickStart).toContain('Issue #99 merged');
    expect(quickStart).toContain('Implement #97');
    expect(quickStart).toContain('knowledge/entry-surface-refresh-design-2026-03-25.md');
    expect(quickStart).toContain('## Recommended Entry Documents');

    const state = yaml.parse(await readFile(join(projectRoot, '.context', 'state.yaml'), 'utf-8')) as any;
    expect(state.session.id).toBe('session-1');
    expect(state.session.started).toBe('2026-03-24T00:00:00.000Z');
    expect(state.session.agent).toBe('codex');
    expect(state.current_task.title).toBe('Implement the next health command issue');
    expect(state.current_task.status).toBe('pending');
    expect(state.current_task.next_step).toBe('Implement #97');
    expect(state.working_memory.facts).toEqual(['Entry surfaces now refresh from structured merge results']);
    expect(state.working_memory.decisions).toEqual(['Avoid freeform AI summarization for live entry surfaces']);
    expect(state.working_memory.pending).toEqual(['Implement #97']);
    expect(state.loaded_context).toEqual([
      '.project.yaml',
      '.context/quick-start.md',
      'knowledge/canonical-sync-contract-2026-03-25.md',
      'knowledge/entry-surface-refresh-design-2026-03-25.md',
      'knowledge/canonical-sync-implementation-report-2026-03-25.md',
    ]);
    expect(state.entry_surface_refresh.issue_id).toBe('99');
    expect(state.guardrail_evidence.last_command).toBe('agenticos_preflight');
  });

  it('falls back to basename and summary when project metadata is missing and list fields are absent', async () => {
    const projectRoot = await setupProjectRoot();
    await writeFile(join(projectRoot, '.context', 'state.yaml'), 'null', 'utf-8');

    const result = await refreshEntrySurfaces({
      project_path: projectRoot,
      summary: 'Refresh fallback summary',
      status: 'implemented',
      current_focus: 'Review remaining entry surfaces',
    });

    expect(result.project_name).toBe(projectRoot.split('/').pop());
    expect(result.issue_id).toBeNull();
    expect(result.recommended_entry_documents).toEqual([]);

    const quickStart = await readFile(join(projectRoot, '.context', 'quick-start.md'), 'utf-8');
    expect(quickStart).toContain('Refresh fallback summary');
    expect(quickStart).toContain('- No key facts recorded');

    const state = yaml.parse(await readFile(join(projectRoot, '.context', 'state.yaml'), 'utf-8')) as any;
    expect(state.session.id).toContain('entry-refresh-');
    expect(state.session.agent).toBe('agenticos-entry-refresh');
    expect(state.current_task.title).toBe('Review remaining entry surfaces');
    expect(state.current_task.status).toBe('pending');
    expect(state.current_task.next_step).toBe('Review remaining entry surfaces');
    expect(state.working_memory.facts).toEqual([]);
    expect(state.loaded_context).toEqual(['.project.yaml', '.context/quick-start.md']);
  });

  it('prefers explicit project identity overrides and filters non-string list values', async () => {
    const projectRoot = await setupProjectRoot();
    await writeFile(
      join(projectRoot, '.project.yaml'),
      yaml.stringify({
        meta: {
          name: 'Yaml Name',
          description: 'Yaml Description',
        },
      }),
      'utf-8',
    );

    await refreshEntrySurfaces({
      project_path: projectRoot,
      project_name: 'Override Name',
      project_description: 'Override Description',
      summary: 'Override refresh',
      status: 'active',
      current_focus: 'Ship the override path',
      current_task_title: 'Custom task title',
      current_task_status: 'implemented',
      facts: ['kept fact', 42 as any, '  trimmed fact  ' as any],
      decisions: ['decision one'],
      pending: ['pending one'],
      report_paths: ['knowledge/report-one.md', '' as any, 7 as any],
      recommended_entry_documents: ['knowledge/doc-one.md'],
    });

    const quickStart = await readFile(join(projectRoot, '.context', 'quick-start.md'), 'utf-8');
    expect(quickStart).toContain('# Override Name - Quick Start');
    expect(quickStart).toContain('Override Description');

    const state = yaml.parse(await readFile(join(projectRoot, '.context', 'state.yaml'), 'utf-8')) as any;
    expect(state.current_task.title).toBe('Custom task title');
    expect(state.current_task.status).toBe('implemented');
    expect(state.working_memory.facts).toEqual(['kept fact', 'trimmed fact']);
    expect(state.loaded_context).toEqual([
      '.project.yaml',
      '.context/quick-start.md',
      'knowledge/report-one.md',
      'knowledge/doc-one.md',
    ]);
  });

  it('writes to configured canonical context paths when project agent_context overrides root defaults', async () => {
    const projectRoot = await setupProjectRoot();
    await mkdir(join(projectRoot, 'standards', '.context'), { recursive: true });
    await writeFile(
      join(projectRoot, '.project.yaml'),
      yaml.stringify({
        meta: {
          name: 'AgenticOS',
          description: 'Self-hosting AgenticOS product project.',
        },
        agent_context: {
          quick_start: 'standards/.context/quick-start.md',
          current_state: 'standards/.context/state.yaml',
          conversations: 'standards/.context/conversations/',
          knowledge: 'knowledge/',
          tasks: 'tasks/',
          artifacts: 'artifacts/',
        },
      }),
      'utf-8',
    );
    await writeFile(join(projectRoot, 'standards', '.context', 'state.yaml'), yaml.stringify({}), 'utf-8');

    const result = await refreshEntrySurfaces({
      project_path: projectRoot,
      summary: 'Aligned self-hosting canonical context paths.',
      status: 'aligned',
      current_focus: 'Use standards/.context as canonical state',
    });

    expect(result.quick_start_path).toContain('standards/.context/quick-start.md');
    expect(result.state_path).toContain('standards/.context/state.yaml');

    const quickStart = await readFile(join(projectRoot, 'standards', '.context', 'quick-start.md'), 'utf-8');
    expect(quickStart).toContain('`standards/.context/state.yaml`');
    expect(quickStart).toContain('`standards/.context/conversations/`');

    const state = yaml.parse(await readFile(join(projectRoot, 'standards', '.context', 'state.yaml'), 'utf-8')) as any;
    expect(state.loaded_context).toEqual(['.project.yaml', 'standards/.context/quick-start.md']);
  });

  it('falls back to basename inside the readable project-yaml path when metadata fields are empty', async () => {
    const projectRoot = await setupProjectRoot();
    await writeFile(join(projectRoot, '.project.yaml'), yaml.stringify({ meta: {} }), 'utf-8');

    await refreshEntrySurfaces({
      project_path: projectRoot,
      summary: 'Readable yaml fallback summary',
      status: 'active',
      current_focus: 'Use basename fallback',
    });

    const quickStart = await readFile(join(projectRoot, '.context', 'quick-start.md'), 'utf-8');
    expect(quickStart).toContain(`# ${projectRoot.split('/').pop()} - Quick Start`);
    expect(quickStart).toContain('Readable yaml fallback summary');
  });

  it('returns structured JSON through the tool wrapper and validates required fields', async () => {
    const projectRoot = await setupProjectRoot();

    const result = JSON.parse(await runEntrySurfaceRefresh({
      project_path: projectRoot,
      project_name: 'Wrapper Project',
      summary: 'Wrapper refresh',
      status: 'active',
      current_focus: 'Do the next thing',
      pending: ['Do the next thing'],
    })) as {
      status: string;
      project_name: string;
      quick_start_path: string;
    };

    expect(result.status).toBe('REFRESHED');
    expect(result.project_name).toBe('Wrapper Project');
    expect(result.quick_start_path).toContain('.context/quick-start.md');

    await expect(() => runEntrySurfaceRefresh(undefined)).rejects.toThrow('project_path is required.');

    await expect(() => refreshEntrySurfaces({
      project_path: '',
      summary: 'bad',
      status: 'active',
      current_focus: 'focus',
    } as any)).rejects.toThrow('project_path is required.');

    await expect(() => refreshEntrySurfaces({
      project_path: projectRoot,
      summary: '',
      status: 'active',
      current_focus: 'focus',
    })).rejects.toThrow('summary is required.');

    await expect(() => refreshEntrySurfaces({
      project_path: projectRoot,
      summary: 'ok',
      status: '',
      current_focus: 'focus',
    })).rejects.toThrow('status is required.');

    await expect(() => refreshEntrySurfaces({
      project_path: projectRoot,
      summary: 'ok',
      status: 'active',
      current_focus: '',
    })).rejects.toThrow('current_focus is required.');
  });
});
