import yaml from 'yaml';
import { detectDefaultShellProfile, detectDefaultWorkspace, detectSupportedAgents, formatCommand, mergeCursorMcpConfig, parseAgentSelection, renderBootstrapCommand, renderCursorConfigSnippet, renderRepairRemoveCommand, upsertAgenticOSEnvExport, type DetectedAgent, type SupportedAgentId } from './bootstrap-helper.js';

export interface CliOptions {
  apply: boolean;
  verify: boolean;
  firstRun: boolean;
  all: boolean;
  workspace?: string;
  agents: string[];
  help: boolean;
  persistShellEnv: boolean;
  persistLaunchctlEnv: boolean;
  shellProfile?: string;
}

export interface ApplyResult {
  agentId: SupportedAgentId;
  ok: boolean;
  detail: string;
}

export interface CommandResult {
  ok: boolean;
  detail: string;
}

export interface BootstrapCliDeps {
  env: Record<string, string | undefined>;
  homeDir: string;
  platform: string;
  nowIso(): string;
  commandExists(command: string): boolean;
  runCommand(command: string, args: string[], failOnError: boolean): CommandResult;
  mkdirp(path: string): void;
  readFile(path: string): string | null;
  writeFile(path: string, content: string): void;
  stdout(line: string): void;
  stderr(line: string): void;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    verify: false,
    firstRun: false,
    all: false,
    agents: [],
    help: false,
    persistShellEnv: false,
    persistLaunchctlEnv: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--apply':
        options.apply = true;
        break;
      case '--verify':
        options.verify = true;
        break;
      case '--first-run':
        options.firstRun = true;
        break;
      case '--all':
        options.all = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--persist-shell-env':
        options.persistShellEnv = true;
        break;
      case '--persist-launchctl-env':
        options.persistLaunchctlEnv = true;
        break;
      case '--workspace': {
        const value = argv[index + 1];
        if (!value) throw new Error('--workspace requires a path.');
        options.workspace = value;
        index += 1;
        break;
      }
      case '--agent': {
        const value = argv[index + 1];
        if (!value) throw new Error('--agent requires a value.');
        options.agents.push(value);
        index += 1;
        break;
      }
      case '--shell-profile': {
        const value = argv[index + 1];
        if (!value) throw new Error('--shell-profile requires a path.');
        options.shellProfile = value;
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function runBootstrapCli(argv: string[], deps: BootstrapCliDeps): number {
  try {
    const options = normalizeCliOptions(parseCliArgs(argv), deps.platform);

    if (options.help) {
      for (const line of buildHelpLines()) deps.stdout(line);
      return 0;
    }

    const workspaceSelection = options.workspace
      ? { workspace: options.workspace, source: 'arg' as const }
      : detectDefaultWorkspace(deps.env.AGENTICOS_HOME, undefined, deps.homeDir);
    const detectedAgents = detectSupportedAgents(
      deps.commandExists,
      undefined,
      deps.homeDir,
    );
    const selectedAgents = resolveSelectedAgents(options, detectedAgents);

    if (selectedAgents.length === 0) {
      deps.stderr('No agents selected for bootstrap.');
      deps.stderr('Use `--all` or `--agent <id>` if auto-detection does not find your client.');
      return 1;
    }

    if (!options.apply) {
      if (options.verify) {
        const verification = runVerification(
          workspaceSelection.workspace,
          selectedAgents,
          options,
          deps,
        );
        for (const line of verification.lines) deps.stdout(line);
        return verification.ok ? 0 : 1;
      }

      for (const line of buildDryRunLines(
        workspaceSelection.workspace,
        workspaceSelection.source,
        detectedAgents,
        selectedAgents,
        options,
        deps.env.SHELL,
        deps.homeDir,
      )) deps.stdout(line);
      return 0;
    }

    deps.mkdirp(workspaceSelection.workspace);
    const results = selectedAgents.map((agentId) => applyAgent(agentId, workspaceSelection.workspace, deps));
    const shellProfileResult = options.persistShellEnv
      ? persistShellEnv(options.shellProfile, workspaceSelection.workspace, deps)
      : null;
    const launchctlResult = options.persistLaunchctlEnv
      ? persistLaunchctlEnv(workspaceSelection.workspace, deps)
      : null;
    const bootstrapStateResult = persistBootstrapState(
      workspaceSelection.workspace,
      selectedAgents,
      options,
      results,
      shellProfileResult,
      launchctlResult,
      deps,
    );

    deps.stdout(`Workspace: ${workspaceSelection.workspace}`);
    for (const result of results) {
      const marker = result.ok ? 'OK' : 'FAIL';
      deps.stdout(`${marker} ${result.agentId}: ${result.detail}`);
    }
    if (shellProfileResult) {
      const marker = shellProfileResult.ok ? 'OK' : 'FAIL';
      deps.stdout(`${marker} shell-profile: ${shellProfileResult.detail}`);
    }
    if (launchctlResult) {
      const marker = launchctlResult.ok ? 'OK' : 'FAIL';
      deps.stdout(`${marker} launchctl: ${launchctlResult.detail}`);
    }
    {
      const marker = bootstrapStateResult.ok ? 'OK' : 'FAIL';
      deps.stdout(`${marker} bootstrap-state: ${bootstrapStateResult.detail}`);
    }

    return results.some((result) => !result.ok)
      || (shellProfileResult && !shellProfileResult.ok)
      || (launchctlResult && !launchctlResult.ok)
      || !bootstrapStateResult.ok
      ? 1
      : 0;
  } catch (error) {
    deps.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export function buildHelpLines(): string[] {
  return [
    'agenticos-bootstrap — bootstrap AgenticOS MCP registrations',
    '',
    'Usage:',
    '  agenticos-bootstrap [--workspace <path>] [--agent <id>] [--all] [--first-run] [--persist-shell-env] [--persist-launchctl-env] [--shell-profile <path>] [--verify] [--apply]',
    '',
    'Behavior:',
    '  Without `--apply`, prints a dry-run bootstrap plan.',
    '  With `--apply`, creates the workspace if needed and writes supported agent config.',
    '  With `--verify`, checks the selected agent registrations and optional persistence layers without mutating them.',
    '  `--first-run` is a convenience mode: it implies `--apply`, enables shell persistence, and on macOS also enables launchctl persistence.',
    '  `--persist-shell-env` also writes export AGENTICOS_HOME=... to the detected shell profile.',
    '  `--persist-launchctl-env` also runs `launchctl setenv` on macOS for GUI/session inheritance.',
    '',
    'Supported agent ids: claude-code, codex, cursor, gemini-cli',
  ];
}

export function normalizeCliOptions(options: CliOptions, platform: string): CliOptions {
  if (options.apply && options.verify) {
    throw new Error('--apply and --verify cannot be used together.');
  }

  if (options.firstRun && options.verify) {
    throw new Error('--first-run cannot be combined with --verify.');
  }

  if (options.firstRun) {
    options.apply = true;
    options.persistShellEnv = true;
    if (platform === 'darwin') {
      options.persistLaunchctlEnv = true;
    }
  }

  return options;
}

export function resolveSelectedAgents(
  cliOptions: CliOptions,
  detected: DetectedAgent[],
): SupportedAgentId[] {
  if (cliOptions.all) return detected.map((agent) => agent.id);
  if (cliOptions.agents.length > 0) return parseAgentSelection(cliOptions.agents);
  return detected.filter((agent) => agent.installed).map((agent) => agent.id);
}

export function buildDryRunLines(
  workspace: string,
  source: string,
  detected: DetectedAgent[],
  selected: SupportedAgentId[],
  options: CliOptions,
  shellPath: string | undefined,
  homeDir: string,
): string[] {
  const lines = [
    'AgenticOS bootstrap plan',
    '',
    `Workspace: ${workspace} (${source})`,
    '',
    'Detected agents:',
  ];
  for (const agent of detected) {
    const marker = agent.installed ? 'yes' : 'no';
    lines.push(`- ${agent.id}: ${marker} (${agent.detection_hint})`);
  }
  lines.push('', 'Selected agents:');
  for (const agentId of selected) lines.push(`- ${agentId}`);
  lines.push('', 'Planned actions:');
  for (const agentId of selected) {
    if (agentId === 'cursor') {
      lines.push('- cursor: write ~/.cursor/mcp.json entry');
      lines.push(renderCursorConfigSnippet(workspace));
      continue;
    }
    const remove = renderRepairRemoveCommand(agentId);
    const add = renderBootstrapCommand(agentId, workspace);
    if (remove) lines.push(`- ${agentId}: ${formatCommand(remove)} || true`);
    lines.push(`- ${agentId}: ${formatCommand(add)}`);
  }
  if (options.persistShellEnv) {
    const target = options.shellProfile || detectDefaultShellProfile(shellPath, homeDir);
    lines.push(`- shell-profile: write export AGENTICOS_HOME to ${target}`);
  }
  if (options.persistLaunchctlEnv) {
    lines.push('- launchctl: run `launchctl setenv AGENTICOS_HOME ...` (macOS only)');
  }
  lines.push('', 'Re-run with `--apply` to perform these actions.');
  return lines;
}

function runVerification(
  workspace: string,
  selected: SupportedAgentId[],
  options: CliOptions,
  deps: BootstrapCliDeps,
): { ok: boolean; lines: string[] } {
  const lines = [
    'AgenticOS bootstrap verification',
    '',
    `Workspace: ${workspace}`,
    '',
  ];
  let ok = true;

  for (const agentId of selected) {
    const result = verifyAgent(agentId, deps, workspace);
    const marker = result.ok ? 'OK' : 'FAIL';
    lines.push(`${marker} ${agentId}: ${result.detail}`);
    if (!result.ok) ok = false;
  }

  if (options.persistShellEnv) {
    const result = verifyShellEnv(options.shellProfile, workspace, deps);
    const marker = result.ok ? 'OK' : 'FAIL';
    lines.push(`${marker} shell-profile: ${result.detail}`);
    if (!result.ok) ok = false;
  }

  if (options.persistLaunchctlEnv) {
    const result = verifyLaunchctlEnv(workspace, deps);
    const marker = result.ok ? 'OK' : 'FAIL';
    lines.push(`${marker} launchctl: ${result.detail}`);
    if (!result.ok) ok = false;
  }

  return { ok, lines };
}

function applyAgent(
  agentId: SupportedAgentId,
  workspace: string,
  deps: BootstrapCliDeps,
): ApplyResult {
  if (agentId === 'cursor') {
    return applyCursor(workspace, deps);
  }

  const remove = renderRepairRemoveCommand(agentId);
  if (remove) deps.runCommand(remove.command, remove.args, false);

  const add = renderBootstrapCommand(agentId, workspace);
  const addResult = deps.runCommand(add.command, add.args, true);
  if (!addResult.ok) {
    return { agentId, ok: false, detail: addResult.detail };
  }

  const verification = verifyAgent(agentId, deps, workspace);
  return { agentId, ok: verification.ok, detail: verification.detail };
}

function applyCursor(workspace: string, deps: BootstrapCliDeps): ApplyResult {
  try {
    const configPath = `${deps.homeDir}/.cursor/mcp.json`;
    deps.mkdirp(`${deps.homeDir}/.cursor`);
    const existing = deps.readFile(configPath);
    const merged = mergeCursorMcpConfig(existing, workspace);
    deps.writeFile(configPath, merged);
    return { agentId: 'cursor', ok: merged.includes('"AGENTICOS_HOME"'), detail: `updated ${configPath}` };
  } catch (error) {
    return { agentId: 'cursor', ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function persistShellEnv(
  explicitProfilePath: string | undefined,
  workspace: string,
  deps: BootstrapCliDeps,
): { ok: boolean; detail: string } {
  try {
    const profilePath = explicitProfilePath || detectDefaultShellProfile(deps.env.SHELL, deps.homeDir);
    const profileDir = profilePath.split('/').slice(0, -1).join('/') || '.';
    deps.mkdirp(profileDir);
    const existing = deps.readFile(profilePath);
    const next = upsertAgenticOSEnvExport(existing, workspace);
    deps.writeFile(profilePath, next);
    return { ok: true, detail: `updated ${profilePath}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function verifyShellEnv(
  explicitProfilePath: string | undefined,
  workspace: string,
  deps: BootstrapCliDeps,
): { ok: boolean; detail: string } {
  const profilePath = explicitProfilePath || detectDefaultShellProfile(deps.env.SHELL, deps.homeDir);
  const content = deps.readFile(profilePath);
  if (!content) {
    return {
      ok: false,
      detail: `missing ${profilePath}`,
    };
  }

  const expected = `export AGENTICOS_HOME="${workspace}"`;
  return content.includes(expected)
    ? { ok: true, detail: `verified ${profilePath}` }
    : { ok: false, detail: `expected ${expected} in ${profilePath}` };
}

function persistLaunchctlEnv(
  workspace: string,
  deps: BootstrapCliDeps,
): { ok: boolean; detail: string } {
  if (deps.platform !== 'darwin') {
    return {
      ok: false,
      detail: '--persist-launchctl-env is supported only on macOS.',
    };
  }

  const setResult = deps.runCommand('launchctl', ['setenv', 'AGENTICOS_HOME', workspace], true);
  if (!setResult.ok) {
    return {
      ok: false,
      detail: setResult.detail,
    };
  }

  const verifyResult = deps.runCommand('launchctl', ['getenv', 'AGENTICOS_HOME'], true);
  if (!verifyResult.ok || !verifyResult.detail.includes(workspace)) {
    return {
      ok: false,
      detail: verifyResult.detail || 'launchctl getenv did not report AGENTICOS_HOME.',
    };
  }

  return {
    ok: true,
    detail: 'session env verified via `launchctl getenv AGENTICOS_HOME`',
  };
}

function verifyLaunchctlEnv(
  workspace: string,
  deps: BootstrapCliDeps,
): { ok: boolean; detail: string } {
  if (deps.platform !== 'darwin') {
    return {
      ok: false,
      detail: '--persist-launchctl-env is supported only on macOS.',
    };
  }

  const verifyResult = deps.runCommand('launchctl', ['getenv', 'AGENTICOS_HOME'], true);
  if (!verifyResult.ok || !verifyResult.detail.includes(workspace)) {
    return {
      ok: false,
      detail: verifyResult.detail || 'launchctl getenv did not report AGENTICOS_HOME.',
    };
  }

  return {
    ok: true,
    detail: 'session env verified via `launchctl getenv AGENTICOS_HOME`',
  };
}

function persistBootstrapState(
  workspace: string,
  selectedAgents: SupportedAgentId[],
  options: CliOptions,
  agentResults: ApplyResult[],
  shellProfileResult: { ok: boolean; detail: string } | null,
  launchctlResult: { ok: boolean; detail: string } | null,
  deps: BootstrapCliDeps,
): { ok: boolean; detail: string } {
  try {
    const stateDir = `${workspace}/.agent-workspace`;
    const statePath = `${stateDir}/bootstrap-state.yaml`;
    const successfulAgents = agentResults.filter((result) => result.ok).map((result) => result.agentId);
    const failedAgents = agentResults.filter((result) => !result.ok).map((result) => result.agentId);
    const status = agentResults.every((result) => result.ok)
      && (!shellProfileResult || shellProfileResult.ok)
      && (!launchctlResult || launchctlResult.ok)
      ? 'success'
      : 'partial-failure';

    deps.mkdirp(stateDir);
    deps.writeFile(
      statePath,
      yaml.stringify({
        version: 1,
        last_bootstrapped_at: deps.nowIso(),
        workspace,
        platform: deps.platform,
        mode: options.firstRun ? 'first-run' : 'apply',
        selected_agents: selectedAgents,
        successful_agents: successfulAgents,
        failed_agents: failedAgents,
        persist_shell_env: options.persistShellEnv,
        persist_launchctl_env: options.persistLaunchctlEnv,
        shell_profile_path: options.persistShellEnv
          ? (options.shellProfile || detectDefaultShellProfile(deps.env.SHELL, deps.homeDir))
          : null,
        status,
      }),
    );
    return {
      ok: true,
      detail: `updated ${statePath}`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function verifyAgent(agentId: SupportedAgentId, deps: BootstrapCliDeps, workspace: string): CommandResult {
  switch (agentId) {
    case 'claude-code': {
      const result = deps.runCommand('claude', ['mcp', 'get', 'agenticos'], true);
      return result.ok && hasExpectedWorkspaceEnv(result.detail, workspace)
        ? { ok: true, detail: 'registration verified via `claude mcp get agenticos` (workspace env matches)' }
        : { ok: false, detail: result.detail };
    }
    case 'codex': {
      const result = deps.runCommand('codex', ['mcp', 'get', 'agenticos'], true);
      return result.ok && hasExpectedWorkspaceEnv(result.detail, workspace)
        ? { ok: true, detail: 'registration verified via `codex mcp get agenticos` (workspace env matches)' }
        : { ok: false, detail: result.detail };
    }
    case 'gemini-cli': {
      const result = deps.runCommand('gemini', ['mcp', 'list'], true);
      return result.ok && result.detail.includes('agenticos')
        ? { ok: true, detail: 'registration verified via `gemini mcp list`' }
        : { ok: false, detail: result.detail };
    }
    case 'cursor': {
      const configPath = `${deps.homeDir}/.cursor/mcp.json`;
      const content = deps.readFile(configPath);
      if (!content) {
        return { ok: false, detail: `missing ${configPath}` };
      }
      return content.includes('"agenticos"') && content.includes(workspace)
        ? { ok: true, detail: `verified ${configPath}` }
        : { ok: false, detail: `expected agenticos MCP entry in ${configPath}` };
    }
  }
}

function hasExpectedWorkspaceEnv(detail: string, workspace: string): boolean {
  if (!detail.includes('AGENTICOS_HOME')) {
    return false;
  }

  return detail.includes(`AGENTICOS_HOME=${workspace}`)
    || detail.includes(`AGENTICOS_HOME: ${workspace}`)
    || detail.includes(`AGENTICOS_HOME="${workspace}"`);
}
