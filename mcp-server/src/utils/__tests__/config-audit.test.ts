import { describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import { renderConfigAuditResult, runConfigAudit } from '../config-audit.js';
import { renderAgenticosSkillContent } from '../agent-skill.js';

function createDeps() {
  const files = new Map<string, string>();
  const paths = new Set<string>();
  const commands = new Map<string, { ok: boolean; detail: string }>();

  return {
    files,
    paths,
    commands,
    deps: {
      env: {} as Record<string, string | undefined>,
      homeDir: '/Users/tester',
      platform: 'darwin',
      shellPath: '/bin/zsh',
      nowIso() {
        return '2026-04-13T13:50:00.000Z';
      },
      commandExists(command: string): boolean {
        return command === 'launchctl';
      },
      runCommand(command: string, args: string[]) {
        return commands.get([command, ...args].join(' ')) || { ok: false, detail: 'unset' };
      },
      readFile(path: string) {
        return files.get(path) ?? null;
      },
      pathExists(path: string) {
        return paths.has(path);
      },
    },
  };
}

describe('config audit', () => {
  it('shows detected runtime and MCP configuration sources', () => {
    const harness = createDeps();
    harness.deps.env.AGENTICOS_HOME = '/runtime/home';
    harness.files.set('/Users/tester/.zshrc', 'export AGENTICOS_HOME="/runtime/home"\n');
    harness.files.set('/Users/tester/.claude/settings.json', JSON.stringify({ env: { AGENTICOS_HOME: '/runtime/home' } }));
    harness.files.set('/Users/tester/.claude.json', JSON.stringify({ mcpServers: { agenticos: { env: { AGENTICOS_HOME: '/runtime/home' } } } }));
    harness.files.set('/Users/tester/.codex/config.toml', '[mcp_servers.agenticos.env]\nAGENTICOS_HOME = "/runtime/home"\n');
    harness.files.set('/Users/tester/.cursor/mcp.json', JSON.stringify({ mcpServers: { agenticos: { env: { AGENTICOS_HOME: '/runtime/home' } } } }));
    harness.paths.add('/opt/homebrew/var/agenticos');
    harness.commands.set('launchctl getenv AGENTICOS_HOME', { ok: true, detail: '/runtime/home' });

    const result = runConfigAudit({ action: 'show', scope: 'all' }, harness.deps);
    const rendered = renderConfigAuditResult(result);

    expect(result.status).toBe('PASS');
    expect(result.canonical_workspace).toBe('/runtime/home');
    expect(rendered).toContain('process.env AGENTICOS_HOME');
    expect(rendered).toContain('Claude Code settings env');
    expect(rendered).toContain('Claude Code AgenticOS activation Skill');
    expect(rendered).toContain('Codex AgenticOS activation Skill');
    expect(rendered).toContain('Hermes AgenticOS activation Skill');
    expect(rendered).toContain('Cursor MCP config');
    expect(rendered).toContain('/opt/homebrew/var/agenticos');
    expect(rendered).not.toContain('Discord configuration');
  });

  it('fails validation when authoritative sources disagree', () => {
    const harness = createDeps();
    harness.deps.env.AGENTICOS_HOME = '/runtime/home';
    harness.files.set('/Users/tester/.zshrc', 'export AGENTICOS_HOME="/other/home"\n');
    harness.commands.set('launchctl getenv AGENTICOS_HOME', { ok: true, detail: '/runtime/home' });

    const result = runConfigAudit({ action: 'validate', scope: 'runtime' }, harness.deps);
    const rendered = renderConfigAuditResult(result);

    expect(result.status).toBe('FAIL');
    expect(result.discrepancies).toEqual([
      {
        label: 'shell profile export',
        value: '/other/home',
        fix_target: '/Users/tester/.zshrc',
      },
    ]);
    expect(rendered).toContain('Configuration drift detected');
    expect(rendered).toContain('/Users/tester/.zshrc');
  });

  it('shows drift without switching out of show mode', () => {
    const harness = createDeps();
    harness.deps.env.AGENTICOS_HOME = '/runtime/home';
    harness.files.set('/Users/tester/.zshrc', 'export AGENTICOS_HOME="/other/home"\n');

    const result = runConfigAudit({ action: 'show', scope: 'runtime' }, harness.deps);

    expect(result.status).toBe('FAIL');
    expect(result.summary).toContain('drift is present');
  });

  it('fails validation when no configured source exists', () => {
    const harness = createDeps();
    harness.files.set('/Users/tester/.zshrc', '# no export here\n');

    const result = runConfigAudit({ action: 'validate', scope: 'runtime' }, harness.deps);
    const rendered = renderConfigAuditResult(result);

    expect(result.status).toBe('FAIL');
    expect(result.canonical_workspace).toBeNull();
    expect(rendered).toContain('No configured AGENTICOS_HOME source was detected');
  });

  it('filters sources by scope and handles unavailable launchctl/json parse failures', () => {
    const harness = createDeps();
    harness.deps.platform = 'linux';
    harness.files.set('/Users/tester/.claude/settings.json', '{bad json');
    harness.files.set('/Users/tester/.cursor/mcp.json', JSON.stringify([{ env: { AGENTICOS_HOME: '/cursor/home' } }]));
    harness.paths.add('/usr/local/var/agenticos');

    const result = runConfigAudit({ action: 'show', scope: 'mcp' }, harness.deps);

    expect(result.sources.every((source) => source.scope === 'mcp')).toBe(true);
    expect(result.sources.find((source) => source.id === 'claude_settings')?.status).toBe('unavailable');
    expect(result.sources.find((source) => source.id === 'cursor_mcp')?.value).toBe('/cursor/home');

    const homebrewOnly = runConfigAudit({ action: 'show', scope: 'homebrew' }, harness.deps);
    expect(homebrewOnly.sources).toHaveLength(2);
    expect(homebrewOnly.sources.find((source) => source.value === '/usr/local/var/agenticos')?.status).toBe('present');
  });

  it('treats missing Codex values and empty JSON arrays as unset', () => {
    const harness = createDeps();
    harness.files.set('/Users/tester/.codex/config.toml', '[mcp_servers.other]\nname = "other"\n');
    harness.files.set('/Users/tester/.claude/settings.json', '[]');

    const result = runConfigAudit({ action: 'show', scope: 'mcp' }, harness.deps);

    expect(result.sources.find((source) => source.id === 'codex_config')?.status).toBe('unset');
    expect(result.sources.find((source) => source.id === 'claude_settings')?.status).toBe('unset');
    expect(result.sources.find((source) => source.id === 'claude_pwd_alignment_hook')?.status).toBe('unset');
  });

  it('detects Claude Code cwd guidance hook without making it canonical workspace input', () => {
    const harness = createDeps();
    harness.files.set('/Users/tester/.claude/settings.json', JSON.stringify({
      hooks: {
        PostToolUse: [
          {
            matcher: 'mcp__agenticos__agenticos_switch',
            hooks: [{ type: 'command', command: 'agenticos-claude-pwd-hook' }],
          },
          {
            matcher: 'mcp__agenticos__agenticos_switch_out',
            hooks: [{ type: 'command', command: 'agenticos-claude-pwd-hook' }],
          },
        ],
      },
    }));

    const result = runConfigAudit({ action: 'show', scope: 'mcp' }, harness.deps);
    const hookSource = result.sources.find((source) => source.id === 'claude_pwd_alignment_hook');

    expect(result.canonical_workspace).toBeNull();
    expect(hookSource?.status).toBe('configured');
    expect(hookSource?.value).toBe('mcp__agenticos__agenticos_switch,mcp__agenticos__agenticos_switch_out');
  });

  it('reports configured Claude Code cwd guidance hooks', () => {
    const harness = createDeps();
    harness.files.set('/Users/tester/.claude/settings.json', JSON.stringify({
      hooks: {
        PostToolUse: [
          {
            matcher: 'mcp__agenticos__agenticos_switch',
            hooks: [{ type: 'command', command: 'agenticos-claude-pwd-hook' }],
          },
          {
            matcher: 'mcp__agenticos__agenticos_switch_out',
            hooks: [{ type: 'command', command: 'agenticos-claude-pwd-hook' }],
          },
        ],
      },
    }));

    const result = runConfigAudit({ action: 'show', scope: 'mcp' }, harness.deps);
    const hook = result.sources.find((source) => source.id === 'claude_pwd_alignment_hook');

    expect(hook?.status).toBe('configured');
    expect(hook?.value).toBe('mcp__agenticos__agenticos_switch,mcp__agenticos__agenticos_switch_out');
    expect(hook?.detail).toContain('Detected PostToolUse hook');
  });

  it('reports activation Skill status without making it canonical workspace input', () => {
    const harness = createDeps();
    harness.files.set('/Users/tester/.codex/skills/agenticos/SKILL.md', renderAgenticosSkillContent());
    harness.files.set('/Users/tester/.hermes/skills/work/agenticos/SKILL.md', renderAgenticosSkillContent());

    const result = runConfigAudit({ action: 'show', scope: 'mcp' }, harness.deps);
    const codexSkill = result.sources.find((source) => source.id === 'codex_activation_skill');
    const claudeSkill = result.sources.find((source) => source.id === 'claude-code_activation_skill');
    const hermesSkill = result.sources.find((source) => source.id === 'hermes-agent_activation_skill');

    expect(result.canonical_workspace).toBeNull();
    expect(codexSkill?.status).toBe('configured');
    expect(codexSkill?.value).toBe('agenticos-skill:v4');
    expect(codexSkill?.contributes_to_workspace).toBe(false);
    expect(claudeSkill?.status).toBe('missing');
    expect(claudeSkill?.fix_target).toContain('--install-skills');
    expect(hermesSkill?.status).toBe('configured');
    expect(hermesSkill?.location).toBe('/Users/tester/.hermes/skills/work/agenticos/SKILL.md');
    expect(hermesSkill?.fix_target).toBe('agenticos-bootstrap --agent hermes-agent --install-skills --apply');
  });

  it('reports user-modified activation Skills as present with force recovery', () => {
    const harness = createDeps();
    harness.files.set('/Users/tester/.codex/skills/agenticos/SKILL.md', '# custom activation\n');

    const result = runConfigAudit({ action: 'show', scope: 'mcp' }, harness.deps);
    const codexSkill = result.sources.find((source) => source.id === 'codex_activation_skill');

    expect(codexSkill?.status).toBe('present');
    expect(codexSkill?.detail).toContain('Skill state: modified-user');
    expect(codexSkill?.fix_target).toContain('--force-skills');
  });

  it('reports stale managed activation Skills with non-force upgrade recovery', () => {
    const harness = createDeps();
    const path = '/Users/tester/.codex/skills/agenticos/SKILL.md';
    const staleWithoutHash = renderAgenticosSkillContent()
      .replace(/^<!-- agenticos-skill-managed-sha256: [a-f0-9]{64} -->\n?/, '')
      .replace('project status', 'project context');
    const staleHash = createHash('sha256').update(staleWithoutHash, 'utf-8').digest('hex');
    harness.files.set(path, `<!-- agenticos-skill-managed-sha256: ${staleHash} -->\n${staleWithoutHash}`);

    const result = runConfigAudit({ action: 'show', scope: 'mcp' }, harness.deps);
    const codexSkill = result.sources.find((source) => source.id === 'codex_activation_skill');

    expect(codexSkill?.status).toBe('present');
    expect(codexSkill?.detail).toContain('Skill state: stale-managed');
    expect(codexSkill?.fix_target).toBe('agenticos-bootstrap --agent codex --install-skills --apply');
  });

  it('does not include optional Hermes/Discord channel readiness in normal config audit', () => {
    const harness = createDeps();
    harness.deps.env.HERMES_GATEWAY_URL = 'http://127.0.0.1:8787';
    harness.deps.env.DISCORD_APP_ID = 'app-id';
    harness.deps.env.DISCORD_BOT_TOKEN = 'secret-token';
    harness.deps.commandExists = (command: string) => command === 'launchctl' || command === 'hermes-gateway';

    const result = runConfigAudit({ action: 'show', scope: 'mcp' }, harness.deps);
    const rendered = renderConfigAuditResult(result);

    expect(result.status).toBe('PASS');
    expect(result.sources.some((source) => source.id.startsWith('hermes_discord:'))).toBe(false);
    expect(rendered).not.toContain('Discord configuration');
    expect(rendered).not.toContain('secret-token');
  });

  it('reports missing Claude Code cwd guidance hook when hooks do not match', () => {
    const harness = createDeps();
    harness.files.set('/Users/tester/.claude/settings.json', JSON.stringify({
      hooks: {
        PostToolUse: [
          null,
          { matcher: 'other_tool' },
        ],
      },
    }));

    const result = runConfigAudit({ action: 'show', scope: 'mcp' }, harness.deps);
    const hook = result.sources.find((source) => source.id === 'claude_pwd_alignment_hook');

    expect(hook?.status).toBe('unset');
    expect(hook?.detail).toContain('missing cwd guidance hook');
  });

  it('accepts generic Codex AGENTICOS_HOME entries outside a focused agent block', () => {
    const harness = createDeps();
    harness.files.set('/Users/tester/.codex/config.toml', 'AGENTICOS_HOME = "/generic/home"\n');

    const result = runConfigAudit({ action: 'show', scope: 'mcp' }, harness.deps);

    expect(result.sources.find((source) => source.id === 'codex_config')?.value).toBe('/generic/home');
  });

  it('uses default action and scope when omitted', () => {
    const harness = createDeps();

    const result = runConfigAudit({}, harness.deps);

    expect(result.action).toBe('show');
    expect(result.scope).toBe('all');
  });

  it('marks launchctl unavailable when the command is not present', () => {
    const harness = createDeps();
    harness.deps.commandExists = () => false;

    const result = runConfigAudit({ action: 'show', scope: 'runtime' }, harness.deps);

    expect(result.sources.find((source) => source.id === 'launchctl')?.detail).toContain('not available on PATH');
  });

  it('returns null when JSON config trees contain no AGENTICOS_HOME anywhere', () => {
    const harness = createDeps();
    harness.files.set('/Users/tester/.claude/settings.json', JSON.stringify({ mcpServers: { agenticos: { env: {} } } }));
    harness.files.set('/Users/tester/.claude.json', JSON.stringify('plain-string'));

    const result = runConfigAudit({ action: 'show', scope: 'mcp' }, harness.deps);

    expect(result.sources.find((source) => source.id === 'claude_settings')?.status).toBe('unset');
    expect(result.sources.find((source) => source.id === 'claude_legacy')?.status).toBe('unset');
  });

  it('passes validation when configured sources agree', () => {
    const harness = createDeps();
    harness.deps.env.AGENTICOS_HOME = '/runtime/home';
    harness.files.set('/Users/tester/.zshrc', 'export AGENTICOS_HOME="/runtime/home"\n');
    harness.commands.set('launchctl getenv AGENTICOS_HOME', { ok: true, detail: '/runtime/home' });

    const result = runConfigAudit({ action: 'validate', scope: 'runtime' }, harness.deps);

    expect(result.status).toBe('PASS');
    expect(result.summary).toContain('agree on /runtime/home');
  });

  it('rejects unsupported action and scope values', () => {
    const harness = createDeps();

    expect(() => runConfigAudit({ action: 'fix' }, harness.deps)).toThrow('action must be one of: show, validate');
    expect(() => runConfigAudit({ scope: 'cli' }, harness.deps)).toThrow('scope must be one of: all, runtime, mcp, homebrew');
  });
});
