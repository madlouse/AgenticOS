import { join } from 'path';
import { detectDefaultShellProfile } from './bootstrap-helper.js';

export type ConfigAuditAction = 'show' | 'validate';
export type ConfigAuditScope = 'all' | 'runtime' | 'mcp' | 'homebrew';
export type ConfigSourceStatus = 'configured' | 'unset' | 'missing' | 'unavailable' | 'present';

export interface CommandResult {
  ok: boolean;
  detail: string;
}

export interface ConfigAuditDeps {
  env: Record<string, string | undefined>;
  homeDir: string;
  platform: string;
  shellPath?: string;
  commandExists(command: string): boolean;
  runCommand(command: string, args: string[], failOnError: boolean): CommandResult;
  readFile(path: string): string | null;
  pathExists(path: string): boolean;
  nowIso(): string;
}

export interface ConfigSourceRecord {
  id: string;
  label: string;
  scope: Exclude<ConfigAuditScope, 'all'>;
  status: ConfigSourceStatus;
  value: string | null;
  location: string;
  fix_target: string;
  detail: string;
}

export interface ConfigAuditResult {
  command: 'agenticos_config';
  action: ConfigAuditAction;
  scope: ConfigAuditScope;
  status: 'PASS' | 'FAIL';
  checked_at: string;
  canonical_workspace: string | null;
  summary: string;
  sources: ConfigSourceRecord[];
  discrepancies: Array<{
    label: string;
    value: string;
    fix_target: string;
  }>;
}

export function normalizeAction(value: unknown): ConfigAuditAction {
  if (value === undefined || value === null || value === '') return 'show';
  if (value === 'show' || value === 'validate') return value;
  throw new Error('action must be one of: show, validate');
}

export function normalizeScope(value: unknown): ConfigAuditScope {
  if (value === undefined || value === null || value === '') return 'all';
  if (value === 'all' || value === 'runtime' || value === 'mcp' || value === 'homebrew') return value;
  throw new Error('scope must be one of: all, runtime, mcp, homebrew');
}

export function runConfigAudit(
  args: { action?: unknown; scope?: unknown } | null | undefined,
  deps: ConfigAuditDeps,
): ConfigAuditResult {
  const action = normalizeAction(args?.action);
  const scope = normalizeScope(args?.scope);
  const checkedAt = deps.nowIso();
  const allSources = collectConfigSources(deps);
  const sources = scope === 'all'
    ? allSources
    : allSources.filter((source) => source.scope === scope);
  const configuredSources = sources.filter((source) => source.status === 'configured' && source.value);
  const canonicalWorkspace = configuredSources.find((source) => source.id === 'process_env')?.value
    || configuredSources[0]?.value
    || null;
  const discrepancies = canonicalWorkspace
    ? configuredSources
      .filter((source) => source.value !== canonicalWorkspace)
      .map((source) => ({
        label: source.label,
        value: source.value as string,
        fix_target: source.fix_target,
      }))
    : [];

  if (action === 'show') {
    return {
      command: 'agenticos_config',
      action,
      scope,
      status: discrepancies.length > 0 ? 'FAIL' : 'PASS',
      checked_at: checkedAt,
      canonical_workspace: canonicalWorkspace,
      summary: canonicalWorkspace
        ? discrepancies.length > 0
          ? 'Configuration drift is present across detected sources.'
          : 'Detected configuration sources are aligned.'
        : 'No configured AGENTICOS_HOME source was detected in the selected scope.',
      sources,
      discrepancies,
    };
  }

  if (!canonicalWorkspace) {
    return {
      command: 'agenticos_config',
      action,
      scope,
      status: 'FAIL',
      checked_at: checkedAt,
      canonical_workspace: null,
      summary: 'No configured AGENTICOS_HOME source was detected in the selected scope.',
      sources,
      discrepancies: [],
    };
  }

  if (discrepancies.length > 0) {
    return {
      command: 'agenticos_config',
      action,
      scope,
      status: 'FAIL',
      checked_at: checkedAt,
      canonical_workspace: canonicalWorkspace,
      summary: 'Configuration drift detected. Update the mismatched source(s) listed below.',
      sources,
      discrepancies,
    };
  }

  return {
    command: 'agenticos_config',
    action,
    scope,
    status: 'PASS',
    checked_at: checkedAt,
    canonical_workspace: canonicalWorkspace,
    summary: `All detected configuration sources agree on ${canonicalWorkspace}.`,
    sources,
    discrepancies: [],
  };
}

export function renderConfigAuditResult(result: ConfigAuditResult): string {
  const lines = [
    'AgenticOS configuration audit',
    `Action: ${result.action}`,
    `Scope: ${result.scope}`,
    `Status: ${result.status}`,
    `Checked at: ${result.checked_at}`,
    `Canonical workspace: ${result.canonical_workspace || 'UNSET'}`,
    '',
    result.summary,
    '',
    'Sources:',
  ];

  for (const source of result.sources) {
    lines.push(`- ${source.label}`);
    lines.push(`  status: ${source.status}`);
    lines.push(`  value: ${source.value || 'UNSET'}`);
    lines.push(`  location: ${source.location}`);
    lines.push(`  fix: ${source.fix_target}`);
    lines.push(`  detail: ${source.detail}`);
  }

  if (result.action === 'validate' && result.status === 'FAIL') {
    lines.push('');
    lines.push('Discrepancies:');
    if (result.discrepancies.length === 0) {
      lines.push('- No authoritative source is configured. Set AGENTICOS_HOME in your shell or rerun bootstrap for the target agent.');
    } else {
      for (const mismatch of result.discrepancies) {
        lines.push(`- ${mismatch.label}: ${mismatch.value} -> update ${mismatch.fix_target}`);
      }
    }
  }

  return lines.join('\n');
}

function collectConfigSources(deps: ConfigAuditDeps): ConfigSourceRecord[] {
  return [
    readProcessEnvSource(deps),
    readShellProfileSource(deps),
    readLaunchctlSource(deps),
    readClaudeSettingsSource(deps),
    readClaudeLegacySource(deps),
    readCodexConfigSource(deps),
    readCursorConfigSource(deps),
    ...readHomebrewSources(deps),
  ];
}

function readProcessEnvSource(deps: ConfigAuditDeps): ConfigSourceRecord {
  const value = normalizeValue(deps.env.AGENTICOS_HOME);
  return {
    id: 'process_env',
    label: 'process.env AGENTICOS_HOME',
    scope: 'runtime',
    status: value ? 'configured' : 'unset',
    value,
    location: 'current process environment',
    fix_target: 'export AGENTICOS_HOME=... before starting the client',
    detail: value ? 'Active runtime environment value.' : 'AGENTICOS_HOME is not set in the current process.',
  };
}

function readShellProfileSource(deps: ConfigAuditDeps): ConfigSourceRecord {
  const profilePath = detectDefaultShellProfile(deps.shellPath, deps.homeDir);
  const content = deps.readFile(profilePath);
  if (content === null) {
    return {
      id: 'shell_profile',
      label: 'shell profile export',
      scope: 'runtime',
      status: 'missing',
      value: null,
      location: profilePath,
      fix_target: profilePath,
      detail: 'Detected shell profile file is missing.',
    };
  }

  const value = extractShellExportValue(content);
  return {
    id: 'shell_profile',
    label: 'shell profile export',
    scope: 'runtime',
    status: value ? 'configured' : 'unset',
    value,
    location: profilePath,
    fix_target: profilePath,
    detail: value
      ? 'Detected export AGENTICOS_HOME entry in the shell profile.'
      : 'No export AGENTICOS_HOME entry found in the detected shell profile.',
  };
}

function readLaunchctlSource(deps: ConfigAuditDeps): ConfigSourceRecord {
  if (deps.platform !== 'darwin') {
    return {
      id: 'launchctl',
      label: 'launchctl session env',
      scope: 'runtime',
      status: 'unavailable',
      value: null,
      location: 'launchctl getenv AGENTICOS_HOME',
      fix_target: 'launchctl setenv AGENTICOS_HOME ...',
      detail: 'launchctl is only applicable on macOS.',
    };
  }

  if (!deps.commandExists('launchctl')) {
    return {
      id: 'launchctl',
      label: 'launchctl session env',
      scope: 'runtime',
      status: 'unavailable',
      value: null,
      location: 'launchctl getenv AGENTICOS_HOME',
      fix_target: 'launchctl setenv AGENTICOS_HOME ...',
      detail: 'launchctl is not available on PATH.',
    };
  }

  const result = deps.runCommand('launchctl', ['getenv', 'AGENTICOS_HOME'], true);
  const value = result.ok ? normalizeValue(result.detail) : null;
  return {
    id: 'launchctl',
    label: 'launchctl session env',
    scope: 'runtime',
    status: value ? 'configured' : 'unset',
    value,
    location: 'launchctl getenv AGENTICOS_HOME',
    fix_target: 'launchctl setenv AGENTICOS_HOME ...',
    detail: value
      ? 'launchctl reports an inherited GUI/session workspace.'
      : 'launchctl did not report AGENTICOS_HOME.',
  };
}

function readClaudeSettingsSource(deps: ConfigAuditDeps): ConfigSourceRecord {
  return readJsonEnvSource(
    deps,
    'claude_settings',
    'Claude Code settings env',
    join(deps.homeDir, '.claude', 'settings.json'),
  );
}

function readClaudeLegacySource(deps: ConfigAuditDeps): ConfigSourceRecord {
  return readJsonEnvSource(
    deps,
    'claude_legacy',
    'Claude legacy MCP env',
    join(deps.homeDir, '.claude.json'),
  );
}

function readCursorConfigSource(deps: ConfigAuditDeps): ConfigSourceRecord {
  return readJsonEnvSource(
    deps,
    'cursor_mcp',
    'Cursor MCP config',
    join(deps.homeDir, '.cursor', 'mcp.json'),
  );
}

function readJsonEnvSource(
  deps: ConfigAuditDeps,
  id: string,
  label: string,
  filePath: string,
): ConfigSourceRecord {
  const content = deps.readFile(filePath);
  if (content === null) {
    return {
      id,
      label,
      scope: 'mcp',
      status: 'missing',
      value: null,
      location: filePath,
      fix_target: filePath,
      detail: 'Config file is missing.',
    };
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    const value = findEnvValueInJson(parsed);
    return {
      id,
      label,
      scope: 'mcp',
      status: value ? 'configured' : 'unset',
      value,
      location: filePath,
      fix_target: filePath,
      detail: value
        ? 'Detected AGENTICOS_HOME in the config file.'
        : 'Config file exists but does not contain AGENTICOS_HOME for AgenticOS.',
    };
  } catch {
    return {
      id,
      label,
      scope: 'mcp',
      status: 'unavailable',
      value: null,
      location: filePath,
      fix_target: filePath,
      detail: 'Config file could not be parsed as JSON.',
    };
  }
}

function readCodexConfigSource(deps: ConfigAuditDeps): ConfigSourceRecord {
  const filePath = join(deps.homeDir, '.codex', 'config.toml');
  const content = deps.readFile(filePath);
  if (content === null) {
    return {
      id: 'codex_config',
      label: 'Codex MCP config',
      scope: 'mcp',
      status: 'missing',
      value: null,
      location: filePath,
      fix_target: filePath,
      detail: 'Config file is missing.',
    };
  }

  const value = extractCodexValue(content);
  return {
    id: 'codex_config',
    label: 'Codex MCP config',
    scope: 'mcp',
    status: value ? 'configured' : 'unset',
    value,
    location: filePath,
    fix_target: filePath,
    detail: value
      ? 'Detected AGENTICOS_HOME in Codex config.'
      : 'Config file exists but no AGENTICOS_HOME entry was detected for AgenticOS.',
  };
}

function readHomebrewSources(deps: ConfigAuditDeps): ConfigSourceRecord[] {
  const candidates = ['/opt/homebrew/var/agenticos', '/usr/local/var/agenticos'];
  return candidates.map((candidate) => ({
    id: `homebrew:${candidate}`,
    label: `Homebrew runtime-home hint (${candidate})`,
    scope: 'homebrew' as const,
    status: deps.pathExists(candidate) ? 'present' : 'missing',
    value: deps.pathExists(candidate) ? candidate : null,
    location: candidate,
    fix_target: candidate,
    detail: deps.pathExists(candidate)
      ? 'Default Homebrew runtime-home path exists on this machine.'
      : 'Default Homebrew runtime-home path does not exist on this machine.',
  }));
}

function normalizeValue(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function extractShellExportValue(content: string): string | null {
  const match = content.match(/^\s*export\s+AGENTICOS_HOME=(['"]?)(.+?)\1\s*$/m);
  return match ? normalizeValue(match[2]) : null;
}

function extractCodexValue(content: string): string | null {
  const focusedMatch = content.match(/agenticos[\s\S]{0,400}?AGENTICOS_HOME\s*=\s*["']([^"']+)["']/i);
  if (focusedMatch) {
    return normalizeValue(focusedMatch[1]);
  }
  const genericMatch = content.match(/AGENTICOS_HOME\s*=\s*["']([^"']+)["']/);
  return genericMatch ? normalizeValue(genericMatch[1]) : null;
}

function findEnvValueInJson(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findEnvValueInJson(item);
      if (nested) return nested;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.env && typeof record.env === 'object' && !Array.isArray(record.env)) {
    const envRecord = record.env as Record<string, unknown>;
    if (typeof envRecord.AGENTICOS_HOME === 'string') {
      return normalizeValue(envRecord.AGENTICOS_HOME);
    }
  }

  for (const nestedValue of Object.values(record)) {
    const nested = findEnvValueInJson(nestedValue);
    if (nested) return nested;
  }

  return null;
}
