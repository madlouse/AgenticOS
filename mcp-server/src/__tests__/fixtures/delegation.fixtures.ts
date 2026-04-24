/**
 * Delegation fixture factory module.
 *
 * Provides typed, Zod-validated factories for ValidationResult objects and
 * markdown string factories for log.md / result.md fixture files.
 *
 * Zod.parse() is used at creation time to validate the complete shape — not
 * just TypeScript static types. This catches e.g. missing required fields or
 * type mismatches before the object reaches production code.
 *
 * Usage:
 *   import { makeValidationResult, fixturePassing } from './fixtures/delegation.fixtures.js';
 *   import { describe, it, expect } from 'vitest';
 *
 *   describe('my test', () => {
 *     it('passes', () => {
 *       const result = fixturePassing();
 *       expect(result.pass).toBe(true);
 *     });
 *   });
 */
/// <reference types="vitest/globals" />
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/** Shared schema for all ValidationResult log_checks objects. */
const LogChecksSchema = z.object({
  delegation_id_present: z.boolean(),
  delegation_id_matches: z.boolean().nullable(),
  recorded_at_present: z.boolean(),
  recorded_at_valid: z.boolean(),
  sub_task_present: z.boolean(),
  status_present: z.boolean(),
  status_valid: z.boolean(),
  actions_taken_nonempty: z.boolean(),
  findings_nonempty: z.boolean(),
});

/** Shared schema for all ValidationResult result_checks objects. */
const ResultChecksSchema = z.object({
  delegation_id_present: z.boolean(),
  delegation_id_matches: z.boolean().nullable(),
  timestamp_present: z.boolean(),
  summary_nonempty: z.boolean(),
  findings_nonempty: z.boolean(),
  recommendations_nonempty: z.boolean(),
});

/** Shared schema for the optional escalation block. */
const EscalationSchema = z.object({
  reason: z.string(),
  recommendation: z.string(),
  attempts: z.number().int().nonnegative(),
});

/**
 * Zod schema mirroring the ValidationResult TypeScript interface.
 * All fields are required except `escalation`.
 */
export const ValidationResultSchema = z.object({
  pass: z.boolean(),
  log_pass: z.boolean(),
  result_pass: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  escalation: EscalationSchema.optional(),
  log_checks: LogChecksSchema,
  result_checks: ResultChecksSchema,
});

// ---------------------------------------------------------------------------
// Default value factories (plain objects — validated on return)
// ---------------------------------------------------------------------------

const DEFAULT_LOG_CHECKS = {
  delegation_id_present: true,
  delegation_id_matches: true,
  recorded_at_present: true,
  recorded_at_valid: true,
  sub_task_present: true,
  status_present: true,
  status_valid: true,
  actions_taken_nonempty: true,
  findings_nonempty: true,
} as const;

const DEFAULT_RESULT_CHECKS = {
  delegation_id_present: true,
  delegation_id_matches: true,
  timestamp_present: true,
  summary_nonempty: true,
  findings_nonempty: true,
  recommendations_nonempty: true,
} as const;

const DEFAULT_TIMESTAMP = '2026-04-23T08:00:00';
const DEFAULT_RESULT_TIMESTAMP = '2026-04-23T08:30:00';

/** Partial type accepted by makeValidationResult — any subset of ValidationResult fields. */
export type ValidationResultOverrides = Partial<z.infer<typeof ValidationResultSchema>>;

/**
 * Core typed factory for ValidationResult.
 *
 * Valid by default; selectively override fields via the `overrides` argument.
 * The result is Zod-parsed before being returned so that bad overrides are
 * caught at test-creation time rather than at assertion time.
 *
 * @param overrides  Any subset of ValidationResult fields to merge over defaults.
 * @returns A fully-typed, Zod-validated ValidationResult object.
 */
export function makeValidationResult(overrides: ValidationResultOverrides = {}): z.infer<typeof ValidationResultSchema> {
  const base = {
    pass: true,
    log_pass: true,
    result_pass: true,
    errors: [],
    warnings: [],
    escalation: undefined,
    log_checks: { ...DEFAULT_LOG_CHECKS },
    result_checks: { ...DEFAULT_RESULT_CHECKS },
  };

  // Deep-merge checks objects if caller provided them
  const merged: z.infer<typeof ValidationResultSchema> = {
    ...base,
    ...overrides,
    log_checks: overrides.log_checks
      ? { ...DEFAULT_LOG_CHECKS, ...overrides.log_checks }
      : { ...DEFAULT_LOG_CHECKS },
    result_checks: overrides.result_checks
      ? { ...DEFAULT_RESULT_CHECKS, ...overrides.result_checks }
      : { ...DEFAULT_RESULT_CHECKS },
  };

  return ValidationResultSchema.parse(merged);
}

// ---------------------------------------------------------------------------
// Named fixture factories
// ---------------------------------------------------------------------------

/**
 * A fully valid, passing ValidationResult with all checks green.
 * Suitable as a baseline in happy-path tests.
 */
export function fixturePassing(): z.infer<typeof ValidationResultSchema> {
  return makeValidationResult({});
}

/**
 * A failing ValidationResult — pass=false, with optional error and warning messages.
 *
 * @param errors    Array of error strings. Defaults to one generic error.
 * @param warnings  Array of warning strings. Defaults to empty.
 */
export function fixtureFailing(
  errors: string[] = ['log.md: delegation_id field is missing'],
  warnings: string[] = [],
): z.infer<typeof ValidationResultSchema> {
  return makeValidationResult({
    pass: false,
    log_pass: false,
    result_pass: false,
    errors,
    warnings,
  });
}

/**
 * A ValidationResult in escalation state — pass=false, escalation block present.
 *
 * @param reason          Escalation reason string.
 * @param recommendation  Recommended next step.
 * @param attempts        Number of failed attempts (default 5).
 */
export function fixtureEscalation(
  reason: string = 'Too many failures',
  recommendation: string = 'Restart delegation',
  attempts: number = 5,
): z.infer<typeof ValidationResultSchema> {
  return makeValidationResult({
    pass: false,
    log_pass: true,
    result_pass: true,
    errors: [],
    warnings: [],
    escalation: { reason, recommendation, attempts },
  });
}

/**
 * A ValidationResult where the log file is missing a delegation_id.
 * log_checks.delegation_id_present is false; the resulting errors array
 * will include a log.md delegation_id error.
 */
export function fixtureMissingDelegationId(): z.infer<typeof ValidationResultSchema> {
  return makeValidationResult({
    pass: false,
    log_pass: false,
    result_pass: false,
    errors: ['log.md: delegation_id field is missing'],
    warnings: [],
    log_checks: {
      ...DEFAULT_LOG_CHECKS,
      delegation_id_present: false,
      delegation_id_matches: null,
    },
    result_checks: { ...DEFAULT_RESULT_CHECKS },
  });
}

// ---------------------------------------------------------------------------
// Markdown string factories (for integration tests that write real files)
// ---------------------------------------------------------------------------

/**
 * ISO 8601 timestamp used as the default recorded_at value in log.md fixtures.
 */
export const FIXTURE_TIMESTAMP = DEFAULT_TIMESTAMP;

/**
 * ISO 8601 timestamp used as the default timestamp value in result.md fixtures.
 */
export const FIXTURE_RESULT_TIMESTAMP = DEFAULT_RESULT_TIMESTAMP;

/**
 * Valid status values accepted by log.md.
 */
export const VALID_STATUSES = ['completed', 'blocked', 'partial'] as const;

/**
 * Builds a valid log.md string with all required fields populated.
 * Any field can be overridden via the `overrides` parameter.
 *
 * @param delegationId  Delegation ID value for the frontmatter field.
 * @param overrides     Selective overrides for recorded_at, sub_task, status, actions, findings.
 */
export function makeDelegationLog(
  delegationId: string,
  overrides: {
    recorded_at?: string;
    sub_task?: string;
    status?: string;
    actions?: string;
    findings?: string;
  } = {},
): string {
  const recorded_at = overrides.recorded_at ?? FIXTURE_TIMESTAMP;
  const sub_task = overrides.sub_task ?? 'Implement validateDelegationOutput function';
  const status = overrides.status ?? 'completed';
  const actions = overrides.actions ?? '- Wrote the validation function\n- Added comprehensive field checks';
  const findings = overrides.findings ?? '- Pure function design works well\n- Field extraction handles edge cases';

  return `---
delegation_id: ${delegationId}
recorded_at: ${recorded_at}
sub_task: ${sub_task}
status: ${status}
---

## Actions Taken
${actions}

## Findings
${findings}
`;
}

/**
 * Builds a valid result.md string with all required sections.
 * Any section can be overridden via the `overrides` parameter.
 *
 * @param delegationId  Delegation ID value written after the ## Delegation ID heading.
 * @param overrides     Selective overrides for summary, findings, recommendations, timestamp.
 */
export function makeDelegationResult(
  delegationId: string,
  overrides: {
    summary?: string;
    findings?: string;
    recommendations?: string;
    timestamp?: string;
  } = {},
): string {
  const summary = overrides.summary ?? 'A comprehensive validation function for delegation output files.';
  const findings = overrides.findings ?? '- Log.md requires delegation_id, recorded_at, sub_task, status\n- Result.md requires Delegation ID, Timestamp, Summary, Findings, Recommendations';
  const recommendations = overrides.recommendations ?? '1. Use this validation in the MCP tool layer\n2. Extend with additional checks as needed';
  const timestamp = overrides.timestamp ?? FIXTURE_RESULT_TIMESTAMP;

  return `## Summary
${summary}

## Findings
${findings}

## Recommendations
${recommendations}

## Verification Evidence
Unit tests cover all key paths

## Delegation ID
${delegationId}

## Timestamp
${timestamp}
`;
}
