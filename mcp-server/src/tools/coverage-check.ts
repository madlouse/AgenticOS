import { readFile } from 'fs/promises';
import { join } from 'path';
import { resolveManagedProjectTarget } from '../utils/project-target.js';
import { generateCoverageEvidence, validateCoverageEvidence, type CoverageEvidence } from '../utils/coverage-evidence.js';

export async function runCoverageCheck(args: any): Promise<string> {
  const { evidence_path } = args;

  let resolved;
  try {
    resolved = await resolveManagedProjectTarget({
      project: args.project,
      commandName: 'agenticos_coverage_check',
    });
  } catch (error: any) {
    return `❌ ${error.message}`;
  }

  const { projectPath } = resolved;
  const defaultPath = join(projectPath, 'mcp-server/coverage/coverage-final.json');
  const evidenceFile = evidence_path || defaultPath;

  let content: string;
  try {
    content = await readFile(evidenceFile, 'utf-8');
  } catch {
    return `❌ coverage-evidence.json not found or unreadable at ${evidenceFile}`;
  }

  let parsed: CoverageEvidence;
  try {
    parsed = JSON.parse(content);
  } catch {
    return `❌ coverage-evidence.json is not valid JSON`;
  }

  const { pass, errors, warnings } = validateCoverageEvidence(parsed);

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
  lines.push(`  - Generated at: ${parsed.generated_at || '(unknown)'}`);
  lines.push(`  - Running in PR: ${parsed.is_pr ? 'yes' : 'no'}`);
  lines.push(`  - Changed files: ${parsed.changed_files.length > 0 ? parsed.changed_files.join(', ') : '(none)'}`);
  lines.push(`  - Aggregate lines: ${parsed.aggregate?.pct_lines ?? '?'}% (floor: ${parsed.threshold_aggregate?.lines}%)`);
  lines.push(`  - Aggregate functions: ${parsed.aggregate?.pct_functions ?? '?'}% (floor: ${parsed.threshold_aggregate?.functions}%)`);
  lines.push(`  - Aggregate branches: ${parsed.aggregate?.pct_branches ?? '?'}% (floor: ${parsed.threshold_aggregate?.branches}%)`);
  lines.push(`  - Aggregate statements: ${parsed.aggregate?.pct_statements ?? '?'}% (floor: ${parsed.threshold_aggregate?.statements}%)`);
  lines.push(`  - Aggregate pass: ${parsed.aggregate_pass ? '✅' : '❌'}`);
  lines.push(`  - Changed-scope pass: ${parsed.changed_scope_pass ? '✅' : '⚠️ (inactive)'}`);

  return lines.join('\n');
}

export async function runCoverageGenerate(args: any): Promise<string> {
  const { coverage_json_path, is_pr = false, changed_files_json } = args;

  let resolved;
  try {
    resolved = await resolveManagedProjectTarget({
      project: args.project,
      commandName: 'agenticos_coverage_check',
    });
  } catch (error: any) {
    return `❌ ${error.message}`;
  }

  const { projectPath } = resolved;
  const defaultPath = join(projectPath, 'mcp-server/coverage/coverage-final.json');
  const jsonPath = coverage_json_path || defaultPath;

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

  const changedFiles = typeof changed_files_json === 'string'
    ? JSON.parse(changed_files_json)
    : Array.isArray(changed_files_json) ? changed_files_json : [];

  const evidence = generateCoverageEvidence(coverageJson, is_pr, changedFiles);

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