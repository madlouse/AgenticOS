import { readFile, writeFile } from 'fs/promises';

/**
 * Current template version. Increment when templates change.
 * Used for auto-upgrade on project switch.
 */
export const CURRENT_TEMPLATE_VERSION = 3;

/** Version marker format in generated files */
const VERSION_MARKER = `<!-- agenticos-template: v${CURRENT_TEMPLATE_VERSION} -->`;

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

// ---------------------------------------------------------------------------
// AGENTS.md template
// ---------------------------------------------------------------------------

export function generateAgentsMd(name: string, description: string): string {
  return `${VERSION_MARKER}
# AGENTS.md — ${name}

## Guardrail Protocol (MANDATORY)

Implementation work must use the executable guardrail flow:

1. call \`agenticos_preflight\` before editing
2. if preflight returns \`REDIRECT\`, call \`agenticos_branch_bootstrap\`
3. do not submit a PR before running \`agenticos_pr_scope_check\`

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

On session start, read these files for context:
1. \`.project.yaml\` — Project metadata
2. \`.context/quick-start.md\` — human-readable project summary
3. \`.context/state.yaml\` — Current state and working memory
4. \`.context/conversations/\` — Previous session records

Then greet the user with: project name, last progress, current pending items, suggested next step.

## Project

**Name**: ${name}
**Description**: ${description || '(not set)'}

## Directory Structure

| Path | Purpose |
|------|---------|
| \`.project.yaml\` | Project metadata |
| \`.context/quick-start.md\` | Quick project summary |
| \`.context/state.yaml\` | Session state and working memory |
| \`.context/conversations/\` | Session records (auto-generated) |
| \`knowledge/\` | Persistent knowledge documents |
| \`tasks/\` | Task tracking |
| \`tasks/templates/agent-preflight-checklist.yaml\` | Preflight checklist template |
| \`tasks/templates/issue-design-brief.md\` | Design-loop template |
| \`tasks/templates/submission-evidence.md\` | Submission evidence template |
| \`artifacts/\` | Outputs and deliverables |
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

function buildClaudeMdContent(name: string, description: string, state?: StateYaml, userContent?: ExtractedUserContent): string {
  const stateSection = state
    ? buildStateSection(state)
    : buildStateSection({ session: { last_backup: new Date().toISOString() }, current_task: null, working_memory: { facts: [], decisions: [], pending: ['Define project goals', 'Set up initial tasks'] } });

  const pdna = userContent?.projectDna
    ? `## Project DNA\n\n${userContent.projectDna}\n`
    : `## Project DNA\n\n**一句话定位**: ${description || '(待补充)'}\n\n**核心设计原则**: (待补充 — 在项目推进中逐步完善)\n\n**技术栈**: (待补充)\n`;

  const nav = userContent?.navigation
    ? `## Navigation\n\n${userContent.navigation}\n`
    : `## Navigation\n\n| 目录/文件 | 用途 |\n|-----------|------|\n| \`.project.yaml\` | 项目元信息 |\n| \`.context/quick-start.md\` | 快速项目概览 |\n| \`.context/state.yaml\` | 当前会话状态及工作记忆 |\n| \`.context/conversations/\` | 会话记录（自动生成） |\n| \`knowledge/\` | 持久化知识文档 |\n| \`tasks/\` | 任务追踪 |\n| \`tasks/templates/agent-preflight-checklist.yaml\` | preflight 模板 |\n| \`tasks/templates/issue-design-brief.md\` | 设计循环模板 |\n| \`tasks/templates/submission-evidence.md\` | 提交证据模板 |\n| \`artifacts/\` | 产出物 |\n`;

  return `${VERSION_MARKER}
# CLAUDE.md — ${name}

## Guardrail Protocol (MANDATORY)

For implementation-affecting work:

1. call \`agenticos_preflight\` before editing
2. if the result is \`REDIRECT\`, call \`agenticos_branch_bootstrap\` and continue in the returned worktree
3. before PR creation or merge, call \`agenticos_pr_scope_check\`

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

1. Read the "Current State" section below
2. Greet the user with a brief status report:

\`\`\`
📍 项目：${name}
📌 上次进展：[current_task title + status]
🎯 当前待办：[top pending items]
💡 建议下一步：[recommended next action]

继续上次的工作，还是有新的方向？
\`\`\`

3. Wait for the user's direction before proceeding

---

${pdna}## Current State

${STATE_START}
${stateSection}
${STATE_END}

---

${nav}`;
}

export function generateClaudeMd(name: string, description: string, state?: StateYaml): string {
  return buildClaudeMdContent(name, description, state);
}

/** Upgrade an existing CLAUDE.md to current template version, preserving user content. */
export function upgradeClaudeMd(claudeMdPath: string, name: string, description: string, state?: StateYaml): string {
  const content = readFile(claudeMdPath, 'utf-8').toString();
  return buildClaudeMdContent(name, description, state, extractUserContent(content));
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
