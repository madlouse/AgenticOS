import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface EnforceGitPolicyArgs {
  /** Full PR/MR URL to enforce policy on. */
  pr_url?: string;
  /** Repository in owner/repo format (required if pr_url not provided). */
  repo?: string;
  /** PR/MR number (required if pr_url not provided). */
  pr_number?: number;
  /** Git host provider (auto-detected from pr_url if omitted). */
  provider?: 'github' | 'gitlab';
  /** Minimum number of approvals required (default: 1). */
  required_approvals?: number;
}

type CheckStatus = 'PASS' | 'FAIL' | 'SKIP';

interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
}

interface EnforceResult {
  status: 'PASS' | 'BLOCK';
  provider: string;
  repo: string;
  pr_number: number;
  branch: string;
  checks: Check[];
  blocked_reasons: string[];
  url: string;
}

export function detectProvider(prUrl?: string, explicit?: 'github' | 'gitlab'): 'github' | 'gitlab' {
  if (explicit) return explicit;
  if (prUrl?.includes('gitlab.com')) return 'gitlab';
  if (prUrl?.includes('github.com')) return 'github';
  return 'github'; // default
}

function sanitize(value: string): string {
  // Strip markdown-special characters to prevent output injection
  return value.replace(/[`*_~[\]()#>]/g, '?').substring(0, 200);
}

export function parsePrUrl(prUrl: string): { repo: string; number: number } | null {
  // GitHub: https://github.com/owner/repo/pull/123
  // GitLab: https://gitlab.com/owner/repo/-/merge_requests/123
  const ghMatch = prUrl.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (ghMatch) return { repo: ghMatch[1], number: parseInt(ghMatch[2], 10) };

  const glMatch = prUrl.match(/gitlab\.com\/(.+?)\/-\/merge_requests\/(\d+)/);
  if (glMatch) return { repo: glMatch[1], number: parseInt(glMatch[2], 10) };

  return null;
}

export function buildPrUrl(provider: string, repo: string, prNumber: number): string {
  if (provider === 'gitlab') return `https://gitlab.com/${repo}/-/merge_requests/${prNumber}`;
  return `https://github.com/${repo}/pull/${prNumber}`;
}

// ---------------------------------------------------------------------------
// GitHub checks
// ---------------------------------------------------------------------------

async function ghRun(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('gh', args, { timeout: 15000 });
  return (stdout ?? '').trim();
}

async function checkGhCiStatus(repo: string, branch: string): Promise<Check> {
  try {
    const output = await ghRun([
      'run', 'list', '--repo', repo, '--branch', branch,
      '--limit', '1', '--json', 'status,conclusion,name', '--jq', '.[0]',
    ]);
    if (!output || output === 'null') {
      return { name: 'CI Status', status: 'SKIP', detail: 'No recent workflow runs found' };
    }
    const run = JSON.parse(output);
    const status = run.status;
    const conclusion = run.conclusion;

    if (status === 'in_progress' || status === 'queued' || status === 'waiting') {
      return { name: 'CI Status', status: 'FAIL', detail: `CI is ${status}` };
    }
    if (conclusion === 'success') {
      return { name: 'CI Status', status: 'PASS', detail: `CI passed (${sanitize(run.name)})` };
    }
    return { name: 'CI Status', status: 'FAIL', detail: `CI ${sanitize(conclusion || status)} (${sanitize(run.name)})` };
  } catch {
    return {
      name: 'CI Status',
      status: 'SKIP',
      detail: 'Could not check CI (command failed)',
    };
  }
}

async function checkGhPrState(repo: string, prNumber: number): Promise<Check> {
  try {
    const output = await ghRun([
      'pr', 'view', String(prNumber), '--repo', repo,
      '--json', 'isDraft,state,title', '--jq', '{isDraft,state,title}',
    ]);
    const info = JSON.parse(output);

    if (info.isDraft) {
      return { name: 'PR Draft', status: 'FAIL', detail: 'PR is still in draft state' };
    }
    if (info.state !== 'OPEN') {
      return { name: 'PR State', status: 'FAIL', detail: `PR is ${info.state}, not OPEN` };
    }
    return { name: 'PR State', status: 'PASS', detail: `PR is open (${sanitize(info.title)})` };
  } catch {
    return {
      name: 'PR State',
      status: 'SKIP',
      detail: 'Could not check PR state (command failed)',
    };
  }
}

async function checkGhApprovals(repo: string, prNumber: number, required: number): Promise<Check> {
  try {
    const output = await ghRun([
      'pr', 'view', String(prNumber), '--repo', repo,
      '--json', 'reviewDecision,reviews', '--jq', '{reviewDecision,reviews}',
    ]);
    const info = JSON.parse(output);

    const approvingReviews = (info.reviews || []).filter(
      (r: { state: string }) => r.state === 'APPROVED',
    ).length;

    if (info.reviewDecision === 'APPROVED' || approvingReviews >= required) {
      return {
        name: 'PR Approvals',
        status: 'PASS',
        detail: `${approvingReviews} approving review(s) (required: ${required})`,
      };
    }
    if (info.reviewDecision === 'CHANGES_REQUESTED') {
      return { name: 'PR Approvals', status: 'FAIL', detail: 'Changes have been requested' };
    }
    if (info.reviewDecision === 'REVIEW_REQUIRED' || approvingReviews < required) {
      return {
        name: 'PR Approvals',
        status: 'FAIL',
        detail: `${approvingReviews} approval(s), ${required} required`,
      };
    }
    return { name: 'PR Approvals', status: 'SKIP', detail: 'Could not determine review status' };
  } catch {
    return {
      name: 'PR Approvals',
      status: 'SKIP',
      detail: 'Could not check approvals (command failed)',
    };
  }
}

async function checkGhGitPolicy(repo: string, prNumber: number, requiredApprovals: number): Promise<EnforceResult> {
  try {
    // Get PR branch first
    const prViewOutput = await ghRun([
      'pr', 'view', String(prNumber), '--repo', repo,
      '--json', 'headRefName', '--jq', '.headRefName',
    ]);
    const branch = prViewOutput.trim();

    const [ciStatus, prState, approvals] = await Promise.all([
      checkGhCiStatus(repo, branch),
      checkGhPrState(repo, prNumber),
      checkGhApprovals(repo, prNumber, requiredApprovals),
    ]);

    const checks: Check[] = [ciStatus, prState, approvals];
    const blocked_reasons = checks
      .filter((c) => c.status === 'FAIL')
      .map((c) => `${c.name}: ${c.detail}`);

    return {
      status: blocked_reasons.length === 0 ? 'PASS' : 'BLOCK',
      provider: 'github',
      repo,
      pr_number: prNumber,
      branch,
      checks,
      blocked_reasons,
      url: buildPrUrl('github', repo, prNumber),
    };
  } catch (err) {
    return {
      status: 'BLOCK',
      provider: 'github',
      repo,
      pr_number: prNumber,
      branch: '(unknown)',
      checks: [{
        name: 'GitHub API',
        status: 'FAIL',
        detail: 'Could not access PR (command failed)',
      }],
      blocked_reasons: ['GitHub API error: command failed'],
      url: buildPrUrl('github', repo, prNumber),
    };
  }
}

// ---------------------------------------------------------------------------
// GitLab checks (requires glab CLI)
// ---------------------------------------------------------------------------

async function checkGitlabSupport(): Promise<boolean> {
  try {
    await execFileAsync('which', ['glab'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function checkGlCiStatus(repo: string, mrIid: number): Promise<Check> {
  try {
    const { stdout } = await execFileAsync(
      'glab', ['ci', 'status', '--repo', repo, '--output', 'json'],
      { timeout: 15000 },
    );
    const info = JSON.parse(stdout);
    const status = info.status || info.state;

    if (status === 'success' || status === 'passed') {
      return { name: 'CI Status', status: 'PASS', detail: 'Pipeline passed' };
    }
    if (status === 'running' || status === 'pending') {
      return { name: 'CI Status', status: 'FAIL', detail: `Pipeline is ${status}` };
    }
    return { name: 'CI Status', status: 'FAIL', detail: `Pipeline ${status}` };
  } catch {
    return { name: 'CI Status', status: 'SKIP', detail: 'glab not installed or not authenticated' };
  }
}

async function checkGlMrState(repo: string, mrIid: number): Promise<Check> {
  try {
    const { stdout } = await execFileAsync(
      'glab', ['mr', 'view', String(mrIid), '--repo', repo, '--output', 'json', '--fields', 'state,title'],
      { timeout: 15000 },
    );
    const info = JSON.parse(stdout);
    if (info.state !== 'opened') {
      return { name: 'MR State', status: 'FAIL', detail: `MR is ${info.state}` };
    }
    return { name: 'MR State', status: 'PASS', detail: `MR is open (${sanitize(info.title)})` };
  } catch {
    return { name: 'MR State', status: 'SKIP', detail: 'glab not installed or not authenticated' };
  }
}

async function checkGlApprovals(repo: string, mrIid: number, required: number): Promise<Check> {
  try {
    const { stdout } = await execFileAsync(
      'glab', ['mr', 'view', String(mrIid), '--repo', repo, '--output', 'json', '--fields', 'approvals'],
      { timeout: 15000 },
    );
    const info = JSON.parse(stdout);
    const approved = info.approvals?.approved ?? false;
    const count = info.approvals?.approved_by?.length ?? 0;

    if (approved || count >= required) {
      return { name: 'MR Approvals', status: 'PASS', detail: `${count} approval(s) (required: ${required})` };
    }
    return { name: 'MR Approvals', status: 'FAIL', detail: `${count} approval(s), ${required} required` };
  } catch {
    return { name: 'MR Approvals', status: 'SKIP', detail: 'Could not check MR approvals' };
  }
}

async function checkGlGitPolicy(repo: string, mrIid: number, requiredApprovals: number): Promise<EnforceResult> {
  const [ciStatus, mrState, approvals] = await Promise.all([
    checkGlCiStatus(repo, mrIid),
    checkGlMrState(repo, mrIid),
    checkGlApprovals(repo, mrIid, requiredApprovals),
  ]);

  const checks: Check[] = [ciStatus, mrState, approvals];
  const blocked_reasons = checks
    .filter((c) => c.status === 'FAIL')
    .map((c) => `${c.name}: ${c.detail}`);

  return {
    status: blocked_reasons.length === 0 ? 'PASS' : 'BLOCK',
    provider: 'gitlab',
    repo,
    pr_number: mrIid,
    branch: '(unknown)',
    checks,
    blocked_reasons,
    url: buildPrUrl('gitlab', repo, mrIid),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runEnforceGitPolicy(args: EnforceGitPolicyArgs): Promise<string> {
  const {
    pr_url,
    repo: explicitRepo,
    pr_number: explicitNumber,
    provider: explicitProvider,
    required_approvals: rawApprovals = 1,
  } = args;

  const required_approvals = Math.max(0, Math.min(rawApprovals, 50));

  const provider = detectProvider(pr_url, explicitProvider);

  // Resolve repo and number
  let repo = explicitRepo;
  let prNumber = explicitNumber;

  if (pr_url) {
    const parsed = parsePrUrl(pr_url);
    if (!parsed) {
      return [
        '**Git Policy Enforcement Error**',
        '',
        `Could not parse PR/MR URL: \`${pr_url}\``,
        '',
        'Expected formats:',
        '- GitHub: `https://github.com/owner/repo/pull/123`',
        '- GitLab: `https://gitlab.com/owner/repo/-/merge_requests/123`',
      ].join('\n');
    }
    repo = parsed.repo;
    prNumber = parsed.number;
  }

  if (!repo || !prNumber) {
    return [
      '**Git Policy Enforcement Error**',
      '',
      'Either `pr_url` or both `repo` and `pr_number` are required.',
    ].join('\n');
  }

  if (provider === 'gitlab') {
    const supported = await checkGitlabSupport();
    if (!supported) {
      return [
        '**GitLab Support Requires `glab` CLI**',
        '',
        `\`glab\` is not installed or not authenticated.`,
        '',
        'Install: https://gitlab.com/gitlab-org/cli',
        'Auth:   `glab auth login`',
      ].join('\n');
    }
    const result = await checkGlGitPolicy(repo, prNumber, required_approvals);
    return formatResult(result);
  }

  const result = await checkGhGitPolicy(repo, prNumber, required_approvals);
  return formatResult(result);
}

function formatResult(result: EnforceResult): string {
  const statusIcon = result.status === 'PASS' ? '✅' : '🚫';
  const statusLabel = result.status === 'PASS' ? 'PASS — Ready to merge' : 'BLOCK — Issues found';

  const checkLines = result.checks.map((c) => {
    const icon = c.status === 'PASS' ? '✅' : c.status === 'FAIL' ? '❌' : '⏭️';
    return `  ${icon} **${c.name}:** ${c.detail}`;
  });

  const lines = [
    `## ${statusIcon} Git Policy Enforcement — ${result.status}`,
    '',
    `**Provider:** ${result.provider}`,
    `**Repository:** \`${result.repo}\``,
    `**PR/MR #:** ${result.pr_number}`,
    `**Branch:** \`${result.branch}\``,
    `**URL:** ${result.url}`,
    '',
    '### Checks',
    '',
    ...checkLines,
  ];

  if (result.blocked_reasons.length > 0) {
    lines.push('');
    lines.push('### Blocked Reasons');
    for (const reason of result.blocked_reasons) {
      lines.push(`- ${reason}`);
    }
  }

  if (result.status === 'PASS') {
    lines.push('');
    lines.push('> All required checks passed. This PR/MR is cleared for merge.');
  } else {
    lines.push('');
    lines.push('> Resolve the failed checks above before merging.');
  }

  return lines.join('\n');
}
