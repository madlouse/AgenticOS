import { mkdtemp, mkdir, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildCaseContextSection,
  ensureCaseKnowledgeDirectories,
  getCaseDirectoryName,
  getCaseTypeLabel,
  listCasesAcrossProjects,
  listCasesForProject,
  normalizeCaseFilterType,
  normalizeCaseType,
  parseCaseDocument,
  parseCaseTags,
  recordCaseKnowledge,
  renderCaseDocument,
  renderCaseListMarkdown,
  type CaseProjectTarget,
} from '../case-knowledge.js';

async function createProject(name: string, id: string): Promise<CaseProjectTarget> {
  const projectPath = await mkdtemp(join(tmpdir(), `agenticos-case-${id}-`));
  await mkdir(projectPath, { recursive: true });
  return {
    projectId: id,
    projectName: name,
    projectPath,
    projectYaml: {
      agent_context: {
        knowledge: 'knowledge/',
      },
    },
  };
}

describe('case-knowledge', () => {
  it('creates case directories and records collision-safe case files', async () => {
    const project = await createProject('Alpha Project', 'alpha');

    await ensureCaseKnowledgeDirectories(project.projectPath, project.projectYaml);

    const first = await recordCaseKnowledge(project, {
      type: 'corner',
      title: 'Retry Loop',
      trigger: 'Repeated git bootstrap',
      behavior: 'The agent retried the same failing command',
      tags: ['Git', 'Retry'],
      timestamp: '2026-04-14T10:00:00.000Z',
    });
    const second = await recordCaseKnowledge(project, {
      type: 'corner',
      title: 'Retry Loop',
      trigger: 'Repeated git bootstrap',
      behavior: 'The agent retried the same failing command',
      tags: ['Git', 'Retry'],
      timestamp: '2026-04-14T10:05:00.000Z',
    });
    const third = await recordCaseKnowledge(project, {
      type: 'corner',
      title: 'Retry Loop',
      trigger: 'Repeated git bootstrap',
      behavior: 'The agent retried the same failing command',
      tags: ['Git', 'Retry'],
      timestamp: '2026-04-14T10:10:00.000Z',
    });

    expect(first.relativePath).toBe('knowledge/corner-cases/2026-04-14-retry-loop.md');
    expect(second.relativePath).toBe('knowledge/corner-cases/2026-04-14-retry-loop-2.md');
    expect(third.relativePath).toBe('knowledge/corner-cases/2026-04-14-retry-loop-3.md');
    expect(getCaseTypeLabel('corner')).toBe('corner-case');
    expect(getCaseDirectoryName('bad')).toBe('bad-cases');

    const content = await readFile(first.filePath, 'utf-8');
    expect(content).toContain('# corner-case: Retry Loop');
    expect(content).toContain('## Root Cause\n(not provided)');
    expect(content).toContain('## Tags\ncorner-case, git, retry');

    const parsed = parseCaseDocument(content, project, first.filePath);
    expect(parsed.tags).toEqual(['corner-case', 'git', 'retry']);
    expect(parsed.rootCause).toBeNull();
    expect(parsed.behavior).toContain('retried the same failing command');
  });

  it('validates types, filters, tags, timestamps, and malformed case documents', async () => {
    const project = await createProject('Beta Project', 'beta');
    const validTimestamp = '2026-04-14T12:00:00.000Z';

    expect(normalizeCaseType('corner')).toBe('corner');
    expect(normalizeCaseType('bad')).toBe('bad');
    expect(() => normalizeCaseType('weird')).toThrow('type is required and must be "corner" or "bad".');
    expect(normalizeCaseFilterType(undefined)).toBe('all');
    expect(normalizeCaseFilterType('all')).toBe('all');
    expect(normalizeCaseFilterType('bad')).toBe('bad');
    expect(parseCaseTags(' Guardrail,\nGuardrail, Runtime ', 'bad')).toEqual(['bad-case', 'guardrail', 'runtime']);

    expect(() => renderCaseDocument({
      type: 'bad',
      title: '',
      trigger: 'x',
      behavior: 'y',
    })).toThrow('title is required.');
    expect(() => renderCaseDocument({
      type: 'bad',
      title: 'Missing Trigger',
      trigger: '',
      behavior: 'y',
    })).toThrow('trigger is required.');
    expect(() => renderCaseDocument({
      type: 'bad',
      title: 'Missing Behavior',
      trigger: 'x',
      behavior: '',
    })).toThrow('behavior is required.');
    expect(() => renderCaseDocument({
      type: 'bad',
      title: 'Invalid Timestamp',
      trigger: 'x',
      behavior: 'y',
      timestamp: 'not-an-iso-date',
    })).toThrow('timestamp must be a valid ISO-8601 string when provided.');

    expect(() => parseCaseDocument('## Timestamp\n2026-04-14T12:00:00.000Z\n', project, join(project.projectPath, 'broken.md')))
      .toThrow(`Case document ${join(project.projectPath, 'broken.md')} is missing the title heading.`);

    const unknownTypeDoc = `# strange-case: Mystery\n\n## Timestamp\n${validTimestamp}\n\n## Trigger\nx\n\n## Observed Behavior\ny\n`;
    expect(() => parseCaseDocument(unknownTypeDoc, project, join(project.projectPath, 'unknown.md')))
      .toThrow('has an unknown type heading "strange-case"');

    const missingTriggerDoc = `# bad-case: Missing Trigger\n\n## Timestamp\n${validTimestamp}\n\n## Observed Behavior\ny\n`;
    expect(() => parseCaseDocument(missingTriggerDoc, project, join(project.projectPath, 'missing-trigger.md')))
      .toThrow('Case document is missing required section "Trigger".');
  });

  it('lists, filters, and aggregates cases across projects', async () => {
    const alpha = await createProject('Alpha Project', 'alpha');
    const beta = await createProject('Beta Project', 'beta');
    const empty = await createProject('Empty Project', 'empty');

    await recordCaseKnowledge(alpha, {
      type: 'bad',
      title: 'Guardrail Drift',
      trigger: 'Switching between projects',
      behavior: 'The runtime surfaced stale guardrail evidence',
      rootCause: 'Global binding leaked across sessions',
      workaround: 'Rebind the session before reading state',
      prevention: 'Use session-local binding only',
      tags: ['guardrail', 'runtime'],
      timestamp: '2026-04-13T10:00:00.000Z',
    });
    await recordCaseKnowledge(alpha, {
      type: 'corner',
      title: 'Sparse Bootstrap',
      trigger: 'Bootstrap without linked docs',
      behavior: 'The agent started with minimal context',
      tags: ['bootstrap'],
      timestamp: '2026-04-12T09:00:00.000Z',
    });
    await recordCaseKnowledge(alpha, {
      type: 'bad',
      title: 'Alpha Tie',
      trigger: 'Same timestamp ordering',
      behavior: 'Order depends on relative path',
      tags: ['guardrail', 'runtime'],
      timestamp: '2026-04-13T10:00:00.000Z',
    });
    await recordCaseKnowledge(beta, {
      type: 'bad',
      title: 'Registry Race',
      trigger: 'Concurrent saves',
      behavior: 'Registry writes overlapped',
      tags: ['guardrail', 'registry'],
      timestamp: '2026-04-14T08:00:00.000Z',
    });

    expect(await listCasesForProject(empty, { type: 'all' })).toEqual([]);

    const alphaBadCases = await listCasesForProject(alpha, { type: 'bad', tags: ['guardrail'] });
    expect(alphaBadCases).toHaveLength(2);
    expect(alphaBadCases.map((entry) => entry.title)).toEqual(['Alpha Tie', 'Guardrail Drift']);

    const strictTagFilter = await listCasesForProject(alpha, { type: 'bad', tags: ['guardrail', 'registry'] });
    expect(strictTagFilter).toEqual([]);

    const acrossProjects = await listCasesAcrossProjects([alpha, beta], { type: 'all', tags: ['guardrail'] });
    expect(acrossProjects.map((entry) => entry.title)).toEqual(['Registry Race', 'Alpha Tie', 'Guardrail Drift']);

    const markdown = renderCaseListMarkdown(acrossProjects, 'Workspace Cases');
    expect(markdown).toContain('# Workspace Cases');
    expect(markdown).toContain('## Beta Project · bad-case: Registry Race');
    expect(markdown).toContain('### Root Cause');
    expect(markdown).toContain('(not provided)');
    expect(renderCaseListMarkdown([], 'Workspace Cases')).toContain('No matching cases found.');
  });

  it('builds recent and relevant case context sections', async () => {
    const project = await createProject('Gamma Project', 'gamma');

    await recordCaseKnowledge(project, {
      type: 'bad',
      title: 'Guardrail Failure',
      trigger: 'Running status after project switch',
      behavior: 'Old issue evidence was shown',
      workaround: 'Re-run switch and refresh state',
      tags: ['guardrail', 'switch'],
      timestamp: '2026-04-10T09:00:00.000Z',
    });
    await recordCaseKnowledge(project, {
      type: 'corner',
      title: 'Context Refresh Gap',
      trigger: 'Reading quick start before state refresh',
      behavior: 'The summary was stale',
      workaround: 'Call refresh_entry_surfaces first',
      tags: ['context'],
      timestamp: '2026-04-14T09:00:00.000Z',
    });
    await recordCaseKnowledge(project, {
      type: 'bad',
      title: 'Switch Guardrail Drift',
      trigger: 'Switching projects before status refresh',
      behavior: 'The previous project guardrail remained visible',
      workaround: 'Refresh guardrail state after each switch',
      tags: ['guardrail'],
      timestamp: '2026-04-12T09:00:00.000Z',
    });
    await recordCaseKnowledge(project, {
      type: 'bad',
      title: 'Aged Session State',
      trigger: 'Reusing an older state snapshot',
      behavior: 'A stale runtime decision was reused',
      tags: ['router'],
      timestamp: '2026-04-11T09:00:00.000Z',
    });
    await recordCaseKnowledge(project, {
      type: 'corner',
      title: 'Deferred Context Load',
      trigger: 'Loading state after the first command',
      behavior: 'The first response lacked refreshed context',
      tags: ['router'],
      timestamp: '2026-04-13T09:00:00.000Z',
    });

    const noCasesProject = await createProject('No Cases', 'nocases');
    expect(await buildCaseContextSection(noCasesProject, {})).toContain('No recorded corner or bad cases.');

    const recentSection = await buildCaseContextSection(project, {}, 1);
    expect(recentSection).toContain('## Recent Cases');
    expect(recentSection).toContain('Context Refresh Gap');
    expect(recentSection).not.toContain('Guardrail Failure');

    const fallbackRecentSection = await buildCaseContextSection(project, {
      current_task: { title: 'Polish docs', next_step: 'update readme' },
      working_memory: { pending: ['clean release notes'] },
    }, 1);
    expect(fallbackRecentSection).toContain('## Recent Cases');
    expect(fallbackRecentSection).toContain('Context Refresh Gap');

    const relevantSection = await buildCaseContextSection(project, {
      current_task: { title: 'Fix guardrail switch issue', next_step: 'stabilize guardrail output' },
      working_memory: { pending: ['refresh guardrail state'] },
    }, 2);
    expect(relevantSection).toContain('## Relevant Cases');
    expect(relevantSection).toContain('Guardrail Failure');
    expect(relevantSection).toContain('Switch Guardrail Drift');
    expect(relevantSection).toContain('Re-run switch and refresh state');

    const tiedRelevantSection = await buildCaseContextSection(project, {
      current_task: { title: 'Router audit' },
      working_memory: { pending: [] },
    }, 2);
    expect(tiedRelevantSection).toContain('## Relevant Cases');
    expect(tiedRelevantSection.indexOf('Deferred Context Load')).toBeLessThan(
      tiedRelevantSection.indexOf('Aged Session State'),
    );
  });
});
