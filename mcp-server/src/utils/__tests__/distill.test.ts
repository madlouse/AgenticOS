import { describe, expect, it } from 'vitest';
import {
  AGENTS_ADAPTER_LINES,
  AGENTS_RUNTIME_GUIDANCE_TITLE,
  CLAUDE_ADAPTER_LINES,
  CLAUDE_RUNTIME_GUIDANCE_TITLE,
  CURRENT_TEMPLATE_VERSION,
  LIFECYCLE_IMPACT_GATE_CONTENT,
  LIFECYCLE_IMPACT_GATE_TITLE,
  PROJECT_SWITCH_ROUTING_CONTENT,
  PROJECT_SWITCH_ROUTING_TITLE,
  SHARED_POLICY_BULLETS,
  SHARED_POLICY_TITLE,
  TASK_INTAKE_RULE_TITLE,
  generateAgentsMd,
  generateClaudeMd,
  upgradeClaudeMd,
  upgradeAgentsMd,
  updateClaudeMdState,
  extractTemplateVersion,
  mergeSections,
  STANDARD_SECTION_NAMES,
} from '../distill.js';
import { writeFile, unlink, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { STOP_HOOK_MIGRATION_BULLETS } from '../stop-hook-guidance.js';

describe('distill templates', () => {
  it('generates AGENTS.md with the current template version and minimal required sections', () => {
    const content = generateAgentsMd('Demo Project', 'Test project');

    expect(CURRENT_TEMPLATE_VERSION).toBe(16);
    expect(content).toContain('<!-- agenticos-template: v16 -->');
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
    expect(content).toContain(`## ${PROJECT_SWITCH_ROUTING_TITLE}`);
    expect(content).toContain(PROJECT_SWITCH_ROUTING_CONTENT);
    expect(content).toContain('tool_search');
    expect(content).toContain('切换项目');
    expect(content).toContain('进入项目');
    expect(content).toContain('continue project');
    expect(content).toContain('Fall back to shell directory search only when AgenticOS MCP is unavailable');
    expect(content).toContain(`## ${LIFECYCLE_IMPACT_GATE_TITLE}`);
    expect(content).toContain(LIFECYCLE_IMPACT_GATE_CONTENT);
    expect(content).toContain('Fresh install path');
    expect(content).toContain('Existing upgrade path');
    expect(content).toContain('Do not silently mutate runtime config');
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

    expect(CURRENT_TEMPLATE_VERSION).toBe(16);
    expect(content).toContain('<!-- agenticos-template: v16 -->');
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
    expect(content).toContain(`## ${PROJECT_SWITCH_ROUTING_TITLE}`);
    expect(content).toContain('tool_search');
    expect(content).toContain('switch project');
    expect(content).toContain('继续项目');
    expect(content).toContain(`## ${LIFECYCLE_IMPACT_GATE_TITLE}`);
    expect(content).toContain('Fresh install path');
    expect(content).toContain('Existing upgrade path');
    expect(content).toContain('previewable, auditable');
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
    expect(content).toContain('<!-- agenticos-section: lifecycle-impact-gate -->');
    expect(content).toContain('<!-- agenticos-section: guardrail-protocol -->');
    expect(content).toContain('<!-- agenticos-section: recording-protocol -->');

    // All standard sections should be marked
    expect(STANDARD_SECTION_NAMES.length).toBe(10);
  });

  it('mergeSections preserves project-specific content from existing file', () => {
    const existingContent = `<!-- agenticos-template: v13 -->
# CLAUDE.md — Existing Project

<!-- agenticos-section: adapter-role -->
## Adapter Role
Existing adapter role content
<!-- /agenticos-section -->

<!-- agenticos-section: custom-command-contract -->
## Command Contract

- Project-specific command contract content that should be preserved
- More project-specific rules
<!-- /agenticos-section -->

<!-- agenticos-section: canonical-policy -->
## Canonical Policy (Shared Across Agents)
Old canonical policy
<!-- /agenticos-section -->
`;

    const templateContent = generateClaudeMd('Existing Project', '');

    // Existing file has old canonical policy, new template has new
    // The standard section should be replaced
    expect(mergeSections(templateContent, existingContent)).toContain('This project has one canonical AgenticOS execution policy');

    // The non-standard section should be preserved
    expect(mergeSections(templateContent, existingContent)).toContain('Project-specific command contract');
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

      // Should have the current template marker
      expect(result).toContain('v16');
    } finally {
      await unlink(tempPath);
    }
  });
});

describe('merge sections edge cases', () => {
  it('mergeSections with null existing content returns template', () => {
    const template = generateClaudeMd('Test', '');
    const result = mergeSections(template, null);
    expect(result).toBe(template);
  });

  it('mergeSections with empty string returns template', () => {
    const template = generateClaudeMd('Test', '');
    const result = mergeSections(template, '');
    expect(result).toBe(template);
  });

  it('mergeSections without section markers falls back to the template content', () => {
    expect(mergeSections('plain template', 'plain existing')).toBe('plain template');
  });

  it('mergeSections with existing section markers preserves project-specific sections', () => {
    const template = generateClaudeMd('Test', '');
    const existing = `<!-- agenticos-template: v13 -->
# CLAUDE.md — Test

<!-- agenticos-section: canonical-policy -->
## Canonical Policy
Old policy content
<!-- /agenticos-section -->

<!-- agenticos-section: custom-project-section -->
## Custom Project Section

- Project-specific bullet
- Another bullet
<!-- /agenticos-section -->

<!-- agenticos-section: runtime-notes -->
## Claude Runtime Notes
Old runtime notes
<!-- /agenticos-section -->
`;

    const result = mergeSections(template, existing);

    // Standard section should be replaced from template
    expect(result).toContain('This project has one canonical AgenticOS execution policy');
    expect(result).not.toContain('Old policy content');
    expect(result).not.toContain('Old runtime notes');

    // Non-standard section should be preserved
    expect(result).toContain('Custom Project Section');
    expect(result).toContain('Project-specific bullet');
  });

  it('mergeSections replaces all standard sections', () => {
    const template = generateClaudeMd('Test', '');
    const existing = `<!-- agenticos-template: v13 -->
# CLAUDE.md — Test

<!-- agenticos-section: canonical-policy -->
## Canonical Policy
Old canonical
<!-- /agenticos-section -->

<!-- agenticos-section: guardrail-protocol -->
## Guardrail Protocol
Old guardrail
<!-- /agenticos-section -->

<!-- agenticos-section: recording-protocol -->
## Recording Protocol
Old recording
<!-- /agenticos-section -->
`;

    const result = mergeSections(template, existing);

    // All standard sections should be replaced
    expect(result).toContain('This project has one canonical AgenticOS execution policy');
    expect(result).not.toContain('Old canonical');
    expect(result).not.toContain('Old guardrail');
    expect(result).not.toContain('Old recording');
  });

  it('mergeSections preserves non-standard sections from existing', () => {
    const template = generateClaudeMd('Test', '');
    const existing = `<!-- agenticos-template: v13 -->
# CLAUDE.md — Test

<!-- agenticos-section: custom-project-section -->
## Custom Project Section

- Project-specific bullet
- Another bullet
<!-- /agenticos-section -->
`;

    const result = mergeSections(template, existing);

    // Should have template sections
    expect(result).toContain('This project has one canonical AgenticOS execution policy');

    // Should preserve non-standard section from existing
    expect(result).toContain('Custom Project Section');
    expect(result).toContain('Project-specific bullet');
  });

  it('mergeSections preserves matching non-standard template sections from existing', () => {
    const template = `<!-- agenticos-section: project-specific -->
## Project Specific

Template content
<!-- /agenticos-section -->`;
    const existing = `<!-- agenticos-section: project-specific -->
## Project Specific

Existing content
<!-- /agenticos-section -->`;

    const result = mergeSections(template, existing);

    expect(result).toContain('Existing content');
    expect(result).not.toContain('Template content');
  });

  it('mergeSections parses marker sections without markdown titles', () => {
    const template = `<!-- agenticos-section: custom -->
No title template
<!-- /agenticos-section -->`;
    const existing = `<!-- agenticos-section: custom -->
No title existing
<!-- /agenticos-section -->`;

    const result = mergeSections(template, existing);

    expect(result).toContain('No title existing');
  });
});

describe('upgrade functions edge cases', () => {
  it('upgradeClaudeMd with non-existent file generates fresh template', () => {
    const nonExistentPath = join(tmpdir(), 'non-existent-' + Date.now() + '.md');
    const result = upgradeClaudeMd(nonExistentPath, 'Test', 'Test desc');

    // Should generate template without errors
    expect(result).toContain('<!-- agenticos-template: v16 -->');
    expect(result).toContain('## Adapter Role');
  });

  it('upgradeClaudeMd with file without markers preserves project sections', async () => {
    const existingContent = `<!-- agenticos-template: v13 -->
# CLAUDE.md — Legacy Project

## Adapter Role

Legacy adapter role

## Canonical Policy

Old canonical policy

## Custom Design Section

- Custom design rules

## Another Custom Section

More custom content
`;

    const tempPath = join(tmpdir(), 'test-legacy-claude.md');
    await writeFile(tempPath, existingContent, 'utf-8');

    try {
      const result = upgradeClaudeMd(tempPath, 'Legacy Project', '');

      // Should have new template content
      expect(result).toContain('v16');
      expect(result).toContain('This project has one canonical AgenticOS execution policy');

      // Should preserve custom sections
      expect(result).toContain('Custom Design Section');
      expect(result).toContain('Custom design rules');
      expect(result).toContain('Another Custom Section');
    } finally {
      await unlink(tempPath);
    }
  });

  it('upgradeAgentsMd preserves project-specific content', async () => {
    const existingContent = `<!-- agenticos-template: v13 -->
# AGENTS.md — CLI Project

## Adapter Role

CLI adapter role

## Command Contract

- Command 1
- Command 2

## Secret Contract

- Secret 1
`;

    const tempPath = join(tmpdir(), 'test-agents-upgrade.md');
    await writeFile(tempPath, existingContent, 'utf-8');

    try {
      const result = upgradeAgentsMd(tempPath, 'CLI Project', '');

      // Should have new template content
      expect(result).toContain('v16');
      expect(result).toContain('This project has one canonical AgenticOS execution policy');

      // Should preserve project-specific sections
      expect(result).toContain('Command Contract');
      expect(result).toContain('Command 1');
      expect(result).toContain('Secret Contract');
      expect(result).toContain('Secret 1');
    } finally {
      await unlink(tempPath);
    }
  });

  it('upgradeClaudeMd preserves unknown sections before legacy recording protocol headers', async () => {
    const existingContent = `<!-- agenticos-template: v13 -->
# CLAUDE.md — Legacy Project

## Custom Operations

- Keep this custom operation

## Recording Protocol

Legacy recording instructions
`;

    const tempPath = join(tmpdir(), 'test-legacy-recording-claude.md');
    await writeFile(tempPath, existingContent, 'utf-8');

    try {
      const result = upgradeClaudeMd(tempPath, 'Legacy Project', '');

      expect(result).toContain('Custom Operations');
      expect(result).toContain('Keep this custom operation');
      expect(result).not.toContain('Legacy recording instructions');
    } finally {
      await unlink(tempPath);
    }
  });

  it('upgradeClaudeMd splits adjacent unknown legacy sections conservatively', async () => {
    const existingContent = `<!-- agenticos-template: v13 -->
# CLAUDE.md — Legacy Project

## First Unknown
## Second Unknown

Second body
`;

    const tempPath = join(tmpdir(), 'test-adjacent-unknown-claude.md');
    await writeFile(tempPath, existingContent, 'utf-8');

    try {
      const result = upgradeClaudeMd(tempPath, 'Legacy Project', '');

      expect(result).toContain('First Unknown');
      expect(result).toContain('Second Unknown');
      expect(result).toContain('Second body');
    } finally {
      await unlink(tempPath);
    }
  });

  it('upgradeAgentsMd with non-existent file generates fresh template', () => {
    const nonExistentPath = join(tmpdir(), 'non-existent-agents-' + Date.now() + '.md');
    const result = upgradeAgentsMd(nonExistentPath, 'Test', 'Test desc');

    expect(result).toContain('<!-- agenticos-template: v16 -->');
    expect(result).toContain('## Project Switch Routing');
  });

  it('upgradeAgentsMd with section markers uses mergeSections', async () => {
    const existingContent = `<!-- agenticos-template: v13 -->
# AGENTS.md — Marked Project

<!-- agenticos-section: canonical-policy -->
## Canonical Policy
Old canonical
<!-- /agenticos-section -->

<!-- agenticos-section: custom-agent-content -->
## Custom Agent Content

- Agent bullet
<!-- /agenticos-section -->
`;

    const tempPath = join(tmpdir(), 'test-marked-agents.md');
    await writeFile(tempPath, existingContent, 'utf-8');

    try {
      const result = upgradeAgentsMd(tempPath, 'Marked Project', '');

      expect(result).toContain('This project has one canonical AgenticOS execution policy');
      expect(result).not.toContain('Old canonical');
      expect(result).toContain('Custom Agent Content');
      expect(result).toContain('Agent bullet');
    } finally {
      await unlink(tempPath);
    }
  });

  it('upgradeClaudeMd with section markers uses mergeSections', async () => {
    const existingContent = `<!-- agenticos-template: v13 -->
# CLAUDE.md — Marked Project

<!-- agenticos-section: canonical-policy -->
## Canonical Policy
Old canonical
<!-- /agenticos-section -->

<!-- agenticos-section: custom-project-content -->
## Custom Project Content

- Project bullet
<!-- /agenticos-section -->
`;

    const tempPath = join(tmpdir(), 'test-marked-claude.md');
    await writeFile(tempPath, existingContent, 'utf-8');

    try {
      const result = upgradeClaudeMd(tempPath, 'Marked Project', '');

      // Should have section markers from template
      expect(result).toContain('<!-- agenticos-section:');
      expect(result).toContain('<!-- /agenticos-section -->');

      // Should have new canonical policy
      expect(result).toContain('This project has one canonical AgenticOS execution policy');
      expect(result).not.toContain('Old canonical');

      // Should preserve custom content
      expect(result).toContain('Custom Project Content');
      expect(result).toContain('Project bullet');
    } finally {
      await unlink(tempPath);
    }
  });
});

describe('section markers format consistency', () => {
  it('extractTemplateVersion returns parsed version or zero when absent', () => {
    expect(extractTemplateVersion('<!-- agenticos-template: v16 -->')).toBe(16);
    expect(extractTemplateVersion('# No marker')).toBe(0);
  });

  it('generateClaudeMd produces consistent marker format', () => {
    const content = generateClaudeMd('Test', '');

    // Check marker format
    expect(content).toMatch(/<!-- agenticos-section: [a-z-]+ -->/g);
    expect(content).toContain('<!-- /agenticos-section -->');

    // All standard sections should be marked
    for (const sectionName of STANDARD_SECTION_NAMES) {
      expect(content).toContain(`<!-- agenticos-section: ${sectionName} -->`);
    }
  });

  it('generateAgentsMd produces consistent marker format', () => {
    const content = generateAgentsMd('Test', '');

    // Check marker format
    expect(content).toMatch(/<!-- agenticos-section: [a-z-]+ -->/g);
    expect(content).toContain('<!-- /agenticos-section -->');

    // All standard sections should be marked
    for (const sectionName of STANDARD_SECTION_NAMES) {
      expect(content).toContain(`<!-- agenticos-section: ${sectionName} -->`);
    }
  });

  it('STANDARD_SECTION_NAMES has expected sections', () => {
    expect(STANDARD_SECTION_NAMES).toContain('adapter-role');
    expect(STANDARD_SECTION_NAMES).toContain('canonical-policy');
    expect(STANDARD_SECTION_NAMES).toContain('guardrail-protocol');
    expect(STANDARD_SECTION_NAMES).toContain('recording-protocol');
    expect(STANDARD_SECTION_NAMES).toContain('session-start-protocol');
    expect(STANDARD_SECTION_NAMES).toContain('runtime-notes');
    expect(STANDARD_SECTION_NAMES).toContain('stop-hook');
    expect(STANDARD_SECTION_NAMES).toContain('task-intake-rule');
    expect(STANDARD_SECTION_NAMES).toContain('project-switch-routing');
    expect(STANDARD_SECTION_NAMES).toContain('lifecycle-impact-gate');
  });

  it('updateClaudeMdState is a no-op because state lives in state.yaml', async () => {
    await expect(updateClaudeMdState('/tmp/CLAUDE.md', {})).resolves.toEqual({
      updated: false,
      created: false,
    });
  });
});
