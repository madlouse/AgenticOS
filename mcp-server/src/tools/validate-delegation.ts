import { constants } from 'fs';
import { lstat, open, realpath } from 'fs/promises';
import { basename, resolve } from 'path';
import { validateDelegationContent } from '../utils/delegation-validation.js';
import { resolveManagedProjectTarget } from '../utils/project-target.js';
import { isPathWithinRoot } from '../utils/worktree-topology.js';

async function canonicalizeDelegationFile(filePath: string, resolvedDelegationsRoot: string): Promise<{
  path: string | null;
  error: string | null;
}> {
  try {
    const resolvedPath = await realpath(filePath);
    if (!isPathWithinRoot(resolvedPath, resolvedDelegationsRoot)) {
      return {
        path: null,
        error: '❌ delegation_id resolves outside the delegations directory',
      };
    }
    return {
      path: resolvedPath,
      error: null,
    };
  } catch (error: any) {
    const errorCode = typeof error?.code === 'string' ? error.code : '';
    if (errorCode === 'ENOENT' || errorCode === 'ENOTDIR') {
      return {
        path: null,
        error: `❌ delegation file not found or unreadable at ${filePath}`,
      };
    }
    return {
      path: null,
      error: '❌ failed to canonicalize delegation files',
    };
  }
}

async function readDelegationFileContent(canonicalPath: string, displayPath: string): Promise<{
  content: string | null;
  error: string | null;
}> {
  let handle;
  try {
    const expectedStat = await lstat(canonicalPath);
    handle = await open(canonicalPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const openedStat = await handle.stat();
    if (openedStat.dev !== expectedStat.dev || openedStat.ino !== expectedStat.ino) {
      return {
        content: null,
        error: '❌ delegation file changed during validation',
      };
    }
    return {
      content: await handle.readFile('utf-8'),
      error: null,
    };
  } catch {
    return {
      content: null,
      error: `❌ delegation file not found or unreadable at ${displayPath}`,
    };
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

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

  let resolvedDelegationsRoot: string;
  try {
    const [resolvedProjectPath, canonicalDelegationsRoot] = await Promise.all([
      realpath(projectPath),
      realpath(delegationsRoot),
    ]);
    if (!isPathWithinRoot(canonicalDelegationsRoot, resolvedProjectPath)) {
      return '❌ delegation_id resolves outside the delegations directory';
    }
    resolvedDelegationsRoot = canonicalDelegationsRoot;
  } catch {
    return '❌ failed to resolve delegation root';
  }

  const validatedLogPath = await canonicalizeDelegationFile(logPath, resolvedDelegationsRoot);
  if (validatedLogPath.error) {
    return validatedLogPath.error;
  }

  const validatedResultPath = await canonicalizeDelegationFile(resultPath, resolvedDelegationsRoot);
  if (validatedResultPath.error) {
    return validatedResultPath.error;
  }

  const logContent = await readDelegationFileContent(validatedLogPath.path!, logPath);
  if (logContent.error) {
    return logContent.error;
  }

  const resultContent = await readDelegationFileContent(validatedResultPath.path!, resultPath);
  if (resultContent.error) {
    return resultContent.error;
  }

  const result = validateDelegationContent(logContent.content!, resultContent.content!, delegationId);

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
