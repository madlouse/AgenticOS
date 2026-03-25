import { access, mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'yaml';

export interface NonCodeEvaluationArgs {
  project_path: string;
  rubric_path: string;
}

type NonCodeArtifactType =
  | 'protocol_doc'
  | 'design_doc'
  | 'knowledge_doc'
  | 'issue_draft'
  | 'workflow_spec';

type NonCodeCriterionResult = 'PASS' | 'FAIL';

interface CanonicalCriterion {
  name: string;
  question: string;
  pass_threshold: string;
}

interface CanonicalRubric {
  name: string;
  artifact?: {
    allowed_types?: NonCodeArtifactType[];
  };
  criteria?: CanonicalCriterion[];
  evaluation?: {
    method?: string;
    passes_required?: number;
  };
}

interface RubricCriterionInput {
  name?: string;
  result?: string;
  notes?: string;
}

interface RubricInput {
  name?: string;
  artifact?: {
    path?: string;
    type?: string;
  };
  goal?: {
    intended_outcome?: string;
    linked_issue?: string;
  };
  criteria?: RubricCriterionInput[];
  evaluation?: {
    overall_result?: string;
    residual_risks?: unknown;
    method?: string;
    passes_required?: number;
  };
}

export interface NonCodeEvaluationResult {
  command: 'agenticos_non_code_evaluate';
  status: 'RECORDED';
  project_path: string;
  state_path: string;
  rubric_path: string;
  artifact_path: string;
  artifact_type: NonCodeArtifactType;
  linked_issue: string;
  overall_result: NonCodeCriterionResult;
  recorded_at: string;
  criteria: Array<{
    name: string;
    result: NonCodeCriterionResult;
  }>;
  residual_risks: string[];
}

interface PersistedCriterion {
  name: string;
  question: string;
  pass_threshold: string;
  result: NonCodeCriterionResult;
  notes: string;
}

interface NormalizedEvaluation {
  rubricPath: string;
  artifactPath: string;
  artifactType: NonCodeArtifactType;
  intendedOutcome: string;
  linkedIssue: string;
  overallResult: NonCodeCriterionResult;
  residualRisks: string[];
  criteria: PersistedCriterion[];
  method: string;
  passesRequired: number;
}

interface StateYaml {
  session?: Record<string, unknown>;
  non_code_evaluation?: Record<string, unknown>;
  [key: string]: unknown;
}

const CANONICAL_RUBRIC_NAME = 'non-code-evaluation-rubric';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CANONICAL_RUBRIC_PATH = resolve(__dirname, '..', '..', '..', '.meta', 'templates', 'non-code-evaluation-rubric.yaml');

function normalizeAbsolutePath(projectPath: string, candidatePath: string): string {
  return isAbsolute(candidatePath) ? resolve(candidatePath) : resolve(projectPath, candidatePath);
}

function toProjectRelativePath(projectPath: string, targetPath: string): string {
  return relative(projectPath, targetPath);
}

function normalizeString(value: unknown, fieldName: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function normalizeCriterionResult(value: unknown, fieldName: string): NonCodeCriterionResult {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'PASS' || normalized === 'FAIL') {
    return normalized;
  }
  throw new Error(`${fieldName} must be PASS or FAIL.`);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readYamlFile<T>(path: string, notFoundMessage: string): Promise<T> {
  try {
    return (yaml.parse(await readFile(path, 'utf-8')) || {}) as T;
  } catch {
    throw new Error(notFoundMessage);
  }
}

async function loadCanonicalRubric(): Promise<CanonicalRubric> {
  const rubric = await readYamlFile<CanonicalRubric>(
    CANONICAL_RUBRIC_PATH,
    `Canonical rubric could not be read at ${CANONICAL_RUBRIC_PATH}.`,
  );

  if (rubric.name !== CANONICAL_RUBRIC_NAME) {
    throw new Error(`Canonical rubric at ${CANONICAL_RUBRIC_PATH} has an unexpected name.`);
  }

  if (!Array.isArray(rubric.criteria) || rubric.criteria.length === 0) {
    throw new Error('Canonical rubric criteria are missing.');
  }

  const allowedTypes = rubric.artifact?.allowed_types;
  if (!Array.isArray(allowedTypes) || allowedTypes.length === 0) {
    throw new Error('Canonical rubric allowed artifact types are missing.');
  }

  if (typeof rubric.evaluation?.method !== 'string' || rubric.evaluation.method.trim().length === 0) {
    throw new Error('Canonical rubric evaluation.method is missing.');
  }

  if (typeof rubric.evaluation?.passes_required !== 'number') {
    throw new Error('Canonical rubric evaluation.passes_required is missing.');
  }

  return rubric;
}

function normalizeCriteria(
  inputCriteria: RubricCriterionInput[] | undefined,
  canonicalCriteria: CanonicalCriterion[],
): PersistedCriterion[] {
  if (!Array.isArray(inputCriteria) || inputCriteria.length === 0) {
    throw new Error('criteria are required.');
  }

  const canonicalByName = new Map(canonicalCriteria.map((criterion) => [criterion.name, criterion]));
  const seen = new Set<string>();

  const normalized = inputCriteria.map((criterion, index) => {
    const name = normalizeString(criterion?.name, `criteria[${index}].name`);
    const canonical = canonicalByName.get(name);
    if (!canonical) {
      throw new Error(`criteria contains unknown canonical criterion "${name}".`);
    }
    if (seen.has(name)) {
      throw new Error(`criteria contains duplicate canonical criterion "${name}".`);
    }
    seen.add(name);

    return {
      name,
      question: canonical.question,
      pass_threshold: canonical.pass_threshold,
      result: normalizeCriterionResult(criterion?.result, `criteria[${index}].result`),
      notes: typeof criterion?.notes === 'string' ? criterion.notes.trim() : '',
    };
  });

  if (normalized.length !== canonicalCriteria.length) {
    throw new Error('criteria must contain every canonical criterion exactly once.');
  }

  return normalized;
}

async function readState(statePath: string): Promise<StateYaml> {
  try {
    return (yaml.parse(await readFile(statePath, 'utf-8')) || {}) as StateYaml;
  } catch {
    return {};
  }
}

function normalizeEvaluation(
  args: NonCodeEvaluationArgs,
  canonicalRubric: CanonicalRubric,
  rubric: RubricInput,
): NormalizedEvaluation {
  if (rubric.name !== CANONICAL_RUBRIC_NAME) {
    throw new Error(`rubric name must be ${CANONICAL_RUBRIC_NAME}.`);
  }

  const artifactPathInput = normalizeString(rubric.artifact?.path, 'artifact.path');
  const artifactType = normalizeString(rubric.artifact?.type, 'artifact.type') as NonCodeArtifactType;
  if (!canonicalRubric.artifact?.allowed_types?.includes(artifactType)) {
    throw new Error(`artifact.type must be one of: ${canonicalRubric.artifact?.allowed_types?.join(', ')}.`);
  }

  const artifactPath = normalizeAbsolutePath(args.project_path, artifactPathInput);
  const criteria = normalizeCriteria(rubric.criteria, canonicalRubric.criteria!);
  const overallResult = normalizeCriterionResult(rubric.evaluation?.overall_result, 'evaluation.overall_result');
  const derivedOverallResult: NonCodeCriterionResult = criteria.every((criterion) => criterion.result === 'PASS') ? 'PASS' : 'FAIL';

  if (overallResult !== derivedOverallResult) {
    throw new Error(`evaluation.overall_result must match criteria results (${derivedOverallResult}).`);
  }

  return {
    rubricPath: normalizeAbsolutePath(args.project_path, args.rubric_path),
    artifactPath,
    artifactType,
    intendedOutcome: normalizeString(rubric.goal?.intended_outcome, 'goal.intended_outcome'),
    linkedIssue: normalizeString(rubric.goal?.linked_issue, 'goal.linked_issue'),
    overallResult,
    residualRisks: normalizeStringList(rubric.evaluation?.residual_risks),
    criteria,
    method: typeof rubric.evaluation?.method === 'string' && rubric.evaluation.method.trim().length > 0
      ? rubric.evaluation.method.trim()
      : canonicalRubric.evaluation!.method!,
    passesRequired: typeof rubric.evaluation?.passes_required === 'number'
      ? rubric.evaluation.passes_required
      : canonicalRubric.evaluation!.passes_required!,
  };
}

function buildPersistedState(
  state: StateYaml,
  evaluation: NormalizedEvaluation,
  projectPath: string,
  recordedAt: string,
): StateYaml {
  state.session = state.session || {};
  state.session.last_non_code_evaluation = recordedAt;

  state.non_code_evaluation = {
    updated_at: recordedAt,
    latest: {
      command: 'agenticos_non_code_evaluate',
      recorded_at: recordedAt,
      rubric_path: toProjectRelativePath(projectPath, evaluation.rubricPath),
      artifact: {
        path: toProjectRelativePath(projectPath, evaluation.artifactPath),
        type: evaluation.artifactType,
      },
      goal: {
        intended_outcome: evaluation.intendedOutcome,
        linked_issue: evaluation.linkedIssue,
      },
      evaluation: {
        method: evaluation.method,
        passes_required: evaluation.passesRequired,
        overall_result: evaluation.overallResult,
      },
      criteria: evaluation.criteria,
      residual_risks: evaluation.residualRisks,
    },
  };

  return state;
}

export async function evaluateNonCode(args: NonCodeEvaluationArgs): Promise<NonCodeEvaluationResult> {
  const projectPath = normalizeString(args?.project_path, 'project_path');
  const rubricPathInput = normalizeString(args?.rubric_path, 'rubric_path');

  const canonicalRubric = await loadCanonicalRubric();
  const rubricPath = normalizeAbsolutePath(projectPath, rubricPathInput);

  if (!(await pathExists(rubricPath))) {
    throw new Error(`rubric_path does not exist: ${rubricPath}`);
  }

  const rubric = await readYamlFile<RubricInput>(rubricPath, `rubric_path could not be read: ${rubricPath}`);
  const normalized = normalizeEvaluation({ project_path: projectPath, rubric_path: rubricPathInput }, canonicalRubric, rubric);

  if (!(await pathExists(normalized.artifactPath))) {
    throw new Error(`artifact.path does not exist: ${normalized.artifactPath}`);
  }

  const statePath = join(projectPath, '.context', 'state.yaml');
  await mkdir(dirname(statePath), { recursive: true });

  const recordedAt = new Date().toISOString();
  const nextState = buildPersistedState(await readState(statePath), normalized, projectPath, recordedAt);
  await writeFile(statePath, yaml.stringify(nextState), 'utf-8');

  return {
    command: 'agenticos_non_code_evaluate',
    status: 'RECORDED',
    project_path: projectPath,
    state_path: statePath,
    rubric_path: toProjectRelativePath(projectPath, normalized.rubricPath),
    artifact_path: toProjectRelativePath(projectPath, normalized.artifactPath),
    artifact_type: normalized.artifactType,
    linked_issue: normalized.linkedIssue,
    overall_result: normalized.overallResult,
    recorded_at: recordedAt,
    criteria: normalized.criteria.map((criterion) => ({
      name: criterion.name,
      result: criterion.result,
    })),
    residual_risks: normalized.residualRisks,
  };
}
