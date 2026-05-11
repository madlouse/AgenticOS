import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  makeDelegationLog,
  makeDelegationResult,
} from '../../__tests__/fixtures/delegation.fixtures.js';
import { validateDelegationOutput } from '../delegation-validation.js';

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
});
