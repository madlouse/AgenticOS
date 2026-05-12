import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyYamlChanges, classifyMarkdownChanges, analyzeTemplateDiff } from '../standard-kit.js';

describe('classifyYamlChanges', () => {
  describe('template_marker_only classification', () => {
    it('detects when only template marker version differs', () => {
      const canonical = `# <!-- agenticos-template: v2 -->
meta:
  name: Test
`;
      const local = `# <!-- agenticos-template: v1 -->
meta:
  name: Test
`;
      const result = classifyYamlChanges(canonical, local, '.project.yaml');
      expect(result.classification).toBe('template_marker_only');
      expect(result.merge_recommendation).toBe('safe_to_merge');
      expect(result.confidence).toBe('high');
    });

    it('handles identical files', () => {
      const canonical = `meta:
  name: Test
`;
      const local = `meta:
  name: Test
`;
      const result = classifyYamlChanges(canonical, local, '.project.yaml');
      expect(result.classification).toBe('template_marker_only');
      expect(result.merge_recommendation).toBe('safe_to_merge');
    });
  });

  describe('project_customization classification', () => {
    it('detects project-specific field changes in .project.yaml', () => {
      const canonical = `meta:
  name: Canonical Name
  description: Canonical description
source_control:
  topology: local_directory_only
status:
  phase: planning
  next_action: Define goals
`;
      const local = `meta:
  name: My Custom Name
  description: My custom description
source_control:
  topology: github_versioned
  github_repo: owner/repo
status:
  phase: implementation
  next_action: Ship feature
`;
      const result = classifyYamlChanges(canonical, local, '.project.yaml');
      expect(result.classification).toBe('project_customization');
      expect(result.merge_recommendation).toBe('keep_as_is');
      expect(result.project_specific_areas.length).toBeGreaterThan(0);
      expect(result.standard_improvement_areas.length).toBe(0);
    });

    it('detects when local has extra fields not in canonical', () => {
      const canonical = `meta:
  name: Test
`;
      const local = `meta:
  name: Test
custom:
  field: value
`;
      const result = classifyYamlChanges(canonical, local, '.project.yaml');
      expect(result.classification).toBe('project_customization');
      expect(result.merge_recommendation).toBe('keep_as_is');
    });
  });

  describe('standard_improvement classification', () => {
    it('detects new canonical-only fields', () => {
      const canonical = `meta:
  name: Test
tech:
  languages:
    - typescript
`;
      const local = `meta:
  name: Test
`;
      const result = classifyYamlChanges(canonical, local, '.project.yaml');
      expect(result.classification).toBe('standard_improvement');
      expect(result.merge_recommendation).toBe('safe_to_merge');
      expect(result.standard_improvement_areas).toContain('tech');
    });

    it('detects agent_context path changes', () => {
      const canonical = `agent_context:
  quick_start: standards/.context/quick-start.md
  current_state: standards/.context/state.yaml
`;
      const local = `agent_context:
  quick_start: .context/quick-start.md
  current_state: .context/state.yaml
`;
      const result = classifyYamlChanges(canonical, local, '.project.yaml');
      expect(result.classification).toBe('standard_improvement');
      expect(result.merge_recommendation).toBe('safe_to_merge');
      // Fields are reported as leaf paths
      expect(result.standard_improvement_areas.some(a => a.startsWith('agent_context'))).toBe(true);
    });
  });

  describe('mixed classification', () => {
    it('detects both project-specific and standard improvement changes', () => {
      const canonical = `meta:
  name: Canonical
  description: New description
agent_context:
  quick_start: standards/.context/quick-start.md
`;
      const local = `meta:
  name: My Project
  description: My description
agent_context:
  quick_start: .context/quick-start.md
`;
      const result = classifyYamlChanges(canonical, local, '.project.yaml');
      expect(result.classification).toBe('mixed');
      expect(result.merge_recommendation).toBe('review_required');
      expect(result.project_specific_areas.length).toBeGreaterThan(0);
      expect(result.standard_improvement_areas.length).toBeGreaterThan(0);
    });
  });

  describe('state.yaml special handling', () => {
    it('preserves working_memory and session as operational state, allows memory_contract merge', () => {
      const canonical = `# <!-- agenticos-template: v1 -->
session:
  id: session-001
  agent: claude-sonnet-4.6
current_task:
  id: task-1
  title: Test task
working_memory:
  facts:
    - fact1
memory_contract:
  version: 2
`;
      const local = `# <!-- agenticos-template: v1 -->
session:
  id: local-session-999
  agent: custom-agent
current_task:
  id: task-999
  title: Local task
working_memory:
  facts:
    - local-fact1
    - local-fact2
memory_contract:
  version: 1
`;
      const result = classifyYamlChanges(canonical, local, '.context/state.yaml');
      // memory_contract change is standard_improvement, session/current_task/working_memory are preserved (skipped)
      expect(result.classification).toBe('standard_improvement');
      expect(result.merge_recommendation).toBe('safe_to_merge');
      expect(result.standard_improvement_areas).toContain('memory_contract');
      // session, current_task, working_memory are in the preserve-only category
    });

    it('keeps all operational state when only memory_contract differs', () => {
      const canonical = `# <!-- agenticos-template: v1 -->
session:
  id: canonical-session
current_task:
  title: Canonical task
memory_contract:
  version: 2
`;
      const local = `# <!-- agenticos-template: v1 -->
session:
  id: local-session
current_task:
  title: Local task
memory_contract:
  version: 1
`;
      const result = classifyYamlChanges(canonical, local, '.context/state.yaml');
      expect(result.classification).toBe('standard_improvement');
      expect(result.merge_recommendation).toBe('safe_to_merge');
      expect(result.standard_improvement_areas).toContain('memory_contract');
    });
  });
});

describe('classifyMarkdownChanges', () => {
  describe('template_marker_only classification', () => {
    it('detects when only template marker differs', () => {
      const canonical = `# <!-- agenticos-template: v2 -->
# Quick Start

## Project Snapshot
- **Project**: Test
`;
      const local = `# <!-- agenticos-template: v1 -->
# Quick Start

## Project Snapshot
- **Project**: Test
`;
      const result = classifyMarkdownChanges(canonical, local, '.context/quick-start.md');
      expect(result.classification).toBe('template_marker_only');
      expect(result.merge_recommendation).toBe('safe_to_merge');
      expect(result.confidence).toBe('high');
    });

    it('handles identical content', () => {
      const canonical = `# Quick Start

## Project Snapshot
- **Project**: Test
`;
      const local = `# Quick Start

## Project Snapshot
- **Project**: Test
`;
      const result = classifyMarkdownChanges(canonical, local, '.context/quick-start.md');
      expect(result.classification).toBe('template_marker_only');
    });
  });

  describe('project_customization classification', () => {
    it('detects project-specific sections like Key Facts', () => {
      const canonical = `# Quick Start

## Project Snapshot
- **Project**: Canonical
`;
      const local = `# Quick Start

## Project Snapshot
- **Project**: Local
- **Custom**: Local only
`;
      const result = classifyMarkdownChanges(canonical, local, '.context/quick-start.md');
      expect(result.project_specific_areas.length).toBeGreaterThan(0);
    });
  });

  describe('standard_improvement classification', () => {
    it('detects new sections in canonical', () => {
      const canonical = `# Quick Start

## New Section
Content

## Canonical Layers
- Operational state
`;
      const local = `# Quick Start

## New Section
Content
`;
      const result = classifyMarkdownChanges(canonical, local, '.context/quick-start.md');
      expect(result.standard_improvement_areas).toContain('canonical layers');
    });
  });
});

describe('analyzeTemplateDiff', () => {
  it('returns diff_lines along with classification', () => {
    const canonical = `meta:
  name: Canonical
`;
    const local = `meta:
  name: Local
`;
    const result = analyzeTemplateDiff(canonical, local, '.project.yaml');
    expect(result.diff_lines.length).toBeGreaterThan(0);
    // Diff format: "- " for removed, "+ " for added, "  " for unchanged
    expect(result.diff_lines.some(l => l.startsWith('- '))).toBe(true);
    expect(result.diff_lines.some(l => l.startsWith('+ '))).toBe(true);
    expect(['project_customization', 'mixed']).toContain(result.classification);
  });

  it('handles unknown file types gracefully', () => {
    const canonical = `some content`;
    const local = `other content`;
    const result = analyzeTemplateDiff(canonical, local, 'unknown.ext');
    expect(result.classification).toBe('unknown');
    expect(result.merge_recommendation).toBe('review_required');
  });
});