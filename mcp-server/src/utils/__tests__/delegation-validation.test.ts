import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  makeDelegationLog,
  makeDelegationResult,
} from '../../__tests__/fixtures/delegation.fixtures.js';
import { validateDelegationContent, validateDelegationOutput } from '../delegation-validation.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('validateDelegationOutput', () => {
  it('validates log.md and result.md from disk using async reads', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agenticos-delegation-'));
    tempDirs.push(dir);

    const delegationId = 'delegation-001';
    const logPath = join(dir, 'log.md');
    const resultPath = join(dir, 'result.md');

    await writeFile(logPath, makeDelegationLog(delegationId), 'utf-8');
    await writeFile(resultPath, makeDelegationResult(delegationId), 'utf-8');

    const result = await validateDelegationOutput(logPath, resultPath, delegationId);

    expect(result.pass).toBe(true);
    expect(result.log_pass).toBe(true);
    expect(result.result_pass).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns a blocking error when result.md cannot be read', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agenticos-delegation-'));
    tempDirs.push(dir);

    const delegationId = 'delegation-002';
    const logPath = join(dir, 'log.md');
    const resultPath = join(dir, 'missing-result.md');

    await writeFile(logPath, makeDelegationLog(delegationId), 'utf-8');

    const result = await validateDelegationOutput(logPath, resultPath, delegationId);

    expect(result.pass).toBe(false);
    expect(result.result_pass).toBe(false);
    expect(result.errors).toContain(`result file not found or unreadable at ${resultPath}`);
  });

  it('returns a blocking error when log.md cannot be read', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agenticos-delegation-'));
    tempDirs.push(dir);

    const delegationId = 'delegation-003';
    const logPath = join(dir, 'missing-log.md');
    const resultPath = join(dir, 'result.md');

    await writeFile(resultPath, makeDelegationResult(delegationId), 'utf-8');

    const result = await validateDelegationOutput(logPath, resultPath, delegationId);

    expect(result.pass).toBe(false);
    expect(result.log_pass).toBe(false);
    expect(result.errors).toContain(`log file not found or unreadable at ${logPath}`);
  });
});

describe('validateDelegationContent', () => {
  it('validates delegation log and result markdown content directly', () => {
    const delegationId = 'delegation-content-001';

    const result = validateDelegationContent(
      makeDelegationLog(delegationId),
      makeDelegationResult(delegationId),
      delegationId,
    );

    expect(result.pass).toBe(true);
    expect(result.log_pass).toBe(true);
    expect(result.result_pass).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.log_checks.delegation_id_matches).toBe(true);
    expect(result.result_checks.delegation_id_matches).toBe(true);
  });

  it('reports direct content validation failures without reading files', () => {
    const delegationId = 'delegation-content-002';

    const result = validateDelegationContent(
      makeDelegationLog(delegationId, {
        recorded_at: 'not-a-timestamp',
        status: 'pending',
        actions: '',
      }),
      makeDelegationResult('different-delegation', {
        summary: 'short',
        findings: '',
        recommendations: '',
      }),
      delegationId,
    );

    expect(result.pass).toBe(false);
    expect(result.log_pass).toBe(false);
    expect(result.result_pass).toBe(false);
    expect(result.errors).toContain('log.md: recorded_at is not ISO 8601 (got not-a-timestamp)');
    expect(result.errors).toContain('log.md: status must be one of completed|blocked|partial (got pending)');
    expect(result.errors).toContain('result.md: Delegation ID mismatch (expected delegation-content-002, got different-delegation)');
    expect(result.errors).toContain('result.md: Summary field is empty or too short');
    expect(result.errors).toContain('result.md: ## Findings section is empty');
    expect(result.errors).toContain('result.md: ## Recommendations section is empty');
    expect(result.warnings).toContain('log.md: ## Actions Taken section is empty');
    expect(result.log_checks.recorded_at_valid).toBe(false);
    expect(result.log_checks.status_valid).toBe(false);
    expect(result.log_checks.actions_taken_nonempty).toBe(false);
    expect(result.result_checks.delegation_id_matches).toBe(false);
    expect(result.result_checks.summary_nonempty).toBe(false);
    expect(result.result_checks.findings_nonempty).toBe(false);
    expect(result.result_checks.recommendations_nonempty).toBe(false);
  });
});
