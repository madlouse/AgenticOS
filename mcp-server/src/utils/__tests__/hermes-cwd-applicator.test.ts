import { describe, expect, it } from 'vitest';
import yaml from 'yaml';
import {
  HERMES_CWD_APPLICATOR_PLUGIN_NAME,
  enableHermesPlugin,
  inspectHermesCwdApplicator,
  installHermesCwdApplicator,
  isHermesCwdApplicatorOkForVerify,
  renderHermesCwdApplicatorManifest,
  renderHermesCwdApplicatorPlugin,
  resolveHermesCwdApplicatorTarget,
} from '../hermes-cwd-applicator.js';

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

describe('hermes cwd applicator bootstrap', () => {
  it('resolves the user plugin target and renders Hermes plugin files', () => {
    const target = resolveHermesCwdApplicatorTarget('/Users/tester');

    expect(target.pluginDir).toBe('/Users/tester/.hermes/plugins/agenticos-cwd-applicator');
    expect(target.manifestPath).toBe('/Users/tester/.hermes/plugins/agenticos-cwd-applicator/plugin.yaml');
    expect(target.initPath).toBe('/Users/tester/.hermes/plugins/agenticos-cwd-applicator/__init__.py');
    expect(renderHermesCwdApplicatorManifest()).toContain(`name: ${HERMES_CWD_APPLICATOR_PLUGIN_NAME}`);
    expect(renderHermesCwdApplicatorManifest()).toContain('post_tool_call');
    expect(renderHermesCwdApplicatorPlugin()).toContain('agenticos_switch_out');
    expect(renderHermesCwdApplicatorPlugin()).toContain('TERMINAL_CWD');
    expect(renderHermesCwdApplicatorPlugin()).toContain('set_session_cwd');
  });

  it('enables the Hermes plugin in empty or existing config', () => {
    const empty = yaml.parse(enableHermesPlugin(null, HERMES_CWD_APPLICATOR_PLUGIN_NAME));
    expect(empty.plugins.enabled).toEqual([HERMES_CWD_APPLICATOR_PLUGIN_NAME]);

    const existing = yaml.parse(enableHermesPlugin([
      'model:',
      '  default: test',
      'plugins:',
      '  enabled:',
      '    - qihu360teams',
      '  disabled: []',
      '',
    ].join('\n'), HERMES_CWD_APPLICATOR_PLUGIN_NAME));

    expect(existing.model.default).toBe('test');
    expect(existing.plugins.enabled).toEqual(['qihu360teams', HERMES_CWD_APPLICATOR_PLUGIN_NAME]);
    expect(existing.plugins.disabled).toEqual([]);

    const idempotent = yaml.parse(enableHermesPlugin(yaml.stringify(existing), HERMES_CWD_APPLICATOR_PLUGIN_NAME));
    expect(idempotent.plugins.enabled).toEqual(['qihu360teams', HERMES_CWD_APPLICATOR_PLUGIN_NAME]);
  });

  it('installs and verifies the managed Hermes cwd applicator plugin', () => {
    const harness = createDeps();

    const result = installHermesCwdApplicator('/Users/tester', harness.deps);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('current');
    expect(harness.dirs).toContain('/Users/tester/.hermes/plugins/agenticos-cwd-applicator');
    expect(harness.dirs).toContain('/Users/tester/.hermes');
    expect(harness.files.get('/Users/tester/.hermes/plugins/agenticos-cwd-applicator/plugin.yaml'))
      .toContain('agenticos-cwd-applicator');
    expect(harness.files.get('/Users/tester/.hermes/plugins/agenticos-cwd-applicator/__init__.py'))
      .toContain('AgenticOS cwd applicator');
    expect(harness.files.get('/Users/tester/.hermes/config.yaml')).toContain('agenticos-cwd-applicator');
    expect(isHermesCwdApplicatorOkForVerify(inspectHermesCwdApplicator('/Users/tester', harness.deps))).toBe(true);
  });

  it('reports missing, disabled, stale, and invalid states', () => {
    const harness = createDeps();
    expect(inspectHermesCwdApplicator('/Users/tester', harness.deps).status).toBe('missing');

    const target = resolveHermesCwdApplicatorTarget('/Users/tester');
    harness.files.set(target.manifestPath, renderHermesCwdApplicatorManifest());
    harness.files.set(target.initPath, renderHermesCwdApplicatorPlugin());
    harness.files.set(target.configPath, 'plugins:\n  enabled: []\n');
    expect(inspectHermesCwdApplicator('/Users/tester', harness.deps).status).toBe('disabled');

    harness.files.set(target.configPath, '\n');
    expect(inspectHermesCwdApplicator('/Users/tester', harness.deps).status).toBe('disabled');

    harness.files.set(target.configPath, 'model:\n  default: test\n');
    expect(inspectHermesCwdApplicator('/Users/tester', harness.deps).status).toBe('disabled');

    harness.files.set(target.configPath, 'plugins: []\n');
    expect(inspectHermesCwdApplicator('/Users/tester', harness.deps).status).toBe('disabled');

    harness.files.set(target.configPath, '[]\n');
    expect(inspectHermesCwdApplicator('/Users/tester', harness.deps).status).toBe('unavailable');

    harness.files.set(target.configPath, 'plugins: [');
    expect(inspectHermesCwdApplicator('/Users/tester', harness.deps).status).toBe('unavailable');

    harness.files.set(target.configPath, `plugins:\n  enabled:\n    - ${HERMES_CWD_APPLICATOR_PLUGIN_NAME}\n`);
    harness.files.set(target.initPath, '# local edit\n');
    expect(inspectHermesCwdApplicator('/Users/tester', harness.deps).status).toBe('stale-managed');
  });

  it('rejects invalid Hermes config while enabling the plugin', () => {
    expect(() => enableHermesPlugin('[]', HERMES_CWD_APPLICATOR_PLUGIN_NAME)).toThrow('Hermes config must be a YAML object.');
  });
});
