import { readFile, writeFile } from 'fs/promises';
import { readFileSync } from 'fs';
import { joinDisplayPath, type ManagedProjectContextDisplayPaths } from './agent-context-paths.js';

/**
 * Current template version. Increment when templates change.
 * Used for auto-upgrade on project switch.
 */
export const CURRENT_TEMPLATE_VERSION = 12;

/** Version marker format in generated files */
const VERSION_MARKER = `<!-- agenticos-template: v${CURRENT_TEMPLATE_VERSION} -->`;

const DEFAULT_AGENT_CONTEXT_PATHS: ManagedProjectContextDisplayPaths = {
  quickStartPath: '.context/quick-start.md',
  statePath: '.context/state.yaml',
  conversationsDir: '.context/conversations/',
  markerPath: '.context/.last_record',
  knowledgeDir: 'knowledge/',
  tasksDir: 'tasks/',
  artifactsDir: 'artifacts/',
};

function normalizeAgentContextPaths(paths?: Partial<ManagedProjectContextDisplayPaths>): ManagedProjectContextDisplayPaths {
  return {
    quickStartPath: paths?.quickStartPath || DEFAULT_AGENT_CONTEXT_PATHS.quickStartPath,
    statePath: paths?.statePath || DEFAULT_AGENT_CONTEXT_PATHS.statePath,
    conversationsDir: paths?.conversationsDir || DEFAULT_AGENT_CONTEXT_PATHS.conversationsDir,
    markerPath: paths?.markerPath || DEFAULT_AGENT_CONTEXT_PATHS.markerPath,
    knowledgeDir: paths?.knowledgeDir || DEFAULT_AGENT_CONTEXT_PATHS.knowledgeDir,
    tasksDir: paths?.tasksDir || DEFAULT_AGENT_CONTEXT_PATHS.tasksDir,
    artifactsDir: paths?.artifactsDir || DEFAULT_AGENT_CONTEXT_PATHS.artifactsDir,
  };
}

export const SHARED_POLICY_TITLE = 'Canonical Policy (Shared Across Agents)';
export const SHARED_POLICY_BULLETS = [
  'This project has one canonical AgenticOS execution policy across Claude Code, Codex, and other supported agents.',
  'Implementation work must stay issue-first, preflighted, and inside the guardrail-controlled branch/worktree flow.',
  'PR creation or merge must not happen before executable scope validation passes.',
  'Recording and save flow remain canonical project requirements rather than runtime-specific preferences.',
] as const;

export const AGENTS_ADAPTER_LINES = [
  '`AGENTS.md` is the Codex/generic adapter surface for this project.',
  'It must expose the same canonical policy as other agent adapters rather than defining a different workflow.',
] as const;

export const AGENTS_RUNTIME_GUIDANCE_TITLE = 'Codex / Generic Runtime Notes';
export const AGENTS_RUNTIME_GUIDANCE_BULLETS = [
  'If natural-language routing is weak, use explicit `agenticos_*` tool calls before treating the issue as transport failure.',
  'Bootstrap differences are runtime concerns rather than policy changes.',
] as const;

export const CLAUDE_ADAPTER_LINES = [
  '`CLAUDE.md` is the Claude Code adapter surface for this project.',
  'It must expose the same canonical policy as other agent adapters while allowing Claude-specific operator guidance.',
] as const;

export const CLAUDE_RUNTIME_GUIDANCE_TITLE = 'Claude Runtime Notes';
export const CLAUDE_RUNTIME_GUIDANCE_BULLETS = [
  'Claude CLI-managed user MCP config is the canonical Claude bootstrap surface.',
  'Claude-specific stop hooks remain optional local stop-hook reminders rather than canonical guardrails.',
] as const;

export const TASK_INTAKE_RULE_TITLE = 'Task Intake Rule';
export const TASK_INTAKE_RULE_BULLETS = [
  'At task intake, recover operator intent before treating named methods or workflow fragments as the full plan.',
  'Separate goals, hard constraints, useful signals, and candidate methods before choosing an execution path.',
  'Once intent is resolved, collapse it into a clean execution objective instead of carrying the full intake rubric through every later step.',
] as const;

export const CONTINUITY_CONTRACT_TITLE = 'Continuity Contract';
export const CONTINUITY_CONTRACT_BULLETS = [
  'The tracked continuity contract is publication-policy aware: local_private stays runtime-local, private_continuity persists the tracked continuity core, and public_distilled keeps a narrower tracked surface.',
  'The configured conversations path is a context contract input, but raw transcript routing may differ by publication policy.',
  '`CLAUDE.md` and `AGENTS.md` are mirrored adapter surfaces. They should stay aligned with project policy, but continuity correctness must not depend on them existing.',
] as const;

/** Extract template version from an existing file. Returns 0 if no marker found (v1 or earlier). */
export function extractTemplateVersion(content: string): number {
  const match = content.match(/<!--\s*agenticos-template:\s*v(\d+)\s*-->/);
  return match ? parseInt(match[1], 10) : 0;
}

/** Update version marker in existing content to current version */
function ensureVersionMarker(content: string): string {
  if (content.includes(`agenticos-template: v${CURRENT_TEMPLATE_VERSION}`)) return content;
  const cleaned = content.replace(/<!--\s*agenticos-template:\s*v\d+\s*-->\n?/, '');
  return `${VERSION_MARKER}\n${cleaned}`;
}

function renderSharedPolicySection(): string {
  return [
    `## ${SHARED_POLICY_TITLE}`,
    '',
    ...SHARED_POLICY_BULLETS.map((line) => `- ${line}`),
    '',
  ].join('\n');
}

function renderRuntimeGuidanceSection(title: string, bullets: readonly string[]): string {
  return [
    `## ${title}`,
    '',
    ...bullets.map((line) => `- ${line}`),
    '',
  ].join('\n');
}

function renderContinuityContractSection(): string {
  return [
    `## ${CONTINUITY_CONTRACT_TITLE}`,
    '',
    ...CONTINUITY_CONTRACT_BULLETS.map((line) => `- ${line}`),
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// AGENTS.md template
// ---------------------------------------------------------------------------

export function generateAgentsMd(
  name: string,
  description: string,
  paths?: Partial<ManagedProjectContextDisplayPaths>,
): string {
  const contextPaths = normalizeAgentContextPaths(paths);
  const taskTemplatesDir = joinDisplayPath(contextPaths.tasksDir, 'templates');

  return `${VERSION_MARKER}
# AGENTS.md — ${name}

## Adapter Role

${AGENTS_ADAPTER_LINES[0]}
${AGENTS_ADAPTER_LINES[1]}

${renderSharedPolicySection()}${renderContinuityContractSection()}${renderRuntimeGuidanceSection(AGENTS_RUNTIME_GUIDANCE_TITLE, AGENTS_RUNTIME_GUIDANCE_BULLETS)}${renderRuntimeGuidanceSection(TASK_INTAKE_RULE_TITLE, TASK_INTAKE_RULE_BULLETS)}## Guardrail Protocol (MANDATORY)

Before implementation edits, confirm session/project alignment with \`agenticos_status\`; if no session project is bound or the bound project is not the intended one, call \`agenticos_switch\`.

Implementation work must use the executable guardrail flow:

1. call \`agenticos_preflight\`; if it returns \`REDIRECT\`, call \`agenticos_branch_bootstrap\` and continue in the returned worktree
2. after the issue worktree is active, perform the normal startup load and record \`agenticos_issue_bootstrap\`
3. rerun \`agenticos_preflight\` in that worktree before editing
4. use \`agenticos_edit_guard\` immediately before implementation edits
5. do not submit a PR before running \`agenticos_pr_scope_check\`

If any guardrail returns \`BLOCK\`, stop and resolve the blocking reason first.

## Recording Protocol (MANDATORY)

This project uses AgenticOS for persistent context management.
All session activity MUST be recorded via MCP tools.

### How to Record

Call the MCP tool \`agenticos_record\` with:
- \`summary\` (required): What happened in this session
- \`decisions\`: Key decisions made
- \`outcomes\`: What was accomplished
- \`pending\`: What remains to be done
- \`current_task\`: { title, status } to update current task

### When to Record

1. After completing any meaningful unit of work
2. Before ending the session (MANDATORY — context is lost otherwise)

After recording, call \`agenticos_save\` to commit to Git.

### Session Start

On session start, align the runtime before meaningful work:
1. call \`agenticos_status\` to confirm the current session project, current task, pending work, and latest recorded state
2. if no session project is bound or the bound project is not \`${name}\`, call \`agenticos_switch\`
3. read \`.project.yaml\`, \`${contextPaths.quickStartPath}\`, \`${contextPaths.statePath}\`, and review the configured conversation history surface when relevant
4. review the latest guardrail evidence and latest \`agenticos_issue_bootstrap\` record before implementation-affecting work
5. if implementation work is requested, follow the Guardrail Protocol above exactly before editing

Then greet the user with: project name, last progress, current pending items, suggested next step.

## Project

**Name**: ${name}
**Description**: ${description || '(not set)'}

## Directory Structure

| Path | Purpose |
|------|---------|
| \`.project.yaml\` | Project metadata |
| \`${contextPaths.quickStartPath}\` | Quick project summary |
| \`${contextPaths.statePath}\` | Session state and working memory |
| \`${contextPaths.conversationsDir}\` | Configured conversation history surface (tracked or policy-routed) |
| \`${contextPaths.knowledgeDir}\` | Persistent knowledge documents |
| \`${contextPaths.tasksDir}\` | Task tracking |
| \`${joinDisplayPath(taskTemplatesDir, 'agent-preflight-checklist.yaml')}\` | Preflight checklist template |
| \`${joinDisplayPath(taskTemplatesDir, 'issue-design-brief.md')}\` | Design-loop template |
| \`${joinDisplayPath(taskTemplatesDir, 'non-code-evaluation-rubric.yaml')}\` | Non-code evaluation rubric |
| \`${joinDisplayPath(taskTemplatesDir, 'submission-evidence.md')}\` | Submission evidence template |
| \`${contextPaths.artifactsDir}\` | Outputs and deliverables |
`;
}

// ---------------------------------------------------------------------------
// CLAUDE.md template
// ---------------------------------------------------------------------------

const STATE_START = '<!-- AGENT_CONTEXT_START -->';
const STATE_END = '<!-- AGENT_CONTEXT_END -->';

interface StateYaml {
  session?: { last_backup?: string };
  current_task?: { title?: string; status?: string } | null;
  working_memory?: { facts?: string[]; decisions?: string[]; pending?: string[] };
}

export function buildStateSection(state: StateYaml): string {
  const lastUpdated = state.session?.last_backup || new Date().toISOString();
  const taskTitle = state.current_task?.title || 'No active task';
  const taskStatus = state.current_task?.status || 'unknown';
  const pending = state.working_memory?.pending || [];
  const decisions = state.working_memory?.decisions || [];

  const lines: string[] = [];
  lines.push(`**Last Updated**: ${lastUpdated}`);
  lines.push('');
  lines.push(`**Current Task**: ${taskTitle} (status: ${taskStatus})`);
  lines.push('');
  if (pending.length > 0) {
    lines.push('**Active Items**:');
    for (const item of pending.slice(0, 5)) lines.push(`- ${item}`);
  } else {
    lines.push('**Active Items**: None');
  }
  lines.push('');
  if (decisions.length > 0) {
    lines.push('**Recent Decisions**:');
    for (const item of decisions.slice(-3)) lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push(`**Next Action**: ${pending.length > 0 ? pending[0] : 'Define next steps'}`);

  return lines.join('\n');
}

interface ExtractedUserContent {
  projectDna: string | null;
  navigation: string | null;
}

function extractUserContent(content: string): ExtractedUserContent {
  const projectDnaMatch = content.match(/## Project DNA\n([\s\S]*?)(?=## |\z)/);
  const navigationMatch = content.match(/## Navigation\n([\s\S]*?)(?=## |\z)/);
  const isDefault = (t: string | null) => !t || t.includes('(待补充)') || t.includes('(not set)') || t.trim() === '';
  return {
    projectDna: projectDnaMatch && !isDefault(projectDnaMatch[1].trim()) ? projectDnaMatch[1].trim() : null,
    navigation: navigationMatch && navigationMatch[1].trim().length > 0 ? navigationMatch[1].trim() : null,
  };
}

function buildClaudeMdContent(
  name: string,
  description: string,
  state?: StateYaml,
  userContent?: ExtractedUserContent,
  paths?: Partial<ManagedProjectContextDisplayPaths>,
): string {
  const contextPaths = normalizeAgentContextPaths(paths);
  const taskTemplatesDir = joinDisplayPath(contextPaths.tasksDir, 'templates');
  const stateSection = state
    ? buildStateSection(state)
    : buildStateSection({ session: { last_backup: new Date().toISOString() }, current_task: null, working_memory: { facts: [], decisions: [], pending: ['Define project goals', 'Set up initial tasks'] } });

  const pdna = userContent?.projectDna
    ? `## Project DNA\n\n${userContent.projectDna}\n`
    : `## Project DNA\n\n**一句话定位**: ${description || '(待补充)'}\n\n**核心设计原则**: (待补充 — 在项目推进中逐步完善)\n\n**技术栈**: (待补充)\n`;

  const nav = userContent?.navigation
    ? `## Navigation\n\n${userContent.navigation}\n`
    : `## Navigation\n\n| 目录/文件 | 用途 |\n|-----------|------|\n| \`.project.yaml\` | 项目元信息 |\n| \`${contextPaths.quickStartPath}\` | 快速项目概览 |\n| \`${contextPaths.statePath}\` | 当前会话状态及工作记忆 |\n| \`${contextPaths.conversationsDir}\` | 会话历史入口（tracked 或按 policy 路由） |\n| \`${contextPaths.knowledgeDir}\` | 持久化知识文档 |\n| \`${contextPaths.tasksDir}\` | 任务追踪 |\n| \`${joinDisplayPath(taskTemplatesDir, 'agent-preflight-checklist.yaml')}\` | preflight 模板 |\n| \`${joinDisplayPath(taskTemplatesDir, 'issue-design-brief.md')}\` | 设计循环模板 |\n| \`${joinDisplayPath(taskTemplatesDir, 'non-code-evaluation-rubric.yaml')}\` | 非代码评估模板 |\n| \`${joinDisplayPath(taskTemplatesDir, 'submission-evidence.md')}\` | 提交证据模板 |\n| \`${contextPaths.artifactsDir}\` | 产出物 |\n`;

  return `${VERSION_MARKER}
# CLAUDE.md — ${name}

## Adapter Role

${CLAUDE_ADAPTER_LINES[0]}
${CLAUDE_ADAPTER_LINES[1]}

${renderSharedPolicySection()}${renderContinuityContractSection()}${renderRuntimeGuidanceSection(CLAUDE_RUNTIME_GUIDANCE_TITLE, CLAUDE_RUNTIME_GUIDANCE_BULLETS)}${renderRuntimeGuidanceSection(TASK_INTAKE_RULE_TITLE, TASK_INTAKE_RULE_BULLETS)}## Guardrail Protocol (MANDATORY)

Before implementation edits, confirm session/project alignment with \`agenticos_status\`; if no session project is bound or the bound project is not the intended one, call \`agenticos_switch\`.

For implementation-affecting work:

1. call \`agenticos_preflight\`; if the result is \`REDIRECT\`, call \`agenticos_branch_bootstrap\` and continue in the returned worktree
2. after the issue worktree is active, perform the normal startup load and record \`agenticos_issue_bootstrap\`
3. rerun \`agenticos_preflight\` in that worktree before editing
4. call \`agenticos_edit_guard\` immediately before implementation edits
5. before PR creation or merge, call \`agenticos_pr_scope_check\`

If any guardrail command returns \`BLOCK\`, stop and resolve the blocking reason before continuing.

## MANDATORY: Recording Protocol

> This is an AgenticOS project. All session activity MUST be recorded.
> Recording is not optional — it is the core function of this system.

### During Session

After completing any meaningful unit of work (feature, fix, design decision, analysis), call \`agenticos_record\`:

\`\`\`
agenticos_record({
  summary: "what happened",
  decisions: ["decision 1", ...],
  outcomes: ["outcome 1", ...],
  pending: ["next step 1", ...],
  current_task: { title: "task name", status: "in_progress" }
})
\`\`\`

### Before Session Ends

When the user signals session end (says goodbye, thanks, done, or stops responding), you MUST:

1. Call \`agenticos_record\` with a complete session summary
2. Call \`agenticos_save\` to commit to Git

**If you skip this step, all context from this session is permanently lost.**

---

## Session Start Protocol

When you open this project in a new session, **immediately do the following**:

1. Call \`agenticos_status\` to confirm the current session project, current task, pending work, and latest recorded state
2. If no session project is bound or the bound project is not \`${name}\`, call \`agenticos_switch\`
3. Read \`.project.yaml\`, the "Current State" section below, \`${contextPaths.quickStartPath}\`, and review the configured conversation history surface when relevant
4. Review the latest guardrail evidence and latest \`agenticos_issue_bootstrap\` record before implementation-affecting work
5. Greet the user with a brief status report:

\`\`\`
📍 项目：${name}
📌 上次进展：[current_task title + status]
🎯 当前待办：[top pending items]
💡 建议下一步：[recommended next action]

继续上次的工作，还是有新的方向？
\`\`\`

6. If implementation work is requested, enter the Guardrail Protocol above before editing
7. Wait for the user's direction before proceeding

---

${pdna}## Current State

${STATE_START}
${stateSection}
${STATE_END}

---

${nav}`;
}

export function generateClaudeMd(
  name: string,
  description: string,
  state?: StateYaml,
  paths?: Partial<ManagedProjectContextDisplayPaths>,
): string {
  return buildClaudeMdContent(name, description, state, undefined, paths);
}

/** Upgrade an existing CLAUDE.md to current template version, preserving user content. */
export function upgradeClaudeMd(
  claudeMdPath: string,
  name: string,
  description: string,
  state?: StateYaml,
  paths?: Partial<ManagedProjectContextDisplayPaths>,
): string {
  const content = readFileSync(claudeMdPath, 'utf-8');
  return buildClaudeMdContent(name, description, state, extractUserContent(content), paths);
}

// ---------------------------------------------------------------------------
// State update
// ---------------------------------------------------------------------------

export async function updateClaudeMdState(
  claudeMdPath: string,
  state: StateYaml,
  projectName?: string,
  projectDescription?: string,
): Promise<{ updated: boolean; created: boolean }> {
  let content: string;
  let created = false;

  try {
    content = await readFile(claudeMdPath, 'utf-8');
  } catch {
    content = generateClaudeMd(projectName || 'Untitled Project', projectDescription || '', state);
    await writeFile(claudeMdPath, content, 'utf-8');
    return { updated: true, created: true };
  }

  const startIdx = content.indexOf(STATE_START);
  const endIdx = content.indexOf(STATE_END);

  if (startIdx === -1 || endIdx === -1) {
    content += `\n\n${STATE_START}\n${buildStateSection(state)}\n${STATE_END}\n`;
  } else {
    const before = content.substring(0, startIdx + STATE_START.length);
    const after = content.substring(endIdx);
    content = `${before}\n${buildStateSection(state)}\n${after}`;
  }

  await writeFile(claudeMdPath, ensureVersionMarker(content), 'utf-8');
  return { updated: true, created: false };
}
