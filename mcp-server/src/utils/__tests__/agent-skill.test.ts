import { describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import {
  installAgentSkill,
  inspectAgentSkill,
  isAgentSkillOkForVerify,
  renderAgenticosSkillContent,
  resolveAgentSkillTarget,
} from '../agent-skill.js';

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
  it('resolves Codex and Claude Code Skill targets', () => {
    expect(resolveAgentSkillTarget('codex', '/Users/tester').path)
      .toBe('/Users/tester/.codex/skills/agenticos/SKILL.md');
    expect(resolveAgentSkillTarget('claude-code', '/Users/tester').path)
      .toBe('/Users/tester/.claude/skills/agenticos/SKILL.md');
    expect(resolveAgentSkillTarget('cursor', '/Users/tester').supported).toBe(false);
  });

  it('renders a managed Skill with project switch triggers and hash marker', () => {
    const content = renderAgenticosSkillContent();

    expect(content).toMatch(/^<!-- agenticos-skill-managed-sha256: [a-f0-9]{64} -->/);
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
    const staleWithoutHash = stale.replace(/^<!-- agenticos-skill-managed-sha256: [a-f0-9]{64} -->\n?/, '');
    const staleHash = createHash('sha256').update(staleWithoutHash, 'utf-8').digest('hex');
    const managedStale = `<!-- agenticos-skill-managed-sha256: ${staleHash} -->\n${staleWithoutHash}`;
    harness.files.set(path, managedStale);

    expect(inspectAgentSkill('codex', '/Users/tester', harness.deps.readFile).status).toBe('stale-managed');
    const result = installAgentSkill('codex', '/Users/tester', harness.deps);

    expect(result.ok).toBe(true);
    expect(result.wrote).toBe(true);
    expect(result.status).toBe('current');
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
});
