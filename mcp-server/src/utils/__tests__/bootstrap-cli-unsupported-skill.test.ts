import { describe, expect, it, vi } from 'vitest';

vi.mock('../agent-skill.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../agent-skill.js')>();
  return {
    ...actual,
    installAgentSkill(agentId: string, homeDir: string, deps: unknown, options: unknown) {
      if (agentId === 'codex' && homeDir === '/Unsupported') {
        return {
          agentId,
          target: {
            agentId,
            label: 'Unsupported test Skill',
            supported: false,
            path: null,
            reloadHint: '',
          },
          status: 'unsupported',
          installedVersion: null,
          expectedVersion: actual.AGENTICOS_SKILL_TEMPLATE_VERSION,
          detail: 'local Skills are not supported in this test harness',
          ok: true,
          wrote: false,
          skipped: true,
        };
      }
      return actual.installAgentSkill(agentId as never, homeDir, deps as never, options as never);
    },
    inspectAgentSkill(agentId: string, homeDir: string, readFile: (path: string) => string | null) {
      if (agentId === 'codex' && homeDir === '/Unsupported') {
        return {
          agentId,
          target: {
            agentId,
            label: 'Unsupported test Skill',
            supported: false,
            path: null,
            reloadHint: '',
          },
          status: 'unsupported',
          installedVersion: null,
          expectedVersion: actual.AGENTICOS_SKILL_TEMPLATE_VERSION,
          detail: 'local Skills are not supported in this test harness',
        };
      }
      return actual.inspectAgentSkill(agentId as never, homeDir, readFile);
    },
    isAgentSkillOkForVerify(inspection: { status: string }) {
      return inspection.status === 'unsupported' || actual.isAgentSkillOkForVerify(inspection as never);
    },
  };
});

describe('bootstrap cli unsupported Skill handling', () => {
  it('renders dry-run Skill skips when an agent target is unsupported', async () => {
    const { buildDryRunLines } = await import('../bootstrap-cli.js');

    const lines = buildDryRunLines(
      '/tmp/workspace',
      'explicit --workspace',
      [{ id: 'codex', label: 'Codex', installed: true, detection_hint: 'test' }],
      ['codex'],
      {
        apply: false,
        verify: false,
        firstRun: false,
        all: false,
        agents: ['codex'],
        help: false,
        persistShellEnv: false,
        persistLaunchctlEnv: false,
        autoConfigureHooks: false,
        installSkills: true,
        forceSkills: false,
        verifyHermesDiscord: false,
      },
      undefined,
      '/Unsupported',
    );

    expect(lines.join('\n')).toContain('codex-skill: skip (local Skills are not supported');
  });

  it('reports unsupported Skill verification as SKIP', async () => {
    const { runBootstrapCli } = await import('../bootstrap-cli.js');
    const stdout: string[] = [];

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--install-skills', '--verify'],
      {
        env: {},
        homeDir: '/Unsupported',
        platform: 'darwin',
        nowIso: () => '2026-05-30T00:00:00.000Z',
        commandExists: (command) => command === 'codex',
        runCommand(command, args) {
          if ([command, ...args].join(' ') === 'codex mcp get agenticos') {
            return { ok: true, detail: 'env: AGENTICOS_HOME=/tmp/workspace' };
          }
          return { ok: true, detail: 'ok' };
        },
        mkdirp() {},
        readFile() {
          return null;
        },
        writeFile() {},
        stdout(line) {
          stdout.push(line);
        },
        stderr() {},
      },
    );

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('SKIP codex-skill: Skill state: unsupported');
  });

  it('reports unsupported Skill apply results as SKIP', async () => {
    const { runBootstrapCli } = await import('../bootstrap-cli.js');
    const stdout: string[] = [];

    const exitCode = runBootstrapCli(
      ['--workspace', '/tmp/workspace', '--agent', 'codex', '--install-skills', '--apply'],
      {
        env: {},
        homeDir: '/Unsupported',
        platform: 'darwin',
        nowIso: () => '2026-05-30T00:00:00.000Z',
        commandExists: (command) => command === 'codex',
        runCommand(command, args) {
          if ([command, ...args].join(' ') === 'codex mcp get agenticos') {
            return { ok: true, detail: 'env: AGENTICOS_HOME=/tmp/workspace' };
          }
          return { ok: true, detail: 'ok' };
        },
        mkdirp() {},
        readFile() {
          return null;
        },
        writeFile() {},
        stdout(line) {
          stdout.push(line);
        },
        stderr() {},
      },
    );

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('SKIP codex-skill: local Skills are not supported');
  });
});
