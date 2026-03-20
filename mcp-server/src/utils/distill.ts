import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const STATE_START = '<!-- AGENT_CONTEXT_START -->';
const STATE_END = '<!-- AGENT_CONTEXT_END -->';

interface StateYaml {
  session?: {
    last_backup?: string;
  };
  current_task?: {
    title?: string;
    status?: string;
  } | null;
  working_memory?: {
    facts?: string[];
    decisions?: string[];
    pending?: string[];
  };
}

/**
 * Build the Current State markdown section from state.yaml data.
 */
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
    for (const item of pending.slice(0, 5)) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push('**Active Items**: None');
  }
  lines.push('');

  if (decisions.length > 0) {
    lines.push('**Recent Decisions**:');
    for (const item of decisions.slice(-3)) {
      lines.push(`- ${item}`);
    }
  }
  lines.push('');

  const nextAction = pending.length > 0 ? pending[0] : 'Define next steps';
  lines.push(`**Next Action**: ${nextAction}`);

  return lines.join('\n');
}

/**
 * Generate a full CLAUDE.md for a new project (used by init).
 */
export function generateClaudeMd(name: string, description: string, state?: StateYaml): string {
  const stateSection = state ? buildStateSection(state) : buildStateSection({
    session: { last_backup: new Date().toISOString() },
    current_task: null,
    working_memory: { facts: [], decisions: [], pending: ['Define project goals', 'Set up initial tasks'] },
  });

  return `# CLAUDE.md — ${name}

## Session Start Protocol

When you open this project in a new session, **immediately do the following**:

1. Read the "Current State" section below
2. Greet the user with a brief status report in this format:

\`\`\`
📍 项目：${name}
📌 上次进展：[current_task title + status]
🎯 当前待办：[top pending items]
💡 建议下一步：[recommended next action]

继续上次的工作，还是有新的方向？
\`\`\`

3. Wait for the user's direction before proceeding

---

## Project DNA

**一句话定位**: ${description || '(待补充)'}

**核心设计原则**: (待补充 — 在项目推进中逐步完善)

**技术栈**: (待补充)

---

## Current State

${STATE_START}
${stateSection}
${STATE_END}

---

## Navigation

| 目录/文件 | 用途 |
|-----------|------|
| \`.project.yaml\` | 项目元信息 |
| \`.context/state.yaml\` | 当前会话状态及工作记忆 |
| \`.context/quick-start.md\` | 项目概览 |
| \`knowledge/\` | 持久化知识文档 |
| \`tasks/\` | 任务追踪 |
| \`artifacts/\` | 产出物 |
`;
}

/**
 * Update only the Current State section in an existing CLAUDE.md (used by save).
 * If CLAUDE.md doesn't exist, generates a new one.
 */
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
    // CLAUDE.md doesn't exist — generate from scratch
    content = generateClaudeMd(
      projectName || 'Untitled Project',
      projectDescription || '',
      state,
    );
    await writeFile(claudeMdPath, content, 'utf-8');
    return { updated: true, created: true };
  }

  // Find and replace the state section between markers
  const startIdx = content.indexOf(STATE_START);
  const endIdx = content.indexOf(STATE_END);

  if (startIdx === -1 || endIdx === -1) {
    // Markers not found — append state section at the end
    const stateBlock = `\n\n${STATE_START}\n${buildStateSection(state)}\n${STATE_END}\n`;
    content += stateBlock;
    await writeFile(claudeMdPath, content, 'utf-8');
    return { updated: true, created: false };
  }

  // Replace content between markers
  const before = content.substring(0, startIdx + STATE_START.length);
  const after = content.substring(endIdx);
  const newContent = `${before}\n${buildStateSection(state)}\n${after}`;

  await writeFile(claudeMdPath, newContent, 'utf-8');
  return { updated: true, created: false };
}
