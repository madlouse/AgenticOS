import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import yaml from 'yaml';
import {
  buildDryRunLines,
  buildHelpLines,
  parseCliArgs,
  resolveSelectedAgents,
  runBootstrapCli,
} from '../bootstrap-cli.js';
import {
  renderHermesCwdApplicatorManifest,
  renderHermesCwdApplicatorPlugin,
} from '../hermes-cwd-applicator.js';

function createDeps() {
  const files = new Map<string, string>();
  const commands: Array<{ command: string; args: string[]; failOnError: boolean }> = [];
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    files,
    commands,
    stdout,
    stderr,
    deps: {
      env: {} as Record<string, string | undefined>,
      homeDir: '/Users/tester',
      platform: 'darwin',
      nowIso() {
        return '2026-04-03T09:00:00.000Z';
      },
      commandExists(command: string) {
        return ['codex', 'claude', 'gemini', 'cursor-agent', 'hermes-gateway'].includes(command);
      },
      runCommand(command: string, args: string[], failOnError: boolean) {
        commands.push({ command, args, failOnError });
        const joined = [command, ...args].join(' ');
        if (joined === 'launchctl getenv AGENTICOS_HOME') {
          return { ok: true, detail: '/tmp/workspace' };
        }
        if (joined === 'codex mcp get agenticos') {
          return { ok: true, detail: 'env: AGENTICOS_HOME=/tmp/workspace' };
        }
        if (joined === 'gemini mcp list') {
          return { ok: true, detail: 'agenticos' };
        }
        if (joined === 'claude mcp get agenticos') {
          return { ok: true, detail: 'AGENTICOS_HOME=/tmp/workspace' };
        }
        return { ok: true, detail: 'ok' };
      },
      mkdirp() {},
      readFile(path: string) {
        return files.get(path) ?? null;
      },
      writeFile(path: string, content: string) {
        files.set(path, content);
      },
      stdout(line: string) {
        stdout.push(line);
      },
      stderr(line: string) {
        stderr.push(line);
      },
    },
  };
}

describe('bootstrap cli', () => {
  it('prints help and parses option edge cases', () => {
    const harness = createDeps();

    expect(runBootstrapCli(['--help'], harness.deps)).toBe(0);
    expect(harness.stdout.join('\n')).toContain('agenticos-bootstrap');
    expect(buildHelpLines().join('\n')).toContain('--auto-configure-hooks');
    expect(buildHelpLines().join('\n')).toContain('--install-skills');
    expect(buildHelpLines().join('\n')).toContain('--verify-hermes-discord');
    expect(buildHelpLines().join('\n')).toContain('hermes-agent');
    expect(parseCliArgs(['--all', '--auto-configure-hooks']).all).toBe(true);
    expect(parseCliArgs(['--install-skills', '--force-skills']).installSkills).toBe(true);
    expect(parseCliArgs(['--install-skills', '--force-skills']).forceSkills).toBe(true);
    expect(parseCliArgs(['--verify-hermes-discord']).verifyHermesDiscord).toBe(true);
    expect(() => parseCliArgs(['--workspace'])).toThrow('--workspace requires a path.');
    expect(() => parseCliArgs(['--agent'])).toThrow('--agent requires a value.');
    expect(() => parseCliArgs(['--shell-profile'])).toThrow('--shell-profile requires a path.');
    expect(() => parseCliArgs(['--bogus'])).toThrow('Unknown argument: --bogus');
  });

  it('rejects apply and verify together', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--apply', '--verify'],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stderr.some((line) => line.includes('--apply and --verify cannot be used together.'))).toBe(true);
  });

  it('rejects empty agent selections', () => {
    const harness = createDeps();
    harness.deps.commandExists = () => false;

    const exitCode = runBootstrapCli(['--workspace', '/tmp/workspace', '--agent', ','], harness.deps);

    expect(exitCode).toBe(1);
    expect(harness.stderr.some((line) => line.includes('No agents selected'))).toBe(true);
  });

  it('resolves installed agents when no explicit selection is provided', () => {
    expect(resolveSelectedAgents(
      {
        apply: false,
        verify: false,
        firstRun: false,
        all: true,
        agents: [],
        help: false,
        persistShellEnv: false,
        persistLaunchctlEnv: false,
        autoConfigureHooks: false,
        installSkills: false,
        forceSkills: false,
      },
      [
        { id: 'codex', label: 'Codex', installed: true, detection_hint: 'test' },
        { id: 'claude-code', label: 'Claude Code', installed: false, detection_hint: 'test' },
      ],
    )).toEqual(['codex', 'claude-code']);

    expect(resolveSelectedAgents(
      {
        apply: false,
        verify: false,
        firstRun: false,
        all: false,
        agents: [],
        help: false,
        persistShellEnv: false,
        persistLaunchctlEnv: false,
        autoConfigureHooks: false,
        installSkills: false,
        forceSkills: false,
      },
      [
        { id: 'codex', label: 'Codex', installed: true, detection_hint: 'test' },
        { id: 'claude-code', label: 'Claude Code', installed: false, detection_hint: 'test' },
      ],
    )).toEqual(['codex']);
  });

  it('renders dry-run state for missing agents', () => {
    const lines = buildDryRunLines(
      '/tmp/workspace',
      'explicit --workspace',
      [
        { id: 'codex', label: 'Codex', installed: true, detection_hint: 'test' },
        { id: 'claude-code', label: 'Claude Code', installed: false, detection_hint: 'test' },
      ],
      ['claude-code'],
      {
        apply: false,
        verify: false,
        firstRun: false,
        all: false,
        agents: ['claude-code'],
        help: false,
        persistShellEnv: true,
        persistLaunchctlEnv: true,
        autoConfigureHooks: true,
        installSkills: true,
        forceSkills: false,
      },
      undefined,
      '/Users/tester',
    );

    expect(lines.join('\n')).toContain('- claude-code: no (test)');
    expect(lines.join('\n')).toContain('launchctl setenv AGENTICOS_HOME');
  });

  it('renders dry-run Skill install, skip, and force overwrite actions', () => {
    const lines = buildDryRunLines(
      '/tmp/workspace',
      'explicit --workspace',
      [
        { id: 'cursor', label: 'Cursor', installed: true, detection_hint: 'test' },
        { id: 'gemini-cli', label: 'Gemini CLI', installed: true, detection_hint: 'test' },
        { id: 'hermes-agent', label: 'Hermes Agent', installed: true, detection_hint: 'test' },
      ],
      ['cursor', 'gemini-cli', 'hermes-agent'],
      {
        apply: false,
        verify: false,
        firstRun: false,
        all: false,
        agents: ['cursor', 'gemini-cli'],
        help: false,
        persistShellEnv: false,
        persistLaunchctlEnv: false,
        autoConfigureHooks: false,
        installSkills: true,
        forceSkills: true,
        verifyHermesDiscord: true,
      },
      undefined,
      '/Users/tester',
    );

    const text = lines.join('\n');
    expect(text).toContain('cursor-skill: install/update /Users/tester/.cursor/skills-cursor/agenticos/SKILL.md');
    expect(text).toContain('gemini-cli-skill: install/update /Users/tester/.gemini/skills/agenticos/SKILL.md');
    expect(text).toContain('hermes-agent: no MCP registration is written');
    expect(text).toContain('agenticos-cwd-applicator');
    expect(text).toContain('hermes-agent-skill: install/update /Users/tester/.hermes/skills/work/agenticos/SKILL.md');
    expect(text).toContain('overwrite user-modified managed Skill files');
    expect(text).toContain('hermes-discord: enforce optional Discord channel project routing');
  });

  it('applies Hermes Agent activation and cwd applicator bootstrap without requiring Discord channel readiness', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'hermes-agent', '--install-skills', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.commands).toEqual([]);
    expect(harness.files.get('/Users/tester/.hermes/skills/work/agenticos/SKILL.md')).toContain('AgenticOS Activation');
    expect(harness.files.get('/Users/tester/.hermes/plugins/agenticos-cwd-applicator/plugin.yaml')).toContain('agenticos-cwd-applicator');
    expect(harness.files.get('/Users/tester/.hermes/config.yaml')).toContain('agenticos-cwd-applicator');
    expect(harness.stdout.some((line) => line.includes('OK hermes-agent: installed v0.1.1 and enabled agenticos-cwd-applicator'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('OK hermes-agent-skill: installed v5'))).toBe(true);
  });

  it('upgrades stale Hermes Agent Skill and cwd applicator during apply', () => {
    const harness = createDeps();
    harness.files.set(
      '/Users/tester/.hermes/plugins/agenticos-cwd-applicator/plugin.yaml',
      renderHermesCwdApplicatorManifest().replace('version: "0.1.1"', 'version: "0.1.0"'),
    );
    harness.files.set(
      '/Users/tester/.hermes/plugins/agenticos-cwd-applicator/__init__.py',
      renderHermesCwdApplicatorPlugin().replace('PLUGIN_VERSION = "0.1.1"', 'PLUGIN_VERSION = "0.1.0"'),
    );
    harness.files.set('/Users/tester/.hermes/config.yaml', 'plugins:\n  enabled:\n    - agenticos-cwd-applicator\n');
    harness.files.set('/Users/tester/.hermes/skills/work/agenticos/SKILL.md', [
      '---',
      'name: agenticos',
      'metadata:',
      '  agenticos:',
      '    managed: true',
      '    template_version: 4',
      '---',
      '<!-- agenticos-skill-managed-sha256: 0000000000000000000000000000000000000000000000000000000000000000 -->',
      '# AgenticOS Activation',
      '',
    ].join('\n'));

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'hermes-agent', '--install-skills', '--force-skills', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.files.get('/Users/tester/.hermes/plugins/agenticos-cwd-applicator/plugin.yaml')).toContain('version: "0.1.1"');
    expect(harness.files.get('/Users/tester/.hermes/plugins/agenticos-cwd-applicator/__init__.py')).toContain('PLUGIN_VERSION = "0.1.1"');
    expect(harness.files.get('/Users/tester/.hermes/skills/work/agenticos/SKILL.md')).toContain('template_version: 5');
    expect(harness.files.get('/Users/tester/.hermes/skills/work/agenticos/SKILL.md')).toContain('Claude Code must use per-call cwd guidance');
  });

  it('verifies Hermes Agent activation Skill state independently of optional Discord channel readiness', () => {
    const harness = createDeps();
    runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'hermes-agent', '--install-skills', '--apply'],
      harness.deps,
    );
    harness.stdout.length = 0;

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'hermes-agent', '--install-skills', '--verify'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.stdout.some((line) => line.includes('OK hermes-agent: Hermes cwd applicator verified'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('OK hermes-agent-skill: Skill state: current'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('Discord'))).toBe(false);
  });

  it('skips Hermes cwd applicator verification when Hermes is absent', () => {
    const harness = createDeps();
    harness.deps.commandExists = () => false;

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'hermes-agent', '--verify'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.stdout.some((line) => line.includes('OK hermes-agent: Hermes Agent was not detected'))).toBe(true);
  });

  it('fails Hermes cwd applicator verification when Hermes config exists but the plugin is missing', () => {
    const harness = createDeps();
    harness.deps.commandExists = (command: string) => command === 'hermes';
    harness.files.set('/Users/tester/.hermes/config.yaml', 'plugins:\n  enabled: []\n');

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'hermes-agent', '--verify'],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.some((line) => line.includes('FAIL hermes-agent: Hermes cwd applicator state: missing'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('Recovery: agenticos-bootstrap --agent hermes-agent --install-skills --apply'))).toBe(true);
  });

  it('reports non-Error thrown failures', () => {
    const detectHarness = createDeps();
    detectHarness.deps.commandExists = () => {
      throw 'detect exploded';
    };

    expect(runBootstrapCli(['--workspace', '/tmp/workspace'], detectHarness.deps)).toBe(1);
    expect(detectHarness.stderr).toContain('detect exploded');

    const cursorHarness = createDeps();
    cursorHarness.deps.writeFile = () => {
      throw 'cursor config locked';
    };
    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'cursor', '--apply'],
      cursorHarness.deps,
    )).toBe(1);
    expect(cursorHarness.stdout.some((line) => line.includes('FAIL cursor: cursor config locked'))).toBe(true);

    const hermesHarness = createDeps();
    hermesHarness.deps.writeFile = () => {
      throw 'hermes config locked';
    };
    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'hermes-agent', '--apply'],
      hermesHarness.deps,
    )).toBe(1);
    expect(hermesHarness.stdout.some((line) => line.includes('FAIL hermes-agent: hermes config locked'))).toBe(true);

    const hermesErrorHarness = createDeps();
    hermesErrorHarness.deps.writeFile = () => {
      throw new Error('hermes error config locked');
    };
    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'hermes-agent', '--apply'],
      hermesErrorHarness.deps,
    )).toBe(1);
    expect(hermesErrorHarness.stdout.some((line) => line.includes('FAIL hermes-agent: hermes error config locked'))).toBe(true);

    const profileHarness = createDeps();
    profileHarness.deps.writeFile = (path: string, content: string) => {
      if (path === 'profile') throw 'profile locked';
      profileHarness.files.set(path, content);
    };
    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--persist-shell-env', '--shell-profile', 'profile', '--apply'],
      profileHarness.deps,
    )).toBe(1);
    expect(profileHarness.stdout.some((line) => line.includes('FAIL shell-profile: profile locked'))).toBe(true);

    const hookHarness = createDeps();
    hookHarness.deps.writeFile = () => {
      throw 'hook settings locked';
    };
    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'claude-code', '--auto-configure-hooks', '--apply'],
      hookHarness.deps,
    )).toBe(1);
    expect(hookHarness.stdout.some((line) => line.includes('FAIL claude-pwd-hook'))).toBe(true);

    const stateHarness = createDeps();
    stateHarness.deps.writeFile = (path: string, content: string) => {
      if (path.endsWith('bootstrap-state.yaml')) throw 'state locked';
      stateHarness.files.set(path, content);
    };
    expect(runBootstrapCli(['--workspace', '/tmp/workspace', '--agent', 'codex', '--apply'], stateHarness.deps)).toBe(1);
    expect(stateHarness.stdout.some((line) => line.includes('FAIL bootstrap-state: state locked'))).toBe(true);
  });

  it('applies codex bootstrap and persists shell env', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      [
        '--workspace',
        '/tmp/workspace',
        '--agent',
        'codex',
        '--persist-shell-env',
        '--shell-profile',
        '/Users/tester/.zshrc',
        '--apply',
      ],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.commands.map((entry) => [entry.command, ...entry.args].join(' '))).toEqual([
      'codex mcp remove agenticos',
      'codex mcp add --env AGENTICOS_HOME=/tmp/workspace agenticos -- agenticos-mcp',
      'codex mcp get agenticos',
    ]);
    expect(harness.files.get('/Users/tester/.zshrc')).toContain('export AGENTICOS_HOME="/tmp/workspace"');
    const bootstrapState = yaml.parse(harness.files.get('/tmp/workspace/.agent-workspace/bootstrap-state.yaml') || '');
    expect(bootstrapState.mode).toBe('apply');
    expect(bootstrapState.selected_agents).toEqual(['codex']);
    expect(bootstrapState.successful_agents).toEqual(['codex']);
    expect(bootstrapState.status).toBe('success');
    expect(harness.stdout.some((line) => line.includes('OK codex'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('OK shell-profile'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('OK bootstrap-state'))).toBe(true);
  });

  it('writes cursor MCP config during apply', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      [
        '--workspace',
        '/tmp/workspace',
        '--agent',
        'cursor',
        '--apply',
      ],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    const content = harness.files.get('/Users/tester/.cursor/mcp.json');
    expect(content).toContain('"agenticos"');
    expect(content).toContain('/tmp/workspace');
  });

  it('reports cursor config write errors during apply', () => {
    const harness = createDeps();
    harness.deps.writeFile = () => {
      throw new Error('cursor config locked');
    };

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'cursor', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.some((line) => line.includes('FAIL cursor: cursor config locked'))).toBe(true);
  });

  it('prints dry-run plan without mutating files', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--persist-shell-env'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.commands).toHaveLength(0);
    expect(harness.files.size).toBe(0);
    expect(harness.stdout.some((line) => line.includes('shell-profile'))).toBe(true);
  });

  it('prints launchctl dry-run action when requested', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--persist-launchctl-env'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.stdout.some((line) => line.includes('launchctl: run'))).toBe(true);
  });

  it('prints cursor dry-run config and Claude hook guidance without auto flag', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'cursor', '--agent', 'claude-code'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.stdout.join('\n')).toContain('~/.cursor/mcp.json');
    expect(harness.stdout.join('\n')).toContain('rerun with --auto-configure-hooks --apply');
  });

  it('prints Claude PWD hook dry-run guidance without mutating settings', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'claude-code', '--auto-configure-hooks'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.files.has('/Users/tester/.claude/settings.json')).toBe(false);
    expect(harness.stdout.some((line) => line.includes('claude-pwd-hook'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('add agenticos_switch and agenticos_switch_out PostToolUse cwd guidance hooks'))).toBe(true);
  });

  it('adds Claude cwd guidance hook during apply when requested', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'claude-code', '--auto-configure-hooks', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    const settings = JSON.parse(harness.files.get('/Users/tester/.claude/settings.json') || '{}');
    expect(settings.hooks.PostToolUse).toHaveLength(2);
    expect(settings.hooks.PostToolUse[0].matcher).toBe('mcp__agenticos__agenticos_switch');
    expect(settings.hooks.PostToolUse[1].matcher).toBe('mcp__agenticos__agenticos_switch_out');
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe('agenticos-claude-pwd-hook');
    expect(harness.stdout.some((line) => line.includes('OK claude-pwd-hook'))).toBe(true);
  });

  it('installs AgenticOS activation Skills during apply when requested', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--install-skills', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    const skill = harness.files.get('/Users/tester/.codex/skills/agenticos/SKILL.md');
    expect(skill).toContain('agenticos-skill-managed-sha256');
    expect(skill).toContain('AgenticOS Activation');
    expect(harness.stdout.some((line) => line.includes('OK codex-skill'))).toBe(true);
    const bootstrapState = yaml.parse(harness.files.get('/tmp/workspace/.agent-workspace/bootstrap-state.yaml') || '');
    expect(bootstrapState.install_skills).toBe(true);
    expect(bootstrapState.agenticos_skills[0].status).toBe('current');
  });

  it('installs the Cursor activation Skill during apply', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'cursor', '--install-skills', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.stdout.some((line) => line.includes('OK cursor-skill'))).toBe(true);
    const cursorSkill = harness.files.get('/Users/tester/.cursor/skills-cursor/agenticos/SKILL.md');
    expect(cursorSkill).toContain('agenticos-skill-managed-sha256');
    expect(cursorSkill).toContain('AgenticOS Activation');
    const bootstrapState = yaml.parse(harness.files.get('/tmp/workspace/.agent-workspace/bootstrap-state.yaml') || '');
    expect(bootstrapState.agenticos_skills[0].agent_id).toBe('cursor');
    expect(bootstrapState.agenticos_skills[0].status).toBe('current');
    expect(bootstrapState.agenticos_skills[0].path).toBe('/Users/tester/.cursor/skills-cursor/agenticos/SKILL.md');
  });

  it('installs the Gemini CLI activation Skill during apply', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'gemini-cli', '--install-skills', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.stdout.some((line) => line.includes('OK gemini-cli-skill'))).toBe(true);
    const geminiSkill = harness.files.get('/Users/tester/.gemini/skills/agenticos/SKILL.md');
    expect(geminiSkill).toContain('agenticos-skill-managed-sha256');
    expect(geminiSkill).toContain('AgenticOS Activation');
    const bootstrapState = yaml.parse(harness.files.get('/tmp/workspace/.agent-workspace/bootstrap-state.yaml') || '');
    expect(bootstrapState.agenticos_skills[0].agent_id).toBe('gemini-cli');
    expect(bootstrapState.agenticos_skills[0].status).toBe('current');
    expect(bootstrapState.agenticos_skills[0].path).toBe('/Users/tester/.gemini/skills/agenticos/SKILL.md');
  });

  it('fails Skill install on user-modified files unless force is requested', () => {
    const harness = createDeps();
    harness.files.set('/Users/tester/.codex/skills/agenticos/SKILL.md', '# custom skill\n');

    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--install-skills', '--apply'],
      harness.deps,
    )).toBe(1);
    expect(harness.stdout.some((line) => line.includes('FAIL codex-skill'))).toBe(true);
    expect(harness.files.get('/Users/tester/.codex/skills/agenticos/SKILL.md')).toBe('# custom skill\n');

    const forceHarness = createDeps();
    forceHarness.files.set('/Users/tester/.codex/skills/agenticos/SKILL.md', '# custom skill\n');
    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--install-skills', '--force-skills', '--apply'],
      forceHarness.deps,
    )).toBe(0);
    expect(forceHarness.files.get('/Users/tester/.codex/skills/agenticos/SKILL.md')).toContain('AgenticOS Activation');
  });

  it('reports Skill install write errors during apply', () => {
    const harness = createDeps();
    harness.deps.writeFile = (path: string, content: string) => {
      if (path.includes('/.codex/skills/agenticos/')) throw new Error('skill path locked');
      harness.files.set(path, content);
    };

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--install-skills', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.some((line) => line.includes('FAIL codex-skill: skill path locked'))).toBe(true);

    const stringHarness = createDeps();
    stringHarness.deps.writeFile = (path: string, content: string) => {
      if (path.includes('/.codex/skills/agenticos/')) throw 'skill path string lock';
      stringHarness.files.set(path, content);
    };
    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--install-skills', '--apply'],
      stringHarness.deps,
    )).toBe(1);
    expect(stringHarness.stdout.some((line) => line.includes('FAIL codex-skill: skill path string lock'))).toBe(true);
  });

  it('warns but does not fail when Claude hook is missing and auto configure is not requested', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'claude-code', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.stdout.some((line) => line.includes('WARN claude-pwd-hook'))).toBe(true);
    const bootstrapState = yaml.parse(harness.files.get('/tmp/workspace/.agent-workspace/bootstrap-state.yaml') || '');
    expect(bootstrapState.claude_pwd_hook.fatal).toBe(false);
  });

  it('adds missing Claude switch-out cwd guidance hook during upgrade', () => {
    const harness = createDeps();
    harness.files.set('/Users/tester/.claude/settings.json', JSON.stringify({
      hooks: {
        PostToolUse: [
          {
            matcher: 'mcp__agenticos__agenticos_switch',
            hooks: [{ type: 'command', command: 'agenticos-claude-pwd-hook', shell: 'bash' }],
          },
        ],
      },
    }));

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'claude-code', '--auto-configure-hooks', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    const settings = JSON.parse(harness.files.get('/Users/tester/.claude/settings.json') || '{}');
    expect(settings.hooks.PostToolUse).toHaveLength(2);
    expect(settings.hooks.PostToolUse[1].matcher).toBe('mcp__agenticos__agenticos_switch_out');
    expect(harness.stdout.some((line) => line.includes('updated /Users/tester/.claude/settings.json'))).toBe(true);
  });

  it('fails apply when Claude settings cannot be merged', () => {
    const harness = createDeps();
    harness.files.set('/Users/tester/.claude/settings.json', '[]');

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'claude-code', '--auto-configure-hooks', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.some((line) => line.includes('FAIL claude-pwd-hook'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('Claude Code settings must be a JSON object'))).toBe(true);
  });

  it('fails when agent registration apply command fails', () => {
    const harness = createDeps();
    harness.deps.runCommand = (command: string, args: string[], failOnError: boolean) => {
      harness.commands.push({ command, args, failOnError });
      if ([command, ...args].join(' ') === 'codex mcp add --env AGENTICOS_HOME=/tmp/workspace agenticos -- agenticos-mcp') {
        return { ok: false, detail: 'add failed' };
      }
      return { ok: true, detail: 'ok' };
    };

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.some((line) => line.includes('FAIL codex: add failed'))).toBe(true);
  });

  it('reports shell profile persistence write errors', () => {
    const harness = createDeps();
    harness.deps.writeFile = (path: string, content: string) => {
      if (path.endsWith('.zshrc')) throw new Error('profile locked');
      harness.files.set(path, content);
    };

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--persist-shell-env', '--shell-profile', '/Users/tester/.zshrc', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.some((line) => line.includes('FAIL shell-profile: profile locked'))).toBe(true);
  });

  it('reports bootstrap state write errors', () => {
    const harness = createDeps();
    harness.deps.writeFile = (path: string, content: string) => {
      if (path.endsWith('bootstrap-state.yaml')) throw new Error('state locked');
      harness.files.set(path, content);
    };

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.some((line) => line.includes('FAIL bootstrap-state: state locked'))).toBe(true);
  });

  it('fails closed when no explicit or preconfirmed workspace exists', () => {
    const harness = createDeps();
    harness.deps.env.AGENTICOS_SOURCE_ROOT = '/Users/tester/dev/AgenticOS';

    const exitCode = runBootstrapCli(
      ['--agent', 'codex'],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stderr.some((line) => line.includes('Workspace is required.'))).toBe(true);
    expect(harness.stderr.some((line) => line.includes('default: /Users/tester/dev/AgenticOS'))).toBe(true);
    expect(harness.stderr.some((line) => line.includes('Confirm one explicitly with: agenticos-bootstrap --workspace "/Users/tester/dev/AgenticOS" ...'))).toBe(true);
    expect(harness.commands).toHaveLength(0);
  });

  it('uses preconfirmed AGENTICOS_HOME when present', () => {
    const harness = createDeps();
    harness.deps.env.AGENTICOS_HOME = '/confirmed/workspace';

    const exitCode = runBootstrapCli(
      ['--agent', 'codex'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.stdout.some((line) => line.includes('Workspace: /confirmed/workspace (env)'))).toBe(true);
  });

  it('applies launchctl persistence on macOS when requested', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--persist-launchctl-env', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.commands.map((entry) => [entry.command, ...entry.args].join(' '))).toContain(
      'launchctl setenv AGENTICOS_HOME /tmp/workspace',
    );
    expect(harness.commands.map((entry) => [entry.command, ...entry.args].join(' '))).toContain(
      'launchctl getenv AGENTICOS_HOME',
    );
    expect(harness.stdout.some((line) => line.includes('OK launchctl'))).toBe(true);
  });

  it('fails launchctl apply when setenv fails or verification mismatches', () => {
    const setHarness = createDeps();
    setHarness.deps.runCommand = (command: string, args: string[], failOnError: boolean) => {
      setHarness.commands.push({ command, args, failOnError });
      if ([command, ...args].join(' ') === 'launchctl setenv AGENTICOS_HOME /tmp/workspace') {
        return { ok: false, detail: 'setenv failed' };
      }
      return { ok: true, detail: 'ok' };
    };

    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--persist-launchctl-env', '--apply'],
      setHarness.deps,
    )).toBe(1);
    expect(setHarness.stdout.some((line) => line.includes('FAIL launchctl: setenv failed'))).toBe(true);

    const verifyHarness = createDeps();
    verifyHarness.deps.runCommand = (command: string, args: string[], failOnError: boolean) => {
      verifyHarness.commands.push({ command, args, failOnError });
      if ([command, ...args].join(' ') === 'launchctl getenv AGENTICOS_HOME') {
        return { ok: true, detail: '/tmp/other' };
      }
      return { ok: true, detail: 'ok' };
    };

    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--persist-launchctl-env', '--apply'],
      verifyHarness.deps,
    )).toBe(1);
    expect(verifyHarness.stdout.some((line) => line.includes('FAIL launchctl: /tmp/other'))).toBe(true);

    const emptyVerifyHarness = createDeps();
    emptyVerifyHarness.deps.runCommand = (command: string, args: string[], failOnError: boolean) => {
      emptyVerifyHarness.commands.push({ command, args, failOnError });
      if ([command, ...args].join(' ') === 'launchctl getenv AGENTICOS_HOME') {
        return { ok: false, detail: '' };
      }
      return { ok: true, detail: 'ok' };
    };

    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--persist-launchctl-env', '--apply'],
      emptyVerifyHarness.deps,
    )).toBe(1);
    expect(emptyVerifyHarness.stdout.some((line) => line.includes('launchctl getenv did not report'))).toBe(true);
  });

  it('fails launchctl persistence on non-macos platforms', () => {
    const harness = createDeps();
    harness.deps.platform = 'linux';

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--persist-launchctl-env', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.some((line) => line.includes('FAIL launchctl'))).toBe(true);
  });

  it('fails launchctl verification on non-macOS or empty output', () => {
    const linuxHarness = createDeps();
    linuxHarness.deps.platform = 'linux';

    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--persist-launchctl-env', '--verify'],
      linuxHarness.deps,
    )).toBe(1);
    expect(linuxHarness.stdout.some((line) => line.includes('supported only on macOS'))).toBe(true);

    const emptyHarness = createDeps();
    emptyHarness.deps.runCommand = (command: string, args: string[], failOnError: boolean) => {
      emptyHarness.commands.push({ command, args, failOnError });
      if ([command, ...args].join(' ') === 'launchctl getenv AGENTICOS_HOME') {
        return { ok: false, detail: '' };
      }
      return { ok: true, detail: 'ok' };
    };

    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--persist-launchctl-env', '--verify'],
      emptyHarness.deps,
    )).toBe(1);
    expect(emptyHarness.stdout.some((line) => line.includes('launchctl getenv did not report'))).toBe(true);
  });

  it('verifies codex, shell profile, and launchctl state without mutating', () => {
    const harness = createDeps();
    harness.files.set('/Users/tester/.zshrc', 'export AGENTICOS_HOME="/tmp/workspace"\n');

    const exitCode = runBootstrapCli(
      [
        '--workspace',
        '/tmp/workspace',
        '--agent',
        'codex',
        '--persist-shell-env',
        '--persist-launchctl-env',
        '--shell-profile',
        '/Users/tester/.zshrc',
        '--verify',
      ],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.files.get('/Users/tester/.zshrc')).toBe('export AGENTICOS_HOME="/tmp/workspace"\n');
    expect(harness.stdout.some((line) => line.includes('OK codex'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('OK shell-profile'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('OK launchctl'))).toBe(true);
    expect(harness.files.has('/tmp/workspace/.agent-workspace/bootstrap-state.yaml')).toBe(false);
  });

  it('keeps normal verification free of optional Discord channel readiness output', () => {
    const harness = createDeps();
    harness.deps.commandExists = (command: string) => command === 'codex';

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--verify'],
      harness.deps,
    );

    const output = harness.stdout.join('\n');
    expect(exitCode).toBe(0);
    expect(output).toContain('OK codex');
    expect(output).not.toContain('Optional Discord channel readiness');
    expect(output).not.toContain('discord_config');
  });

  it('blocks Discord channel routing verification only when that workflow is explicitly required', () => {
    const harness = createDeps();
    harness.deps.commandExists = (command: string) => command === 'codex';

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--verify', '--verify-hermes-discord'],
      harness.deps,
    );

    const output = harness.stdout.join('\n');
    expect(exitCode).toBe(1);
    expect(output).toContain('FAIL hermes_runtime');
    expect(output).toContain('FAIL discord_config');
    expect(output).toContain('Recovery: Install or start Hermes');
  });

  it('passes required Discord channel verification when prerequisites and thread bindings are present', () => {
    const harness = createDeps();
    harness.deps.env.HERMES_GATEWAY_URL = 'http://127.0.0.1:8787';
    harness.deps.env.DISCORD_APP_ID = 'app-id';
    harness.deps.env.DISCORD_BOT_TOKEN = 'secret-token';
    harness.files.set('/tmp/workspace/.agent-workspace/integrations/discord/thread-bindings.yaml', 'bindings:\n  - project_id: agenticos\n');
    harness.deps.commandExists = (command: string) => command === 'codex' || command === 'hermes-gateway';

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--verify', '--verify-hermes-discord'],
      harness.deps,
    );

    const output = harness.stdout.join('\n');
    expect(exitCode).toBe(0);
    expect(output).toContain('OK hermes_runtime');
    expect(output).toContain('OK discord_config');
    expect(output).toContain('Restart Hermes gateway');
    expect(output).not.toContain('secret-token');
  });

  it('verifies activation Skill state when requested', () => {
    const harness = createDeps();
    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--install-skills', '--apply'],
      harness.deps,
    )).toBe(0);

    harness.stdout.length = 0;
    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--install-skills', '--verify'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.stdout.some((line) => line.includes('OK codex-skill'))).toBe(true);

    const missingHarness = createDeps();
    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--install-skills', '--verify'],
      missingHarness.deps,
    )).toBe(1);
    expect(missingHarness.stdout.some((line) => line.includes('FAIL codex-skill'))).toBe(true);
    expect(missingHarness.stdout.some((line) => line.includes('--install-skills --apply'))).toBe(true);

    const cursorAppliedHarness = createDeps();
    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'cursor', '--install-skills', '--apply'],
      cursorAppliedHarness.deps,
    )).toBe(0);
    cursorAppliedHarness.stdout.length = 0;
    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'cursor', '--install-skills', '--verify'],
      cursorAppliedHarness.deps,
    )).toBe(0);
    expect(cursorAppliedHarness.stdout.some((line) => line.includes('OK cursor-skill'))).toBe(true);
    expect(cursorAppliedHarness.files.get('/Users/tester/.cursor/skills-cursor/agenticos/SKILL.md'))
      .toMatch(/AgenticOS Activation/);

    const geminiAppliedHarness = createDeps();
    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'gemini-cli', '--install-skills', '--apply'],
      geminiAppliedHarness.deps,
    )).toBe(0);
    geminiAppliedHarness.stdout.length = 0;
    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'gemini-cli', '--install-skills', '--verify'],
      geminiAppliedHarness.deps,
    )).toBe(0);
    expect(geminiAppliedHarness.stdout.some((line) => line.includes('OK gemini-cli-skill'))).toBe(true);
    expect(geminiAppliedHarness.files.get('/Users/tester/.gemini/skills/agenticos/SKILL.md'))
      .toMatch(/AgenticOS Activation/);

    const missingGeminiHarness = createDeps();
    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'gemini-cli', '--install-skills', '--verify'],
      missingGeminiHarness.deps,
    )).toBe(1);
    expect(missingGeminiHarness.stdout.some((line) => line.includes('FAIL gemini-cli-skill'))).toBe(true);

    const modifiedHarness = createDeps();
    modifiedHarness.files.set('/Users/tester/.codex/skills/agenticos/SKILL.md', '# local edit\n');
    expect(runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--install-skills', '--verify'],
      modifiedHarness.deps,
    )).toBe(1);
    expect(modifiedHarness.stdout.some((line) => line.includes('--force-skills --apply'))).toBe(true);
  });

  it('verifies shell profile through the default shell path', () => {
    const harness = createDeps();
    harness.files.set('/Users/tester/.profile', 'export AGENTICOS_HOME="/tmp/workspace"\n');

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--persist-shell-env', '--verify'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.stdout.some((line) => line.includes('OK shell-profile: verified /Users/tester/.profile'))).toBe(true);
  });

  it('verifies codex redacted output through config file fallback', () => {
    const harness = createDeps();
    const home = mkdtempSync(join(tmpdir(), 'agenticos-bootstrap-test-'));
    try {
      harness.deps.homeDir = home;
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(join(home, '.codex', 'config.toml'), 'agenticos = true\nAGENTICOS_HOME = "/tmp/workspace"\n');
      harness.deps.runCommand = (command: string, args: string[], failOnError: boolean) => {
        harness.commands.push({ command, args, failOnError });
        if ([command, ...args].join(' ') === 'codex mcp get agenticos') {
          return { ok: true, detail: 'AGENTICOS_HOME=*****' };
        }
        return { ok: true, detail: 'ok' };
      };

      expect(runBootstrapCli(['--workspace', '/tmp/workspace', '--agent', 'codex', '--verify'], harness.deps)).toBe(0);
      expect(harness.stdout.some((line) => line.includes('CLI output redacted'))).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('fails codex redacted verification when config fallback mismatches', () => {
    const harness = createDeps();
    harness.deps.runCommand = (command: string, args: string[], failOnError: boolean) => {
      harness.commands.push({ command, args, failOnError });
      if ([command, ...args].join(' ') === 'codex mcp get agenticos') {
        return { ok: true, detail: 'AGENTICOS_HOME=*****' };
      }
      return { ok: true, detail: 'ok' };
    };

    expect(runBootstrapCli(['--workspace', '/tmp/workspace', '--agent', 'codex', '--verify'], harness.deps)).toBe(1);
    expect(harness.stdout.some((line) => line.includes('workspace path mismatch'))).toBe(true);
  });

  it('fails verification when codex points at a different workspace', () => {
    const harness = createDeps();
    harness.deps.runCommand = (command: string, args: string[], failOnError: boolean) => {
      harness.commands.push({ command, args, failOnError });
      const joined = [command, ...args].join(' ');
      if (joined === 'codex mcp get agenticos') {
        return { ok: true, detail: 'env: AGENTICOS_HOME=/tmp/other-workspace' };
      }
      return { ok: true, detail: 'ok' };
    };

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--verify'],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.some((line) => line.includes('FAIL codex: env: AGENTICOS_HOME=/tmp/other-workspace'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('Recovery: agenticos-bootstrap --agent codex'))).toBe(true);
  });

  it('shows recovery command for claude-code when verification fails', () => {
    const harness = createDeps();
    harness.deps.runCommand = (command: string, args: string[], failOnError: boolean) => {
      harness.commands.push({ command, args, failOnError });
      if ([command, ...args].join(' ') === 'claude mcp get agenticos') {
        return { ok: false, detail: 'not registered' };
      }
      return { ok: true, detail: 'ok' };
    };

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'claude-code', '--verify'],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.some((line) => line.includes('FAIL claude-code'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('Recovery: claude mcp add agenticos -s user -e AGENTICOS_HOME="$AGENTICOS_HOME" -- agenticos-mcp'))).toBe(true);
  });

  it('verifies the Claude cwd guidance hook when claude-code is selected', () => {
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

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'claude-code', '--verify'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.stdout.some((line) => line.includes('OK claude-code'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('OK claude-pwd-hook'))).toBe(true);
  });

  it('keeps an already configured Claude cwd hook unchanged during apply', () => {
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

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'claude-code', '--auto-configure-hooks', '--apply'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.stdout.some((line) => line.includes('OK claude-pwd-hook'))).toBe(true);
  });

  it('fails Claude verification when the cwd guidance hook is missing', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'claude-code', '--verify'],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.some((line) => line.includes('FAIL claude-pwd-hook'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('--auto-configure-hooks --apply'))).toBe(true);
  });

  it('verifies gemini and cursor agents', () => {
    const geminiHarness = createDeps();

    expect(runBootstrapCli(['--workspace', '/tmp/workspace', '--agent', 'gemini-cli', '--verify'], geminiHarness.deps)).toBe(0);
    expect(geminiHarness.stdout.some((line) => line.includes('OK gemini-cli'))).toBe(true);

    const failedGeminiHarness = createDeps();
    failedGeminiHarness.deps.runCommand = (command: string, args: string[], failOnError: boolean) => {
      failedGeminiHarness.commands.push({ command, args, failOnError });
      if ([command, ...args].join(' ') === 'gemini mcp list') {
        return { ok: true, detail: 'no servers' };
      }
      return { ok: true, detail: 'ok' };
    };
    expect(runBootstrapCli(['--workspace', '/tmp/workspace', '--agent', 'gemini-cli', '--verify'], failedGeminiHarness.deps)).toBe(1);
    expect(failedGeminiHarness.stdout.some((line) => line.includes('FAIL gemini-cli'))).toBe(true);

    const missingCursorHarness = createDeps();
    expect(runBootstrapCli(['--workspace', '/tmp/workspace', '--agent', 'cursor', '--verify'], missingCursorHarness.deps)).toBe(1);
    expect(missingCursorHarness.stdout.some((line) => line.includes('missing /Users/tester/.cursor/mcp.json'))).toBe(true);

    const cursorHarness = createDeps();
    cursorHarness.files.set('/Users/tester/.cursor/mcp.json', JSON.stringify({ mcpServers: { agenticos: { env: { AGENTICOS_HOME: '/tmp/workspace' } } } }));
    expect(runBootstrapCli(['--workspace', '/tmp/workspace', '--agent', 'cursor', '--verify'], cursorHarness.deps)).toBe(0);
    expect(cursorHarness.stdout.some((line) => line.includes('OK cursor'))).toBe(true);

    const mismatchCursorHarness = createDeps();
    mismatchCursorHarness.files.set('/Users/tester/.cursor/mcp.json', JSON.stringify({ mcpServers: { agenticos: { env: { AGENTICOS_HOME: '/tmp/other' } } } }));
    expect(runBootstrapCli(['--workspace', '/tmp/workspace', '--agent', 'cursor', '--verify'], mismatchCursorHarness.deps)).toBe(1);
    expect(mismatchCursorHarness.stdout.some((line) => line.includes('expected agenticos MCP entry'))).toBe(true);
  });

  it('fails verification when the expected shell profile export is missing', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      [
        '--workspace',
        '/tmp/workspace',
        '--agent',
        'codex',
        '--persist-shell-env',
        '--shell-profile',
        '/Users/tester/.zshrc',
        '--verify',
      ],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.some((line) => line.includes('FAIL shell-profile'))).toBe(true);
  });

  it('fails verification when shell profile points at a different workspace', () => {
    const harness = createDeps();
    harness.files.set('/Users/tester/.zshrc', 'export AGENTICOS_HOME="/tmp/other"\n');

    const exitCode = runBootstrapCli(
      [
        '--workspace',
        '/tmp/workspace',
        '--agent',
        'codex',
        '--persist-shell-env',
        '--shell-profile',
        '/Users/tester/.zshrc',
        '--verify',
      ],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.some((line) => line.includes('expected export AGENTICOS_HOME="/tmp/workspace"'))).toBe(true);
  });

  it('enables apply, shell persistence, and launchctl persistence in first-run mode on macOS', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--first-run'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.commands.map((entry) => [entry.command, ...entry.args].join(' '))).toContain(
      'launchctl setenv AGENTICOS_HOME /tmp/workspace',
    );
    expect(harness.files.get('/Users/tester/.profile')).toContain('export AGENTICOS_HOME="/tmp/workspace"');
    expect(harness.stdout.some((line) => line.includes('OK shell-profile'))).toBe(true);
    expect(harness.stdout.some((line) => line.includes('OK launchctl'))).toBe(true);
  });

  it('enables shell persistence only in first-run mode on non-macOS', () => {
    const harness = createDeps();
    harness.deps.platform = 'linux';

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--first-run'],
      harness.deps,
    );

    expect(exitCode).toBe(0);
    expect(harness.commands.map((entry) => [entry.command, ...entry.args].join(' '))).not.toContain(
      'launchctl setenv AGENTICOS_HOME /tmp/workspace',
    );
    expect(harness.stdout.some((line) => line.includes('OK shell-profile'))).toBe(true);
  });

  it('rejects combining first-run with verify', () => {
    const harness = createDeps();

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--first-run', '--verify'],
      harness.deps,
    );

    expect(exitCode).toBe(1);
    expect(harness.stderr.some((line) => line.includes('--first-run cannot be combined with --verify.'))).toBe(true);
  });
});
