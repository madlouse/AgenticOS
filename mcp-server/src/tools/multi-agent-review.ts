import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import { appendFile, mkdir, unlink, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { promisify } from 'util';
import pLimit from 'p-limit';

const execAsync = promisify(exec);
export const AGENT_REVIEW_CONCURRENCY = 2;
export const CLAUDE_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const DEFAULT_AGENT_TIMEOUT_MS = 180000;
const ARCHITECTURE_AGENT_TIMEOUT_MS = 300000;

function sanitize(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/[`*_~[\]()#>]/g, '?')
    .substring(0, 500);
}

function escapeHtml(value: string): string {
  return sanitize(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildReviewLogRow(
  result: MultiAgentReviewResult,
  now: string,
): string {
  const agentNames = result.reviews.map((r) => sanitize(r.agent_name)).join(', ');
  const findingCount = result.reviews.reduce((sum, r) => sum + r.findings.length, 0);
  const date = now.split('T')[0];
  const detailSections = result.reviews.map((review) => {
    const findings = review.findings.length > 0
      ? `<ul>${review.findings.map((finding) => `<li>${escapeHtml(finding)}</li>`).join('')}</ul>`
      : '<p><em>none</em></p>';
    const recommendations = review.recommendations.length > 0
      ? `<ul>${review.recommendations.map((recommendation) => `<li>${escapeHtml(recommendation)}</li>`).join('')}</ul>`
      : '<p><em>none</em></p>';
    const status = review.status === 'ok' ? 'OK' : 'ERROR';

    return [
      `<section><strong>${status} ${escapeHtml(review.agent_name)}</strong></section>`,
      `<p>${escapeHtml(review.summary)}</p>`,
      `<p><strong>Findings (${review.findings.length}):</strong></p>`,
      findings,
      `<p><strong>Recommendations (${review.recommendations.length}):</strong></p>`,
      recommendations,
    ].join('');
  }).join('<hr />');

  return [
    '<tr>',
    `<td><a href="https://github.com/madlouse/AgenticOS/pull/${result.pr_number}">#${result.pr_number}</a><details><summary>Details</summary>${detailSections}</details></td>`,
    `<td>${escapeHtml(agentNames)}</td>`,
    `<td><strong>${escapeHtml(result.overall_recommendation)}</strong></td>`,
    `<td>${findingCount}</td>`,
    `<td>${date}</td>`,
    '</tr>\n',
  ].join('');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// Agent role definitions for multi-agent review
export const AGENT_ROLES: Record<string, { name: string; focus: string; description: string; agent_type: string }> = {
  'code-reviewer': {
    name: 'Code Reviewer',
    focus: 'Code quality, logic correctness, maintainability',
    description: 'Reviews code changes for quality, correctness, and maintainability.',
    agent_type: 'code-reviewer',
  },
  'security-auditor': {
    name: 'Security Auditor',
    focus: 'Security vulnerabilities, injection risks, dependency issues',
    description: 'Audits for security vulnerabilities, injection risks, and dependency issues.',
    agent_type: 'security-auditor',
  },
  'qa-expert': {
    name: 'QA Expert',
    focus: 'Test coverage, edge cases, regression risks',
    description: 'Evaluates test coverage, identifies edge cases, and flags regression risks.',
    agent_type: 'qa-expert',
  },
  'architecture-reviewer': {
    name: 'Architecture Reviewer',
    focus: 'System design, scalability, technical debt',
    description: 'Reviews system design, scalability concerns, and accumulated technical debt.',
    agent_type: 'architecture-reviewer',
  },
  'performance-engineer': {
    name: 'Performance Engineer',
    focus: 'Performance bottlenecks, resource usage, scalability',
    description: 'Analyzes performance characteristics, identifies bottlenecks, and resource issues.',
    agent_type: 'performance-engineer',
  },
};

interface MultiAgentReviewArgs {
  pr_number?: number;
  agents?: string[];
  repo_path?: string;
  format?: 'markdown' | 'json';
}

interface AgentReviewResult {
  agent: string;
  agent_name: string;
  status: 'ok' | 'error';
  findings: string[];
  recommendations: string[];
  summary: string;
  duration_ms: number;
}

interface MultiAgentReviewResult {
  pr_number: number;
  total_agents: number;
  successful_agents: number;
  failed_agents: number;
  reviews: AgentReviewResult[];
  aggregated_summary: string;
  overall_recommendation: 'APPROVE' | 'REQUEST_CHANGES' | 'BLOCK';
  persistence_path?: string;
}

// Map agent type string to Claude --agent subagent type
export function mapToClaudeAgentType(agent: string): string {
  const known = ['code-reviewer', 'security-auditor', 'qa-expert', 'architecture-reviewer', 'performance-engineer'];
  return known.includes(agent) ? agent : 'code-reviewer';
}

function getClaudeAgentTimeoutMs(agentType: string): number {
  return agentType === 'architecture-reviewer'
    ? ARCHITECTURE_AGENT_TIMEOUT_MS
    : DEFAULT_AGENT_TIMEOUT_MS;
}

function buildPromptTempFilePath(tmpDir: string, pid: number, timestamp: number, uuid: string): string {
  return `${tmpDir}/claude-agent-prompt-${pid}-${timestamp}-${uuid}.txt`;
}

async function runGh(repoPath: string, args: string): Promise<string> {
  const { stdout } = await execAsync(`gh ${args}`, { cwd: repoPath, timeout: 30000 });
  return stdout.trim();
}

async function getPrDetails(repoPath: string, prNumber: number): Promise<{
  title: string;
  body: string;
  state: string;
  author: string;
  changedFiles: string[];
  additions: number;
  deletions: number;
}> {
  const prJson = await runGh(repoPath, `pr view ${prNumber} --json title,body,state,author,files,additions,deletions`);
  const pr = JSON.parse(prJson);
  const files = (pr.files?.nodes || pr.files || []) as Array<{ path: string }>;

  return {
    title: pr.title || '',
    body: pr.body || '',
    state: pr.state || 'UNKNOWN',
    author: pr.author?.login || 'unknown',
    changedFiles: files.map((f) => f.path),
    additions: pr.additions || 0,
    deletions: pr.deletions || 0,
  };
}

async function getFileDiff(repoPath: string, prNumber: number): Promise<string> {
  try {
    return await runGh(repoPath, `pr diff ${prNumber}`);
  } catch {
    return '(diff unavailable)';
  }
}

export function buildReviewPrompt(
  prDetails: Awaited<ReturnType<typeof getPrDetails>>,
  diff: string,
  agentRole: { name: string; focus: string; description: string },
  prNumber: number,
): string {
  const fileList = prDetails.changedFiles.slice(0, 30).join('\n');
  const truncatedDiff = diff.length > 8000 ? diff.substring(0, 8000) + '\n... (truncated)' : diff;

  return `You are performing a ${agentRole.name} review for PR #${prNumber}.

## Your Role
${agentRole.description}
Focus areas: ${agentRole.focus}

## PR Details
- Title: ${prDetails.title}
- Author: ${prDetails.author}
- State: ${prDetails.state}
- Changed files: ${prDetails.changedFiles.length}
- Additions: +${prDetails.additions} / -${prDetails.deletions}

## Files Changed
${fileList || '(no files)'}

## Diff
\`\`\`
${truncatedDiff}
\`\`\`

## Instructions
1. Review the diff with your focus areas in mind
2. Identify specific, actionable findings (with file:line references when possible)
3. Provide clear recommendations
4. Summarize your assessment in 2-3 sentences

Format your response exactly as:
**Findings:**
- (list specific issues, each as a separate bullet)

**Recommendations:**
- (list actionable recommendations, each as a separate bullet)

**Summary:**
(2-3 sentence assessment)`;
}

export async function runClaudeAgent(
  agentType: string,
  prompt: string,
): Promise<{ findings: string[]; recommendations: string[]; summary: string }> {
  const tmpDir = process.env.TEMP_DIR || process.env.TMPDIR || '/tmp';
  const tmpFile = buildPromptTempFilePath(tmpDir, process.pid, Date.now(), randomUUID());

  try {
    const agentFlag = mapToClaudeAgentType(agentType);
    // Write prompt to temp file — avoids shell injection from PR title/body/diff content
    await writeFile(tmpFile, prompt, 'utf-8');

    // Use 'command claude' to bypass shell function wrappers (e.g., agent-cli-api overrides 'claude')
    // execFile doesn't invoke a shell, so 'command' builtin isn't available — use execAsync instead
    // Redirect stdin from /dev/null to prevent 'no stdin data received' warning
    const { stdout } = await execAsync(
      `command claude --print --agent ${agentFlag} --system-prompt-file ${shellQuote(tmpFile)} . --dangerously-skip-permissions < /dev/null`,
      { timeout: getClaudeAgentTimeoutMs(agentType), maxBuffer: CLAUDE_MAX_BUFFER_BYTES },
    );

    const result = stdout.trim();
    const findings: string[] = [];
    const recommendations: string[] = [];
    let summary = '';

    const findingsMatch = result.match(/\*\*Findings:\*\*\s*\n?([\s\S]*?)(?=\*\*Recommendations:|$)/i);
    if (findingsMatch) {
      findings.push(...findingsMatch[1]
        .split('\n')
        .filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'))
        .map((l) => l.replace(/^[-*]\s*/, '').trim())
        .filter((l) => l.length > 0));
    }

    const recsMatch = result.match(/\*\*Recommendations:\*\*\s*\n?([\s\S]*?)(?=\*\*Summary:|$)/i);
    if (recsMatch) {
      recommendations.push(...recsMatch[1]
        .split('\n')
        .filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'))
        .map((l) => l.replace(/^[-*]\s*/, '').trim())
        .filter((l) => l.length > 0));
    }

    const summaryMatch = result.match(/\*\*Summary:\*\*\s*\n?([\s\S]*?)$/i);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
    } else if (result.length > 0) {
      summary = result.substring(0, 500).trim();
    }

    return { findings, recommendations, summary };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      findings: [`Failed to run ${agentType} agent: ${msg}`],
      recommendations: [],
      summary: `Agent ${agentType} failed: ${msg}`,
    };
  } finally {
    // Always clean up temp file
    await unlink(tmpFile).catch(() => {/* ignore */});
  }
}

export function aggregateResults(reviews: AgentReviewResult[]): {
  summary: string;
  recommendation: 'APPROVE' | 'REQUEST_CHANGES' | 'BLOCK';
} {
  if (reviews.length === 0) {
    return { summary: 'No reviews were completed.', recommendation: 'REQUEST_CHANGES' };
  }

  const blockers = reviews.filter((r) =>
    r.findings.some((f) =>
      f.toLowerCase().includes('block') ||
      f.toLowerCase().includes('security') ||
      f.toLowerCase().includes('critical'),
    ),
  ).length;

  const errors = reviews.filter((r) => r.status === 'error').length;
  const totalReviews = reviews.length;

  let recommendation: 'APPROVE' | 'REQUEST_CHANGES' | 'BLOCK' = 'APPROVE';

  if (blockers >= Math.ceil(totalReviews * 0.4)) {
    recommendation = 'BLOCK';
  } else if (errors > 0 || blockers > 0) {
    recommendation = 'REQUEST_CHANGES';
  }

  const totalFindings = reviews.reduce((sum, r) => sum + r.findings.length, 0);
  const totalRecs = reviews.reduce((sum, r) => sum + r.recommendations.length, 0);

  const summary = `${reviews.length} agent(s) reviewed this PR and produced ${totalFindings} finding(s) and ${totalRecs} recommendation(s). ` +
    `${blockers > 0 ? `${blockers} agent(s) flagged blocking issues. ` : ''}` +
    `${errors > 0 ? `${errors} agent(s) encountered errors. ` : ''}` +
    `Overall recommendation: ${recommendation}`;

  return { summary, recommendation };
}

export async function persistReviewLog(
  result: MultiAgentReviewResult,
  repoPath: string,
): Promise<string> {
  const safeBase = resolve(repoPath);
  const reviewLogPath = resolve(safeBase, 'tasks/global-review-log.md');
  // Guard: resolved path must stay within the repo directory
  if (!reviewLogPath.startsWith(safeBase + '/')) {
    throw new Error('Review log path escaped repository directory');
  }
  const now = new Date().toISOString();
  await mkdir(resolve(safeBase, 'tasks'), { recursive: true });

  try {
    await writeFile(
      reviewLogPath,
      [
        '# Global Review Log',
        '',
        '<table>',
        '<thead><tr><th>PR</th><th>Agents</th><th>Recommendation</th><th>Findings</th><th>Date</th></tr></thead>',
        '<tbody>',
        '',
      ].join('\n'),
      { encoding: 'utf-8', flag: 'wx' },
    );
  } catch (err) {
    const code = typeof err === 'object' && err && 'code' in err ? err.code : undefined;
    if (code !== 'EEXIST') {
      throw err;
    }
  }

  await appendFile(reviewLogPath, buildReviewLogRow(result, now), 'utf-8');
  return reviewLogPath;
}

export async function runAgentReviews<T>(
  agentTypes: string[],
  runner: (agentType: string) => Promise<T>,
  concurrency = AGENT_REVIEW_CONCURRENCY,
): Promise<PromiseSettledResult<T>[]> {
  const limit = pLimit(concurrency);
  return Promise.allSettled(agentTypes.map((agentType) => limit(() => runner(agentType))));
}

export async function runMultiAgentReview(args: MultiAgentReviewArgs): Promise<string> {
  const {
    pr_number,
    agents = ['code-reviewer', 'security-auditor', 'qa-expert'],
    repo_path = process.cwd(),
    format = 'markdown',
  } = args;

  if (!pr_number || pr_number <= 0) {
    return `❌ **Multi-Agent Review Error**\n\nPR number must be a positive integer, got: ${pr_number}`;
  }

  const validAgents = agents.filter((a) => a in AGENT_ROLES);
  if (validAgents.length === 0) {
    const available = Object.keys(AGENT_ROLES).join(', ');
    return `❌ **Multi-Agent Review Error**\n\nNo valid agent types. Available: ${available}`;
  }

  const startTime = Date.now();

  try {
    const prDetails = await getPrDetails(repo_path, pr_number);
    const diff = await getFileDiff(repo_path, pr_number);

    const settled = await runAgentReviews(validAgents, async (agentType) => {
      const agentRole = AGENT_ROLES[agentType];
      const agentStart = Date.now();
      const prompt = buildReviewPrompt(prDetails, diff, agentRole, pr_number);

      const reviewResult = await runClaudeAgent(agentType, prompt);

      return {
        agent: agentType,
        agent_name: agentRole.name,
        status: 'ok' as const,
        findings: reviewResult.findings,
        recommendations: reviewResult.recommendations,
        summary: reviewResult.summary,
        duration_ms: Date.now() - agentStart,
      } satisfies AgentReviewResult;
    });

    const reviews: AgentReviewResult[] = [];
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        reviews.push(outcome.value);
      } else {
        reviews.push({
          agent: 'unknown',
          agent_name: 'Unknown Agent',
          status: 'error',
          findings: [`Review failed: ${outcome.reason}`],
          recommendations: [],
          summary: 'Review encountered an error.',
          duration_ms: 0,
        });
      }
    }

    const { summary: aggregated_summary, recommendation: overall_recommendation } = aggregateResults(reviews);

    const result: MultiAgentReviewResult = {
      pr_number,
      total_agents: validAgents.length,
      successful_agents: reviews.filter((r) => r.status === 'ok').length,
      failed_agents: reviews.filter((r) => r.status === 'error').length,
      reviews,
      aggregated_summary,
      overall_recommendation,
    };

    const logPath = await persistReviewLog(result, repo_path);
    result.persistence_path = logPath;

    const totalDuration = Date.now() - startTime;

    if (format === 'json') {
      return JSON.stringify(result, null, 2);
    }

    const recommendationIcon = overall_recommendation === 'APPROVE' ? '✅' :
      overall_recommendation === 'BLOCK' ? '🚫' : '⚠️';

    const lines: string[] = [
      `## Multi-Agent Review — PR #${pr_number}`,
      '',
      `**Overall:** ${recommendationIcon} **${overall_recommendation}**`,
      `**Agents:** ${reviews.filter((r) => r.status === 'ok').length}/${validAgents.length} completed`,
      `**Duration:** ${totalDuration}ms total`,
      '',
    ];

    for (const review of reviews) {
      const icon = review.status === 'ok' ? '✅' : '❌';
      lines.push(`### ${icon} ${sanitize(review.agent_name)} (${review.duration_ms}ms)`);
      lines.push('');
      lines.push(sanitize(review.summary));
      lines.push('');
      if (review.findings.length > 0) {
        lines.push(`**Findings — ${review.findings.length}**`);
        for (const finding of review.findings) {
          lines.push(`- ${sanitize(finding)}`);
        }
        lines.push('');
      }
      if (review.recommendations.length > 0) {
        lines.push(`**Recommendations — ${review.recommendations.length}**`);
        for (const rec of review.recommendations) {
          lines.push(`- ${sanitize(rec)}`);
        }
        lines.push('');
      }
    }

    lines.push('---');
    lines.push(`📝 Review log → \`${logPath}\``);

    return lines.join('\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `❌ **Multi-Agent Review Failed**\n\n${message}\n\n` +
      `Verify: \`gh auth status\` and \`claude --version\`.`;
  }
}
