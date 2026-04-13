import { describe, expect, it } from 'vitest';
import {
  AGENTS_ADAPTER_LINES,
  CONTINUITY_CONTRACT_BULLETS,
  CONTINUITY_CONTRACT_TITLE,
  AGENTS_RUNTIME_GUIDANCE_BULLETS,
  AGENTS_RUNTIME_GUIDANCE_TITLE,
  CLAUDE_ADAPTER_LINES,
  CLAUDE_RUNTIME_GUIDANCE_BULLETS,
  CLAUDE_RUNTIME_GUIDANCE_TITLE,
  CURRENT_TEMPLATE_VERSION,
  SHARED_POLICY_BULLETS,
  SHARED_POLICY_TITLE,
  TASK_INTAKE_RULE_BULLETS,
  TASK_INTAKE_RULE_TITLE,
  generateAgentsMd,
  generateClaudeMd,
} from '../distill.js';

describe('distill templates', () => {
  it('generates AGENTS.md with the current template marker, adapter role, and guardrail flow', () => {
    const content = generateAgentsMd('Demo Project', 'Guardrail test');

    expect(CURRENT_TEMPLATE_VERSION).toBe(12);
    expect(content).toContain('<!-- agenticos-template: v12 -->');
    expect(content).toContain('## Adapter Role');
    expect(content).toContain(AGENTS_ADAPTER_LINES[0]);
    expect(content).toContain(AGENTS_ADAPTER_LINES[1]);
    expect(content).toContain(`## ${SHARED_POLICY_TITLE}`);
    for (const bullet of SHARED_POLICY_BULLETS) {
      expect(content).toContain(bullet);
    }
    expect(content).toContain(`## ${CONTINUITY_CONTRACT_TITLE}`);
    for (const bullet of CONTINUITY_CONTRACT_BULLETS) {
      expect(content).toContain(bullet);
    }
    expect(content).toContain(`## ${AGENTS_RUNTIME_GUIDANCE_TITLE}`);
    for (const bullet of AGENTS_RUNTIME_GUIDANCE_BULLETS) {
      expect(content).toContain(bullet);
    }
    expect(content).toContain(`## ${TASK_INTAKE_RULE_TITLE}`);
    for (const bullet of TASK_INTAKE_RULE_BULLETS) {
      expect(content).toContain(bullet);
    }
    expect(content).toContain('## Guardrail Protocol (MANDATORY)');
    expect(content).toContain('agenticos_preflight');
    expect(content).toContain('agenticos_status');
    expect(content).toContain('agenticos_switch');
    expect(content).toContain('current session project');
    expect(content).toContain('no session project is bound');
    expect(content).not.toContain('confirm the active project');
    expect(content).not.toContain('active project is missing or wrong');
    expect(content).toContain('agenticos_issue_bootstrap');
    expect(content).toContain('agenticos_edit_guard');
    expect(content).toContain('agenticos_branch_bootstrap');
    expect(content).toContain('agenticos_pr_scope_check');
    expect(content).toContain('.context/quick-start.md');
    expect(content).toContain('review the configured conversation history surface when relevant');
    expect(content).toContain('Configured conversation history surface (tracked or policy-routed)');
    expect(content).toContain('tasks/templates/agent-preflight-checklist.yaml');
    expect(content).toContain('tasks/templates/non-code-evaluation-rubric.yaml');
  });

  it('generates CLAUDE.md with adapter role, shared policy, and template navigation', () => {
    const content = generateClaudeMd('Demo Project', 'Guardrail test');

    expect(content).toContain('## Adapter Role');
    expect(content).toContain(CLAUDE_ADAPTER_LINES[0]);
    expect(content).toContain(CLAUDE_ADAPTER_LINES[1]);
    expect(content).toContain(`## ${SHARED_POLICY_TITLE}`);
    for (const bullet of SHARED_POLICY_BULLETS) {
      expect(content).toContain(bullet);
    }
    expect(content).toContain(`## ${CONTINUITY_CONTRACT_TITLE}`);
    for (const bullet of CONTINUITY_CONTRACT_BULLETS) {
      expect(content).toContain(bullet);
    }
    expect(content).toContain(`## ${CLAUDE_RUNTIME_GUIDANCE_TITLE}`);
    for (const bullet of CLAUDE_RUNTIME_GUIDANCE_BULLETS) {
      expect(content).toContain(bullet);
    }
    expect(content).toContain(`## ${TASK_INTAKE_RULE_TITLE}`);
    for (const bullet of TASK_INTAKE_RULE_BULLETS) {
      expect(content).toContain(bullet);
    }
    expect(content).toContain('## Guardrail Protocol (MANDATORY)');
    expect(content).toContain('agenticos_preflight');
    expect(content).toContain('agenticos_status');
    expect(content).toContain('agenticos_switch');
    expect(content).toContain('current session project');
    expect(content).toContain('no session project is bound');
    expect(content).not.toContain('confirm the active project');
    expect(content).not.toContain('active project is missing or wrong');
    expect(content).toContain('agenticos_issue_bootstrap');
    expect(content).toContain('agenticos_edit_guard');
    expect(content).toContain('agenticos_branch_bootstrap');
    expect(content).toContain('agenticos_pr_scope_check');
    expect(content).toContain('.context/quick-start.md');
    expect(content).toContain('review the configured conversation history surface when relevant');
    expect(content).toContain('会话历史入口（tracked 或按 policy 路由）');
    expect(content).toContain('tasks/templates/submission-evidence.md');
    expect(content).toContain('tasks/templates/non-code-evaluation-rubric.yaml');
  });

  it('renders configured canonical context paths when a project overrides agent_context', () => {
    const content = generateAgentsMd('AgenticOS', 'Self-hosting project', {
      quickStartPath: 'standards/.context/quick-start.md',
      statePath: 'standards/.context/state.yaml',
      conversationsDir: 'standards/.context/conversations/',
      knowledgeDir: 'knowledge/',
      tasksDir: 'tasks/',
      artifactsDir: 'artifacts/',
    });

    expect(content).toContain('standards/.context/quick-start.md');
    expect(content).toContain('standards/.context/state.yaml');
    expect(content).toContain('standards/.context/conversations/');
    expect(content).not.toContain('| `.context/quick-start.md` | Quick project summary |');
  });
});
