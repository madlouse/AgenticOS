import { promisify } from 'util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const execAsyncMock = vi.fn();
const execMock = vi.fn();
Object.defineProperty(execMock, promisify.custom, {
  value: execAsyncMock,
});

const appendFileMock = vi.fn();
const mkdirMock = vi.fn();
const unlinkMock = vi.fn();
const writeFileMock = vi.fn();
const randomUUIDMock = vi.fn();

vi.mock('child_process', () => ({
  exec: execMock,
}));

vi.mock('crypto', () => ({
  randomUUID: randomUUIDMock,
}));

vi.mock('fs/promises', async () => ({
  appendFile: appendFileMock,
  mkdir: mkdirMock,
  unlink: unlinkMock,
  writeFile: writeFileMock,
}));

async function loadModule() {
  return import('../multi-agent-review.js');
}

const PR_DETAILS = {
  title: 'feat: add delegation toolchain',
  body: 'Implements delegation + coverage',
  state: 'OPEN',
  author: 'jeking',
  changedFiles: ['src/index.ts', 'src/tools/index.ts'],
  additions: 120,
  deletions: 30,
};

const REVIEW_RESULT = {
  pr_number: 42,
  total_agents: 2,
  successful_agents: 2,
  failed_agents: 0,
  reviews: [
    {
      agent: 'code-reviewer',
      agent_name: 'Code Reviewer',
      status: 'ok' as const,
      findings: ['Needs more tests'],
      recommendations: ['Add unit tests'],
      summary: 'Solid overall.',
      duration_ms: 100,
    },
  ],
  aggregated_summary: '1 agent reviewed the PR.',
  overall_recommendation: 'REQUEST_CHANGES' as const,
};

describe('multi-agent-review', () => {
  beforeEach(() => {
    vi.resetModules();

    execAsyncMock.mockReset();
    execAsyncMock.mockResolvedValue({ stdout: '', stderr: '' });

    appendFileMock.mockReset();
    appendFileMock.mockResolvedValue(undefined);

    mkdirMock.mockReset();
    mkdirMock.mockResolvedValue(undefined);

    unlinkMock.mockReset();
    unlinkMock.mockResolvedValue(undefined);

    writeFileMock.mockReset();
    writeFileMock.mockResolvedValue(undefined);

    randomUUIDMock.mockReset();
    randomUUIDMock.mockReturnValue('uuid-123');
  });

  describe('mapToClaudeAgentType', () => {
    it('maps known agent types', async () => {
      const mod = await loadModule();
      expect(mod.mapToClaudeAgentType('code-reviewer')).toBe('code-reviewer');
      expect(mod.mapToClaudeAgentType('security-auditor')).toBe('security-auditor');
      expect(mod.mapToClaudeAgentType('qa-expert')).toBe('qa-expert');
      expect(mod.mapToClaudeAgentType('architecture-reviewer')).toBe('architecture-reviewer');
      expect(mod.mapToClaudeAgentType('performance-engineer')).toBe('performance-engineer');
    });

    it('defaults unknown agents to code-reviewer', async () => {
      const mod = await loadModule();
      expect(mod.mapToClaudeAgentType('unknown-agent')).toBe('code-reviewer');
      expect(mod.mapToClaudeAgentType('')).toBe('code-reviewer');
    });
  });

  describe('aggregateResults', () => {
    it('returns REQUEST_CHANGES for empty reviews', async () => {
      const mod = await loadModule();
      const result = mod.aggregateResults([]);
      expect(result.recommendation).toBe('REQUEST_CHANGES');
      expect(result.summary).toContain('No reviews were completed');
    });

    it('returns APPROVE when no blockers', async () => {
      const mod = await loadModule();
      const reviews = [
        { findings: ['Style issue'], recommendations: ['Fix formatting'], status: 'ok', duration_ms: 100 },
      ] as any;
      expect(mod.aggregateResults(reviews).recommendation).toBe('APPROVE');
    });

    it('returns BLOCK when blockers >= 40%', async () => {
      const mod = await loadModule();
      const reviews = [
        { findings: ['SECURITY: RCE'], recommendations: [], status: 'ok', duration_ms: 100 },
        { findings: ['Blocker'], recommendations: [], status: 'ok', duration_ms: 100 },
        { findings: ['Nits'], recommendations: [], status: 'ok', duration_ms: 100 },
      ] as any;
      expect(mod.aggregateResults(reviews).recommendation).toBe('BLOCK');
    });

    it('returns REQUEST_CHANGES for 1 blocker out of 4', async () => {
      const mod = await loadModule();
      const reviews = [
        { findings: ['SECURITY: critical'], status: 'ok', recommendations: [], duration_ms: 100 },
        { findings: ['Style'], status: 'ok', recommendations: [], duration_ms: 100 },
        { findings: [], status: 'ok', recommendations: [], duration_ms: 100 },
        { findings: [], status: 'ok', recommendations: [], duration_ms: 100 },
      ] as any;
      expect(mod.aggregateResults(reviews).recommendation).toBe('REQUEST_CHANGES');
    });

    it('returns REQUEST_CHANGES when any agent errors', async () => {
      const mod = await loadModule();
      const reviews = [
        { findings: [], status: 'error', recommendations: [], duration_ms: 0 },
      ] as any;
      expect(mod.aggregateResults(reviews).recommendation).toBe('REQUEST_CHANGES');
    });

    it('counts findings and recommendations in summary', async () => {
      const mod = await loadModule();
      const reviews = [
        { findings: ['A', 'B'], recommendations: ['X', 'Y', 'Z'], status: 'ok', duration_ms: 100 },
      ] as any;
      const result = mod.aggregateResults(reviews);
      expect(result.summary).toContain('2 finding(s)');
      expect(result.summary).toContain('3 recommendation(s)');
    });
  });

  describe('buildReviewPrompt', () => {
    it('includes PR number and title', async () => {
      const mod = await loadModule();
      const prompt = mod.buildReviewPrompt(PR_DETAILS, '', {
        name: 'Code Reviewer',
        focus: 'quality',
        description: 'Reviews code',
      }, 42);
      expect(prompt).toContain('PR #42');
      expect(prompt).toContain('feat: add delegation toolchain');
    });

    it('includes author and stats', async () => {
      const mod = await loadModule();
      const prompt = mod.buildReviewPrompt(PR_DETAILS, '', {
        name: 'QA', focus: 'coverage', description: 'QA review',
      }, 1);
      expect(prompt).toContain('jeking');
      expect(prompt).toContain('+120');
      expect(prompt).toContain('-30');
    });

    it('limits file list to 30', async () => {
      const mod = await loadModule();
      const manyFiles = Array.from({ length: 50 }, (_, i) => `src/file${i}.ts`);
      const details = { ...PR_DETAILS, changedFiles: manyFiles };
      const prompt = mod.buildReviewPrompt(details, '', {
        name: 'QA', focus: 'coverage', description: 'QA review',
      }, 1);
      const fileLines = prompt.split('\n').filter((line) => line.startsWith('src/file'));
      expect(fileLines.length).toBe(30);
    });

    it('truncates long diffs with marker', async () => {
      const mod = await loadModule();
      const longDiff = 'a'.repeat(20000);
      const prompt = mod.buildReviewPrompt(PR_DETAILS, longDiff, {
        name: 'QA', focus: 'coverage', description: 'QA review',
      }, 1);
      expect(prompt).toContain('... (truncated)');
      expect(prompt.length).toBeLessThan(12000);
    });
  });

  describe('agent execution settings', () => {
    it('runs claude with expanded buffer, shell-safe prompt files, and cleanup', async () => {
      process.env.TMPDIR = `/tmp/test-agent-review-$(echo nope)-o'hare`;
      execAsyncMock.mockResolvedValue({
        stdout: '**Findings:**\n- Missing limit\n\n**Recommendations:**\n- Add tests\n\n**Summary:**\nNeeds follow-up.',
        stderr: '',
      });

      const mod = await loadModule();
      const result = await mod.runClaudeAgent('architecture-reviewer', 'review this diff');

      expect(result.findings).toEqual(['Missing limit']);
      expect(result.recommendations).toEqual(['Add tests']);
      expect(result.summary).toBe('Needs follow-up.');

      const tmpFile = writeFileMock.mock.calls[0][0] as string;
      expect(tmpFile).toContain('/tmp/test-agent-review-$(echo nope)-o\'hare/claude-agent-prompt-');
      expect(tmpFile).toContain('uuid-123.txt');

      const execCommand = execAsyncMock.mock.calls[0][0] as string;
      expect(execCommand).toContain(`--system-prompt-file '/tmp/test-agent-review-$(echo nope)-o'\\''hare`);
      expect(execCommand).not.toContain(`--system-prompt-file "${tmpFile}"`);
      expect(execAsyncMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timeout: 300000,
          maxBuffer: 10 * 1024 * 1024,
        }),
      );
      expect(unlinkMock).toHaveBeenCalledWith(tmpFile);
    });
  });

  describe('concurrency and persistence', () => {
    it('limits concurrent agent execution to 2', async () => {
      const mod = await loadModule();
      let active = 0;
      let maxActive = 0;

      const settled = await mod.runAgentReviews(
        ['a', 'b', 'c', 'd'],
        async (agentType: string) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 10));
          active -= 1;
          return agentType;
        },
        2,
      );

      expect(maxActive).toBe(2);
      expect(settled.every((result) => result.status === 'fulfilled')).toBe(true);
    });

    it('formats log entries as append-only sections', async () => {
      const mod = await loadModule();
      await mod.persistReviewLog(REVIEW_RESULT, '/repo');
      expect(appendFileMock).toHaveBeenCalledWith(
        '/repo/tasks/global-review-log.md',
        expect.stringContaining('## PR #42'),
        'utf-8',
      );
      expect(appendFileMock).toHaveBeenCalledWith(
        '/repo/tasks/global-review-log.md',
        expect.stringContaining('### OK Code Reviewer'),
        'utf-8',
      );
    });

    it('creates log header atomically before appending new entries', async () => {
      const mod = await loadModule();
      const logPath = await mod.persistReviewLog(REVIEW_RESULT, '/repo');

      expect(logPath).toBe('/repo/tasks/global-review-log.md');
      expect(mkdirMock).toHaveBeenCalledWith('/repo/tasks', { recursive: true });
      expect(writeFileMock).toHaveBeenNthCalledWith(
        1,
        '/repo/tasks/global-review-log.md',
        expect.stringContaining('# Global Review Log'),
        expect.objectContaining({ flag: 'wx' }),
      );
      expect(appendFileMock).toHaveBeenCalledTimes(1);
      expect(appendFileMock).toHaveBeenCalledWith(
        '/repo/tasks/global-review-log.md',
        expect.stringContaining('## PR #42'),
        'utf-8',
      );
    });

    it('treats EEXIST during header creation as a harmless concurrent writer race', async () => {
      writeFileMock.mockRejectedValueOnce(Object.assign(new Error('exists'), { code: 'EEXIST' }));

      const mod = await loadModule();
      await expect(mod.persistReviewLog(REVIEW_RESULT, '/repo')).resolves.toBe('/repo/tasks/global-review-log.md');
      expect(appendFileMock).toHaveBeenCalledTimes(1);
    });

    it('runs the main review path with bounded orchestration and per-agent timeouts', async () => {
      let activeReviews = 0;
      let maxActiveReviews = 0;

      execAsyncMock.mockImplementation(async (command: string, options?: { timeout?: number; maxBuffer?: number }) => {
        if (command.startsWith('gh pr view')) {
          return {
            stdout: JSON.stringify({
              title: PR_DETAILS.title,
              body: PR_DETAILS.body,
              state: PR_DETAILS.state,
              author: { login: PR_DETAILS.author },
              files: PR_DETAILS.changedFiles.map((path) => ({ path })),
              additions: PR_DETAILS.additions,
              deletions: PR_DETAILS.deletions,
            }),
            stderr: '',
          };
        }

        if (command.startsWith('gh pr diff')) {
          return { stdout: 'diff --git a/src/index.ts b/src/index.ts', stderr: '' };
        }

        if (command.startsWith('command claude')) {
          activeReviews += 1;
          maxActiveReviews = Math.max(maxActiveReviews, activeReviews);
          await new Promise((resolve) => setTimeout(resolve, 10));
          activeReviews -= 1;

          return {
            stdout: '**Findings:**\n- Looks fine\n\n**Recommendations:**\n- Ship it\n\n**Summary:**\nNo blocking issues.',
            stderr: '',
          };
        }

        throw new Error(`unexpected command: ${command}`);
      });

      const mod = await loadModule();
      const output = await mod.runMultiAgentReview({
        pr_number: 42,
        repo_path: '/repo',
        agents: ['code-reviewer', 'security-auditor', 'qa-expert', 'architecture-reviewer'],
      });

      expect(output).toContain('## Multi-Agent Review — PR #42');
      expect(output).toContain('**Agents:** 4/4 completed');
      expect(maxActiveReviews).toBe(2);

      const claudeCallOptions = execAsyncMock.mock.calls
        .filter(([command]) => (command as string).startsWith('command claude'))
        .map(([, options]) => options as { timeout: number; maxBuffer: number });

      expect(claudeCallOptions).toContainEqual(expect.objectContaining({ timeout: 300000, maxBuffer: 10 * 1024 * 1024 }));
      expect(claudeCallOptions).toContainEqual(expect.objectContaining({ timeout: 180000, maxBuffer: 10 * 1024 * 1024 }));
    });
  });

  describe('AGENT_ROLES', () => {
    it('defines all 5 agent types', async () => {
      const mod = await loadModule();
      const roles = mod.AGENT_ROLES as Record<string, any>;
      expect(Object.keys(roles)).toHaveLength(5);
      expect(roles['code-reviewer']).toBeDefined();
      expect(roles['security-auditor']).toBeDefined();
      expect(roles['qa-expert']).toBeDefined();
      expect(roles['architecture-reviewer']).toBeDefined();
      expect(roles['performance-engineer']).toBeDefined();
    });
  });
});
