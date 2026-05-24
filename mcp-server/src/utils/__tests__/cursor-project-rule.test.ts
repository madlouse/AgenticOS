import { createHash } from 'crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CURSOR_PROJECT_RULE_RELATIVE_PATH,
  CURSOR_PROJECT_RULE_TEMPLATE_VERSION,
  __testInsertAfterYamlFrontmatter,
  cursorProjectRuleUpgradeStatus,
  inspectCursorProjectRule,
  renderCursorProjectRule,
  upgradeCursorProjectRule,
} from '../cursor-project-rule.js';

const HASH_MARKER_RE = /^<!-- agenticos-skill-managed-sha256: ([a-f0-9]{64}) -->\n?/m;

describe('cursor-project-rule', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

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

  it('detects missing, stale-managed, and modified-user states', () => {
    expect(inspectCursorProjectRule(null, 'AgenticOS', '').status).toBe('missing');

    const rendered = renderCursorProjectRule('AgenticOS', '');
    const withoutHash = rendered.replace(HASH_MARKER_RE, '');
    expect(inspectCursorProjectRule(withoutHash, 'AgenticOS', '').status).toBe('stale-managed');

    const staleVersionBody = rendered.replace('template_version: 1', 'template_version: 0').replace(HASH_MARKER_RE, '');
    const staleHash = createHash('sha256').update(staleVersionBody, 'utf-8').digest('hex');
    const staleVersion = staleVersionBody.replace('\n---\n', `\n---\n<!-- agenticos-skill-managed-sha256: ${staleHash} -->\n`);
    expect(inspectCursorProjectRule(staleVersion, 'AgenticOS', '').status).toBe('stale-managed');

    const hashMismatch = rendered.replace(
      '## Cursor Runtime Notes',
      '## Cursor Runtime Notes\n\nOperator-local note.',
    );
    expect(inspectCursorProjectRule(hashMismatch, 'AgenticOS', '').status).toBe('modified-user');
  });

  it('maps upgrade status and preserves user-modified content unless forced', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cursor-rule-upgrade-'));
    tempDirs.push(dir);
    const path = join(dir, 'agenticos.mdc');

    const created = upgradeCursorProjectRule(path, 'AgenticOS', '');
    expect(created).toContain('alwaysApply: true');
    writeFileSync(path, created, 'utf-8');
    expect(upgradeCursorProjectRule(path, 'AgenticOS', '')).toBe(created);

    const modified = created.replace('## Cursor Runtime Notes', '## Cursor Runtime Notes\n\nLocal note.');
    writeFileSync(path, modified, 'utf-8');
    expect(upgradeCursorProjectRule(path, 'AgenticOS', '')).toBe(modified);
    expect(upgradeCursorProjectRule(path, 'AgenticOS', '', undefined, { force: true })).toBe(created);

    expect(cursorProjectRuleUpgradeStatus(null, 'AgenticOS', '')).toBe('missing');
    expect(cursorProjectRuleUpgradeStatus(created, 'AgenticOS', '')).toBe('current');
    const staleVersion = created.replace('template_version: 1', 'template_version: 0');
    expect(cursorProjectRuleUpgradeStatus(staleVersion, 'AgenticOS', '')).toBe('stale');
  });

  it('rejects invalid YAML frontmatter when inserting managed hash markers', () => {
    expect(() => __testInsertAfterYamlFrontmatter('no frontmatter', 'x')).toThrow(
      'Cursor project rule template must start with YAML frontmatter',
    );
    expect(() => __testInsertAfterYamlFrontmatter('---\nopen\n', 'x')).toThrow(
      'Cursor project rule template frontmatter is not closed',
    );
  });

  it('uses default agent context paths when custom paths are omitted', () => {
    const content = renderCursorProjectRule('AgenticOS', '');
    expect(content).toContain('.context/quick-start.md');
    expect(content).toContain('.context/state.yaml');
  });

  it('renders project description and custom agent context paths when provided', () => {
    const content = renderCursorProjectRule('AgenticOS', '  Self-hosting project  ', {
      quickStartPath: 'standards/.context/quick-start.md',
      statePath: 'standards/.context/state.yaml',
      conversationsDir: 'standards/.context/conversations/',
      markerPath: 'standards/.context/.last_record',
      knowledgeDir: 'standards/knowledge/',
      tasksDir: 'standards/tasks/',
      artifactsDir: 'standards/artifacts/',
    });
    expect(content).toContain('Project: AgenticOS — Self-hosting project');
    expect(content).toContain('standards/.context/quick-start.md');
    expect(content).toContain('standards/.context/state.yaml');
  });

  it('reports missing status when inspecting a null rule', () => {
    expect(inspectCursorProjectRule(null, 'AgenticOS', '').status).toBe('missing');
  });

  it('detects template drift when managed hash still matches stored body', () => {
    const rendered = renderCursorProjectRule('AgenticOS', 'Self-hosting project');
    expect(inspectCursorProjectRule(rendered, 'Other Project', 'Self-hosting project').status).toBe('modified-user');
  });
});
