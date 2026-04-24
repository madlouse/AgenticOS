/// <reference types="vitest/globals" />
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { runValidateDelegation as runValidateDelegationActual } from '../validate-delegation.js';
import {
  fixturePassing,
  fixtureFailing,
  fixtureEscalation,
} from '../../__tests__/fixtures/delegation.fixtures.js';

const mockValidate = vi.hoisted(() => vi.fn());
const mockResolve = vi.hoisted(() => vi.fn());

vi.mock('../../utils/delegation-validation.js', () => ({
  validateDelegationOutput: mockValidate,
}));
vi.mock('../../utils/project-target.js', () => ({
  resolveManagedProjectTarget: mockResolve,
}));

describe('runValidateDelegation', () => {
  beforeEach(() => {
    mockValidate.mockReset();
    mockResolve.mockReset();
    mockResolve.mockResolvedValue({ projectPath: '/tmp/project' });
  });
  afterEach(() => {
    mockValidate.mockRestore();
    mockResolve.mockRestore();
  });

  it('returns error when delegation_id is missing', async () => {
    const result = await runValidateDelegationActual({});
    expect(result).toContain('delegation_id is required');
  });

  it('formats a passing validation result', async () => {
    mockValidate.mockReturnValue(fixturePassing());

    const result = await runValidateDelegationActual({ delegation_id: 'test-001' });
    expect(result).toContain('✅');
    expect(result).toContain('**Log checks:**');
    expect(result).toContain('**Result checks:**');
    expect(result).not.toContain('Escalation required');
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
