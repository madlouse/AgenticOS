import { describe, expect, it } from 'vitest';
import { resolveContextPolicyPlan } from '../context-policy-plan.js';
import { resolveContinuitySurfacePlan } from '../continuity-surface.js';

describe('resolveContinuitySurfacePlan', () => {
  it('returns the full tracked continuity set for private_continuity', () => {
    const contextPlan = resolveContextPolicyPlan({
      projectName: 'Private Project',
      projectPath: '/workspace/private-project',
      repoRoot: '/workspace/private-project',
      projectYaml: {
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
        },
      },
    });

    const plan = resolveContinuitySurfacePlan(contextPlan, {
      include_claude_state_mirror: true,
      include_agents_guidance: true,
    });

    expect(plan.policy).toBe('private_continuity');
    expect(plan.tracked_continuity_paths).toEqual([
      '.project.yaml',
      '.context/quick-start.md',
      '.context/state.yaml',
      '.context/conversations/',
      'knowledge/',
      'tasks/',
    ]);
    expect(plan.optional_guidance_paths).toEqual(['CLAUDE.md', 'AGENTS.md']);
    expect(plan.excluded_paths).toContain('.context/.last_record');
    expect(plan.excluded_paths).toContain('.private/conversations/');
    expect(plan.unsupported_reasons).toEqual([]);
  });

  it('does not widen public_distilled to full continuity', () => {
    const contextPlan = resolveContextPolicyPlan({
      projectName: 'Public Project',
      projectPath: '/workspace/public-project',
      repoRoot: '/workspace/public-project',
      projectYaml: {
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
        },
      },
    });

    const plan = resolveContinuitySurfacePlan(contextPlan);

    expect(plan.policy).toBe('public_distilled');
    expect(plan.tracked_continuity_paths).toEqual([]);
    expect(plan.optional_guidance_paths).toEqual([]);
  });

  it('fails closed when a required tracked continuity path escapes the repo root', () => {
    const contextPlan = resolveContextPolicyPlan({
      projectName: 'Escaping Project',
      projectPath: '/workspace/project',
      repoRoot: '/workspace/project',
      projectYaml: {
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
        },
        agent_context: {
          tasks: '../shared-tasks/',
        },
      },
    });

    const plan = resolveContinuitySurfacePlan(contextPlan);

    expect(plan.unsupported_reasons).toContain('tasks path escapes repo root: /workspace/shared-tasks/');
  });

  it('fails closed when a required tracked continuity path escapes the project root but remains inside the repo', () => {
    const contextPlan = resolveContextPolicyPlan({
      projectName: 'Nested Project',
      projectPath: '/workspace/repo/projects/app',
      repoRoot: '/workspace/repo',
      projectYaml: {
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
        },
        agent_context: {
          tasks: '../../shared-tasks/',
        },
      },
    });

    const plan = resolveContinuitySurfacePlan(contextPlan);

    expect(plan.unsupported_reasons).toContain('tasks path escapes project root: /workspace/repo/shared-tasks/');
  });
});
