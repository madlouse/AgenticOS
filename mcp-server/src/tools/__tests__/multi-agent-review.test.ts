import { promisify } from 'util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const execAsyncMock = vi.fn();
const execMock = vi.fn();
Object.defineProperty(execMock, promisify.custom, {
  value: execAsyncMock,
});

const appendFileMock = vi.fn();
const lstatMock = vi.fn();
const mkdirMock = vi.fn();
const openFileMock = vi.fn();
const readFileMock = vi.fn();
const renameMock = vi.fn();
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
  lstat: lstatMock,
  mkdir: mkdirMock,
  open: openFileMock,
  readFile: readFileMock,
  rename: renameMock,
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

    lstatMock.mockReset();
    lstatMock.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    mkdirMock.mockReset();
    mkdirMock.mockResolvedValue(undefined);

    openFileMock.mockReset();
    openFileMock.mockImplementation(async () => ({
      read: async (buffer: Buffer) => {
        const content = '# Global Review Log\n\n<!-- agenticos:global-review-log:v2 -->\n\n<table>\n<tbody>\n';
        buffer.write(content);
        return { bytesRead: Buffer.byteLength(content) };
      },
      close: async () => undefined,
    }));

    readFileMock.mockReset();
    readFileMock.mockResolvedValue('# Global Review Log\n\n<table>\n<tbody>\n');

    renameMock.mockReset();
    renameMock.mockResolvedValue(undefined);

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
        expect.stringContaining('<tr>'),
        'utf-8',
      );
      expect(appendFileMock).toHaveBeenCalledWith(
        '/repo/tasks/global-review-log.md',
        expect.stringContaining('<details><summary>Details</summary>'),
        'utf-8',
      );
      expect(appendFileMock).toHaveBeenCalledWith(
        '/repo/tasks/global-review-log.md',
        expect.stringContaining('OK Code Reviewer'),
        'utf-8',
      );
    });

    it('creates log header atomically before appending new entries', async () => {
      const mod = await loadModule();
      const logPath = await mod.persistReviewLog(REVIEW_RESULT, '/repo');

      expect(logPath).toBe('/repo/tasks/global-review-log.md');
      expect(mkdirMock).toHaveBeenCalledWith('/repo/tasks', { recursive: true });
      expect(lstatMock).toHaveBeenCalledWith('/repo/tasks');
      expect(lstatMock).toHaveBeenCalledWith('/repo/tasks/global-review-log.md');
      expect(writeFileMock).toHaveBeenNthCalledWith(
        1,
        '/repo/tasks/global-review-log.md',
        expect.stringContaining('# Global Review Log'),
        expect.objectContaining({ flag: 'wx' }),
      );
      expect(appendFileMock).toHaveBeenCalledTimes(1);
      expect(appendFileMock).toHaveBeenCalledWith(
        '/repo/tasks/global-review-log.md',
        expect.stringContaining('<a href="https://github.com/madlouse/AgenticOS/pull/42">#42</a>'),
        'utf-8',
      );
    });

    it('treats EEXIST during header creation as a harmless concurrent writer race', async () => {
      writeFileMock.mockRejectedValueOnce(Object.assign(new Error('exists'), { code: 'EEXIST' }));

      const mod = await loadModule();
      await expect(mod.persistReviewLog(REVIEW_RESULT, '/repo')).resolves.toBe('/repo/tasks/global-review-log.md');
      expect(readFileMock).not.toHaveBeenCalled();
      expect(appendFileMock).toHaveBeenCalledTimes(1);
      expect(writeFileMock).toHaveBeenCalledTimes(1);
    });

    it('migrates legacy markdown review logs before appending new rows', async () => {
      writeFileMock.mockRejectedValueOnce(Object.assign(new Error('exists'), { code: 'EEXIST' }));
      openFileMock.mockImplementation(async () => ({
        read: async (buffer: Buffer) => {
          const content = '# Global Review Log\n\n| PR | Agents | Recommendation | Findings | Date |\n';
          buffer.write(content);
          return { bytesRead: Buffer.byteLength(content) };
        },
        close: async () => undefined,
      }));
      readFileMock.mockResolvedValueOnce([
        '# Global Review Log',
        '',
        '| PR | Agents | Recommendation | Findings | Date |',
        '|---|---|---|---|---|',
        '| [#1](https://github.com/madlouse/AgenticOS/pull/1) | Old Agent | **APPROVE** | 0 | 2026-05-10 |',
      ].join('\n'));

      const mod = await loadModule();
      await mod.persistReviewLog(REVIEW_RESULT, '/repo');

      expect(writeFileMock).toHaveBeenNthCalledWith(
        2,
        '/repo/tasks/global-review-log.md.migration.lock',
        expect.any(String),
        expect.objectContaining({ flag: 'wx' }),
      );
      expect(writeFileMock).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('/repo/tasks/global-review-log.md.migration.'),
        expect.stringContaining('Legacy markdown review log content preserved during one-time migration.'),
        'utf-8',
      );
      expect(writeFileMock.mock.calls[2][1]).toContain('<!-- agenticos:global-review-log:v2 -->');
      expect(writeFileMock.mock.calls[2][1]).toContain('<a href="https://github.com/madlouse/AgenticOS/pull/1">#1</a>');
      expect(writeFileMock.mock.calls[2][1]).toContain('| [#1](https://github.com/madlouse/AgenticOS/pull/1) | Old Agent |');
      expect(renameMock).toHaveBeenCalledWith(
        expect.stringContaining('/repo/tasks/global-review-log.md.migration.'),
        '/repo/tasks/global-review-log.md',
      );
      expect(appendFileMock).toHaveBeenCalledTimes(1);
    });

    it('does not treat arbitrary embedded tables as canonical review logs', async () => {
      writeFileMock.mockRejectedValueOnce(Object.assign(new Error('exists'), { code: 'EEXIST' }));
      openFileMock.mockImplementation(async () => ({
        read: async (buffer: Buffer) => {
          const content = '# Notes\n\n<table><tbody><tr><td>not the review schema</td></tr></tbody></table>\n';
          buffer.write(content);
          return { bytesRead: Buffer.byteLength(content) };
        },
        close: async () => undefined,
      }));
      readFileMock.mockResolvedValueOnce('# Notes\n\n<table><tbody><tr><td>not the review schema</td></tr></tbody></table>\n');

      const mod = await loadModule();
      await mod.persistReviewLog(REVIEW_RESULT, '/repo');

      expect(renameMock).toHaveBeenCalledWith(
        expect.stringContaining('/repo/tasks/global-review-log.md.migration.'),
        '/repo/tasks/global-review-log.md',
      );
    });

    it('refuses to write through symlinked log surfaces', async () => {
      lstatMock
        .mockResolvedValueOnce({ isSymbolicLink: () => false })
        .mockResolvedValueOnce({ isSymbolicLink: () => true });

      const mod = await loadModule();
      await expect(mod.persistReviewLog(REVIEW_RESULT, '/repo')).rejects.toThrow('Refusing to write review log through symlinked path');
      expect(appendFileMock).not.toHaveBeenCalled();
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
        .filter((call: unknown[]) => (call[0] as string).startsWith('command claude'))
        .map((call: unknown[]) => call[1] as { timeout: number; maxBuffer: number });

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
