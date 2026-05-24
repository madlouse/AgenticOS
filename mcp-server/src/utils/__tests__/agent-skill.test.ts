import { describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import {
  installAgentSkill,
  inspectAgentSkill,
  isAgentSkillOkForVerify,
  renderAgenticosSkillContent,
  resolveAgentSkillTarget,
  __testInsertAfterYamlFrontmatter,
} from '../agent-skill.js';

const HASH_MARKER_RE = /^<!-- agenticos-skill-managed-sha256: [a-f0-9]{64} -->\n?/m;

function createDeps() {
  const files = new Map<string, string>();
  const dirs: string[] = [];

  return {
    files,
    dirs,
    deps: {
      readFile(path: string) {
        return files.get(path) ?? null;
      },
      writeFile(path: string, content: string) {
        files.set(path, content);
      },
      mkdirp(path: string) {
        dirs.push(path);
      },
    },
  };
}

describe('agent skill bootstrap', () => {
  it('resolves Codex, Claude Code, and Cursor Skill targets', () => {
    expect(resolveAgentSkillTarget('codex', '/Users/tester').path)
      .toBe('/Users/tester/.codex/skills/agenticos/SKILL.md');
    expect(resolveAgentSkillTarget('claude-code', '/Users/tester').path)
      .toBe('/Users/tester/.claude/skills/agenticos/SKILL.md');

    const cursorTarget = resolveAgentSkillTarget('cursor', '/Users/tester');
    expect(cursorTarget.supported).toBe(true);
    expect(cursorTarget.path).toBe('/Users/tester/.cursor/skills-cursor/agenticos/SKILL.md');
    expect(cursorTarget.reloadHint).toMatch(/Cursor/);

    expect(resolveAgentSkillTarget('gemini-cli', '/Users/tester').supported).toBe(false);
  });

  it('installs and verifies the Cursor managed Skill at ~/.cursor/skills-cursor/agenticos/SKILL.md', () => {
    const harness = createDeps();

    const result = installAgentSkill('cursor', '/Users/tester', harness.deps);

    expect(result.ok).toBe(true);
    expect(result.wrote).toBe(true);
    expect(result.status).toBe('current');
    expect(harness.dirs).toEqual(['/Users/tester/.cursor/skills-cursor/agenticos']);

    const installedPath = '/Users/tester/.cursor/skills-cursor/agenticos/SKILL.md';
    const installed = harness.files.get(installedPath);
    expect(installed).toContain('AgenticOS Activation');
    expect(installed).toMatch(/^---\n/);
    expect(installed).toContain('agenticos-skill-managed-sha256');
    expect(isAgentSkillOkForVerify(inspectAgentSkill('cursor', '/Users/tester', harness.deps.readFile))).toBe(true);
  });

  it('renders the same canonical Skill content for Codex, Claude Code, and Cursor', () => {
    const harness = createDeps();

    installAgentSkill('codex', '/Users/tester', harness.deps);
    installAgentSkill('claude-code', '/Users/tester', harness.deps);
    installAgentSkill('cursor', '/Users/tester', harness.deps);

    const codex = harness.files.get('/Users/tester/.codex/skills/agenticos/SKILL.md');
    const claude = harness.files.get('/Users/tester/.claude/skills/agenticos/SKILL.md');
    const cursor = harness.files.get('/Users/tester/.cursor/skills-cursor/agenticos/SKILL.md');

    expect(codex).toBeDefined();
    expect(claude).toBe(codex);
    expect(cursor).toBe(codex);
  });

  it('renders a managed Skill with project switch triggers and hash marker', () => {
    const content = renderAgenticosSkillContent();

    expect(content).toMatch(/^---\n/);
    expect(content).toMatch(/\n---\n<!-- agenticos-skill-managed-sha256: [a-f0-9]{64} -->\n\n# AgenticOS Activation/);
    expect(content).toContain('name: agenticos');
    expect(content).toContain('agenticos_switch');
    expect(content).toContain('切换到');
    expect(content).toContain('tool discovery for AgenticOS MCP tools');
  });

  it('installs and verifies a missing managed Skill', () => {
    const harness = createDeps();

    const result = installAgentSkill('codex', '/Users/tester', harness.deps);

    expect(result.ok).toBe(true);
    expect(result.wrote).toBe(true);
    expect(result.status).toBe('current');
    expect(harness.dirs).toEqual(['/Users/tester/.codex/skills/agenticos']);
    expect(harness.files.get('/Users/tester/.codex/skills/agenticos/SKILL.md')).toContain('AgenticOS Activation');
    expect(isAgentSkillOkForVerify(inspectAgentSkill('codex', '/Users/tester', harness.deps.readFile))).toBe(true);
  });

  it('updates stale managed content without force', () => {
    const harness = createDeps();
    const path = '/Users/tester/.codex/skills/agenticos/SKILL.md';
    installAgentSkill('codex', '/Users/tester', harness.deps);
    const stale = (harness.files.get(path) || '').replace('project status', 'project context');
    const staleWithoutHash = stale.replace(HASH_MARKER_RE, '');
    const staleHash = createHash('sha256').update(staleWithoutHash, 'utf-8').digest('hex');
    const managedStale = `<!-- agenticos-skill-managed-sha256: ${staleHash} -->\n${staleWithoutHash}`;
    harness.files.set(path, managedStale);

    expect(inspectAgentSkill('codex', '/Users/tester', harness.deps.readFile).status).toBe('stale-managed');
    const result = installAgentSkill('codex', '/Users/tester', harness.deps);

    expect(result.ok).toBe(true);
    expect(result.wrote).toBe(true);
    expect(result.status).toBe('current');
  });

  it('reports stale managed content from a different template version', () => {
    const harness = createDeps();
    const path = '/Users/tester/.codex/skills/agenticos/SKILL.md';
    installAgentSkill('codex', '/Users/tester', harness.deps);
    const staleWithoutHash = (harness.files.get(path) || '')
      .replace(HASH_MARKER_RE, '')
      .replace('template_version: 1', 'template_version: 99');
    const staleHash = createHash('sha256').update(staleWithoutHash, 'utf-8').digest('hex');
    harness.files.set(path, `<!-- agenticos-skill-managed-sha256: ${staleHash} -->\n${staleWithoutHash}`);

    const inspection = inspectAgentSkill('codex', '/Users/tester', harness.deps.readFile);

    expect(inspection.status).toBe('stale-managed');
    expect(inspection.detail).toContain('is v99; expected v1');
  });

  it('repairs legacy managed content that put comments before frontmatter', () => {
    const harness = createDeps();
    const path = '/Users/tester/.codex/skills/agenticos/SKILL.md';
    const legacyWithoutHash = `<!-- agenticos-skill-template: v1 -->
---
name: agenticos
description: Use when the user asks to switch, enter, continue, inspect, or verify an AgenticOS project; asks pwd/current project/project status/worktree status; or says 切换到/进入/继续项目. Discover and call AgenticOS MCP first.
version: 1.0.0
metadata:
  agenticos:
    managed: true
    template_version: 1
---

# AgenticOS Activation
`;
    const legacyHash = createHash('sha256').update(legacyWithoutHash, 'utf-8').digest('hex');
    harness.files.set(path, `<!-- agenticos-skill-managed-sha256: ${legacyHash} -->\n${legacyWithoutHash}`);

    expect(inspectAgentSkill('codex', '/Users/tester', harness.deps.readFile).status)
      .toBe('stale-managed');

    const result = installAgentSkill('codex', '/Users/tester', harness.deps);

    expect(result.ok).toBe(true);
    expect(result.wrote).toBe(true);
    expect(result.status).toBe('current');
    expect(harness.files.get(path)).toMatch(/^---\n/);
  });

  it('does not rewrite a current managed Skill', () => {
    const harness = createDeps();
    installAgentSkill('codex', '/Users/tester', harness.deps);
    harness.dirs.length = 0;

    const result = installAgentSkill('codex', '/Users/tester', harness.deps);

    expect(result.ok).toBe(true);
    expect(result.wrote).toBe(false);
    expect(result.status).toBe('current');
    expect(harness.dirs).toEqual([]);
  });

  it('refuses to overwrite user-modified Skill content unless forced', () => {
    const harness = createDeps();
    const path = '/Users/tester/.codex/skills/agenticos/SKILL.md';
    harness.files.set(path, '# custom agenticos notes\n');

    const blocked = installAgentSkill('codex', '/Users/tester', harness.deps);

    expect(blocked.ok).toBe(false);
    expect(blocked.status).toBe('modified-user');
    expect(blocked.detail).toContain('--force-skills');
    expect(harness.files.get(path)).toBe('# custom agenticos notes\n');

    const forced = installAgentSkill('codex', '/Users/tester', harness.deps, { force: true });
    expect(forced.ok).toBe(true);
    expect(forced.status).toBe('current');
    expect(harness.files.get(path)).toContain('agenticos-skill-managed-sha256');
  });

  it('marks tampered managed content as user modified', () => {
    const harness = createDeps();
    const path = '/Users/tester/.claude/skills/agenticos/SKILL.md';
    installAgentSkill('claude-code', '/Users/tester', harness.deps);
    harness.files.set(path, `${harness.files.get(path)}\nextra local note\n`);

    const inspection = inspectAgentSkill('claude-code', '/Users/tester', harness.deps.readFile);

    expect(inspection.status).toBe('modified-user');
    expect(isAgentSkillOkForVerify(inspection)).toBe(false);
  });

  it('skips unsupported agents without failing verification', () => {
    const harness = createDeps();

    const result = installAgentSkill('gemini-cli', '/Users/tester', harness.deps);

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.status).toBe('unsupported');
    expect(isAgentSkillOkForVerify(result)).toBe(true);
  });

  it('rejects invalid YAML frontmatter when inserting managed hash markers', () => {
    expect(() => __testInsertAfterYamlFrontmatter('no frontmatter', 'x')).toThrow(
      'AgenticOS Skill template must start with YAML frontmatter',
    );
    expect(() => __testInsertAfterYamlFrontmatter('---\nopen\n', 'x')).toThrow(
      'AgenticOS Skill template is missing a closing YAML frontmatter delimiter',
    );
  });
});
