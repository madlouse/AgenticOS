import { describe, expect, it } from 'vitest';
import { resolveContextPolicyPlan, toRepoRelativePath } from '../context-policy-plan.js';

describe('resolveContextPolicyPlan', () => {
  it('resolves private_continuity tracked paths inside the repo root', () => {
    const plan = resolveContextPolicyPlan({
      projectName: 'Private Project',
      projectPath: '/workspace/private-project',
      repoRoot: '/workspace/private-project',
      projectYaml: {
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
        },
        agent_context: {
          quick_start: '.context/quick-start.md',
          current_state: '.context/state.yaml',
          conversations: '.context/conversations/',
          last_record_marker: '.context/.last_record',
          knowledge: 'knowledge/',
          tasks: 'tasks/',
          artifacts: 'artifacts/',
        },
      },
    });

    expect(plan.policy).toBe('private_continuity');
    expect(plan.rawConversationsDir).toBe('/workspace/private-project/.context/conversations/');
    expect(plan.trackedConversationsDir).toBe('/workspace/private-project/.context/conversations/');
    expect(plan.repoBoundaryViolations).toEqual([]);
  });

  it('routes public_distilled raw conversations to the private sidecar path', () => {
    const plan = resolveContextPolicyPlan({
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

    expect(plan.policy).toBe('public_distilled');
    expect(plan.rawConversationsDir).toBe('/workspace/public-project/.private/conversations');
    expect(plan.trackedConversationsDir).toBeNull();
    expect(plan.sidecarOnlyPaths).toContain('/workspace/public-project/.private/conversations');
  });

  it('records repo-boundary violations for configured paths outside the repo root', () => {
    const plan = resolveContextPolicyPlan({
      projectName: 'Escaping Project',
      projectPath: '/workspace/project',
      repoRoot: '/workspace/project',
      projectYaml: {
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
        },
        agent_context: {
          knowledge: '../shared-knowledge/',
        },
      },
    });

    expect(plan.repoBoundaryViolations).toContain('knowledge path escapes repo root: /workspace/shared-knowledge/');
  });

  it('records project-boundary violations for configured paths outside the project root but still inside the repo', () => {
    const plan = resolveContextPolicyPlan({
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

    expect(plan.projectBoundaryViolations).toContain(
      'tasks path escapes project root: /workspace/repo/shared-tasks/',
    );
    expect(plan.repoBoundaryViolations).toEqual([]);
  });
});

describe('toRepoRelativePath', () => {
  it('returns repo-relative directory paths', () => {
    expect(toRepoRelativePath('/workspace/project', '/workspace/project/tasks', { directory: true })).toBe('tasks/');
  });

  it('throws when the candidate escapes the repo root', () => {
    expect(() => toRepoRelativePath('/workspace/project', '/workspace/elsewhere/state.yaml')).toThrow('Path escapes repo root');
  });
});
