import { realpath } from 'fs/promises';
import { basename, resolve } from 'path';
import { validateDelegationOutput } from '../utils/delegation-validation.js';
import { resolveManagedProjectTarget } from '../utils/project-target.js';
import { isPathWithinRoot } from '../utils/worktree-topology.js';

export async function runValidateDelegation(args: any): Promise<string> {
  const delegationId = typeof args.delegation_id === 'string' ? args.delegation_id.trim() : '';

  if (!delegationId) {
    return '❌ delegation_id is required';
  }
  if (delegationId.includes('\\') || basename(delegationId) !== delegationId || delegationId === '.' || delegationId === '..') {
    return '❌ delegation_id must be a single relative path segment';
  }

  // Resolve project to get agenticos_home
  let resolved;
  try {
    resolved = await resolveManagedProjectTarget({
      project: args.project,
      commandName: 'agenticos_validate_delegation',
    });
  } catch (error: any) {
    return `❌ ${error.message}`;
  }

  const { projectPath } = resolved;
  const delegationsRoot = resolve(projectPath, 'standards/.context/delegations');
  const delegationBase = resolve(delegationsRoot, delegationId);
  const logPath = `${delegationBase}/log.md`;
  const resultPath = `${delegationBase}/result.md`;

  try {
    const [resolvedDelegationsRoot, resolvedLogPath, resolvedResultPath] = await Promise.all([
      realpath(delegationsRoot),
      realpath(logPath),
      realpath(resultPath),
    ]);
    if (!isPathWithinRoot(resolvedLogPath, resolvedDelegationsRoot) || !isPathWithinRoot(resolvedResultPath, resolvedDelegationsRoot)) {
      return '❌ delegation_id resolves outside the delegations directory';
    }
  } catch {
    // Let the validator report missing or unreadable log/result files.
  }

  const result = await validateDelegationOutput(logPath, resultPath, delegationId);

  const lines: string[] = [];
  if (result.pass) {
    lines.push(`✅ Delegation **${delegationId}** validated successfully.`);
  } else {
    lines.push(`❌ Delegation **${delegationId}** validation failed.`);
  }

  if (result.errors.length > 0) {
    lines.push('\n**Errors (blocking):**');
    for (const err of result.errors) {
      lines.push(`  - ${err}`);
    }
  }
  if (result.warnings.length > 0) {
    lines.push('\n**Warnings (non-blocking):**');
    for (const warn of result.warnings) {
      lines.push(`  - ${warn}`);
    }
  }

  if (result.escalation) {
    lines.push('\n**Escalation required:**');
    lines.push(`  - Reason: ${result.escalation.reason}`);
    lines.push(`  - Recommendation: ${result.escalation.recommendation}`);
    lines.push(`  - Attempts: ${result.escalation.attempts}`);
  }

  lines.push('\n**Log checks:**');
  lines.push(`  - delegation_id present: ${result.log_checks.delegation_id_present}`);
  lines.push(`  - delegation_id matches: ${result.log_checks.delegation_id_matches}`);
  lines.push(`  - recorded_at present: ${result.log_checks.recorded_at_present}`);
  lines.push(`  - recorded_at valid ISO 8601: ${result.log_checks.recorded_at_valid}`);
  lines.push(`  - sub_task present: ${result.log_checks.sub_task_present}`);
  lines.push(`  - status present: ${result.log_checks.status_present}`);
  lines.push(`  - status valid: ${result.log_checks.status_valid}`);
  lines.push(`  - Actions Taken section non-empty: ${result.log_checks.actions_taken_nonempty}`);
  lines.push(`  - Findings section non-empty: ${result.log_checks.findings_nonempty}`);

  lines.push('\n**Result checks:**');
  lines.push(`  - Delegation ID present: ${result.result_checks.delegation_id_present}`);
  lines.push(`  - Delegation ID matches: ${result.result_checks.delegation_id_matches}`);
  lines.push(`  - Timestamp present: ${result.result_checks.timestamp_present}`);
  lines.push(`  - Summary non-empty: ${result.result_checks.summary_nonempty}`);
  lines.push(`  - Findings non-empty: ${result.result_checks.findings_nonempty}`);
  lines.push(`  - Recommendations non-empty: ${result.result_checks.recommendations_nonempty}`);

  return lines.join('\n');
}
