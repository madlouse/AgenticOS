import yaml from 'yaml';
import { readFileSync } from 'fs';
import { detectDefaultShellProfile, detectDefaultWorkspace, detectSupportedAgents, detectWorkspaceCandidates, formatCommand, mergeCursorMcpConfig, parseAgentSelection, renderBootstrapCommand, renderCursorConfigSnippet, renderRepairRemoveCommand, upsertAgenticOSEnvExport, type DetectedAgent, type SupportedAgentId } from './bootstrap-helper.js';
import {
  CLAUDE_SETTINGS_PATH,
  inspectClaudePwdAlignmentHook,
  mergeClaudePwdAlignmentHook,
} from './claude-pwd-hook.js';
import {
  installAgentSkill,
  inspectAgentSkill,
  isAgentSkillOkForVerify,
  type AgentSkillInstallResult,
} from './agent-skill.js';
import {
  HERMES_CWD_APPLICATOR_PLUGIN_NAME,
  installHermesCwdApplicator,
  inspectHermesCwdApplicator,
  isHermesCwdApplicatorOkForVerify,
} from './hermes-cwd-applicator.js';
import {
  inspectHermesDiscordReadiness,
  renderHermesDiscordReadinessLines,
} from './integration-readiness.js';

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
  autoConfigureHooks: boolean;
  installSkills: boolean;
  forceSkills: boolean;
  verifyHermesDiscord?: boolean;
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

export interface HookConfigResult {
  ok: boolean;
  fatal: boolean;
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
    autoConfigureHooks: false,
    installSkills: false,
    forceSkills: false,
    verifyHermesDiscord: false,
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
      case '--auto-configure-hooks':
        options.autoConfigureHooks = true;
        break;
      case '--install-skills':
        options.installSkills = true;
        break;
      case '--force-skills':
        options.forceSkills = true;
        break;
      case '--verify-hermes-discord':
        options.verifyHermesDiscord = true;
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
    const workspaceCandidates = detectWorkspaceCandidates(
      undefined,
      deps.homeDir,
      deps.env.AGENTICOS_SOURCE_ROOT,
    );

    if (!workspaceSelection) {
      deps.stderr('Workspace is required. Pass `--workspace <path>` or confirm AGENTICOS_HOME before bootstrap.');
      for (const line of buildWorkspaceConfirmationLines(workspaceCandidates)) deps.stderr(line);
      return 1;
    }
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
    const hookConfigResult = selectedAgents.includes('claude-code')
      ? configureClaudePwdAlignmentHook(options, deps)
      : null;
    const skillInstallResults = options.installSkills
      ? selectedAgents.map((agentId) => applyAgentSkill(agentId, options, deps))
      : null;
    const bootstrapStateResult = persistBootstrapState(
      workspaceSelection.workspace,
      selectedAgents,
      options,
      results,
      shellProfileResult,
      launchctlResult,
      hookConfigResult,
      skillInstallResults,
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
    if (hookConfigResult) {
      const marker = hookConfigResult.ok ? 'OK' : hookConfigResult.fatal ? 'FAIL' : 'WARN';
      deps.stdout(`${marker} claude-pwd-hook: ${hookConfigResult.detail}`);
    }
    if (skillInstallResults) {
      for (const result of skillInstallResults) {
        const marker = result.ok
          ? result.status === 'unsupported' ? 'SKIP' : 'OK'
          : 'FAIL';
        deps.stdout(`${marker} ${result.agentId}-skill: ${result.detail}`);
      }
    }
    {
      const marker = bootstrapStateResult.ok ? 'OK' : 'FAIL';
      deps.stdout(`${marker} bootstrap-state: ${bootstrapStateResult.detail}`);
    }

    return results.some((result) => !result.ok)
      || (shellProfileResult && !shellProfileResult.ok)
      || (launchctlResult && !launchctlResult.ok)
      || (hookConfigResult && hookConfigResult.fatal)
      || (skillInstallResults && skillInstallResults.some((result) => !result.ok))
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
    '  agenticos-bootstrap [--workspace <path>] [--agent <id>] [--all] [--first-run] [--persist-shell-env] [--persist-launchctl-env] [--auto-configure-hooks] [--install-skills] [--force-skills] [--verify-hermes-discord] [--shell-profile <path>] [--verify] [--apply]',
    '',
    'Behavior:',
    '  Without `--apply`, prints a dry-run bootstrap plan.',
    '  With `--apply`, creates the workspace if needed and writes supported agent config.',
    '  With `--verify`, checks the selected agent registrations and optional persistence layers without mutating them.',
    '  `--first-run` is a convenience mode: it implies `--apply`, `--install-skills`, enables shell persistence, and on macOS also enables launchctl persistence.',
    '  `--persist-shell-env` also writes export AGENTICOS_HOME=... to the detected shell profile.',
    '  `--persist-launchctl-env` also runs `launchctl setenv` on macOS for GUI/session inheritance.',
    '  `--auto-configure-hooks` adds the Claude Code PostToolUse hook used to provide per-call cwd guidance after agenticos_switch and agenticos_switch_out.',
    '  `--install-skills` installs or updates the AgenticOS activation Skill for agents that support local skills.',
    '  `--force-skills` allows `--install-skills` to overwrite a user-modified AgenticOS Skill.',
    '  `--verify-hermes-discord` makes optional Discord channel project routing prerequisites blocking during `--verify`.',
    '  Workspace selection is explicit: use `--workspace <path>` or set AGENTICOS_HOME beforehand.',
    '',
    'Supported agent ids: claude-code, codex, cursor, gemini-cli, hermes-agent',
  ];
}

function buildWorkspaceConfirmationLines(candidates: string[]): string[] {
  const lines = [
    'User-confirmed workspace is required before bootstrap.',
    'Suggested workspace candidates for confirmation:',
  ];
  candidates.forEach((candidate, index) => {
    const prefix = index === 0 ? '- default: ' : '- alternate: ';
    lines.push(`${prefix}${candidate}`);
  });
  if (candidates.length > 0) {
    lines.push(`Confirm one explicitly with: agenticos-bootstrap --workspace "${candidates[0]}" ...`);
  }
  return lines;
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
    options.installSkills = true;
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
    if (agentId === 'hermes-agent') {
      lines.push('- hermes-agent: no MCP registration is written by AgenticOS bootstrap; Hermes Agent routing uses existing MCP availability plus activation Skill');
      lines.push(`- hermes-agent: install/enable ${HERMES_CWD_APPLICATOR_PLUGIN_NAME} so AgenticOS switch/switch_out results update Hermes runtime cwd`);
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
  if (options.installSkills) {
    for (const agentId of selected) {
      const inspection = inspectAgentSkill(agentId, homeDir, () => null);
      if (inspection.status === 'unsupported') {
        lines.push(`- ${agentId}-skill: skip (${inspection.detail})`);
      } else {
        lines.push(`- ${agentId}-skill: install/update ${inspection.target.path}`);
      }
    }
    if (options.forceSkills) {
      lines.push('- agenticos-skill: overwrite user-modified managed Skill files if present');
    }
  }
  if (options.verifyHermesDiscord) {
    lines.push('- hermes-discord: enforce optional Discord channel project routing prerequisites during verification');
  }
  if (selected.includes('claude-code')) {
    const settingsPath = `${homeDir}/${CLAUDE_SETTINGS_PATH}`;
    if (options.autoConfigureHooks) {
      lines.push(`- claude-pwd-hook: add agenticos_switch and agenticos_switch_out PostToolUse cwd guidance hooks to ${settingsPath}`);
    } else {
      lines.push(`- claude-pwd-hook: inspect ${settingsPath}; rerun with --auto-configure-hooks --apply to add missing switch/switch_out hooks`);
    }
  }
  lines.push('', 'Re-run with `--apply` to perform these actions.');
  return lines;
}

function getRecoveryCommand(agentId: SupportedAgentId): string {
  const commands: Record<SupportedAgentId, string> = {
    'claude-code': 'claude mcp add agenticos -s user -e AGENTICOS_HOME="$AGENTICOS_HOME" -- agenticos-mcp',
    'codex': 'agenticos-bootstrap --agent codex',
    'cursor': 'agenticos-bootstrap --agent cursor',
    'gemini-cli': 'agenticos-bootstrap --agent gemini-cli',
    'hermes-agent': 'agenticos-bootstrap --agent hermes-agent --install-skills --apply',
  };
  return commands[agentId];
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
    if (!result.ok) {
      ok = false;
      const recovery = getRecoveryCommand(agentId);
      if (recovery) {
        lines.push(`   Recovery: ${recovery}`);
      }
    }
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

  if (selected.includes('claude-code')) {
    const result = verifyClaudePwdGuidanceHook(deps);
    const marker = result.ok ? 'OK' : 'FAIL';
    lines.push(`${marker} claude-pwd-hook: ${result.detail}`);
    if (!result.ok) {
      ok = false;
      lines.push('   Recovery: agenticos-bootstrap --agent claude-code --auto-configure-hooks --apply');
    }
  }

  if (options.installSkills) {
    for (const agentId of selected) {
      const result = verifyAgentSkill(agentId, workspace, deps);
      const marker = result.ok
        ? result.unsupported ? 'SKIP' : 'OK'
        : 'FAIL';
      lines.push(`${marker} ${agentId}-skill: ${result.detail}`);
      if (!result.ok) {
        ok = false;
        lines.push(`   Recovery: ${result.recovery}`);
      }
    }
  }

  if (options.verifyHermesDiscord) {
    const hermesDiscord = inspectHermesDiscordReadiness(deps, {
      required: true,
      workspace,
    });
    lines.push('', ...renderHermesDiscordReadinessLines(hermesDiscord));
    if (!hermesDiscord.ok) {
      ok = false;
    }
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

  if (agentId === 'hermes-agent') {
    return applyHermesAgent(deps);
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

function applyHermesAgent(deps: BootstrapCliDeps): ApplyResult {
  try {
    const applicator = installHermesCwdApplicator(deps.homeDir, deps);
    return {
      agentId: 'hermes-agent',
      ok: applicator.ok,
      detail: `${applicator.detail} No MCP registration command was run; Hermes must already have AgenticOS MCP enabled.`,
    };
  } catch (error) {
    return {
      agentId: 'hermes-agent',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
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

function applyAgentSkill(
  agentId: SupportedAgentId,
  options: CliOptions,
  deps: BootstrapCliDeps,
): AgentSkillInstallResult {
  try {
    return installAgentSkill(agentId, deps.homeDir, deps, {
      force: options.forceSkills,
    });
  } catch (error) {
    const inspection = inspectAgentSkill(agentId, deps.homeDir, deps.readFile);
    return {
      ...inspection,
      ok: false,
      wrote: false,
      skipped: false,
      detail: error instanceof Error ? error.message : String(error),
    };
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

function configureClaudePwdAlignmentHook(
  options: CliOptions,
  deps: BootstrapCliDeps,
): HookConfigResult {
  const settingsPath = `${deps.homeDir}/${CLAUDE_SETTINGS_PATH}`;
  const existing = deps.readFile(settingsPath);
  const inspection = inspectClaudePwdAlignmentHook(existing);

  if (inspection.status === 'configured') {
    return {
      ok: true,
      fatal: false,
      detail: inspection.detail,
    };
  }

  if (!options.autoConfigureHooks) {
    return {
      ok: false,
      fatal: false,
      detail: `${inspection.detail} Rerun with --auto-configure-hooks --apply to add it to ${settingsPath}.`,
    };
  }

  try {
    deps.mkdirp(`${deps.homeDir}/.claude`);
    const merged = mergeClaudePwdAlignmentHook(existing);
    deps.writeFile(settingsPath, merged.content);
    return {
      ok: true,
      fatal: false,
      detail: `updated ${settingsPath}`,
    };
  } catch (error) {
    return {
      ok: false,
      fatal: true,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
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

function verifyClaudePwdGuidanceHook(deps: BootstrapCliDeps): { ok: boolean; detail: string } {
  const settingsPath = `${deps.homeDir}/${CLAUDE_SETTINGS_PATH}`;
  const inspection = inspectClaudePwdAlignmentHook(deps.readFile(settingsPath));
  return inspection.status === 'configured'
    ? { ok: true, detail: inspection.detail }
    : { ok: false, detail: `${inspection.detail} Expected cwd guidance hook in ${settingsPath}.` };
}

function verifyAgentSkill(
  agentId: SupportedAgentId,
  workspace: string,
  deps: BootstrapCliDeps,
): { ok: boolean; unsupported: boolean; detail: string; recovery: string } {
  const inspection = inspectAgentSkill(agentId, deps.homeDir, deps.readFile);
  const ok = isAgentSkillOkForVerify(inspection);
  const recoveryArgs = ['--workspace', workspace, '--agent', agentId, '--install-skills'];
  if (inspection.status === 'modified-user') recoveryArgs.push('--force-skills');
  recoveryArgs.push('--apply');
  return {
    ok,
    unsupported: inspection.status === 'unsupported',
    detail: `Skill state: ${inspection.status}. ${inspection.detail}`,
    recovery: formatCommand({ command: 'agenticos-bootstrap', args: recoveryArgs }),
  };
}

function persistBootstrapState(
  workspace: string,
  selectedAgents: SupportedAgentId[],
  options: CliOptions,
  agentResults: ApplyResult[],
  shellProfileResult: { ok: boolean; detail: string } | null,
  launchctlResult: { ok: boolean; detail: string } | null,
  hookConfigResult: HookConfigResult | null,
  skillInstallResults: AgentSkillInstallResult[] | null,
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
      && (!hookConfigResult || !hookConfigResult.fatal)
      && (!skillInstallResults || skillInstallResults.every((result) => result.ok))
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
        auto_configure_hooks: options.autoConfigureHooks,
        install_skills: options.installSkills,
        force_skills: options.forceSkills,
        claude_pwd_hook: hookConfigResult
          ? {
            ok: hookConfigResult.ok,
            fatal: hookConfigResult.fatal,
            detail: hookConfigResult.detail,
          }
          : null,
        agenticos_skills: skillInstallResults
          ? skillInstallResults.map((result) => ({
            agent_id: result.agentId,
            ok: result.ok,
            status: result.status,
            wrote: result.wrote,
            skipped: result.skipped,
            path: result.target.path,
            detail: result.detail,
          }))
          : [],
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
      if (result.ok && hasExpectedWorkspaceEnv(result.detail, workspace)) {
        return { ok: true, detail: 'registration verified via `codex mcp get agenticos` (workspace env matches)' };
      }
      // CLI output may redact env (AGENTICOS_HOME=*****)
      // Fall back to config file check if CLI shows redaction
      if (result.detail.includes('AGENTICOS_HOME=*****')) {
        const configMatch = verifyCodexConfigMatch(workspace, deps.homeDir);
        if (configMatch) {
          return { ok: true, detail: 'registration verified via `~/.codex/config.toml` (CLI output redacted)' };
        }
        return { ok: false, detail: 'agenticos registered in config but workspace path mismatch' };
      }
      return { ok: false, detail: result.detail };
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
    case 'hermes-agent':
      if (!deps.commandExists('hermes') && !deps.commandExists('hermes-gateway') && !deps.readFile(`${deps.homeDir}/.hermes/config.yaml`)) {
        return {
          ok: true,
          detail: 'Hermes Agent was not detected; skipping Hermes cwd applicator verification.',
        };
      }
      const inspection = inspectHermesCwdApplicator(deps.homeDir, deps);
      return isHermesCwdApplicatorOkForVerify(inspection)
        ? { ok: true, detail: `Hermes cwd applicator verified. ${inspection.detail}` }
        : { ok: false, detail: `Hermes cwd applicator state: ${inspection.status}. ${inspection.detail}` };
    /* c8 ignore next 4 -- SupportedAgentId is exhaustive at compile time. */
    default: {
      const exhaustive: never = agentId;
      return { ok: false, detail: `unsupported agent: ${exhaustive}` };
    }
    /* c8 ignore next 2 -- v8 reports the exhaustive switch/function close as implicit coverage. */
  }
}

function hasExpectedWorkspaceEnv(detail: string, workspace: string): boolean {
  // Check for redacted env (e.g., AGENTICOS_HOME=*****)
  const redactedMatch = detail.match(/AGENTICOS_HOME=\*+/);
  if (redactedMatch) {
    // Config value is redacted - fall through to config file check in verifyAgent
    return false;
  }

  if (!detail.includes('AGENTICOS_HOME')) {
    return false;
  }

  return detail.includes(`AGENTICOS_HOME=${workspace}`)
    || detail.includes(`AGENTICOS_HOME: ${workspace}`)
    || detail.includes(`AGENTICOS_HOME="${workspace}"`);
}

function verifyCodexConfigMatch(workspace: string, homeDir: string): boolean {
  const configPath = `${homeDir}/.codex/config.toml`;
  try {
    const content = readFileSync(configPath, 'utf-8');
    // Check if agenticos is registered and workspace is in the config
    return content.includes('agenticos') && content.includes(workspace.replace(/\\/g, '/'));
  } catch {
    return false;
  }
}
