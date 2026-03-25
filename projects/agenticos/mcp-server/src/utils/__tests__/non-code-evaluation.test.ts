import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'yaml';
import { evaluateNonCode } from '../non-code-evaluation.js';
import { runNonCodeEvaluate } from '../../tools/non-code-evaluate.js';

async function setupProjectRoot(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'agenticos-non-code-eval-'));
  await mkdir(join(projectRoot, '.context'), { recursive: true });
  await mkdir(join(projectRoot, 'knowledge'), { recursive: true });
  await mkdir(join(projectRoot, 'artifacts'), { recursive: true });
  return projectRoot;
}

async function writeRubric(projectRoot: string, content: Record<string, unknown>, relativePath = 'artifacts/non-code-evaluation.yaml'): Promise<string> {
  const rubricPath = join(projectRoot, relativePath);
  await mkdir(join(projectRoot, 'artifacts'), { recursive: true });
  await writeFile(rubricPath, yaml.stringify(content), 'utf-8');
  return rubricPath;
}

describe('non-code evaluation command', () => {
  afterEach(() => {
    delete process.env.AGENTICOS_HOME;
  });

  it('validates a completed rubric, persists latest evidence, and returns a structured tool result', async () => {
    const projectRoot = await setupProjectRoot();
    await writeFile(join(projectRoot, 'knowledge', 'design.md'), '# Design\n', 'utf-8');
    await writeFile(
      join(projectRoot, '.context', 'state.yaml'),
      yaml.stringify({
        session: { id: 'session-1', started: '2026-03-25T00:00:00.000Z', agent: 'codex' },
      }),
      'utf-8',
    );

    await writeRubric(projectRoot, {
      name: 'non-code-evaluation-rubric',
      artifact: {
        path: 'knowledge/design.md',
        type: 'design_doc',
      },
      goal: {
        intended_outcome: 'Freeze the design contract before implementation.',
        linked_issue: '96',
      },
      criteria: [
        { name: 'goal_alignment', result: 'PASS', notes: 'Aligned with the issue scope.' },
        { name: 'executability', result: 'PASS', notes: 'Checks and pseudocode are explicit.' },
        { name: 'consistency', result: 'PASS', notes: 'No conflicts with existing standards.' },
        { name: 'completeness', result: 'PASS', notes: 'Entry, flow, and failure states are covered.' },
        { name: 'downstream_usability', result: 'PASS', notes: 'Another agent can pick this up.' },
      ],
      evaluation: {
        overall_result: 'PASS',
        residual_risks: ['Docs still depend on operator discipline.', '' as any, 7 as any],
      },
    });

    const result = await evaluateNonCode({
      project_path: projectRoot,
      rubric_path: 'artifacts/non-code-evaluation.yaml',
    });

    expect(result.status).toBe('RECORDED');
    expect(result.project_path).toBe(projectRoot);
    expect(result.rubric_path).toBe('artifacts/non-code-evaluation.yaml');
    expect(result.artifact_path).toBe('knowledge/design.md');
    expect(result.artifact_type).toBe('design_doc');
    expect(result.linked_issue).toBe('96');
    expect(result.overall_result).toBe('PASS');
    expect(result.criteria).toEqual([
      { name: 'goal_alignment', result: 'PASS' },
      { name: 'executability', result: 'PASS' },
      { name: 'consistency', result: 'PASS' },
      { name: 'completeness', result: 'PASS' },
      { name: 'downstream_usability', result: 'PASS' },
    ]);

    const state = yaml.parse(await readFile(join(projectRoot, '.context', 'state.yaml'), 'utf-8')) as any;
    expect(state.session.id).toBe('session-1');
    expect(state.session.started).toBe('2026-03-25T00:00:00.000Z');
    expect(state.session.agent).toBe('codex');
    expect(state.session.last_non_code_evaluation).toBe(result.recorded_at);
    expect(state.non_code_evaluation.updated_at).toBe(result.recorded_at);
    expect(state.non_code_evaluation.latest.command).toBe('agenticos_non_code_evaluate');
    expect(state.non_code_evaluation.latest.rubric_path).toBe('artifacts/non-code-evaluation.yaml');
    expect(state.non_code_evaluation.latest.artifact).toEqual({
      path: 'knowledge/design.md',
      type: 'design_doc',
    });
    expect(state.non_code_evaluation.latest.goal).toEqual({
      intended_outcome: 'Freeze the design contract before implementation.',
      linked_issue: '96',
    });
    expect(state.non_code_evaluation.latest.evaluation).toEqual({
      method: 'llm_rubric_review',
      passes_required: 1,
      overall_result: 'PASS',
    });
    expect(state.non_code_evaluation.latest.criteria).toHaveLength(5);
    expect(state.non_code_evaluation.latest.residual_risks).toEqual(['Docs still depend on operator discipline.']);

    const wrapped = JSON.parse(await runNonCodeEvaluate({
      project_path: projectRoot,
      rubric_path: join(projectRoot, 'artifacts', 'non-code-evaluation.yaml'),
    })) as { command: string; overall_result: string };
    expect(wrapped.command).toBe('agenticos_non_code_evaluate');
    expect(wrapped.overall_result).toBe('PASS');
  });

  it('accepts absolute artifact paths, explicit evaluation metadata, and rewrites the latest evidence slot', async () => {
    const projectRoot = await setupProjectRoot();
    const artifactPath = join(projectRoot, 'knowledge', 'workflow.md');
    await writeFile(artifactPath, '# Workflow\n', 'utf-8');

    await writeRubric(projectRoot, {
      name: 'non-code-evaluation-rubric',
      artifact: {
        path: artifactPath,
        type: 'workflow_spec',
      },
      goal: {
        intended_outcome: 'Record the workflow spec result.',
        linked_issue: '96',
      },
      criteria: [
        { name: 'goal_alignment', result: 'FAIL', notes: 'Scope still misses rollout details.' },
        { name: 'executability', result: 'PASS', notes: 'Execution flow is explicit.' },
        { name: 'consistency', result: 'PASS', notes: 'Matches current positioning.' },
        { name: 'completeness', result: 'PASS', notes: 'Major sections exist.' },
        { name: 'downstream_usability', result: 'PASS', notes: 'Readable without chat history.' },
      ],
      evaluation: {
        method: 'manual_review',
        passes_required: 2,
        overall_result: 'FAIL',
        residual_risks: ['Needs rollout-specific examples.'],
      },
    }, 'artifacts/workflow-evaluation.yaml');

    const result = await evaluateNonCode({
      project_path: projectRoot,
      rubric_path: join(projectRoot, 'artifacts', 'workflow-evaluation.yaml'),
    });

    expect(result.overall_result).toBe('FAIL');
    expect(result.artifact_type).toBe('workflow_spec');
    expect(result.residual_risks).toEqual(['Needs rollout-specific examples.']);

    const state = yaml.parse(await readFile(join(projectRoot, '.context', 'state.yaml'), 'utf-8')) as any;
    expect(state.non_code_evaluation.latest.evaluation).toEqual({
      method: 'manual_review',
      passes_required: 2,
      overall_result: 'FAIL',
    });
    expect(state.non_code_evaluation.latest.criteria[0]).toMatchObject({
      name: 'goal_alignment',
      question: expect.any(String),
      pass_threshold: expect.any(String),
      result: 'FAIL',
      notes: 'Scope still misses rollout details.',
    });
  });

  it('treats a null state file as empty mutable state and still records the evaluation', async () => {
    const projectRoot = await setupProjectRoot();
    await writeFile(join(projectRoot, 'knowledge', 'protocol.md'), '# Protocol\n', 'utf-8');
    await writeFile(join(projectRoot, '.context', 'state.yaml'), 'null', 'utf-8');
    await writeRubric(projectRoot, {
      name: 'non-code-evaluation-rubric',
      artifact: {
        path: 'knowledge/protocol.md',
        type: 'protocol_doc',
      },
      goal: {
        intended_outcome: 'Handle null state inputs cleanly.',
        linked_issue: '96',
      },
      criteria: [
        { name: 'goal_alignment', result: 'PASS' },
        { name: 'executability', result: 'PASS' },
        { name: 'consistency', result: 'PASS' },
        { name: 'completeness', result: 'PASS' },
        { name: 'downstream_usability', result: 'PASS' },
      ],
      evaluation: {
        overall_result: 'PASS',
      },
    }, 'artifacts/null-state-evaluation.yaml');

    const result = await evaluateNonCode({
      project_path: projectRoot,
      rubric_path: 'artifacts/null-state-evaluation.yaml',
    });

    const state = yaml.parse(await readFile(join(projectRoot, '.context', 'state.yaml'), 'utf-8')) as any;
    expect(result.overall_result).toBe('PASS');
    expect(state.non_code_evaluation.latest.artifact.type).toBe('protocol_doc');
    expect(state.session.last_non_code_evaluation).toBe(result.recorded_at);
  });

  it('fails closed on missing inputs, malformed rubrics, and missing files', async () => {
    const projectRoot = await setupProjectRoot();
    await writeFile(join(projectRoot, 'knowledge', 'spec.md'), '# Spec\n', 'utf-8');

    await expect(() => runNonCodeEvaluate(undefined)).rejects.toThrow('project_path is required.');
    await expect(() => evaluateNonCode({ project_path: '', rubric_path: 'artifacts/rubric.yaml' } as any)).rejects.toThrow('project_path is required.');
    await expect(() => evaluateNonCode({ project_path: projectRoot, rubric_path: '' } as any)).rejects.toThrow('rubric_path is required.');
    await expect(() => evaluateNonCode({ project_path: projectRoot, rubric_path: 7 as any })).rejects.toThrow('rubric_path is required.');
    await expect(() => evaluateNonCode({ project_path: projectRoot, rubric_path: 'artifacts/missing.yaml' })).rejects.toThrow(`rubric_path does not exist: ${join(projectRoot, 'artifacts', 'missing.yaml')}`);

    await writeRubric(projectRoot, {
      name: 'wrong-name',
      artifact: { path: 'knowledge/spec.md', type: 'knowledge_doc' },
      goal: { intended_outcome: 'Bad rubric', linked_issue: '96' },
      criteria: [],
      evaluation: { overall_result: 'PASS' },
    }, 'artifacts/bad-name.yaml');
    await expect(() => evaluateNonCode({
      project_path: projectRoot,
      rubric_path: 'artifacts/bad-name.yaml',
    })).rejects.toThrow('rubric name must be non-code-evaluation-rubric.');

    await writeRubric(projectRoot, {
      name: 'non-code-evaluation-rubric',
      artifact: { path: '', type: 'knowledge_doc' },
      goal: { intended_outcome: 'Bad artifact path', linked_issue: '96' },
      criteria: [
        { name: 'goal_alignment', result: 'PASS' },
        { name: 'executability', result: 'PASS' },
        { name: 'consistency', result: 'PASS' },
        { name: 'completeness', result: 'PASS' },
        { name: 'downstream_usability', result: 'PASS' },
      ],
      evaluation: { overall_result: 'PASS' },
    }, 'artifacts/missing-artifact-path.yaml');
    await expect(() => evaluateNonCode({
      project_path: projectRoot,
      rubric_path: 'artifacts/missing-artifact-path.yaml',
    })).rejects.toThrow('artifact.path is required.');

    await writeRubric(projectRoot, {
      name: 'non-code-evaluation-rubric',
      artifact: { path: 'knowledge/spec.md', type: 'unknown_doc' },
      goal: { intended_outcome: 'Bad artifact type', linked_issue: '96' },
      criteria: [
        { name: 'goal_alignment', result: 'PASS' },
        { name: 'executability', result: 'PASS' },
        { name: 'consistency', result: 'PASS' },
        { name: 'completeness', result: 'PASS' },
        { name: 'downstream_usability', result: 'PASS' },
      ],
      evaluation: { overall_result: 'PASS' },
    }, 'artifacts/bad-artifact-type.yaml');
    await expect(() => evaluateNonCode({
      project_path: projectRoot,
      rubric_path: 'artifacts/bad-artifact-type.yaml',
    })).rejects.toThrow('artifact.type must be one of: protocol_doc, design_doc, knowledge_doc, issue_draft, workflow_spec.');

    await writeRubric(projectRoot, {
      name: 'non-code-evaluation-rubric',
      artifact: { path: 'knowledge/missing.md', type: 'knowledge_doc' },
      goal: { intended_outcome: 'Missing artifact file', linked_issue: '96' },
      criteria: [
        { name: 'goal_alignment', result: 'PASS' },
        { name: 'executability', result: 'PASS' },
        { name: 'consistency', result: 'PASS' },
        { name: 'completeness', result: 'PASS' },
        { name: 'downstream_usability', result: 'PASS' },
      ],
      evaluation: { overall_result: 'PASS' },
    }, 'artifacts/missing-artifact-file.yaml');
    await expect(() => evaluateNonCode({
      project_path: projectRoot,
      rubric_path: 'artifacts/missing-artifact-file.yaml',
    })).rejects.toThrow(`artifact.path does not exist: ${join(projectRoot, 'knowledge', 'missing.md')}`);

    await writeRubric(projectRoot, {
      name: 'non-code-evaluation-rubric',
      artifact: { path: 'knowledge/spec.md', type: 'knowledge_doc' },
      goal: { intended_outcome: 'Missing criterion', linked_issue: '96' },
      criteria: [
        { name: 'goal_alignment', result: 'PASS' },
        { name: 'executability', result: 'PASS' },
        { name: 'consistency', result: 'PASS' },
        { name: 'completeness', result: 'PASS' },
      ],
      evaluation: { overall_result: 'PASS' },
    }, 'artifacts/missing-criterion.yaml');
    await expect(() => evaluateNonCode({
      project_path: projectRoot,
      rubric_path: 'artifacts/missing-criterion.yaml',
    })).rejects.toThrow('criteria must contain every canonical criterion exactly once.');

    await writeRubric(projectRoot, {
      name: 'non-code-evaluation-rubric',
      artifact: { path: 'knowledge/spec.md', type: 'knowledge_doc' },
      goal: { intended_outcome: 'No criteria', linked_issue: '96' },
      criteria: [],
      evaluation: { overall_result: 'PASS' },
    }, 'artifacts/no-criteria.yaml');
    await expect(() => evaluateNonCode({
      project_path: projectRoot,
      rubric_path: 'artifacts/no-criteria.yaml',
    })).rejects.toThrow('criteria are required.');

    await writeRubric(projectRoot, {
      name: 'non-code-evaluation-rubric',
      artifact: { path: 'knowledge/spec.md', type: 'knowledge_doc' },
      goal: { intended_outcome: 'Duplicate criterion', linked_issue: '96' },
      criteria: [
        { name: 'goal_alignment', result: 'PASS' },
        { name: 'goal_alignment', result: 'PASS' },
        { name: 'consistency', result: 'PASS' },
        { name: 'completeness', result: 'PASS' },
        { name: 'downstream_usability', result: 'PASS' },
      ],
      evaluation: { overall_result: 'PASS' },
    }, 'artifacts/duplicate-criterion.yaml');
    await expect(() => evaluateNonCode({
      project_path: projectRoot,
      rubric_path: 'artifacts/duplicate-criterion.yaml',
    })).rejects.toThrow('criteria contains duplicate canonical criterion "goal_alignment".');

    await writeRubric(projectRoot, {
      name: 'non-code-evaluation-rubric',
      artifact: { path: 'knowledge/spec.md', type: 'knowledge_doc' },
      goal: { intended_outcome: 'Unknown criterion', linked_issue: '96' },
      criteria: [
        { name: 'goal_alignment', result: 'PASS' },
        { name: 'executability', result: 'PASS' },
        { name: 'consistency', result: 'PASS' },
        { name: 'completeness', result: 'PASS' },
        { name: 'mystery', result: 'PASS' },
      ],
      evaluation: { overall_result: 'PASS' },
    }, 'artifacts/unknown-criterion.yaml');
    await expect(() => evaluateNonCode({
      project_path: projectRoot,
      rubric_path: 'artifacts/unknown-criterion.yaml',
    })).rejects.toThrow('criteria contains unknown canonical criterion "mystery".');

    await writeRubric(projectRoot, {
      name: 'non-code-evaluation-rubric',
      artifact: { path: 'knowledge/spec.md', type: 'knowledge_doc' },
      goal: { intended_outcome: 'Bad criterion result', linked_issue: '96' },
      criteria: [
        { name: 'goal_alignment', result: 7 as any },
        { name: 'executability', result: 'PASS' },
        { name: 'consistency', result: 'PASS' },
        { name: 'completeness', result: 'PASS' },
        { name: 'downstream_usability', result: 'PASS' },
      ],
      evaluation: { overall_result: 'FAIL' },
    }, 'artifacts/bad-criterion-result.yaml');
    await expect(() => evaluateNonCode({
      project_path: projectRoot,
      rubric_path: 'artifacts/bad-criterion-result.yaml',
    })).rejects.toThrow('criteria[0].result must be PASS or FAIL.');

    await writeFile(join(projectRoot, 'artifacts', 'null-rubric.yaml'), 'null', 'utf-8');
    await expect(() => evaluateNonCode({
      project_path: projectRoot,
      rubric_path: 'artifacts/null-rubric.yaml',
    })).rejects.toThrow('rubric name must be non-code-evaluation-rubric.');

    await writeRubric(projectRoot, {
      name: 'non-code-evaluation-rubric',
      artifact: { path: 'knowledge/spec.md', type: 'knowledge_doc' },
      goal: { intended_outcome: 'Bad overall result', linked_issue: '96' },
      criteria: [
        { name: 'goal_alignment', result: 'FAIL' },
        { name: 'executability', result: 'PASS' },
        { name: 'consistency', result: 'PASS' },
        { name: 'completeness', result: 'PASS' },
        { name: 'downstream_usability', result: 'PASS' },
      ],
      evaluation: { overall_result: 'PASS' },
    }, 'artifacts/bad-overall-result.yaml');
    await expect(() => evaluateNonCode({
      project_path: projectRoot,
      rubric_path: 'artifacts/bad-overall-result.yaml',
    })).rejects.toThrow('evaluation.overall_result must match criteria results (FAIL).');

    await writeRubric(projectRoot, {
      name: 'non-code-evaluation-rubric',
      artifact: { path: 'knowledge/spec.md', type: 'knowledge_doc' },
      goal: { intended_outcome: '', linked_issue: '' },
      criteria: [
        { name: 'goal_alignment', result: 'PASS' },
        { name: 'executability', result: 'PASS' },
        { name: 'consistency', result: 'PASS' },
        { name: 'completeness', result: 'PASS' },
        { name: 'downstream_usability', result: 'PASS' },
      ],
      evaluation: { overall_result: 'PASS' },
    }, 'artifacts/missing-goal.yaml');
    await expect(() => evaluateNonCode({
      project_path: projectRoot,
      rubric_path: 'artifacts/missing-goal.yaml',
    })).rejects.toThrow('goal.intended_outcome is required.');

    await writeRubric(projectRoot, {
      name: 'non-code-evaluation-rubric',
      artifact: { path: 'knowledge/spec.md', type: 'knowledge_doc' },
      goal: { intended_outcome: 'Missing linked issue', linked_issue: '' },
      criteria: [
        { name: 'goal_alignment', result: 'PASS' },
        { name: 'executability', result: 'PASS' },
        { name: 'consistency', result: 'PASS' },
        { name: 'completeness', result: 'PASS' },
        { name: 'downstream_usability', result: 'PASS' },
      ],
      evaluation: { overall_result: 'PASS' },
    }, 'artifacts/missing-linked-issue.yaml');
    await expect(() => evaluateNonCode({
      project_path: projectRoot,
      rubric_path: 'artifacts/missing-linked-issue.yaml',
    })).rejects.toThrow('goal.linked_issue is required.');
  });

  it('fails closed when the canonical rubric contract is broken', async () => {
    const projectRoot = await setupProjectRoot();
    await writeFile(join(projectRoot, 'knowledge', 'spec.md'), '# Spec\n', 'utf-8');
    await writeRubric(projectRoot, {
      name: 'non-code-evaluation-rubric',
      artifact: { path: 'knowledge/spec.md', type: 'knowledge_doc' },
      goal: { intended_outcome: 'Use the canonical rubric', linked_issue: '96' },
      criteria: [
        { name: 'goal_alignment', result: 'PASS' },
        { name: 'executability', result: 'PASS' },
        { name: 'consistency', result: 'PASS' },
        { name: 'completeness', result: 'PASS' },
        { name: 'downstream_usability', result: 'PASS' },
      ],
      evaluation: { overall_result: 'PASS' },
    }, 'artifacts/valid.yaml');

    const canonicalRubricPath = join(process.cwd(), '..', '.meta', 'templates', 'non-code-evaluation-rubric.yaml');
    const originalCanonicalRubric = await readFile(canonicalRubricPath, 'utf-8');

    try {
      await writeFile(canonicalRubricPath, 'name: [broken', 'utf-8');

      await expect(() => evaluateNonCode({
        project_path: projectRoot,
        rubric_path: 'artifacts/valid.yaml',
      })).rejects.toThrow(`Canonical rubric could not be read at ${canonicalRubricPath}.`);

      await writeFile(canonicalRubricPath, yaml.stringify({
        name: 'wrong-canonical-name',
        artifact: {
          allowed_types: ['knowledge_doc'],
        },
        criteria: [
          {
            name: 'goal_alignment',
            question: 'x',
            pass_threshold: 'y',
          },
        ],
      }), 'utf-8');

      await expect(() => evaluateNonCode({
        project_path: projectRoot,
        rubric_path: 'artifacts/valid.yaml',
      })).rejects.toThrow(`Canonical rubric at ${canonicalRubricPath} has an unexpected name.`);

      await writeFile(canonicalRubricPath, yaml.stringify({
        name: 'non-code-evaluation-rubric',
        artifact: {
          allowed_types: ['knowledge_doc'],
        },
        criteria: [],
      }), 'utf-8');

      await expect(() => evaluateNonCode({
        project_path: projectRoot,
        rubric_path: 'artifacts/valid.yaml',
      })).rejects.toThrow('Canonical rubric criteria are missing.');

      await writeFile(canonicalRubricPath, yaml.stringify({
        name: 'non-code-evaluation-rubric',
        artifact: {},
        criteria: [
          {
            name: 'goal_alignment',
            question: 'x',
            pass_threshold: 'y',
          },
        ],
      }), 'utf-8');

      await expect(() => evaluateNonCode({
        project_path: projectRoot,
        rubric_path: 'artifacts/valid.yaml',
      })).rejects.toThrow('Canonical rubric allowed artifact types are missing.');

      await writeFile(canonicalRubricPath, yaml.stringify({
        name: 'non-code-evaluation-rubric',
        artifact: {
          allowed_types: ['knowledge_doc'],
        },
        criteria: [
          {
            name: 'goal_alignment',
            question: 'x',
            pass_threshold: 'y',
          },
        ],
        evaluation: {
          passes_required: 1,
        },
      }), 'utf-8');

      await expect(() => evaluateNonCode({
        project_path: projectRoot,
        rubric_path: 'artifacts/valid.yaml',
      })).rejects.toThrow('Canonical rubric evaluation.method is missing.');

      await writeFile(canonicalRubricPath, yaml.stringify({
        name: 'non-code-evaluation-rubric',
        artifact: {
          allowed_types: ['knowledge_doc'],
        },
        criteria: [
          {
            name: 'goal_alignment',
            question: 'x',
            pass_threshold: 'y',
          },
        ],
        evaluation: {
          method: 'llm_rubric_review',
        },
      }), 'utf-8');

      await expect(() => evaluateNonCode({
        project_path: projectRoot,
        rubric_path: 'artifacts/valid.yaml',
      })).rejects.toThrow('Canonical rubric evaluation.passes_required is missing.');
    } finally {
      await writeFile(canonicalRubricPath, originalCanonicalRubric, 'utf-8');
    }
  });
});
