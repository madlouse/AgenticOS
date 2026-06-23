import { readFile, writeFile } from 'fs/promises';
import { readFileSync } from 'fs';
import { joinDisplayPath, type ManagedProjectContextDisplayPaths } from './agent-context-paths.js';
import { STOP_HOOK_MIGRATION_BULLETS } from './stop-hook-guidance.js';

/**
 * Current template version. Increment when templates change.
 * Used for auto-upgrade on project switch.
 */
export const CURRENT_TEMPLATE_VERSION = 18;

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
  ...STOP_HOOK_MIGRATION_BULLETS,
] as const;

export const CLAUDE_ADAPTER_LINES = [
  '`CLAUDE.md` is the Claude Code adapter surface for this project.',
  'It must expose the same canonical policy as other agent adapters while allowing Claude-specific operator guidance.',
] as const;

export const CLAUDE_RUNTIME_GUIDANCE_TITLE = 'Claude Runtime Notes';
export const CLAUDE_RUNTIME_GUIDANCE_BULLETS = [
  'Claude CLI-managed user MCP config is the canonical Claude bootstrap surface.',
  'Claude-specific stop hooks remain optional local stop-hook reminders rather than canonical guardrails.',
  ...STOP_HOOK_MIGRATION_BULLETS,
] as const;

export const TASK_INTAKE_RULE_TITLE = 'Task Intake Rule';
export const TASK_INTAKE_RULE_CONTENT = `**Before writing any code or plan, verify three things:**

1. **Intent**: What is the operator actually trying to achieve? (Not what they said — what they mean)
2. **Data Source**: What source should I trust? Do not assume; verify.
3. **Scope**: Can this be done in one session? If not, where are the checkpoints?

If any of these cannot be answered clearly, **stop and ask**. Do not proceed with fuzzy assumptions.

Once intent is resolved, collapse it into a clean execution objective. Do not carry the full intake rubric through every later step.` as const;

export const PROJECT_SWITCH_ROUTING_TITLE = 'Project Switch Routing';
export const PROJECT_SWITCH_ROUTING_CONTENT = `When the operator asks to switch, enter, or continue an AgenticOS project, including phrases such as "switch project", "enter project", "continue project", "切换项目", "进入项目", or "继续项目", route through AgenticOS MCP before filesystem discovery.

1. If AgenticOS MCP tools are not visible yet, first use deferred tool discovery for AgenticOS MCP tools; in Codex-like clients, use \`tool_search\` before shell directory search.
2. If \`agenticos_switch\` is available, call it before running shell commands to locate project directories.
3. Use the returned project path / filesystem workdir as the explicit working directory for subsequent shell commands.
4. Treat \`agenticos_switch\` as a logical AgenticOS binding: it carries project identity, injected markdown startup surfaces, and explicit workdir guidance; it does not mutate the parent shell cwd or reload native runtime config that the agent loaded from its launch root.
5. For full native runtime activation, launch or relaunch the agent rooted at the returned project path so adapter files, commands, subagents, hooks, permissions, and settings come from that project.
6. Claude Code can load switched-project markdown memory without changing cwd by starting with \`CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude --add-dir <project>\`, but this loads markdown memory only, not \`.claude/commands\`, \`.claude/agents\`, hooks, permissions, or settings.
7. Fall back to shell directory search only when AgenticOS MCP is unavailable or \`agenticos_switch\` cannot resolve the requested project.` as const;

export const LIFECYCLE_IMPACT_GATE_TITLE = 'Lifecycle Impact Gate';
export const LIFECYCLE_IMPACT_GATE_CONTENT = `For any change that touches setup, runtime config, storage, service wiring, generated templates, install scripts, local services, external integrations, or operator workflows, define lifecycle impact before implementation:

1. Fresh install path: required prompts, flags, defaults, generated outputs, and validation commands.
2. Existing upgrade path: whether this is code-only or requires migration, repair, aliases, compatibility handling, or operator review.
3. Change surface: source files, generated files, runtime config, local services, launch agents, external systems, and commands affected.
4. Data/config migration: exact files or fields, dry-run/apply model, rollback guidance, audit evidence, and verification command.

Do not silently mutate runtime config during a normal code upgrade. Explicit migration or repair flows must be previewable, auditable, and reversible where practical.` as const;

export const DESIGN_PHILOSOPHY_TITLE = 'Design Philosophy';

/**
 * Design Philosophy is NOT generated by default.
 * It's only retained when upgrading an existing file that already contains it.
 * This is intentional: downstream projects don't need AgenticOS design rationale.
 * Only the canonical AgenticOS project retains Design Philosophy.
 */

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

const STOP_HOOK_SECTION = `## Stop-Hook (Optional)

If your runtime supports local stop hooks, configure \`agenticos-record-reminder\` as a local reminder. This is optional, not a canonical guardrail.`;

const RECORDING_PROTOCOL = `## MANDATORY: Recording Protocol

> All session activity MUST be recorded. If you skip this, context is lost forever.

**During session**: After completing any meaningful unit of work, call \`agenticos_record\` with summary, decisions, outcomes, pending, and current_task.

**Before session ends**: Call \`agenticos_record\` with complete summary, then \`agenticos_save\` to commit to Git.`;

export function generateAgentsMd(
  name: string,
  description: string,
  paths?: Partial<ManagedProjectContextDisplayPaths>,
): string {
  const contextPaths = normalizeAgentContextPaths(paths);

  const sections = [
    {
      name: 'adapter-role',
      content: `## Adapter Role\n\n${AGENTS_ADAPTER_LINES[0]}\n${AGENTS_ADAPTER_LINES[1]}`
    },
    { name: 'canonical-policy', content: renderSharedPolicySection() },
    { name: 'continuity-contract', content: renderContinuityContractSection() },
    { name: 'runtime-notes', content: renderRuntimeGuidanceSection(AGENTS_RUNTIME_GUIDANCE_TITLE, AGENTS_RUNTIME_GUIDANCE_BULLETS) },
    { name: 'stop-hook', content: STOP_HOOK_SECTION },
    {
      name: 'task-intake-rule',
      content: `## ${TASK_INTAKE_RULE_TITLE}\n\n${TASK_INTAKE_RULE_CONTENT}`
    },
    {
      name: 'project-switch-routing',
      content: `## ${PROJECT_SWITCH_ROUTING_TITLE}\n\n${PROJECT_SWITCH_ROUTING_CONTENT}`
    },
    {
      name: 'lifecycle-impact-gate',
      content: `## ${LIFECYCLE_IMPACT_GATE_TITLE}\n\n${LIFECYCLE_IMPACT_GATE_CONTENT}`
    },
    {
      name: 'guardrail-protocol',
      content: `## Guardrail Protocol (MANDATORY)

Before implementation edits, confirm session/project alignment with \`agenticos_status\`; if no session project is bound or the bound project is not the intended one, call \`agenticos_switch\`.

For implementation-affecting work, the fastest path is one call to \`agenticos_issue_start\` (issue_id, slug, repo_path, issue_title, and optional declared_target_files). It drives the startup chain — steps 1–4 below, plus \`agenticos_edit_guard\` when declared_target_files are supplied — and stops at the first \`BLOCK\`, returning the created worktree and per-step evidence. The individual steps remain available and are exactly what \`agenticos_issue_start\` runs:

1. call \`agenticos_preflight\`; if the result is \`REDIRECT\`, call \`agenticos_branch_bootstrap\` and continue in the returned worktree
2. after the issue worktree is active, perform the normal startup load and record \`agenticos_issue_bootstrap\`
3. rerun \`agenticos_preflight\` in that worktree before editing
4. call \`agenticos_edit_guard\` immediately before implementation edits
5. before PR creation or merge, call \`agenticos_pr_scope_check\` (this step is not part of \`agenticos_issue_start\`)

If any guardrail command returns \`BLOCK\`, stop and resolve the blocking reason before continuing.`
    },
    { name: 'recording-protocol', content: RECORDING_PROTOCOL },
    {
      name: 'session-start-protocol',
      content: `## Session Start Protocol

On session start:

1. Call \`agenticos_status\` to confirm current project and task
2. If not on \`${name}\` project, call \`agenticos_switch\`
3. Read \`.project.yaml\`, \`${contextPaths.quickStartPath}\`, and \`${contextPaths.statePath}\`
4. If implementation work requested, enter Guardrail Protocol before editing
5. Greet with: project name, last progress, pending items, suggested next step`
    },
  ];

  const markedContent = sections
    .map(({ name, content }) => wrapStandardSection(name, content))
    .join('\n');

  return `${VERSION_MARKER}
# AGENTS.md — ${name}

${markedContent}
`;
}

// ---------------------------------------------------------------------------
// Section markers for module-level merge
// ---------------------------------------------------------------------------

/**
 * Section marker format for module-level merge.
 * Standard sections get updated from template on upgrade while keeping
 * existing lines that are not already in the template.
 * Project-specific sections are kept from the existing file on upgrade.
 */
const SECTION_MARKER_PREFIX = '<!-- agenticos-section: ';
const SECTION_MARKER_SUFFIX = ' -->';
const SECTION_END_MARKER = '<!-- /agenticos-section -->';

/**
 * Define which sections are standard merge targets vs project-specific preserves.
 * Standard sections: protocol-related, should be kept up-to-date with canonical policy.
 * Project-specific sections: domain knowledge, user entry contracts, project rules.
 */
export const STANDARD_SECTION_NAMES = [
  'adapter-role',
  'canonical-policy',
  'runtime-notes',
  'stop-hook',
  'task-intake-rule',
  'project-switch-routing',
  'lifecycle-impact-gate',
  'guardrail-protocol',
  'recording-protocol',
  'session-start-protocol',
] as const;

/** Additional standard sections for AGENTS.md only */
const AGENTS_ONLY_STANDARD_SECTIONS = ['continuity-contract'] as const;
const ALL_STANDARD_SECTION_NAMES = [
  ...STANDARD_SECTION_NAMES,
  ...AGENTS_ONLY_STANDARD_SECTIONS,
] as const;

/**
 * Map section names to human-readable titles for template generation.
 * Standard sections use canonical titles.
 */
const SECTION_TITLES: Record<string, string> = {
  'adapter-role': 'Adapter Role',
  'canonical-policy': 'Canonical Policy (Shared Across Agents)',
  'continuity-contract': 'Continuity Contract',
  'runtime-notes': 'Claude Runtime Notes',
  'stop-hook': 'Stop-Hook (Optional)',
  'task-intake-rule': 'Task Intake Rule',
  'project-switch-routing': 'Project Switch Routing',
  'lifecycle-impact-gate': 'Lifecycle Impact Gate',
  'guardrail-protocol': 'Guardrail Protocol (MANDATORY)',
  'recording-protocol': 'MANDATORY: Recording Protocol',
  'session-start-protocol': 'Session Start Protocol',
};

const STANDARD_TITLE_ALIASES: Record<string, string[]> = {
  'adapter-role': ['Adapter Role'],
  'canonical-policy': ['Canonical Policy (Shared Across Agents)', 'Canonical Policy'],
  'continuity-contract': ['Continuity Contract'],
  'runtime-notes': ['Claude Runtime Notes', 'Codex / Generic Runtime Notes'],
  'stop-hook': ['Stop-Hook (Optional)'],
  'task-intake-rule': ['Task Intake Rule'],
  'project-switch-routing': ['Project Switch Routing'],
  'lifecycle-impact-gate': ['Lifecycle Impact Gate'],
  'guardrail-protocol': ['Guardrail Protocol (MANDATORY)', 'Guardrail Protocol'],
  'recording-protocol': ['MANDATORY: Recording Protocol', 'Recording Protocol (MANDATORY)', 'Recording Protocol'],
  'session-start-protocol': ['Session Start Protocol'],
};
const STANDARD_SECTION_NAME_BY_TITLE = new Map(
  Object.entries(STANDARD_TITLE_ALIASES).flatMap(([sectionName, titles]) =>
    titles.map((title) => [title, sectionName] as const)
  )
);

function isStandardSectionName(sectionName: string): boolean {
  return (ALL_STANDARD_SECTION_NAMES as readonly string[]).includes(sectionName);
}

function isStandardSectionTitle(title: string): boolean {
  return Object.values(STANDARD_TITLE_ALIASES).some((titles) => titles.includes(title));
}

/** Parse section markers from existing content */
function parseSections(content: string): Map<string, { marker: string; title: string; content: string }> {
  const sections = new Map<string, { marker: string; title: string; content: string }>();
  const regex = new RegExp(
    `${SECTION_MARKER_PREFIX}([a-z-]+)\\s*-->\n(.*?)${SECTION_END_MARKER}`,
    'gs'
  );
  let match;
  while ((match = regex.exec(content)) !== null) {
    const [, sectionName, body] = match;
    const titleMatch = body.match(/^## (.+)\n/);
    const title = titleMatch ? titleMatch[1] : sectionName;
    sections.set(sectionName, {
      marker: SECTION_MARKER_PREFIX + sectionName + SECTION_MARKER_SUFFIX,
      title,
      content: body.trim(),
    });
  }
  return sections;
}

/** Wrap content with section markers for standard sections */
function wrapStandardSection(sectionName: string, content: string): string {
  return `${SECTION_MARKER_PREFIX}${sectionName}${SECTION_MARKER_SUFFIX}\n${content}\n${SECTION_END_MARKER}`;
}

function normalizeMergeLine(line: string): string {
  return line.trim();
}

function mergeStandardSectionContent(templateContent: string, existingContent: string): string {
  const templateLines = templateContent.trimEnd().split('\n');
  const existingLines = existingContent.trimEnd().split('\n');
  const templateLineSet = new Set(templateLines.map(normalizeMergeLine).filter(Boolean));
  const templateTitle = templateLines.find((line) => line.startsWith('## '))?.trim();

  const additions: string[] = [];
  for (const line of existingLines) {
    const normalized = normalizeMergeLine(line);

    if (!normalized) {
      continue;
    }

    if (line.startsWith('## ') && line.trim() === templateTitle) {
      continue;
    }

    if (line.startsWith('## ') && isStandardSectionTitle(line.replace(/^## /, '').trim())) {
      continue;
    }

    if (templateLineSet.has(normalized)) {
      continue;
    }

    additions.push(line);
  }

  if (additions.length === 0) {
    return templateContent;
  }

  return `${templateContent.trimEnd()}\n\n${additions.join('\n')}`;
}

function extractLegacyStandardAdditions(
  title: string,
  sectionLines: string[],
  templateSections: Map<string, { marker: string; title: string; content: string }>,
): string[] {
  const sectionName = STANDARD_SECTION_NAME_BY_TITLE.get(title);
  const templateSection = sectionName ? templateSections.get(sectionName) : undefined;
  const templateLineSet = new Set(
    (templateSection?.content || '')
      .split('\n')
      .map(normalizeMergeLine)
      .filter(Boolean)
  );

  const additions: string[] = [];
  for (const line of sectionLines.slice(1)) {
    const normalized = normalizeMergeLine(line);
    if (!normalized) {
      continue;
    }
    if (templateLineSet.has(normalized)) {
      continue;
    }
    additions.push(line);
  }
  return additions;
}

// ---------------------------------------------------------------------------
// CLAUDE.md template
// ---------------------------------------------------------------------------

function buildAdapterRoleSection(): string {
  return `## Adapter Role

${CLAUDE_ADAPTER_LINES[0]}
${CLAUDE_ADAPTER_LINES[1]}`;
}

function buildStopHookSection(): string {
  return `## Stop-Hook (Optional)

If your runtime supports local stop hooks, configure \`agenticos-record-reminder\` as a local reminder. This is optional, not a canonical guardrail.`;
}

export function generateClaudeMd(
  name: string,
  description: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _state?: any,
  paths?: Partial<ManagedProjectContextDisplayPaths>,
): string {
  const contextPaths = normalizeAgentContextPaths(paths);

  const sections = [
    { name: 'adapter-role', content: buildAdapterRoleSection() },
    { name: 'canonical-policy', content: renderSharedPolicySection() },
    { name: 'runtime-notes', content: renderRuntimeGuidanceSection(CLAUDE_RUNTIME_GUIDANCE_TITLE, CLAUDE_RUNTIME_GUIDANCE_BULLETS) },
    { name: 'stop-hook', content: buildStopHookSection() },
    {
      name: 'task-intake-rule',
      content: `## ${TASK_INTAKE_RULE_TITLE}\n\n${TASK_INTAKE_RULE_CONTENT}`
    },
    {
      name: 'project-switch-routing',
      content: `## ${PROJECT_SWITCH_ROUTING_TITLE}\n\n${PROJECT_SWITCH_ROUTING_CONTENT}`
    },
    {
      name: 'lifecycle-impact-gate',
      content: `## ${LIFECYCLE_IMPACT_GATE_TITLE}\n\n${LIFECYCLE_IMPACT_GATE_CONTENT}`
    },
    {
      name: 'guardrail-protocol',
      content: `## Guardrail Protocol (MANDATORY)

Before implementation edits, confirm session/project alignment with \`agenticos_status\`; if no session project is bound or the bound project is not the intended one, call \`agenticos_switch\`.

For implementation-affecting work, the fastest path is one call to \`agenticos_issue_start\` (issue_id, slug, repo_path, issue_title, and optional declared_target_files). It drives the startup chain — steps 1–4 below, plus \`agenticos_edit_guard\` when declared_target_files are supplied — and stops at the first \`BLOCK\`, returning the created worktree and per-step evidence. The individual steps remain available and are exactly what \`agenticos_issue_start\` runs:

1. call \`agenticos_preflight\`; if the result is \`REDIRECT\`, call \`agenticos_branch_bootstrap\` and continue in the returned worktree
2. after the issue worktree is active, perform the normal startup load and record \`agenticos_issue_bootstrap\`
3. rerun \`agenticos_preflight\` in that worktree before editing
4. call \`agenticos_edit_guard\` immediately before implementation edits
5. before PR creation or merge, call \`agenticos_pr_scope_check\` (this step is not part of \`agenticos_issue_start\`)

If any guardrail command returns \`BLOCK\`, stop and resolve the blocking reason before continuing.`
    },
    {
      name: 'recording-protocol',
      content: `## MANDATORY: Recording Protocol

> All session activity MUST be recorded. If you skip this, context is lost forever.

**During session**: After completing any meaningful unit of work, call \`agenticos_record\` with summary, decisions, outcomes, pending, and current_task.

**Before session ends**: Call \`agenticos_record\` with complete summary, then \`agenticos_save\` to commit to Git.`
    },
    {
      name: 'session-start-protocol',
      content: `## Session Start Protocol

On session start:

1. Call \`agenticos_status\` to confirm current project and task
2. If not on \`${name}\` project, call \`agenticos_switch\`
3. Read \`.project.yaml\`, \`${contextPaths.quickStartPath}\`, and \`${contextPaths.statePath}\`
4. If implementation work requested, enter Guardrail Protocol before editing
5. Greet with: project name, last progress, pending items, suggested next step`
    },
  ];

  const markedContent = sections
    .map(({ name, content }) => wrapStandardSection(name, content))
    .join('\n');

  return `${VERSION_MARKER}
# CLAUDE.md — ${name}

${markedContent}
`;
}

/** @deprecated State is now in .context/state.yaml, not in CLAUDE.md */
export interface StateYaml {
  session?: { last_backup?: string };
  current_task?: { title?: string; status?: string } | null;
  working_memory?: { facts?: string[]; decisions?: string[]; pending?: string[] };
}

// Known project-specific section titles that should be preserved from existing files
const PROJECT_SPECIFIC_TITLES = [
  'Purpose',
  'Read Order',
  'Command Contract',
  'Secret Contract',
  'Resume Contract',
  'Compatibility Contract',
  'Install Contract',
  'Provider Lifecycle Contract',
  'Design Rules',
	  'Cross-Agent Handoff',
	  'Git Development Protocol',
	  'GitHub Development Protocol',
  'Editing Scope',
  'Session Recording',
  'What Must Stay True',
  'Implementation Policy',
  'Verification',
  'Navigation',
];

/** Extract project-specific sections from existing file content.
 * Sections that are NOT in STANDARD_SECTION_NAMES and match PROJECT_SPECIFIC_TITLES
 * should be preserved from existing content.
 */
function extractProjectSpecificSections(existingContent: string, templateContent?: string): string[] {
  const preservedSections: string[] = [];
  const templateSections = templateContent ? parseSections(templateContent) : new Map();
  const lines = existingContent.split('\n');
  let currentSection: string[] = [];

  const flushCurrentSection = () => {
    if (currentSection.length === 0) {
      return;
    }

    const title = currentSection[0].match(/^## ([^`]+)$/)?.[1]?.trim() ?? '';

    if (isStandardSectionTitle(title)) {
      const standardAdditions = extractLegacyStandardAdditions(title, currentSection, templateSections);
      if (standardAdditions.length > 0) {
        preservedSections.push([currentSection[0], '', ...standardAdditions].join('\n'));
      }
    } else {
      const isProjectSpecific = PROJECT_SPECIFIC_TITLES.some(
        psTitle => title.includes(psTitle) || psTitle.includes(title)
      );
      const isLegacyProtocolTitle = title.includes('Guardrail Protocol') || title.includes('Recording Protocol');

      if (isProjectSpecific || !isLegacyProtocolTitle) {
        // Unknown sections default to preserved so a new downstream section title
        // cannot be lost merely because AgenticOS does not know its name yet.
        preservedSections.push(currentSection.join('\n'));
      }
    }

    currentSection = [];
  };

  for (const line of lines) {
    const sectionMatch = line.match(/^## ([^`]+)$/);
    if (sectionMatch) {
      flushCurrentSection();
      currentSection = [line];
    } else if (currentSection.length > 0) {
      currentSection.push(line);
    }
  }

  flushCurrentSection();

  return preservedSections;
}

/** Merge template and existing content at section level.
 * Standard sections are updated from template while preserving existing
 * project customizations that were added inside those sections.
 * Project-specific sections are preserved from existing file.
 */
export function mergeSections(
  templateContent: string,
  existingContent: string | null,
): string {
  // If no existing content, use template
  if (!existingContent) {
    return templateContent;
  }

  // Parse sections from existing content
  const existingSections = parseSections(existingContent);
  const templateSections = parseSections(templateContent);

  const resultLines: string[] = [];
  const processedSectionNames = new Set<string>();

  // Process template sections: merge standard ones, keep project-specific sections.
  const templateEntries = Array.from(templateSections.entries());
  for (const [sectionName, templateSection] of templateEntries) {
    const existingSection = existingSections.get(sectionName);
    const isStandard = isStandardSectionName(sectionName);

    if (isStandard) {
      const content = existingSection
        ? mergeStandardSectionContent(templateSection.content, existingSection.content)
        : templateSection.content;
      resultLines.push(wrapStandardSection(sectionName, content));
      processedSectionNames.add(sectionName);
    } else if (existingSection) {
      // Preserve non-standard section from existing
      resultLines.push(wrapStandardSection(sectionName, existingSection.content));
      processedSectionNames.add(sectionName);
    }
  }

  // Also preserve non-standard sections from existing that are not in template
  for (const [sectionName, existingSection] of existingSections.entries()) {
    if (!processedSectionNames.has(sectionName)) {
      // This is a project-specific section from existing file, preserve it
      resultLines.push(wrapStandardSection(sectionName, existingSection.content));
    }
  }

  if (resultLines.length === 0) {
    return templateContent;
  }

  // Preserve the template header (everything before the first section marker:
  // the VERSION_MARKER line + title). parseSections drops it, but without it the
  // merged file carries no <!-- agenticos-template: vN --> marker and is detected
  // as stale forever — so adopt "upgraded" it to still-stale content (#551).
  const headerEnd = templateContent.indexOf(SECTION_MARKER_PREFIX);
  const templateHeader = headerEnd > 0 ? templateContent.slice(0, headerEnd).trimEnd() : '';
  const mergedBody = resultLines.join('\n\n');
  return templateHeader ? `${templateHeader}\n\n${mergedBody}\n` : mergedBody;
}

/** Upgrade CLAUDE.md with section-level merge.
 * Preserves project-specific content while updating standard protocol sections.
 *
 * For files WITH section markers: merge at section level
 * For files WITHOUT section markers: preserve project-specific sections
 */
export function upgradeClaudeMd(
  claudeMdPath: string,
  name: string,
  description: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _state?: any,
  paths?: Partial<ManagedProjectContextDisplayPaths>,
): string {
  // Read existing content for merge
  let existingContent: string | null = null;
  try {
    existingContent = readFileSync(claudeMdPath, 'utf-8');
  } catch {
    // File doesn't exist, generate fresh
  }

  // Generate new template
  const templateContent = generateClaudeMd(name, description, undefined, paths);

  // If existing content has section markers, do merge
  if (existingContent && existingContent.includes(SECTION_MARKER_PREFIX)) {
    return mergeSections(templateContent, existingContent);
  }

  // No section markers - extract and preserve project-specific content
  if (existingContent) {
    const preservedSections = extractProjectSpecificSections(existingContent, templateContent);

    if (preservedSections.length > 0) {
      // Append preserved sections to template
      return `${templateContent}\n\n---\n\n## Project-Specific Content (Preserved)\n\n${preservedSections.join('\n\n')}`;
    }
  }

  return templateContent;
}

/** Upgrade AGENTS.md with section-level merge.
 * Preserves project-specific content while updating standard protocol sections.
 *
 * For files WITH section markers: merge at section level
 * For files WITHOUT section markers: preserve project-specific sections
 */
export function upgradeAgentsMd(
  agentsMdPath: string,
  name: string,
  description: string,
  paths?: Partial<ManagedProjectContextDisplayPaths>,
): string {
  // Read existing content for merge
  let existingContent: string | null = null;
  try {
    existingContent = readFileSync(agentsMdPath, 'utf-8');
  } catch {
    // File doesn't exist, generate fresh
  }

  // Generate new template
  const templateContent = generateAgentsMd(name, description, paths);

  // If existing content has section markers, do merge
  if (existingContent && existingContent.includes(SECTION_MARKER_PREFIX)) {
    return mergeSections(templateContent, existingContent);
  }

  // No section markers - extract and preserve project-specific content
  if (existingContent) {
    const preservedSections = extractProjectSpecificSections(existingContent, templateContent);

    if (preservedSections.length > 0) {
      // Append preserved sections to template
      return `${templateContent}\n\n---\n\n## Project-Specific Content (Preserved)\n\n${preservedSections.join('\n\n')}`;
    }
  }

  return templateContent;
}

/** @deprecated State is now in .context/state.yaml, not in CLAUDE.md */
export async function updateClaudeMdState(
  _claudeMdPath: string,
  _state: StateYaml,
  _projectName?: string,
  _projectDescription?: string,
): Promise<{ updated: boolean; created: boolean }> {
  // Since v14, state is kept in .context/state.yaml, not in CLAUDE.md
  return { updated: false, created: false };
}
