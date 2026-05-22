import { join } from 'path';

export type ReadinessMarker = 'OK' | 'INFO' | 'SKIP' | 'WARN' | 'FAIL';

export interface IntegrationReadinessDeps {
  env: Record<string, string | undefined>;
  homeDir: string;
  commandExists(command: string): boolean;
  readFile(path: string): string | null;
}

export interface ReadinessCheck {
  id: string;
  label: string;
  marker: ReadinessMarker;
  detail: string;
  location: string;
  recovery?: string;
  restart_hint?: string;
}

export interface HermesDiscordReadiness {
  id: 'hermes_discord';
  required: boolean;
  ok: boolean;
  summary: string;
  checks: ReadinessCheck[];
}

const HERMES_COMMANDS = ['hermes', 'hermes-agent', 'hermes-gateway'];
const HERMES_CONFIG_PATHS = [
  '.hermes/config.yaml',
  '.hermes-agent/config.yaml',
  '.config/hermes/config.yaml',
  '.config/hermes-agent/config.yaml',
];
const DISCORD_TOKEN_ENV = ['DISCORD_BOT_TOKEN', 'HERMES_DISCORD_BOT_TOKEN'];
const DISCORD_APP_ENV = ['DISCORD_APP_ID', 'DISCORD_CLIENT_ID', 'HERMES_DISCORD_APP_ID'];
const DISCORD_OPTIONAL_ENV = [
  'DISCORD_PUBLIC_KEY',
  'DISCORD_GUILD_ID',
  'DISCORD_CHANNEL_ID',
  'HERMES_DISCORD_PUBLIC_KEY',
  'HERMES_DISCORD_GUILD_ID',
  'HERMES_DISCORD_CHANNEL_ID',
];

const HERMES_GATEWAY_RESTART = 'Restart Hermes gateway after changing Hermes or Discord integration settings.';

export function inspectHermesDiscordReadiness(
  deps: IntegrationReadinessDeps,
  options: { required?: boolean; workspace?: string | null } = {},
): HermesDiscordReadiness {
  const required = options.required === true;
  const hermesCommands = detectCommands(deps, HERMES_COMMANDS);
  const hermesConfig = detectFirstReadableFile(deps, HERMES_CONFIG_PATHS.map((path) => join(deps.homeDir, path)));
  const hermesDetected = hermesCommands.length > 0 || hermesConfig !== null;
  const gatewayConfigured = hasAnyEnv(deps.env, ['HERMES_GATEWAY_URL', 'HERMES_AGENT_URL', 'HERMES_GATEWAY_ENABLED']);
  const discordTokenConfigured = hasAnyEnv(deps.env, DISCORD_TOKEN_ENV);
  const discordAppConfigured = hasAnyEnv(deps.env, DISCORD_APP_ENV);
  const discordOptionalConfigured = hasAnyEnv(deps.env, DISCORD_OPTIONAL_ENV);
  const discordConfigured = discordTokenConfigured && discordAppConfigured;
  const threadBindingsPath = options.workspace
    ? join(options.workspace, '.agent-workspace', 'integrations', 'discord', 'thread-bindings.yaml')
    : null;
  const threadBindingsPresent = threadBindingsPath
    ? hasReadableNonEmptyFile(deps, threadBindingsPath)
    : false;

  const checks: ReadinessCheck[] = [
    {
      id: 'hermes_runtime',
      label: 'Hermes runtime',
      marker: hermesDetected ? 'OK' : required ? 'FAIL' : 'SKIP',
      detail: hermesDetected
        ? `Hermes detected via ${hermesCommands.length > 0 ? hermesCommands.join(', ') : hermesConfig}.`
        : 'Hermes is not detected; optional Hermes/Discord routing is skipped and core AgenticOS verification is unaffected.',
      location: [...HERMES_COMMANDS.map((command) => `PATH:${command}`), ...HERMES_CONFIG_PATHS.map((path) => join(deps.homeDir, path))].join(', '),
      recovery: hermesDetected
        ? undefined
        : 'Install or start Hermes only if you want Hermes-side Discord project routing.',
    },
    {
      id: 'hermes_gateway',
      label: 'Hermes gateway',
      marker: gatewayConfigured ? 'OK' : required ? 'FAIL' : hermesDetected ? 'WARN' : 'SKIP',
      detail: gatewayConfigured
        ? 'Hermes gateway environment is present.'
        : hermesDetected
          ? 'Hermes is detected, but no Hermes gateway environment was found.'
          : 'Hermes gateway readiness is skipped because Hermes is not detected.',
      location: 'HERMES_GATEWAY_URL, HERMES_AGENT_URL, HERMES_GATEWAY_ENABLED',
      recovery: gatewayConfigured
        ? undefined
        : 'Configure Hermes gateway environment before enabling Discord project routing.',
      restart_hint: gatewayConfigured ? HERMES_GATEWAY_RESTART : undefined,
    },
    {
      id: 'discord_config',
      label: 'Discord configuration',
      marker: discordConfigured ? 'OK' : required ? 'FAIL' : hermesDetected ? 'WARN' : 'SKIP',
      detail: discordConfigured
        ? 'Discord application id and bot token are present; secret values are intentionally not displayed.'
        : discordOptionalConfigured
          ? 'Some Discord environment is present, but both an application id and bot token are required for routing.'
          : 'Discord configuration is not detected; Discord routing remains optional.',
      location: [...DISCORD_APP_ENV, ...DISCORD_TOKEN_ENV, ...DISCORD_OPTIONAL_ENV].join(', '),
      recovery: discordConfigured
        ? undefined
        : 'Set DISCORD_APP_ID or DISCORD_CLIENT_ID plus DISCORD_BOT_TOKEN, then restart Hermes gateway.',
      restart_hint: discordConfigured ? HERMES_GATEWAY_RESTART : undefined,
    },
    {
      id: 'discord_thread_bindings',
      label: 'Discord project thread bindings',
      marker: threadBindingsPresent ? 'OK' : required ? 'FAIL' : 'INFO',
      detail: threadBindingsPresent
        ? 'AgenticOS Discord project thread bindings sidecar is present.'
        : 'No Discord project thread bindings sidecar was found yet; bind a project thread when the first Discord cockpit is created.',
      location: threadBindingsPath || '${AGENTICOS_HOME}/.agent-workspace/integrations/discord/thread-bindings.yaml',
      recovery: threadBindingsPresent
        ? undefined
        : 'Use agenticos_external_thread_bind after creating or selecting the Discord project thread.',
    },
  ];

  const blocking = checks.filter((check) => check.marker === 'FAIL');
  return {
    id: 'hermes_discord',
    required,
    ok: blocking.length === 0,
    summary: required
      ? blocking.length > 0
        ? 'Hermes+Discord project routing is requested but required prerequisites are missing.'
        : 'Hermes+Discord project routing prerequisites are ready.'
      : 'Hermes/Discord project routing is optional; readiness is reported without blocking core AgenticOS verification.',
    checks,
  };
}

export function renderHermesDiscordReadinessLines(readiness: HermesDiscordReadiness): string[] {
  const lines = [
    'Optional Hermes/Discord readiness:',
    readiness.summary,
  ];
  for (const check of readiness.checks) {
    lines.push(`${check.marker} ${check.id}: ${check.detail}`);
    if (check.recovery && (check.marker === 'FAIL' || check.marker === 'WARN')) {
      lines.push(`   Recovery: ${check.recovery}`);
    }
    if (check.restart_hint && check.marker === 'OK') {
      lines.push(`   Restart: ${check.restart_hint}`);
    }
  }
  if (!readiness.required) {
    lines.push('Use `agenticos-bootstrap --verify --verify-hermes-discord` to enforce this workflow as a blocking check.');
  }
  return lines;
}

function detectCommands(deps: IntegrationReadinessDeps, commands: string[]): string[] {
  return commands.filter((command) => {
    try {
      return deps.commandExists(command);
    } catch {
      return false;
    }
  });
}

function detectFirstReadableFile(deps: IntegrationReadinessDeps, paths: string[]): string | null {
  for (const path of paths) {
    const content = deps.readFile(path);
    if (content !== null) return path;
  }
  return null;
}

function hasReadableNonEmptyFile(deps: IntegrationReadinessDeps, path: string): boolean {
  const content = deps.readFile(path);
  return content !== null && content.trim().length > 0;
}

function hasAnyEnv(env: Record<string, string | undefined>, names: string[]): boolean {
  return names.some((name) => {
    const value = env[name]?.trim();
    return value ? value.length > 0 : false;
  });
}
