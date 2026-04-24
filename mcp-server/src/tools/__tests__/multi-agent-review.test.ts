import { describe, it, expect } from 'vitest';

const mod = await import('../multi-agent-review.js');

const PR_DETAILS = {
  title: 'feat: add delegation toolchain',
  body: 'Implements delegation + coverage',
  state: 'OPEN',
  author: 'jeking',
  changedFiles: ['src/index.ts', 'src/tools/index.ts'],
  additions: 120,
  deletions: 30,
};

describe('multi-agent-review', () => {
  describe('mapToClaudeAgentType', () => {
    it('maps known agent types', () => {
      expect(mod.mapToClaudeAgentType('code-reviewer')).toBe('code-reviewer');
      expect(mod.mapToClaudeAgentType('security-auditor')).toBe('security-auditor');
      expect(mod.mapToClaudeAgentType('qa-expert')).toBe('qa-expert');
      expect(mod.mapToClaudeAgentType('architecture-reviewer')).toBe('architecture-reviewer');
      expect(mod.mapToClaudeAgentType('performance-engineer')).toBe('performance-engineer');
    });

    it('defaults unknown agents to code-reviewer', () => {
      expect(mod.mapToClaudeAgentType('unknown-agent')).toBe('code-reviewer');
      expect(mod.mapToClaudeAgentType('')).toBe('code-reviewer');
    });
  });

  describe('aggregateResults', () => {
    it('returns REQUEST_CHANGES for empty reviews', () => {
      const result = mod.aggregateResults([]);
      expect(result.recommendation).toBe('REQUEST_CHANGES');
      expect(result.summary).toContain('No reviews were completed');
    });

    it('returns APPROVE when no blockers', () => {
      const reviews = [
        { findings: ['Style issue'], recommendations: ['Fix formatting'], status: 'ok', duration_ms: 100 },
      ] as any;
      expect(mod.aggregateResults(reviews).recommendation).toBe('APPROVE');
    });

    it('returns BLOCK when blockers >= 40%', () => {
      const reviews = [
        { findings: ['SECURITY: RCE'], recommendations: [], status: 'ok', duration_ms: 100 },
        { findings: ['Blocker'], recommendations: [], status: 'ok', duration_ms: 100 },
        { findings: ['Nits'], recommendations: [], status: 'ok', duration_ms: 100 },
      ] as any;
      expect(mod.aggregateResults(reviews).recommendation).toBe('BLOCK');
    });

    it('returns REQUEST_CHANGES for 1 blocker out of 4', () => {
      const reviews = [
        { findings: ['SECURITY: critical'], status: 'ok', recommendations: [], duration_ms: 100 },
        { findings: ['Style'], status: 'ok', recommendations: [], duration_ms: 100 },
        { findings: [], status: 'ok', recommendations: [], duration_ms: 100 },
        { findings: [], status: 'ok', recommendations: [], duration_ms: 100 },
      ] as any;
      expect(mod.aggregateResults(reviews).recommendation).toBe('REQUEST_CHANGES');
    });

    it('returns REQUEST_CHANGES when any agent errors', () => {
      const reviews = [
        { findings: [], status: 'error', recommendations: [], duration_ms: 0 },
      ] as any;
      expect(mod.aggregateResults(reviews).recommendation).toBe('REQUEST_CHANGES');
    });

    it('counts findings and recommendations in summary', () => {
      const reviews = [
        { findings: ['A', 'B'], recommendations: ['X', 'Y', 'Z'], status: 'ok', duration_ms: 100 },
      ] as any;
      const result = mod.aggregateResults(reviews);
      expect(result.summary).toContain('2 finding(s)');
      expect(result.summary).toContain('3 recommendation(s)');
    });

    it('flags blocking issues in summary', () => {
      const reviews = [
        { findings: ['SECURITY: XSS'], status: 'ok', recommendations: [], duration_ms: 100 },
      ] as any;
      expect(mod.aggregateResults(reviews).summary).toContain('1 agent(s) flagged blocking issues');
    });

    it('flags errors in summary', () => {
      const reviews = [
        { findings: [], status: 'error', recommendations: [], duration_ms: 0 },
      ] as any;
      expect(mod.aggregateResults(reviews).summary).toContain('1 agent(s) encountered errors');
    });

    it('reports overall recommendation in summary', () => {
      const reviews = [
        { findings: ['Style'], recommendations: [], status: 'ok', duration_ms: 100 },
      ] as any;
      expect(mod.aggregateResults(reviews).summary).toContain('Overall recommendation: APPROVE');
    });
  });

  describe('buildReviewPrompt', () => {
    it('includes PR number and title', () => {
      const prompt = mod.buildReviewPrompt(PR_DETAILS, '', {
        name: 'Code Reviewer',
        focus: 'quality',
        description: 'Reviews code',
      }, 42);
      expect(prompt).toContain('PR #42');
      expect(prompt).toContain('feat: add delegation toolchain');
    });

    it('includes author and stats', () => {
      const prompt = mod.buildReviewPrompt(PR_DETAILS, '', {
        name: 'QA', focus: 'coverage', description: 'QA review',
      }, 1);
      expect(prompt).toContain('jeking');
      expect(prompt).toContain('+120');
      expect(prompt).toContain('-30');
    });

    it('includes changed files', () => {
      const prompt = mod.buildReviewPrompt(PR_DETAILS, '', {
        name: 'QA', focus: 'coverage', description: 'QA review',
      }, 1);
      expect(prompt).toContain('src/index.ts');
      expect(prompt).toContain('src/tools/index.ts');
    });

    it('includes diff content', () => {
      const prompt = mod.buildReviewPrompt(PR_DETAILS, '--- diff ---', {
        name: 'QA', focus: 'coverage', description: 'QA review',
      }, 1);
      expect(prompt).toContain('--- diff ---');
    });

    it('truncates long diffs with marker', () => {
      const longDiff = 'a'.repeat(20000);
      const prompt = mod.buildReviewPrompt(PR_DETAILS, longDiff, {
        name: 'QA', focus: 'coverage', description: 'QA review',
      }, 1);
      expect(prompt).toContain('... (truncated)');
      expect(prompt.length).toBeLessThan(12000);
    });

    it('limits file list to 30', () => {
      const manyFiles = Array.from({ length: 50 }, (_, i) => `src/file${i}.ts`);
      const details = { ...PR_DETAILS, changedFiles: manyFiles };
      const prompt = mod.buildReviewPrompt(details, '', {
        name: 'QA', focus: 'coverage', description: 'QA review',
      }, 1);
      const lines = prompt.split('\n');
      const fileLines = lines.filter(l => l.startsWith('src/file'));
      expect(fileLines.length).toBe(30);
    });

    it('includes agent role and focus areas', () => {
      const prompt = mod.buildReviewPrompt(PR_DETAILS, '', {
        name: 'Security Auditor',
        focus: 'vulnerabilities',
        description: 'Audits security',
      }, 1);
      expect(prompt).toContain('Security Auditor review');
      expect(prompt).toContain('Audits security');
      expect(prompt).toContain('vulnerabilities');
    });

    it('requests Findings/Recommendations/Summary format', () => {
      const prompt = mod.buildReviewPrompt(PR_DETAILS, '', {
        name: 'QA', focus: 'coverage', description: 'QA review',
      }, 1);
      expect(prompt).toContain('**Findings:**');
      expect(prompt).toContain('**Recommendations:**');
      expect(prompt).toContain('**Summary:**');
    });
  });

  describe('AGENT_ROLES', () => {
    it('defines all 5 agent types', () => {
      const roles = mod.AGENT_ROLES as Record<string, any>;
      expect(Object.keys(roles)).toHaveLength(5);
      expect(roles['code-reviewer']).toBeDefined();
      expect(roles['security-auditor']).toBeDefined();
      expect(roles['qa-expert']).toBeDefined();
      expect(roles['architecture-reviewer']).toBeDefined();
      expect(roles['performance-engineer']).toBeDefined();
    });

    it('each role has name, focus, description, agent_type', () => {
      const roles = mod.AGENT_ROLES as Record<string, any>;
      for (const [key, role] of Object.entries(roles)) {
        expect(role.name).toBeTruthy();
        expect(role.focus).toBeTruthy();
        expect(role.description).toBeTruthy();
        expect(role.agent_type).toBe(key);
      }
    });
  });
});
