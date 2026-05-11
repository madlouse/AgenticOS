import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join, relative, resolve, sep } from 'path';
import { resolveManagedProjectTarget } from '../utils/project-target.js';
import { generateCoverageEvidence, validateCoverageEvidence, type CoverageEvidence } from '../utils/coverage-evidence.js';

function isWithinDirectory(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return relativePath === '' || (!relativePath.startsWith('..') && !relativePath.includes(`..${sep}`));
}

function resolveProjectPath(projectPath: string, candidatePath: string | undefined, defaultPath: string): string {
  const projectRoot = resolve(projectPath);
  const resolvedPath = candidatePath ? resolve(projectRoot, candidatePath) : resolve(defaultPath);
  if (!isWithinDirectory(projectRoot, resolvedPath)) {
    throw new Error(`path must stay inside project root: ${projectRoot}`);
  }
  return resolvedPath;
}

function parseChangedFilesJson(input: unknown): { changedFiles: string[]; error?: string } {
  if (input === undefined) return { changedFiles: [] };
  let parsed = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch {
      return { changedFiles: [], error: 'changed_files_json is not valid JSON' };
    }
  }
  if (!Array.isArray(parsed) || !parsed.every((file) => typeof file === 'string')) {
    return { changedFiles: [], error: 'changed_files_json must be an array of strings' };
  }
  return { changedFiles: parsed };
}

export async function runCoverageCheck(args: any): Promise<string> {
  const { evidence_path } = args;

  let resolved;
  try {
    resolved = await resolveManagedProjectTarget({
      project: args.project,
      projectPath: args.project_path,
      commandName: 'agenticos_coverage_check',
    });
  } catch (error: any) {
    return `❌ ${error.message}`;
  }

  const { projectPath } = resolved;
  const defaultPath = join(projectPath, 'mcp-server/coverage/coverage-evidence.json');
  let evidenceFile: string;
  try {
    evidenceFile = resolveProjectPath(projectPath, evidence_path, defaultPath);
  } catch (error: any) {
    return `❌ ${error.message}`;
  }

  let content: string;
  try {
    content = await readFile(evidenceFile, 'utf-8');
  } catch {
    return `❌ coverage-evidence.json not found or unreadable at ${evidenceFile}`;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return `❌ coverage-evidence.json is not valid JSON`;
  }

  const { pass, errors, warnings } = validateCoverageEvidence(parsed);
  const summary = parsed && typeof parsed === 'object' ? parsed : {};

  const lines: string[] = [];
  if (pass) {
    lines.push(`✅ Coverage evidence validated successfully.`);
  } else {
    lines.push(`❌ Coverage validation failed.`);
  }

  if (errors.length > 0) {
    lines.push('\n**Errors (blocking):**');
    for (const err of errors) {
      lines.push(`  - ${err}`);
    }
  }
  if (warnings.length > 0) {
    lines.push('\n**Warnings (non-blocking):**');
    for (const warn of warnings) {
      lines.push(`  - ${warn}`);
    }
  }

  lines.push('\n**Evidence summary:**');
  lines.push(`  - Generated at: ${summary.generated_at || '(unknown)'}`);
  lines.push(`  - Running in PR: ${summary.is_pr ? 'yes' : 'no'}`);
  const changedFiles = Array.isArray(summary.changed_files) ? summary.changed_files : [];
  lines.push(`  - Changed files: ${changedFiles.length > 0 ? changedFiles.join(', ') : '(none)'}`);
  lines.push(`  - Aggregate lines: ${summary.aggregate?.pct_lines ?? '?'}% (floor: ${summary.threshold_aggregate?.lines}%)`);
  lines.push(`  - Aggregate functions: ${summary.aggregate?.pct_functions ?? '?'}% (floor: ${summary.threshold_aggregate?.functions}%)`);
  lines.push(`  - Aggregate branches: ${summary.aggregate?.pct_branches ?? '?'}% (floor: ${summary.threshold_aggregate?.branches}%)`);
  lines.push(`  - Aggregate statements: ${summary.aggregate?.pct_statements ?? '?'}% (floor: ${summary.threshold_aggregate?.statements}%)`);
  lines.push(`  - Aggregate pass: ${summary.aggregate_pass ? '✅' : '❌'}`);
  lines.push(`  - Changed-scope pass: ${summary.changed_scope_pass ? '✅' : '⚠️ (inactive)'}`);

  return lines.join('\n');
}

export async function runCoverageGenerate(args: any): Promise<string> {
  const { coverage_json_path, evidence_path, is_pr = false, changed_files_json } = args;

  let resolved;
  try {
    resolved = await resolveManagedProjectTarget({
      project: args.project,
      projectPath: args.project_path,
      commandName: 'agenticos_coverage_check',
    });
  } catch (error: any) {
    return `❌ ${error.message}`;
  }

  const { projectPath } = resolved;
  const defaultPath = join(projectPath, 'mcp-server/coverage/coverage-final.json');
  let jsonPath: string;
  try {
    jsonPath = resolveProjectPath(projectPath, coverage_json_path, defaultPath);
  } catch (error: any) {
    return `❌ ${error.message}`;
  }

  let content: string;
  try {
    content = await readFile(jsonPath, 'utf-8');
  } catch {
    return `❌ coverage-final.json not found at ${jsonPath}`;
  }

  let coverageJson: Record<string, unknown>;
  try {
    coverageJson = JSON.parse(content);
  } catch {
    return `❌ coverage-final.json is not valid JSON`;
  }

  const { changedFiles, error } = parseChangedFilesJson(changed_files_json);
  if (error) {
    return `❌ ${error}`;
  }

  const evidence = generateCoverageEvidence(coverageJson, is_pr, changedFiles, {
    metadata: {
      branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME,
      commit: process.env.GITHUB_SHA,
      base_branch: process.env.GITHUB_BASE_REF,
      pr_number: process.env.PR_NUMBER || process.env.GITHUB_EVENT_NUMBER,
    },
  });
  let evidenceFile: string;
  try {
    evidenceFile = resolveProjectPath(projectPath, evidence_path, join(projectPath, 'mcp-server/coverage/coverage-evidence.json'));
  } catch (error: any) {
    return `❌ ${error.message}`;
  }
  await mkdir(dirname(evidenceFile), { recursive: true });
  await writeFile(evidenceFile, JSON.stringify(evidence, null, 2), 'utf-8');

  const lines: string[] = [];
  if (evidence.pass) {
    lines.push(`✅ Coverage check passed.`);
  } else {
    lines.push(`❌ Coverage check failed.`);
  }

  lines.push(`\nAggregate: lines=${evidence.aggregate.pct_lines}%, functions=${evidence.aggregate.pct_functions}%, branches=${evidence.aggregate.pct_branches}%, statements=${evidence.aggregate.pct_statements}%`);
  lines.push(`Aggregate floor: lines=${evidence.threshold_aggregate.lines}%, functions=${evidence.threshold_aggregate.functions}%, branches=${evidence.threshold_aggregate.branches}%, statements=${evidence.threshold_aggregate.statements}%`);
  lines.push(`Aggregate pass: ${evidence.aggregate_pass}`);
  lines.push(`Changed-scope pass: ${evidence.changed_scope_pass}`);
  lines.push(`Evidence written: ${evidenceFile}`);

  if (evidence.aggregate_failures.length > 0) {
    lines.push(`\nAggregate failures:`);
    for (const f of evidence.aggregate_failures) lines.push(`  - ${f}`);
  }
  if (evidence.changed_scope_failures.length > 0) {
    lines.push(`\nChanged-scope failures:`);
    for (const f of evidence.changed_scope_failures) lines.push(`  - ${f}`);
  }

  lines.push(`\nEvidence file content (for CI gate):`);
  lines.push(JSON.stringify(evidence, null, 2));

  return lines.join('\n');
}
