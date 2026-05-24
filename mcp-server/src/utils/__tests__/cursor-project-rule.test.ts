import { describe, expect, it } from 'vitest';
import {
  CURSOR_PROJECT_RULE_RELATIVE_PATH,
  CURSOR_PROJECT_RULE_TEMPLATE_VERSION,
  inspectCursorProjectRule,
  renderCursorProjectRule,
  upgradeCursorProjectRule,
} from '../cursor-project-rule.js';

describe('cursor-project-rule', () => {
  it('renders managed Cursor project rule with alwaysApply and sha256 marker', () => {
    const content = renderCursorProjectRule('Demo Project', 'A managed demo', {
      quickStartPath: 'standards/.context/quick-start.md',
      statePath: 'standards/.context/state.yaml',
    });

    expect(content).toContain('alwaysApply: true');
    expect(content).toContain('template_version: 1');
    expect(content).toContain('<!-- agenticos-skill-managed-sha256:');
    expect(content).toContain('# AgenticOS — Demo Project');
    expect(content).toContain('`.cursor/rules/agenticos.mdc` is the Cursor adapter surface');
    expect(content).toContain('## Cursor Runtime Notes');
    expect(content).toContain('~/.cursor/skills-cursor/agenticos/SKILL.md');
    expect(content).toContain('standards/.context/quick-start.md');
    expect(content).toContain('standards/.context/state.yaml');
    expect(content).toContain('`agenticos_preflight`');
    expect(content).toContain('`agenticos_record`');
  });

  it('reports current status for freshly rendered content', () => {
    const content = renderCursorProjectRule('AgenticOS', 'Self-hosting project');
    const inspection = inspectCursorProjectRule(content, 'AgenticOS', 'Self-hosting project');

    expect(inspection.status).toBe('current');
    expect(inspection.installedVersion).toBe(CURSOR_PROJECT_RULE_TEMPLATE_VERSION);
    expect(CURSOR_PROJECT_RULE_RELATIVE_PATH).toBe('.cursor/rules/agenticos.mdc');
  });

  it('detects modified-user content and preserves it unless forced', () => {
    const original = renderCursorProjectRule('AgenticOS', 'Self-hosting project');
    const modified = original.replace(
      '## Cursor Runtime Notes',
      '## Cursor Runtime Notes\n\nOperator-local note.',
    );

    const inspection = inspectCursorProjectRule(modified, 'AgenticOS', 'Self-hosting project');
    expect(inspection.status).toBe('modified-user');
  });

  it('renders fresh content when upgrading a missing Cursor project rule file', () => {
    const upgraded = upgradeCursorProjectRule(
      '/tmp/does-not-exist/agenticos.mdc',
      'AgenticOS',
      'Self-hosting project',
    );

    expect(upgraded).toContain('alwaysApply: true');
    expect(inspectCursorProjectRule(upgraded, 'AgenticOS', 'Self-hosting project').status).toBe('current');
  });
});
