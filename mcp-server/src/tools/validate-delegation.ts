import { execFile } from 'child_process';
import { realpath } from 'fs/promises';
import { basename, relative, resolve } from 'path';
import { validateDelegationContent } from '../utils/delegation-validation.js';
import { resolveManagedProjectTarget } from '../utils/project-target.js';
import { isPathWithinRoot } from '../utils/worktree-topology.js';

const SECURE_READ_SCRIPT = String.raw`
import os
import sys

root = sys.argv[1]
relative_path = sys.argv[2]
parts = [part for part in relative_path.split('/') if part not in ('', '.')]
if not parts or any(part == '..' for part in parts):
    raise SystemExit(2)

dir_fds = []
file_fd = None
try:
    current_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    dir_fds.append(current_fd)

    for part in parts[:-1]:
        current_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=current_fd)
        dir_fds.append(current_fd)

    file_fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW, dir_fd=current_fd)
    with os.fdopen(file_fd, 'r', encoding='utf-8') as handle:
        sys.stdout.write(handle.read())
    file_fd = None
finally:
    if file_fd is not None:
        os.close(file_fd)
    for fd in reversed(dir_fds):
        os.close(fd)
`;

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

async function readDelegationFileContent(
  resolvedDelegationsRoot: string,
  canonicalPath: string,
  displayPath: string,
): Promise<{
  content: string | null;
  error: string | null;
}> {
  const relativePath = relative(resolvedDelegationsRoot, canonicalPath).replace(/\\/g, '/');
  if (!relativePath || relativePath === '..' || relativePath.startsWith('../')) {
    return {
      content: null,
      error: '❌ delegation file changed during validation',
    };
  }

  try {
    const content = await new Promise<string>((resolvePromise, rejectPromise) => {
      execFile(
        'python3',
        ['-c', SECURE_READ_SCRIPT, resolvedDelegationsRoot, relativePath],
        {
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024,
        },
        (error, stdout) => {
          if (error) {
            rejectPromise(error);
            return;
          }
          resolvePromise(stdout);
        },
      );
    });
    return { content, error: null };
  } catch {
    return {
      content: null,
      error: `❌ delegation file not found or unreadable at ${displayPath}`,
    };
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

  const logContent = await readDelegationFileContent(resolvedDelegationsRoot, validatedLogPath.path!, logPath);
  if (logContent.error) {
    return logContent.error;
  }

  const resultContent = await readDelegationFileContent(resolvedDelegationsRoot, validatedResultPath.path!, resultPath);
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
