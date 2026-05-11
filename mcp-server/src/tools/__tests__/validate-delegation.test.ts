/// <reference types="vitest/globals" />
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ExecFileOptions } from 'child_process';
import { runValidateDelegation as runValidateDelegationActual } from '../validate-delegation.js';
import {
  fixturePassing,
  fixtureFailing,
  fixtureEscalation,
} from '../../__tests__/fixtures/delegation.fixtures.js';

const mockValidate = vi.hoisted(() => vi.fn());
const mockResolve = vi.hoisted(() => vi.fn());
const mockRealpath = vi.hoisted(() => vi.fn());
const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock('../../utils/delegation-validation.js', () => ({
  validateDelegationContent: mockValidate,
}));
vi.mock('../../utils/project-target.js', () => ({
  resolveManagedProjectTarget: mockResolve,
}));
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execFile: mockExecFile,
  };
});
vi.mock('fs/promises', () => ({
  realpath: mockRealpath,
}));

function installExecFileSuccess(stdout = 'file content') {
  mockExecFile.mockImplementation(
    (
      _file: string,
      _args: string[],
      _options: ExecFileOptions,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(null, stdout, '');
      return {} as any;
    },
  );
}

describe('runValidateDelegation', () => {
  beforeEach(() => {
    mockValidate.mockReset();
    mockResolve.mockReset();
    mockRealpath.mockReset();
    mockExecFile.mockReset();
    mockResolve.mockResolvedValue({ projectPath: '/tmp/project' });
    mockRealpath.mockImplementation(async (path: string) => path);
    installExecFileSuccess();
  });
  afterEach(() => {
    mockValidate.mockRestore();
    mockResolve.mockRestore();
    mockRealpath.mockRestore();
    mockExecFile.mockRestore();
  });

  it('returns error when delegation_id is missing', async () => {
    const result = await runValidateDelegationActual({});
    expect(result).toContain('delegation_id is required');
  });

  it('rejects delegation_id path traversal input', async () => {
    const result = await runValidateDelegationActual({ delegation_id: '../escape' });
    expect(result).toContain('must be a single relative path segment');
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockRealpath).not.toHaveBeenCalled();
    expect(mockExecFile).not.toHaveBeenCalled();
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it('rejects delegation targets that resolve outside the delegations directory', async () => {
    mockRealpath
      .mockResolvedValueOnce('/tmp/project')
      .mockResolvedValueOnce('/tmp/project/standards/.context/delegations')
      .mockResolvedValueOnce('/tmp/outside/log.md')
      .mockResolvedValueOnce('/tmp/outside/result.md');

    const result = await runValidateDelegationActual({ delegation_id: 'test-escape' });

    expect(result).toContain('resolves outside the delegations directory');
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it('rejects a delegations root that resolves outside the project path', async () => {
    mockRealpath
      .mockResolvedValueOnce('/tmp/project')
      .mockResolvedValueOnce('/tmp/outside/delegations')
      .mockResolvedValueOnce('/tmp/outside/delegations/test-root/log.md')
      .mockResolvedValueOnce('/tmp/outside/delegations/test-root/result.md');

    const result = await runValidateDelegationActual({ delegation_id: 'test-root' });

    expect(result).toContain('resolves outside the delegations directory');
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it('formats a passing validation result', async () => {
    mockValidate.mockReturnValue(fixturePassing());

    const result = await runValidateDelegationActual({ delegation_id: 'test-001' });
    expect(result).toContain('✅');
    expect(result).toContain('**Log checks:**');
    expect(result).toContain('**Result checks:**');
    expect(result).not.toContain('Escalation required');
  });

  it('passes canonicalized paths to the validator when realpath succeeds', async () => {
    mockRealpath
      .mockResolvedValueOnce('/tmp/project')
      .mockResolvedValueOnce('/tmp/project/.real/delegations')
      .mockResolvedValueOnce('/tmp/project/.real/delegations/test-005/log.md')
      .mockResolvedValueOnce('/tmp/project/.real/delegations/test-005/result.md');
    mockValidate.mockReturnValue(fixturePassing());

    await runValidateDelegationActual({ delegation_id: 'test-005' });

    expect(mockExecFile).toHaveBeenCalledTimes(2);
    expect(mockValidate).toHaveBeenCalledWith('file content', 'file content', 'test-005');
  });

  it('returns a direct file error when canonicalization cannot resolve the files', async () => {
    mockRealpath
      .mockResolvedValueOnce('/tmp/project')
      .mockResolvedValueOnce('/tmp/project/standards/.context/delegations')
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const result = await runValidateDelegationActual({ delegation_id: 'test-006' });

    expect(result).toContain('delegation file not found or unreadable at /tmp/project/standards/.context/delegations/test-006/log.md');
    expect(mockValidate).not.toHaveBeenCalled();
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('returns a direct file error when result.md canonicalization cannot resolve the file', async () => {
    mockRealpath
      .mockResolvedValueOnce('/tmp/project')
      .mockResolvedValueOnce('/tmp/project/standards/.context/delegations')
      .mockResolvedValueOnce('/tmp/project/standards/.context/delegations/test-006/log.md')
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const result = await runValidateDelegationActual({ delegation_id: 'test-006' });

    expect(result).toContain('delegation file not found or unreadable at /tmp/project/standards/.context/delegations/test-006/result.md');
    expect(mockValidate).not.toHaveBeenCalled();
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('fails closed when the secure reader rejects a changed file path', async () => {
    mockExecFile.mockImplementationOnce(
      (
        _file: string,
        _args: string[],
        _options: ExecFileOptions,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(new Error('secure read failed'), '', '');
        return {} as any;
      },
    );

    const result = await runValidateDelegationActual({ delegation_id: 'test-009' });

    expect(result).toContain('delegation file not found or unreadable at /tmp/project/standards/.context/delegations/test-009/log.md');
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it('fails closed when the secure reader rejects a changed parent path', async () => {
    mockExecFile.mockImplementationOnce(
      (
        _file: string,
        _args: string[],
        _options: ExecFileOptions,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(new Error('secure read failed'), '', '');
        return {} as any;
      },
    );

    const result = await runValidateDelegationActual({ delegation_id: 'test-010' });

    expect(result).toContain('delegation file not found or unreadable at /tmp/project/standards/.context/delegations/test-010/log.md');
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it('fails closed when canonicalization errors are not missing-file cases', async () => {
    mockRealpath
      .mockResolvedValueOnce('/tmp/project')
      .mockResolvedValueOnce('/tmp/project/standards/.context/delegations')
      .mockRejectedValueOnce(Object.assign(new Error('EACCES'), { code: 'EACCES' }));

    const result = await runValidateDelegationActual({ delegation_id: 'test-007' });

    expect(result).toContain('failed to canonicalize delegation files');
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it('fails closed when the delegation root cannot be resolved', async () => {
    mockRealpath.mockRejectedValueOnce(new Error('root missing'));

    const result = await runValidateDelegationActual({ delegation_id: 'test-008' });

    expect(result).toContain('failed to resolve delegation root');
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it('formats a failing validation result with errors and warnings', async () => {
    mockValidate.mockReturnValue(
      fixtureFailing(
        ['log.md missing delegation_id field'],
        ['Findings section is empty'],
      ),
    );

    const result = await runValidateDelegationActual({ delegation_id: 'test-002' });
    expect(result).toContain('❌');
    expect(result).toContain('Errors (blocking)');
    expect(result).toContain('Warnings (non-blocking)');
  });

  it('includes escalation details when present', async () => {
    mockValidate.mockReturnValue(
      fixtureEscalation('Too many failures', 'Restart delegation', 5),
    );

    const result = await runValidateDelegationActual({ delegation_id: 'test-003' });
    expect(result).toContain('Escalation required');
    expect(result).toContain('Too many failures');
    expect(result).toContain('Restart delegation');
    expect(result).toContain('Attempts: 5');
  });

  it('returns error when project resolution throws', async () => {
    mockResolve.mockRejectedValue(new Error('Project not found'));
    const result = await runValidateDelegationActual({ delegation_id: 'test-004' });
    expect(result).toContain('Project not found');
  });
});
