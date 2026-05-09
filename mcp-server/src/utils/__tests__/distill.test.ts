import { describe, expect, it } from 'vitest';
import {
  AGENTS_ADAPTER_LINES,
  AGENTS_RUNTIME_GUIDANCE_TITLE,
  CLAUDE_ADAPTER_LINES,
  CLAUDE_RUNTIME_GUIDANCE_TITLE,
  CURRENT_TEMPLATE_VERSION,
  SHARED_POLICY_BULLETS,
  SHARED_POLICY_TITLE,
  TASK_INTAKE_RULE_TITLE,
  generateAgentsMd,
  generateClaudeMd,
  upgradeClaudeMd,
  mergeSections,
  STANDARD_SECTION_NAMES,
} from '../distill.js';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { STOP_HOOK_MIGRATION_BULLETS } from '../stop-hook-guidance.js';

describe('distill templates', () => {
  it('generates AGENTS.md with the current template version and minimal required sections', () => {
    const content = generateAgentsMd('Demo Project', 'Test project');

    expect(CURRENT_TEMPLATE_VERSION).toBe(14);
    expect(content).toContain('<!-- agenticos-template: v14 -->');
    expect(content).toContain('## Adapter Role');
    expect(content).toContain(AGENTS_ADAPTER_LINES[0]);
    expect(content).toContain(AGENTS_ADAPTER_LINES[1]);
    expect(content).toContain(`## ${SHARED_POLICY_TITLE}`);
    for (const bullet of SHARED_POLICY_BULLETS) {
      expect(content).toContain(bullet);
    }
    expect(content).toContain(`## ${AGENTS_RUNTIME_GUIDANCE_TITLE}`);
    for (const bullet of STOP_HOOK_MIGRATION_BULLETS) {
      expect(content).toContain(bullet);
    }
    expect(content).toContain('## Stop-Hook (Optional)');
    expect(content).toContain(`## ${TASK_INTAKE_RULE_TITLE}`);
    expect(content).toContain('**Intent**');
    expect(content).toContain('**Data Source**');
    expect(content).toContain('**Scope**');
    expect(content).toContain('## Guardrail Protocol (MANDATORY)');
    expect(content).toContain('agenticos_preflight');
    expect(content).toContain('agenticos_status');
    expect(content).toContain('agenticos_switch');
    expect(content).toContain('agenticos_issue_bootstrap');
    expect(content).toContain('agenticos_edit_guard');
    expect(content).toContain('agenticos_branch_bootstrap');
    expect(content).toContain('agenticos_pr_scope_check');
    expect(content).toContain('## MANDATORY: Recording Protocol');
    expect(content).toContain('agenticos_record');
    expect(content).toContain('agenticos_save');
    expect(content).toContain('## Session Start Protocol');
    expect(content).not.toContain('## Design Philosophy');
    // Should NOT contain old content
    expect(content).not.toContain('## Navigation');
    expect(content).not.toContain('## Directory Structure');
    expect(content).not.toContain('## Current State');
    expect(content).not.toContain('"command": "agenticos-record-reminder"');
  });

  it('generates CLAUDE.md with minimal required sections', () => {
    const content = generateClaudeMd('Demo Project', 'Test project');

    expect(CURRENT_TEMPLATE_VERSION).toBe(14);
    expect(content).toContain('<!-- agenticos-template: v14 -->');
    expect(content).toContain('## Adapter Role');
    expect(content).toContain(CLAUDE_ADAPTER_LINES[0]);
    expect(content).toContain(CLAUDE_ADAPTER_LINES[1]);
    expect(content).toContain(`## ${SHARED_POLICY_TITLE}`);
    for (const bullet of SHARED_POLICY_BULLETS) {
      expect(content).toContain(bullet);
    }
    expect(content).toContain(`## ${CLAUDE_RUNTIME_GUIDANCE_TITLE}`);
    for (const bullet of STOP_HOOK_MIGRATION_BULLETS) {
      expect(content).toContain(bullet);
    }
    expect(content).toContain('## Stop-Hook (Optional)');
    expect(content).toContain(`## ${TASK_INTAKE_RULE_TITLE}`);
    expect(content).toContain('**Intent**');
    expect(content).toContain('**Data Source**');
    expect(content).toContain('**Scope**');
    expect(content).toContain('## Guardrail Protocol (MANDATORY)');
    expect(content).toContain('## MANDATORY: Recording Protocol');
    expect(content).toContain('## Session Start Protocol');
    expect(content).not.toContain('## Design Philosophy');
    // Should NOT contain old content
    expect(content).not.toContain('## Navigation');
    expect(content).not.toContain('## Current State');
    expect(content).not.toContain('## Project DNA');
    expect(content).not.toContain('"command": "agenticos-record-reminder"');
  });

  it('renders configured canonical context paths in Session Start Protocol', () => {
    const content = generateAgentsMd('AgenticOS', 'Self-hosting project', {
      quickStartPath: 'standards/.context/quick-start.md',
      statePath: 'standards/.context/state.yaml',
      conversationsDir: 'standards/.context/conversations/',
      knowledgeDir: 'knowledge/',
      tasksDir: 'tasks/',
      artifactsDir: 'artifacts/',
    });

    expect(content).toContain('standards/.context/quick-start.md');
    expect(content).toContain('standards/.context/state.yaml');
    // Should NOT contain navigation table
    expect(content).not.toContain('| `.context/quick-start.md` | Quick project summary |');
    expect(content).not.toContain('## Navigation');
    expect(content).not.toContain('## Directory Structure');
  });
});

describe('section markers', () => {
  it('generates CLAUDE.md with section markers for module-level merge', () => {
    const content = generateClaudeMd('Demo Project', 'Test project');

    // Should have section markers
    expect(content).toContain('<!-- agenticos-section:');
    expect(content).toContain('<!-- /agenticos-section -->');

    // Should mark standard sections
    expect(content).toContain('<!-- agenticos-section: canonical-policy -->');
    expect(content).toContain('<!-- agenticos-section: guardrail-protocol -->');
    expect(content).toContain('<!-- agenticos-section: recording-protocol -->');

    // All standard sections should be marked
    expect(STANDARD_SECTION_NAMES.length).toBe(9);
  });

  it('mergeSections preserves project-specific content from existing file', () => {
    const existingContent = `<!-- agenticos-template: v13 -->
# CLAUDE.md — Existing Project

<!-- agenticos-section: adapter-role -->
## Adapter Role
Existing adapter role content
<!-- /agenticos-section -->

## Command Contract

- Project-specific command contract content that should be preserved
- More project-specific rules

<!-- agenticos-section: canonical-policy -->
## Canonical Policy (Shared Across Agents)
Old canonical policy
<!-- /agenticos-section -->
`;

    const templateContent = generateClaudeMd('Existing Project', '');

    // Existing file has old canonical policy, new template has new
    // The standard section should be replaced
    expect(mergeSections(templateContent, existingContent)).toContain('This project has one canonical AgenticOS execution policy');
  });

  it('upgradeClaudeMd preserves project-specific content from existing file', async () => {
    const existingContent = `<!-- agenticos-template: v13 -->
# CLAUDE.md — Agent-CLI-API

## Adapter Role

Adapter role for agent-cli-api

## Canonical Policy (Shared Across Agents)

- Old policy text

## Design Rules

### Command Contract

- 用户入口保持小写。
- \`cxb\` 对应 Codex。
- \`ccb\` 对应 Claude Code。

### Secret Contract

- 1Password 是唯一事实源。
- system-level env persistence 是禁止项

## Guardrail Protocol (MANDATORY)

Old guardrail text
`;

    // Write to temp file
    const tempPath = join(tmpdir(), 'test-claude-md-upgrade.md');
    await writeFile(tempPath, existingContent, 'utf-8');

    try {
      const result = upgradeClaudeMd(tempPath, 'Agent-CLI-API', 'CLI API project');

      // Should have new canonical policy from template
      expect(result).toContain('This project has one canonical AgenticOS execution policy');

      // Should preserve project-specific content
      expect(result).toContain('用户入口保持小写');
      expect(result).toContain('1Password 是唯一事实源');
    } finally {
      await unlink(tempPath);
    }
  });
});
