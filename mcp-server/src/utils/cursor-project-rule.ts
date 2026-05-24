import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import type { ManagedProjectContextDisplayPaths } from './agent-context-paths.js';
import {
  PROJECT_SWITCH_ROUTING_CONTENT,
  PROJECT_SWITCH_ROUTING_TITLE,
  SHARED_POLICY_BULLETS,
  SHARED_POLICY_TITLE,
  TASK_INTAKE_RULE_CONTENT,
  TASK_INTAKE_RULE_TITLE,
} from './distill.js';
import { STOP_HOOK_MIGRATION_BULLETS } from './stop-hook-guidance.js';

export const CURSOR_PROJECT_RULE_RELATIVE_PATH = '.cursor/rules/agenticos.mdc';
export const CURSOR_PROJECT_RULE_TEMPLATE_VERSION = 1;

const HASH_MARKER_RE = /^<!-- agenticos-skill-managed-sha256: ([a-f0-9]{64}) -->\n?/m;
const FRONTMATTER_TEMPLATE_VERSION_RE = /^\s*template_version:\s*(\d+)\s*$/m;

export type CursorProjectRuleStatus =
  | 'missing'
  | 'current'
  | 'stale-managed'
  | 'modified-user';

export interface CursorProjectRuleInspection {
  status: CursorProjectRuleStatus;
  installedVersion: number | null;
  expectedVersion: number;
  detail: string;
}

const DEFAULT_AGENT_CONTEXT_PATHS: ManagedProjectContextDisplayPaths = {
  quickStartPath: '.context/quick-start.md',
  statePath: '.context/state.yaml',
  conversationsDir: '.context/conversations/',
  markerPath: '.context/.last_record',
  knowledgeDir: 'knowledge/',
  tasksDir: 'tasks/',
  artifactsDir: 'artifacts/',
};

function normalizeAgentContextPaths(
  paths?: Partial<ManagedProjectContextDisplayPaths>,
): ManagedProjectContextDisplayPaths {
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

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function insertAfterYamlFrontmatter(content: string, insertion: string): string {
  if (!content.startsWith('---\n')) {
    throw new Error('Cursor project rule template must start with YAML frontmatter');
  }
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) {
    throw new Error('Cursor project rule template frontmatter is not closed');
  }
  return `${content.slice(0, end + 5)}${insertion}${content.slice(end + 5)}`;
}

function extractTemplateVersion(content: string): number | null {
  const match = content.match(FRONTMATTER_TEMPLATE_VERSION_RE);
  return match ? Number(match[1]) : null;
}

function extractStoredHash(content: string): string | null {
  const match = content.match(HASH_MARKER_RE);
  return match ? match[1] : null;
}

function stripHashMarker(content: string): string {
  return content.replace(HASH_MARKER_RE, '');
}

function renderCursorProjectRuleWithoutHash(
  name: string,
  description: string,
  paths?: Partial<ManagedProjectContextDisplayPaths>,
): string {
  const contextPaths = normalizeAgentContextPaths(paths);
  const descriptionLine = description.trim()
    ? `\nProject: ${name} — ${description.trim()}`
    : `\nProject: ${name}`;

  return `---
description: AgenticOS project execution policy for ${name}
alwaysApply: true
metadata:
  agenticos:
    managed: true
    template_version: ${CURSOR_PROJECT_RULE_TEMPLATE_VERSION}
---

# AgenticOS — ${name}

## Adapter Role

\`.cursor/rules/agenticos.mdc\` is the Cursor adapter surface for this project.
It must expose the same canonical policy as other agent adapters while allowing Cursor-specific operator guidance.${descriptionLine}

## ${SHARED_POLICY_TITLE}

${SHARED_POLICY_BULLETS.map((line) => `- ${line}`).join('\n')}

## Cursor Runtime Notes

- This always-applied project rule complements the global activation Skill at \`~/.cursor/skills-cursor/agenticos/SKILL.md\`.
- Use AgenticOS MCP tools before shell directory search, raw \`cd\`, or git branch inspection.
${STOP_HOOK_MIGRATION_BULLETS.map((line) => `- ${line}`).join('\n')}

## Stop-Hook (Optional)

If your runtime supports local stop hooks, configure \`agenticos-record-reminder\` as a local reminder. This is optional, not a canonical guardrail.

## ${TASK_INTAKE_RULE_TITLE}

${TASK_INTAKE_RULE_CONTENT}

## ${PROJECT_SWITCH_ROUTING_TITLE}

${PROJECT_SWITCH_ROUTING_CONTENT}

## Guardrail Protocol (MANDATORY)

Before implementation edits, confirm session/project alignment with \`agenticos_status\`; if no session project is bound or the bound project is not the intended one, call \`agenticos_switch\`.

For implementation-affecting work:

1. call \`agenticos_preflight\`; if the result is \`REDIRECT\`, call \`agenticos_branch_bootstrap\` and continue in the returned worktree
2. after the issue worktree is active, perform the normal startup load and record \`agenticos_issue_bootstrap\`
3. rerun \`agenticos_preflight\` in that worktree before editing
4. call \`agenticos_edit_guard\` immediately before implementation edits
5. before PR creation or merge, call \`agenticos_pr_scope_check\`

If any guardrail command returns \`BLOCK\`, stop and resolve the blocking reason before continuing.

## MANDATORY: Recording Protocol

> All session activity MUST be recorded. If you skip this, context is lost forever.

**During session**: After completing any meaningful unit of work, call \`agenticos_record\` with summary, decisions, outcomes, pending, and current_task.

**Before session ends**: Call \`agenticos_record\` with complete summary, then \`agenticos_save\` to commit to Git.

## Session Start Protocol

On session start:

1. Call \`agenticos_status\` to confirm current project and task
2. If not on \`${name}\` project, call \`agenticos_switch\`
3. Read \`.project.yaml\`, \`${contextPaths.quickStartPath}\`, and \`${contextPaths.statePath}\`
4. If implementation work requested, enter Guardrail Protocol before editing
5. Greet with: project name, last progress, pending items, suggested next step
`;
}

export function renderCursorProjectRule(
  name: string,
  description: string,
  paths?: Partial<ManagedProjectContextDisplayPaths>,
): string {
  const withoutHash = renderCursorProjectRuleWithoutHash(name, description, paths);
  const hash = sha256(withoutHash);
  return insertAfterYamlFrontmatter(
    withoutHash,
    `<!-- agenticos-skill-managed-sha256: ${hash} -->\n`,
  );
}

export function inspectCursorProjectRule(
  content: string | null,
  name: string,
  description: string,
  paths?: Partial<ManagedProjectContextDisplayPaths>,
): CursorProjectRuleInspection {
  const expectedVersion = CURSOR_PROJECT_RULE_TEMPLATE_VERSION;

  if (content === null) {
    return {
      status: 'missing',
      installedVersion: null,
      expectedVersion,
      detail: 'Cursor project rule is not installed.',
    };
  }

  const installedVersion = extractTemplateVersion(content);
  const storedHash = extractStoredHash(content);
  const withoutHash = stripHashMarker(content);
  const expectedContent = renderCursorProjectRule(name, description, paths);
  const expectedWithoutHash = stripHashMarker(expectedContent);

  if (storedHash === null) {
    return {
      status: 'stale-managed',
      installedVersion,
      expectedVersion,
      detail: 'Cursor project rule is missing the managed sha256 marker.',
    };
  }

  if (sha256(withoutHash) !== storedHash) {
    return {
      status: 'modified-user',
      installedVersion,
      expectedVersion,
      detail: 'Cursor project rule was modified locally and no longer matches the managed template.',
    };
  }

  if (installedVersion === null || installedVersion < expectedVersion) {
    return {
      status: 'stale-managed',
      installedVersion,
      expectedVersion,
      detail: `Cursor project rule template v${installedVersion ?? 'unknown'} is older than expected v${expectedVersion}.`,
    };
  }

  if (withoutHash === expectedWithoutHash) {
    return {
      status: 'current',
      installedVersion: installedVersion ?? expectedVersion,
      expectedVersion,
      detail: `Cursor project rule is current at v${expectedVersion}.`,
    };
  }

  return {
    status: 'modified-user',
    installedVersion,
    expectedVersion,
    detail: 'Cursor project rule was modified locally and no longer matches the managed template.',
  };
}

export function upgradeCursorProjectRule(
  existingPath: string,
  name: string,
  description: string,
  paths?: Partial<ManagedProjectContextDisplayPaths>,
  options: { force?: boolean } = {},
): string {
  let existingContent: string | null = null;
  try {
    existingContent = readFileSync(existingPath, 'utf-8');
  } catch {
    existingContent = null;
  }

  const inspection = inspectCursorProjectRule(existingContent, name, description, paths);
  if (inspection.status === 'modified-user' && !options.force) {
    return existingContent!;
  }

  if (inspection.status === 'current') {
    return existingContent!;
  }

  return renderCursorProjectRule(name, description, paths);
}

export function cursorProjectRuleUpgradeStatus(
  content: string | null,
  name: string,
  description: string,
  paths?: Partial<ManagedProjectContextDisplayPaths>,
): 'missing' | 'current' | 'stale' {
  const inspection = inspectCursorProjectRule(content, name, description, paths);
  if (inspection.status === 'missing') return 'missing';
  if (inspection.status === 'current') return 'current';
  return 'stale';
}
