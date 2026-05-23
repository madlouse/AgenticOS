import { createHash } from 'crypto';
import { dirname, join } from 'path';
import type { SupportedAgentId } from './bootstrap-helper.js';

export const AGENTICOS_SKILL_TEMPLATE_VERSION = 1;
export const AGENTICOS_SKILL_NAME = 'agenticos';

const HASH_MARKER_RE = /^<!-- agenticos-skill-managed-sha256: ([a-f0-9]{64}) -->\n?/m;
const LEGACY_VERSION_MARKER_RE = /<!-- agenticos-skill-template: v(\d+) -->/;
const FRONTMATTER_TEMPLATE_VERSION_RE = /^\s*template_version:\s*(\d+)\s*$/m;

export type AgentSkillStatus =
  | 'unsupported'
  | 'missing'
  | 'current'
  | 'stale-managed'
  | 'modified-user';

export interface AgentSkillTarget {
  agentId: SupportedAgentId;
  label: string;
  supported: boolean;
  path: string | null;
  reloadHint: string;
}

export interface AgentSkillInspection {
  agentId: SupportedAgentId;
  target: AgentSkillTarget;
  status: AgentSkillStatus;
  installedVersion: number | null;
  expectedVersion: number;
  detail: string;
}

export interface AgentSkillInstallResult extends AgentSkillInspection {
  ok: boolean;
  wrote: boolean;
  skipped: boolean;
}

export interface AgentSkillFileDeps {
  readFile(path: string): string | null;
  writeFile(path: string, content: string): void;
  mkdirp(path: string): void;
}

export function resolveAgentSkillTarget(
  agentId: SupportedAgentId,
  homeDir: string,
): AgentSkillTarget {
  switch (agentId) {
    case 'codex':
      return {
        agentId,
        label: 'Codex AgenticOS activation Skill',
        supported: true,
        path: join(homeDir, '.codex', 'skills', AGENTICOS_SKILL_NAME, 'SKILL.md'),
        reloadHint: 'Restart Codex or reload skills so the AgenticOS activation Skill is indexed.',
      };
    case 'claude-code':
      return {
        agentId,
        label: 'Claude Code AgenticOS activation Skill',
        supported: true,
        path: join(homeDir, '.claude', 'skills', AGENTICOS_SKILL_NAME, 'SKILL.md'),
        reloadHint: 'Restart Claude Code or reload skills so the AgenticOS activation Skill is indexed.',
      };
    case 'cursor':
      return {
        agentId,
        label: 'Cursor AgenticOS activation Skill',
        supported: true,
        path: join(homeDir, '.cursor', 'skills-cursor', AGENTICOS_SKILL_NAME, 'SKILL.md'),
        reloadHint: 'Restart Cursor or reload its Skill index so the AgenticOS activation Skill is picked up.',
      };
    case 'gemini-cli':
      return {
        agentId,
        label: 'Gemini CLI AgenticOS activation Skill',
        supported: false,
        path: null,
        reloadHint: 'Gemini CLI Skill installation is not supported by AgenticOS bootstrap yet.',
      };
  }
}

export function renderAgenticosSkillContent(): string {
  const withoutHash = renderAgenticosSkillContentWithoutHash();
  const hash = sha256(withoutHash);
  return insertAfterYamlFrontmatter(
    withoutHash,
    `<!-- agenticos-skill-managed-sha256: ${hash} -->\n`,
  );
}

export function inspectAgentSkill(
  agentId: SupportedAgentId,
  homeDir: string,
  readFile: (path: string) => string | null,
): AgentSkillInspection {
  const target = resolveAgentSkillTarget(agentId, homeDir);
  if (!target.supported || !target.path) {
    return {
      agentId,
      target,
      status: 'unsupported',
      installedVersion: null,
      expectedVersion: AGENTICOS_SKILL_TEMPLATE_VERSION,
      detail: `${target.label} is not supported by this bootstrap version.`,
    };
  }

  const content = readFile(target.path);
  if (content === null) {
    return {
      agentId,
      target,
      status: 'missing',
      installedVersion: null,
      expectedVersion: AGENTICOS_SKILL_TEMPLATE_VERSION,
      detail: `missing ${target.path}`,
    };
  }

  const installedVersion = extractSkillTemplateVersion(content);
  const storedHash = extractStoredHash(content);
  const withoutHash = stripHashMarker(content);
  const expectedWithoutHash = renderAgenticosSkillContentWithoutHash();

  if (!installedVersion || !storedHash) {
    return {
      agentId,
      target,
      status: 'modified-user',
      installedVersion,
      expectedVersion: AGENTICOS_SKILL_TEMPLATE_VERSION,
      detail: `${target.path} exists but is not a managed AgenticOS Skill.`,
    };
  }

  if (sha256(withoutHash) !== storedHash) {
    return {
      agentId,
      target,
      status: 'modified-user',
      installedVersion,
      expectedVersion: AGENTICOS_SKILL_TEMPLATE_VERSION,
      detail: `${target.path} was modified after AgenticOS installed it.`,
    };
  }

  if (withoutHash === expectedWithoutHash) {
    return {
      agentId,
      target,
      status: 'current',
      installedVersion,
      expectedVersion: AGENTICOS_SKILL_TEMPLATE_VERSION,
      detail: `current v${installedVersion} at ${target.path}`,
    };
  }

  return {
    agentId,
    target,
    status: 'stale-managed',
    installedVersion,
    expectedVersion: AGENTICOS_SKILL_TEMPLATE_VERSION,
    detail: installedVersion === AGENTICOS_SKILL_TEMPLATE_VERSION
      ? `managed Skill at ${target.path} differs from the current v${AGENTICOS_SKILL_TEMPLATE_VERSION} template`
      : `managed Skill at ${target.path} is v${installedVersion}; expected v${AGENTICOS_SKILL_TEMPLATE_VERSION}`,
  };
}

export function installAgentSkill(
  agentId: SupportedAgentId,
  homeDir: string,
  deps: AgentSkillFileDeps,
  options: { force?: boolean } = {},
): AgentSkillInstallResult {
  const inspection = inspectAgentSkill(agentId, homeDir, deps.readFile);
  if (!inspection.target.supported || !inspection.target.path) {
    return {
      ...inspection,
      ok: true,
      wrote: false,
      skipped: true,
    };
  }

  if (inspection.status === 'current') {
    return {
      ...inspection,
      ok: true,
      wrote: false,
      skipped: false,
    };
  }

  if (inspection.status === 'modified-user' && !options.force) {
    return {
      ...inspection,
      ok: false,
      wrote: false,
      skipped: true,
      detail: `${inspection.detail} Rerun with --force-skills to overwrite.`,
    };
  }

  deps.mkdirp(dirname(inspection.target.path));
  deps.writeFile(inspection.target.path, renderAgenticosSkillContent());
  return {
    ...inspectAgentSkill(agentId, homeDir, deps.readFile),
    ok: true,
    wrote: true,
    skipped: false,
    detail: `installed v${AGENTICOS_SKILL_TEMPLATE_VERSION} at ${inspection.target.path}. ${inspection.target.reloadHint}`,
  };
}

export function isAgentSkillOkForVerify(inspection: AgentSkillInspection): boolean {
  return inspection.status === 'unsupported' || inspection.status === 'current';
}

function renderAgenticosSkillContentWithoutHash(): string {
  return `---
name: agenticos
description: Use when the user asks to switch, enter, continue, inspect, or verify an AgenticOS project; asks pwd/current project/project status/worktree status; or says 切换到/进入/继续项目. Discover and call AgenticOS MCP first.
version: 1.0.0
triggers:
  - "switch project"
  - "switch to project"
  - "enter project"
  - "continue project"
  - "current project"
  - "project status"
  - "worktree status"
  - "pwd"
  - "AgenticOS"
  - "切换项目"
  - "切换到"
  - "进入项目"
  - "继续项目"
metadata:
  agenticos:
    managed: true
    template_version: ${AGENTICOS_SKILL_TEMPLATE_VERSION}
---

# AgenticOS Activation

## When To Use

Use this Skill whenever the user asks to switch, enter, continue, inspect, or verify an AgenticOS-managed project or worktree. This includes natural-language requests like "switch to 360Teams", "切换到 360Teams 项目", "pwd", "current project", or "what project am I in?".

## Contract

AgenticOS MCP is the source of truth for project identity, project path, session binding, and explicit workdir guidance.

Before using shell directory search, raw cd behavior, git branch inspection, or guessed repository paths:

1. Use AgenticOS MCP project tools if they are visible. Prefer \`agenticos_status\` for current state and \`agenticos_switch\` for project switching.
2. In Codex-like runtimes where tools may be deferred, use tool discovery for AgenticOS MCP tools before falling back to shell-only behavior.
3. After \`agenticos_switch\` succeeds, treat its returned project path and recommended explicit workdir as authoritative for subsequent tool calls.
4. If AgenticOS MCP tools are unavailable, say that the switch was not completed through AgenticOS. Provide recovery: run \`agenticos-bootstrap --workspace "$AGENTICOS_HOME" --all --install-skills --verify\`, repair MCP registration if needed, and restart or reload the agent.

## Do Not

- Do not claim that a project was switched only because a directory was found.
- Do not substitute \`cd\`, raw filesystem search, or git branch detection for \`agenticos_switch\`.
- Do not ignore AgenticOS output when it differs from the client shell PWD.
- Do not continue implementation work until AgenticOS project/session alignment is clear.
`;
}

function extractSkillTemplateVersion(content: string): number | null {
  const match = content.match(FRONTMATTER_TEMPLATE_VERSION_RE)
    || content.match(LEGACY_VERSION_MARKER_RE);
  return match ? Number(match[1]) : null;
}

function extractStoredHash(content: string): string | null {
  const match = content.match(HASH_MARKER_RE);
  return match ? match[1] : null;
}

function stripHashMarker(content: string): string {
  return content.replace(HASH_MARKER_RE, '');
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function insertAfterYamlFrontmatter(content: string, insertion: string): string {
  if (!content.startsWith('---\n')) {
    throw new Error('AgenticOS Skill template must start with YAML frontmatter');
  }

  const closingDelimiterIndex = content.indexOf('\n---\n', 4);
  if (closingDelimiterIndex === -1) {
    throw new Error('AgenticOS Skill template is missing a closing YAML frontmatter delimiter');
  }

  const insertionIndex = closingDelimiterIndex + '\n---\n'.length;
  return `${content.slice(0, insertionIndex)}${insertion}${content.slice(insertionIndex)}`;
}
