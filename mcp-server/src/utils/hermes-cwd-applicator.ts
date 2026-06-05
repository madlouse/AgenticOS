import { dirname, join } from 'path';
import yaml from 'yaml';

export const HERMES_CWD_APPLICATOR_PLUGIN_NAME = 'agenticos-cwd-applicator';
export const HERMES_CWD_APPLICATOR_PLUGIN_VERSION = '0.1.0';

export type HermesCwdApplicatorStatus =
  | 'current'
  | 'missing'
  | 'stale-managed'
  | 'disabled'
  | 'unavailable';

export interface HermesCwdApplicatorTarget {
  pluginDir: string;
  manifestPath: string;
  initPath: string;
  configPath: string;
}

export interface HermesCwdApplicatorInspection {
  status: HermesCwdApplicatorStatus;
  target: HermesCwdApplicatorTarget;
  detail: string;
}

export interface HermesCwdApplicatorInstallResult extends HermesCwdApplicatorInspection {
  ok: boolean;
  wrote: boolean;
}

export interface HermesCwdApplicatorDeps {
  readFile(path: string): string | null;
  writeFile(path: string, content: string): void;
  mkdirp(path: string): void;
}

export function resolveHermesCwdApplicatorTarget(homeDir: string): HermesCwdApplicatorTarget {
  const pluginDir = join(homeDir, '.hermes', 'plugins', HERMES_CWD_APPLICATOR_PLUGIN_NAME);
  return {
    pluginDir,
    manifestPath: join(pluginDir, 'plugin.yaml'),
    initPath: join(pluginDir, '__init__.py'),
    configPath: join(homeDir, '.hermes', 'config.yaml'),
  };
}

export function renderHermesCwdApplicatorManifest(): string {
  return [
    `name: ${HERMES_CWD_APPLICATOR_PLUGIN_NAME}`,
    `version: "${HERMES_CWD_APPLICATOR_PLUGIN_VERSION}"`,
    'description: "Apply AgenticOS MCP switch and switch-out workdirs to Hermes Agent runtime cwd."',
    'author: "AgenticOS"',
    'hooks:',
    '  - post_tool_call',
    '',
  ].join('\n');
}

export function renderHermesCwdApplicatorPlugin(): string {
  return `"""AgenticOS cwd applicator for Hermes Agent.

This user-level Hermes plugin observes AgenticOS MCP switch results and applies
the returned workdir to Hermes' runtime cwd carrier. AgenticOS MCP remains the
source of truth for project identity; this plugin is only the Hermes client-side
cwd applicator.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

PLUGIN_VERSION = "${HERMES_CWD_APPLICATOR_PLUGIN_VERSION}"


def register(ctx):
    ctx.register_hook("post_tool_call", _on_post_tool_call)


def _on_post_tool_call(**kwargs):
    tool_name = str(kwargs.get("tool_name") or "")
    result = kwargs.get("result")

    if _matches_tool(tool_name, "agenticos_switch_out"):
        target = _extract_switch_out_workdir(result)
    elif _matches_tool(tool_name, "agenticos_switch"):
        target = _extract_switch_workdir(result)
    else:
        return None

    if not target or not _is_safe_existing_dir(target):
        return None

    _apply_runtime_cwd(target)
    return None


def _matches_tool(tool_name: str, suffix: str) -> bool:
    return (
        tool_name == suffix
        or tool_name.endswith("__" + suffix)
        or tool_name.endswith("." + suffix)
        or tool_name.endswith("/" + suffix)
    )


def _extract_switch_workdir(result: Any) -> str | None:
    direct = _find_string_value(result, {"path", "project_path", "workdir"})
    if direct:
        return direct
    text = _flatten_text(result)
    return _match_line(text, r"^Path:\\s*(.+)$") or _match_line(
        text,
        r"^🧰 Project path:\\s*(.+)$",
    )


def _extract_switch_out_workdir(result: Any) -> str | None:
    direct = _find_string_value(result, {"target_workdir", "targetWorkdir", "workdir"})
    if direct:
        return direct
    text = _flatten_text(result)
    return _match_line(text, r"^target_workdir:\\s*(.+)$")


def _find_string_value(value: Any, keys: set[str]) -> str | None:
    if isinstance(value, str):
        parsed = _try_json(value)
        if parsed is not None:
            return _find_string_value(parsed, keys)
        return None

    if isinstance(value, list):
        for item in value:
            found = _find_string_value(item, keys)
            if found:
                return found
        return None

    if isinstance(value, dict):
        for key in keys:
            raw = value.get(key)
            if isinstance(raw, str) and raw.strip():
                return raw.strip()
        for nested_key in ("tool_response", "content", "result", "data"):
            if nested_key in value:
                found = _find_string_value(value[nested_key], keys)
                if found:
                    return found
    return None


def _flatten_text(value: Any) -> str:
    if isinstance(value, str):
        parsed = _try_json(value)
        if parsed is not None:
            nested = _flatten_text(parsed)
            return nested or value
        return value

    if isinstance(value, list):
        return "\\n".join(part for part in (_flatten_text(item) for item in value) if part)

    if isinstance(value, dict):
        if isinstance(value.get("text"), str):
            return value["text"]
        return "\\n".join(
            part
            for part in (
                _flatten_text(value.get(key))
                for key in ("tool_response", "content", "result", "data")
            )
            if part
        )
    return ""


def _try_json(value: str) -> Any | None:
    try:
        return json.loads(value)
    except Exception:
        return None


def _match_line(text: str, pattern: str) -> str | None:
    match = re.search(pattern, text, re.MULTILINE)
    if not match:
        return None
    return match.group(1).strip() or None


def _is_safe_existing_dir(path_text: str) -> bool:
    if "\\x00" in path_text or any(ord(ch) < 32 for ch in path_text):
        return False
    path = Path(path_text).expanduser()
    return path.is_absolute() and path.is_dir()


def _apply_runtime_cwd(path_text: str) -> None:
    resolved = str(Path(path_text).expanduser())
    os.environ["TERMINAL_CWD"] = resolved

    try:
        from agent.runtime_cwd import set_session_cwd

        set_session_cwd(resolved)
    except Exception:
        pass

    # Hermes CLI sessions use process cwd as a fallback. Gateway processes are
    # multi-session, so avoid process-global chdir there and rely on the runtime
    # cwd carrier instead.
    if os.environ.get("_HERMES_GATEWAY") != "1":
        try:
            os.chdir(resolved)
        except OSError:
            pass
`;
}

export function inspectHermesCwdApplicator(
  homeDir: string,
  deps: Pick<HermesCwdApplicatorDeps, 'readFile'>,
): HermesCwdApplicatorInspection {
  const target = resolveHermesCwdApplicatorTarget(homeDir);
  const manifest = deps.readFile(target.manifestPath);
  const init = deps.readFile(target.initPath);
  const config = deps.readFile(target.configPath);

  if (manifest === null && init === null) {
    return {
      status: 'missing',
      target,
      detail: `missing ${target.pluginDir}`,
    };
  }

  if (manifest !== renderHermesCwdApplicatorManifest() || init !== renderHermesCwdApplicatorPlugin()) {
    return {
      status: 'stale-managed',
      target,
      detail: `${target.pluginDir} is missing or differs from AgenticOS ${HERMES_CWD_APPLICATOR_PLUGIN_VERSION}`,
    };
  }

  const enabled = isHermesPluginEnabled(config, HERMES_CWD_APPLICATOR_PLUGIN_NAME);
  if (enabled === null) {
    return {
      status: 'unavailable',
      target,
      detail: `${target.configPath} could not be parsed as YAML`,
    };
  }

  if (!enabled) {
    return {
      status: 'disabled',
      target,
      detail: `${HERMES_CWD_APPLICATOR_PLUGIN_NAME} is installed but not enabled in ${target.configPath}`,
    };
  }

  return {
    status: 'current',
    target,
    detail: `current v${HERMES_CWD_APPLICATOR_PLUGIN_VERSION} at ${target.pluginDir}`,
  };
}

export function installHermesCwdApplicator(
  homeDir: string,
  deps: HermesCwdApplicatorDeps,
): HermesCwdApplicatorInstallResult {
  const target = resolveHermesCwdApplicatorTarget(homeDir);

  deps.mkdirp(target.pluginDir);
  deps.writeFile(target.manifestPath, renderHermesCwdApplicatorManifest());
  deps.writeFile(target.initPath, renderHermesCwdApplicatorPlugin());

  const existingConfig = deps.readFile(target.configPath);
  const nextConfig = enableHermesPlugin(existingConfig, HERMES_CWD_APPLICATOR_PLUGIN_NAME);
  deps.mkdirp(dirname(target.configPath));
  deps.writeFile(target.configPath, nextConfig);

  return {
    ...inspectHermesCwdApplicator(homeDir, deps),
    ok: true,
    wrote: true,
    detail: `installed v${HERMES_CWD_APPLICATOR_PLUGIN_VERSION} and enabled ${HERMES_CWD_APPLICATOR_PLUGIN_NAME}; restart Hermes Agent to load the plugin.`,
  };
}

export function isHermesCwdApplicatorOkForVerify(inspection: HermesCwdApplicatorInspection): boolean {
  return inspection.status === 'current';
}

export function enableHermesPlugin(configContent: string | null, pluginName: string): string {
  const parsed = configContent?.trim()
    ? yaml.parse(configContent)
    : {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Hermes config must be a YAML object.');
  }

  const root = parsed as Record<string, any>;
  const plugins = root.plugins && typeof root.plugins === 'object' && !Array.isArray(root.plugins)
    ? root.plugins as Record<string, any>
    : {};
  const enabled = Array.isArray(plugins.enabled) ? [...plugins.enabled] : [];
  if (!enabled.includes(pluginName)) {
    enabled.push(pluginName);
  }
  root.plugins = {
    ...plugins,
    enabled,
  };
  return yaml.stringify(root);
}

function isHermesPluginEnabled(configContent: string | null, pluginName: string): boolean | null {
  if (configContent === null || !configContent.trim()) return false;
  let parsed: unknown;
  try {
    parsed = yaml.parse(configContent);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const plugins = (parsed as Record<string, unknown>).plugins;
  if (!plugins || typeof plugins !== 'object' || Array.isArray(plugins)) return false;
  const enabled = (plugins as Record<string, unknown>).enabled;
  return Array.isArray(enabled) && enabled.includes(pluginName);
}
