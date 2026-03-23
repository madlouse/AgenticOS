import { describe, expect, it } from 'vitest';
import { CURRENT_TEMPLATE_VERSION, generateAgentsMd, generateClaudeMd } from '../distill.js';

describe('distill templates', () => {
  it('generates AGENTS.md with the current template marker and guardrail flow', () => {
    const content = generateAgentsMd('Demo Project', 'Guardrail test');

    expect(CURRENT_TEMPLATE_VERSION).toBe(3);
    expect(content).toContain('<!-- agenticos-template: v3 -->');
    expect(content).toContain('## Guardrail Protocol (MANDATORY)');
    expect(content).toContain('agenticos_preflight');
    expect(content).toContain('agenticos_branch_bootstrap');
    expect(content).toContain('agenticos_pr_scope_check');
    expect(content).toContain('.context/quick-start.md');
    expect(content).toContain('tasks/templates/agent-preflight-checklist.yaml');
  });

  it('generates CLAUDE.md with guardrail flow and template navigation', () => {
    const content = generateClaudeMd('Demo Project', 'Guardrail test');

    expect(content).toContain('## Guardrail Protocol (MANDATORY)');
    expect(content).toContain('agenticos_preflight');
    expect(content).toContain('agenticos_branch_bootstrap');
    expect(content).toContain('agenticos_pr_scope_check');
    expect(content).toContain('.context/quick-start.md');
    expect(content).toContain('tasks/templates/submission-evidence.md');
  });
});
