import { createHash } from 'crypto';
import { dirname, join } from 'path';
import type { SupportedAgentId } from './bootstrap-helper.js';

export const AGENTICOS_SKILL_TEMPLATE_VERSION = 8;
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
        supported: true,
        path: join(homeDir, '.gemini', 'skills', AGENTICOS_SKILL_NAME, 'SKILL.md'),
        reloadHint: 'Restart Gemini CLI or run `/skills reload` so the AgenticOS activation Skill is indexed.',
      };
    case 'hermes-agent':
      return {
        agentId,
        label: 'Hermes AgenticOS activation Skill',
        supported: true,
        path: join(homeDir, '.hermes', 'skills', 'work', AGENTICOS_SKILL_NAME, 'SKILL.md'),
        reloadHint: 'Restart Hermes Agent or reload Hermes skills so the AgenticOS activation Skill is indexed.',
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
  const skillPath = target.path!;

  const content = readFile(skillPath);
  if (content === null) {
    return {
      agentId,
      target,
      status: 'missing',
      installedVersion: null,
      expectedVersion: AGENTICOS_SKILL_TEMPLATE_VERSION,
      detail: `missing ${skillPath}`,
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
      detail: `${skillPath} exists but is not a managed AgenticOS Skill.`,
    };
  }

  if (sha256(withoutHash) !== storedHash) {
    return {
      agentId,
      target,
      status: 'modified-user',
      installedVersion,
      expectedVersion: AGENTICOS_SKILL_TEMPLATE_VERSION,
      detail: `${skillPath} was modified after AgenticOS installed it.`,
    };
  }

  if (withoutHash === expectedWithoutHash) {
    return {
      agentId,
      target,
      status: 'current',
      installedVersion,
      expectedVersion: AGENTICOS_SKILL_TEMPLATE_VERSION,
      detail: `current v${installedVersion} at ${skillPath}`,
    };
  }

  return {
    agentId,
    target,
    status: 'stale-managed',
    installedVersion,
    expectedVersion: AGENTICOS_SKILL_TEMPLATE_VERSION,
    detail: installedVersion === AGENTICOS_SKILL_TEMPLATE_VERSION
      ? `managed Skill at ${skillPath} differs from the current v${AGENTICOS_SKILL_TEMPLATE_VERSION} template`
      : `managed Skill at ${skillPath} is v${installedVersion}; expected v${AGENTICOS_SKILL_TEMPLATE_VERSION}`,
  };
}

export function installAgentSkill(
  agentId: SupportedAgentId,
  homeDir: string,
  deps: AgentSkillFileDeps,
  options: { force?: boolean } = {},
): AgentSkillInstallResult {
  const inspection = inspectAgentSkill(agentId, homeDir, deps.readFile);

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

  deps.mkdirp(dirname(inspection.target.path!));
  deps.writeFile(inspection.target.path!, renderAgenticosSkillContent());
  const installedPath = inspection.target.path!;
  return {
    ...inspectAgentSkill(agentId, homeDir, deps.readFile),
    ok: true,
    wrote: true,
    skipped: false,
    detail: `installed v${AGENTICOS_SKILL_TEMPLATE_VERSION} at ${installedPath}. ${inspection.target.reloadHint}`,
  };
}

export function isAgentSkillOkForVerify(inspection: AgentSkillInspection): boolean {
  return inspection.status === 'unsupported' || inspection.status === 'current';
}

function renderAgenticosSkillContentWithoutHash(): string {
  return `---
name: agenticos
description: |
  Use when the user asks to switch, enter, continue, inspect, or verify an
  AgenticOS / Agentic OS project or topic; asks pwd/current project/project
  status/worktree status; says 切换到/进入/继续项目/退出项目/切出; or uses aliases such as
  "Agentic OS 项目" or "AgenticOS 项目". Discover AgenticOS MCP with tool_search
  when needed, then call AgenticOS MCP before shell directory search.
version: 1.2.0
triggers:
  - "switch project"
  - "switch to project"
  - "switch to AgenticOS project"
  - "switch to Agentic OS project"
  - "enter project"
  - "continue project"
  - "switch out project"
  - "exit project"
  - "leave project"
  - "return to original directory"
  - "current project"
  - "current AgenticOS project"
  - "current Agentic OS project"
  - "project status"
  - "worktree status"
  - "pwd"
  - "AgenticOS"
  - "Agentic OS"
  - "AgenticOS project"
  - "Agentic OS project"
  - "AgenticOS 项目"
  - "Agentic OS 项目"
  - "切换项目"
  - "切换到"
  - "切换到 AgenticOS 项目"
  - "切换到 Agentic OS 项目"
  - "进入项目"
  - "进入 AgenticOS 项目"
  - "进入 Agentic OS 项目"
  - "继续项目"
  - "切出"
  - "切出项目"
  - "退出项目"
  - "离开项目"
  - "回到初始目录"
  - "当前项目"
  - "项目状态"
metadata:
  trigger: "AgenticOS MCP project switching, switch out project, Agentic OS project, 切换到 Agentic OS 项目, 退出项目, 切出, pwd, current project, project status"
  aliases:
    - "AgenticOS"
    - "Agentic OS"
    - "AgenticOS 项目"
    - "Agentic OS 项目"
  agenticos:
    managed: true
    template_version: ${AGENTICOS_SKILL_TEMPLATE_VERSION}
---

# AgenticOS Activation

## When To Use

Use this Skill whenever the user asks Codex, Claude Code, Cursor, Gemini CLI, or Hermes Agent to switch, enter, continue, exit, inspect, or verify an AgenticOS-managed project, topic, or worktree. This includes natural-language requests like "switch to 360Teams", "切换到 Agentic OS 项目", "切换到 360Teams 项目", "退出项目", "切出", "回到初始目录", "pwd", "current project", or "what project am I in?".

## Contract

AgenticOS MCP is the source of truth for project identity, project path, session binding, and explicit workdir guidance.

Before using shell directory search, raw cd behavior, git branch inspection, or guessed repository paths:

1. Use AgenticOS MCP project tools if they are visible. Prefer \`agenticos_status\` for current state, \`agenticos_switch\` for project switching, and \`agenticos_switch_out\` for "切出/退出项目/回到初始目录" requests.
2. In Codex-like runtimes where tools may be deferred, call tool discovery for AgenticOS MCP tools before any shell-only behavior. If \`tool_search\` is available and \`mcp__agenticos__\` tools are not visible, search for "AgenticOS MCP project switch status" first.
3. Before the first \`agenticos_switch\` in a session, pass the best known absolute client cwd as \`origin_cwd\` when available so \`agenticos_switch_out\` can restore the original entry workdir.
4. After \`agenticos_switch\` succeeds, immediately apply the returned \`structuredContent.project_workdir\` / \`structuredContent.explicit_workdir\` when present, falling back to the text \`project_workdir\` / \`explicit_workdir\` lines or project path, as the active filesystem workdir. Codex-style runtimes must pass that path as explicit tool \`workdir\`; worker launchers should start new Codex sessions with \`codex -C <project_path>\`; Claude Code must use its installed PostToolUse cwd guidance hook, per-call cwd prefixes, or absolute paths; Hermes Agent should rely on its installed AgenticOS cwd applicator when present.
5. After \`agenticos_switch_out\` succeeds, immediately apply \`structuredContent.target_workdir\` / \`structuredContent.explicit_workdir\` when present, falling back to the text \`target_workdir\` / \`explicit_workdir\` lines, as the active filesystem workdir. Do not keep using the previous project path after switch-out. MCP cannot mutate the parent process cwd by itself; if the current agent cannot apply \`target_workdir\`, say the switch-out effect is not complete before continuing.
6. For Claude Code, an installed AgenticOS PostToolUse hook provides per-call cwd guidance after switch-in and switch-out. It does not persistently change Claude Code's parent/session PWD; shell commands must be prefixed with the returned workdir or file/edit operations must use absolute paths.
7. For Hermes Agent, the expected installation includes both this activation Skill and the AgenticOS Hermes cwd applicator plugin. If switch succeeds but Hermes terminal/file/code tools still use the old cwd, run \`agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent hermes-agent --install-skills --apply\`, then \`agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent hermes-agent --install-skills --verify\`, and restart Hermes Agent.
8. For Cursor and Gemini CLI, use the returned \`explicit_workdir\` / \`target_workdir\` for subsequent operations when the runtime offers per-call working-directory control; otherwise use absolute paths and say that persistent cwd mutation is not available.
9. If AgenticOS MCP tools are unavailable, say that the switch was not completed through AgenticOS. Provide recovery: run \`agenticos-bootstrap --workspace "$AGENTICOS_HOME" --all --install-skills --auto-configure-hooks --apply\`, then \`agenticos-bootstrap --workspace "$AGENTICOS_HOME" --all --install-skills --auto-configure-hooks --verify\`, repair MCP registration if needed, and restart or reload the agent.

For project switch/status prompts, the first observable action should be AgenticOS MCP or AgenticOS MCP tool discovery. Shell directory search before MCP discovery is a routing bug.

## Do Not

- Do not claim that a project was switched only because a directory was found.
- Do not substitute \`cd\`, raw filesystem search, \`find\`, \`pwd\`, \`ls\`, or git branch detection for \`agenticos_switch\`.
- Do not substitute \`cd\` for \`agenticos_switch_out\` when the user asks to leave or exit a project context.
- Do not ignore AgenticOS output when it differs from the client shell PWD.
- Do not continue using the previous project path after \`agenticos_switch_out\`; use \`target_workdir\` / \`explicit_workdir\` explicitly.
- Do not ask the user for a second manual \`cd\` when the agent runtime has an installed cwd applicator or per-tool \`workdir\` support; apply the returned workdir yourself.
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

/** @internal Exported for unit tests only. */
export function __testInsertAfterYamlFrontmatter(content: string, insertion: string): string {
  return insertAfterYamlFrontmatter(content, insertion);
}
