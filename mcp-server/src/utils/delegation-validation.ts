import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface ValidationResult {
  pass: boolean;
  log_pass: boolean;
  result_pass: boolean;
  errors: string[];
  warnings: string[];
  escalation?: {
    reason: string;
    recommendation: string;
    attempts: number;
  };
  log_checks: {
    delegation_id_present: boolean;
    delegation_id_matches: boolean | null;
    recorded_at_present: boolean;
    recorded_at_valid: boolean;
    sub_task_present: boolean;
    status_present: boolean;
    status_valid: boolean;
    actions_taken_nonempty: boolean;
    findings_nonempty: boolean;
  };
  result_checks: {
    delegation_id_present: boolean;
    delegation_id_matches: boolean | null;
    timestamp_present: boolean;
    summary_nonempty: boolean;
    findings_nonempty: boolean;
    recommendations_nonempty: boolean;
  };
}

const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const VALID_STATUSES = ['completed', 'blocked', 'partial'];

export function extractField(content: string, field: string): string | null {
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.startsWith(`${field}:`) || line.startsWith(`${field} :`)) {
      return line.substring(line.indexOf(':') + 1).trim();
    }
  }
  return null;
}

export function extractHeadingContent(content: string, heading: string): string | null {
  const idx = content.indexOf(heading);
  if (idx < 0) return null;
  const after = content.substring(idx + heading.length);
  const nextHeading = after.search(/\n## |\n# /);
  const section = nextHeading >= 0 ? after.substring(0, nextHeading) : after;
  const trimmed = section.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Extracts the value on the line immediately after a heading (e.g. "## Delegation ID\nabc123")
export function extractAfterHeading(content: string, heading: string): string | null {
  const idx = content.indexOf(heading);
  if (idx < 0) return null;
  const after = content.substring(idx + heading.length);
  // Skip any blank lines before the value
  const trimmedAfter = after.trimStart();
  const skipChars = after.length - trimmedAfter.length;
  const nextNewlineInAfter = after.indexOf('\n');
  // Find the first non-blank line
  const lines = after.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (t.length === 0) continue; // skip blank lines
    if (/^#{1,6}\s/.test(t)) return null; // next line is a heading — no value
    return t;
  }
  return null;
}

export function sectionNonEmpty(content: string, heading: string): boolean {
  return extractHeadingContent(content, heading) !== null;
}

/**
 * Validates that a sub-agent delegation produced complete, well-formed output.
 *
 * Pure function — zero I/O, zero side effects. Suitable for use in both
 * the main agent's delegation guardrail logic and the `agenticos_validate_delegation`
 * MCP tool.
 *
 * @param logPath     Absolute path to the log.md file
 * @param resultPath  Absolute path to the result.md file
 * @param delegationId Expected delegation ID (for cross-check)
 * @returns ValidationResult with pass/fail and detailed per-field checks
 */
export function validateDelegationOutput(
  logPath: string,
  resultPath: string,
  delegationId: string,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Log checks ---
  let logContent: string;
  try {
    logContent = readFileSync(resolve(logPath), 'utf-8');
  } catch {
    errors.push(`log file not found or unreadable at ${logPath}`);
    return mkResult(false, false, false, errors, warnings, null, null);
  }

  const logId = extractField(logContent, 'delegation_id');
  const logRecordedAt = extractField(logContent, 'recorded_at');
  const logSubTask = extractField(logContent, 'sub_task');
  const logStatus = extractField(logContent, 'status');

  const logIdPresent = logId !== null;
  const logIdMatches = logIdPresent ? logId === delegationId : null;
  const logRecordedAtPresent = logRecordedAt !== null;
  const logRecordedAtValid = logRecordedAt !== null ? ISO8601_RE.test(logRecordedAt) : false;
  const logSubTaskPresent = logSubTask !== null;
  const logStatusPresent = logStatus !== null;
  const logStatusValid = logStatus !== null ? VALID_STATUSES.includes(logStatus) : false;
  const logActionsNonempty = sectionNonEmpty(logContent, '## Actions Taken');
  const logFindingsNonempty = sectionNonEmpty(logContent, '## Findings');

  if (!logIdPresent) errors.push('log.md: delegation_id field is missing');
  else if (logIdMatches === false) errors.push(`log.md: delegation_id mismatch (expected ${delegationId}, got ${logId})`);
  if (!logRecordedAtPresent) errors.push('log.md: recorded_at field is missing');
  else if (!logRecordedAtValid) errors.push(`log.md: recorded_at is not ISO 8601 (got ${logRecordedAt})`);
  if (!logSubTaskPresent) errors.push('log.md: sub_task field is missing');
  if (!logStatusPresent) errors.push('log.md: status field is missing');
  else if (!logStatusValid) errors.push(`log.md: status must be one of ${VALID_STATUSES.join('|')} (got ${logStatus})`);
  if (!logFindingsNonempty) errors.push('log.md: ## Findings section is empty');

  if (!logActionsNonempty) warnings.push('log.md: ## Actions Taken section is empty');

  // --- Result checks ---
  let resultContent: string;
  try {
    resultContent = readFileSync(resolve(resultPath), 'utf-8');
  } catch {
    errors.push(`result file not found or unreadable at ${resultPath}`);
    return mkResult(
      false,
      errors.length === 0,
      false,
      errors,
      warnings,
      mkLogChecks(logIdPresent, logIdMatches, logRecordedAtPresent, logRecordedAtValid, logSubTaskPresent, logStatusPresent, logStatusValid, logActionsNonempty, logFindingsNonempty),
      null,
    );
  }

  const resultId = extractAfterHeading(resultContent, '## Delegation ID');
  const resultTimestamp = extractAfterHeading(resultContent, '## Timestamp');
  const resultSummary = extractHeadingContent(resultContent, '## Summary');
  const resultFindingsNonempty = sectionNonEmpty(resultContent, '## Findings') || sectionNonEmpty(resultContent, '## findings');
  const resultRecsNonempty = sectionNonEmpty(resultContent, '## Recommendations') || sectionNonEmpty(resultContent, '## recommendations');

  const resultIdPresent = resultId !== null;
  const resultIdMatches = resultIdPresent ? resultId === delegationId : null;
  const resultTimestampPresent = resultTimestamp !== null;
  const resultSummaryNonempty = resultSummary !== null && resultSummary.replace(/\s/g, '').length >= 10;

  if (!resultIdPresent) errors.push('result.md: Delegation ID field is missing');
  else if (resultIdMatches === false) errors.push(`result.md: Delegation ID mismatch (expected ${delegationId}, got ${resultId})`);
  if (!resultTimestampPresent) errors.push('result.md: Timestamp field is missing');
  if (!resultSummaryNonempty) errors.push('result.md: Summary field is empty or too short');
  if (!resultFindingsNonempty) errors.push('result.md: ## Findings section is empty');
  if (!resultRecsNonempty) errors.push('result.md: ## Recommendations section is empty');

  const logErrors = [
    !logIdPresent ? 'log.md: delegation_id field is missing' : null,
    logIdMatches === false ? `log.md: delegation_id mismatch (expected ${delegationId}, got ${logId})` : null,
    !logRecordedAtPresent ? 'log.md: recorded_at field is missing' : null,
    !logRecordedAtValid ? `log.md: recorded_at is not ISO 8601 (got ${logRecordedAt})` : null,
    !logSubTaskPresent ? 'log.md: sub_task field is missing' : null,
    !logStatusPresent ? 'log.md: status field is missing' : null,
    !logStatusValid ? `log.md: status must be one of ${VALID_STATUSES.join('|')} (got ${logStatus})` : null,
    !logFindingsNonempty ? 'log.md: ## Findings section is empty' : null,
  ].filter(Boolean) as string[];

  const resultErrors = [
    !resultIdPresent ? 'result.md: Delegation ID field is missing' : null,
    resultIdMatches === false ? `result.md: Delegation ID mismatch (expected ${delegationId}, got ${resultId})` : null,
    !resultTimestampPresent ? 'result.md: Timestamp field is missing' : null,
    !resultSummaryNonempty ? 'result.md: Summary field is empty or too short' : null,
    !resultFindingsNonempty ? 'result.md: ## Findings section is empty' : null,
    !resultRecsNonempty ? 'result.md: ## Recommendations section is empty' : null,
  ].filter(Boolean) as string[];

  return mkResult(
    logErrors.length === 0 && resultErrors.length === 0,
    logErrors.length === 0,
    resultErrors.length === 0,
    [...logErrors, ...resultErrors],
    warnings,
    mkLogChecks(logIdPresent, logIdMatches, logRecordedAtPresent, logRecordedAtValid, logSubTaskPresent, logStatusPresent, logStatusValid, logActionsNonempty, logFindingsNonempty),
    mkResultChecks(resultIdPresent, resultIdMatches, resultTimestampPresent, resultSummaryNonempty, resultFindingsNonempty, resultRecsNonempty),
  );
}

function mkLogChecks(
  delegation_id_present: boolean,
  delegation_id_matches: boolean | null,
  recorded_at_present: boolean,
  recorded_at_valid: boolean,
  sub_task_present: boolean,
  status_present: boolean,
  status_valid: boolean,
  actions_taken_nonempty: boolean,
  findings_nonempty: boolean,
) {
  return { delegation_id_present, delegation_id_matches, recorded_at_present, recorded_at_valid, sub_task_present, status_present, status_valid, actions_taken_nonempty, findings_nonempty };
}

function mkResultChecks(
  delegation_id_present: boolean,
  delegation_id_matches: boolean | null,
  timestamp_present: boolean,
  summary_nonempty: boolean,
  findings_nonempty: boolean,
  recommendations_nonempty: boolean,
) {
  return { delegation_id_present, delegation_id_matches, timestamp_present, summary_nonempty, findings_nonempty, recommendations_nonempty };
}

function mkResult(
  pass: boolean,
  log_pass: boolean,
  result_pass: boolean,
  errors: string[],
  warnings: string[],
  logChecks: ReturnType<typeof mkLogChecks> | null,
  resultChecks: ReturnType<typeof mkResultChecks> | null,
): ValidationResult {
  return {
    pass,
    log_pass,
    result_pass,
    errors,
    warnings,
    log_checks: logChecks ?? {
      delegation_id_present: false,
      delegation_id_matches: null,
      recorded_at_present: false,
      recorded_at_valid: false,
      sub_task_present: false,
      status_present: false,
      status_valid: false,
      actions_taken_nonempty: false,
      findings_nonempty: false,
    },
    result_checks: resultChecks ?? {
      delegation_id_present: false,
      delegation_id_matches: null,
      timestamp_present: false,
      summary_nonempty: false,
      findings_nonempty: false,
      recommendations_nonempty: false,
    },
  };
}