import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildConversationRoutingStatusLines,
  detectLegacyTrackedTranscriptStatus,
  resolveConversationRoutingPlan,
} from '../conversation-routing.js';
import { resolveContextPolicyPlan } from '../context-policy-plan.js';

describe('conversation routing', () => {
  it('derives a sidecar raw transcript path for public_distilled', () => {
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

    const routing = resolveConversationRoutingPlan(contextPlan);

    expect(routing.raw_conversations_display_dir).toBe('.private/conversations/');
    expect(routing.tracked_conversations_display_dir).toBe('.context/conversations/');
    expect(routing.tracked_recovery_contract).toBe('git_distilled');
    expect(routing.is_sidecar).toBe(true);
  });

  it('derives full tracked recovery for private_continuity', () => {
    const contextPlan = resolveContextPolicyPlan({
      projectName: 'Private Project',
      projectPath: '/workspace/private-project',
      repoRoot: '/workspace/private-project',
      projectYaml: {
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'private_continuity',
          github_repo: 'example/private-project',
          branch_strategy: 'github_flow',
        },
      },
    });

    const routing = resolveConversationRoutingPlan(contextPlan);

    expect(routing.raw_conversations_display_dir).toBe('.context/conversations/');
    expect(routing.tracked_conversations_dir).toBe('/workspace/private-project/.context/conversations/');
    expect(routing.tracked_recovery_contract).toBe('git_full');
    expect(routing.notes).toEqual([]);
    expect(routing.is_sidecar).toBe(false);
  });

  it('derives local-only recovery for local_private', () => {
    const contextPlan = resolveContextPolicyPlan({
      projectName: 'Local Project',
      projectPath: '/workspace/local-project',
      projectYaml: {
        source_control: {
          topology: 'local_directory_only',
          context_publication_policy: 'local_private',
        },
      },
    });

    expect(resolveConversationRoutingPlan(contextPlan).tracked_recovery_contract).toBe('local_only');
  });

  it('fails closed when the raw conversation path escapes the project root', () => {
    expect(() => resolveConversationRoutingPlan({
      policy: 'local_private',
      projectRoot: '/workspace/project',
      repoRoot: null,
      trackedContextPaths: {
        projectFile: '/workspace/project/.project.yaml',
        quickStart: '/workspace/project/.context/quick-start.md',
        state: '/workspace/project/.context/state.yaml',
        conversations: '/workspace/project/.context/conversations',
        knowledge: '/workspace/project/knowledge',
        tasks: '/workspace/project/tasks',
        lastRecord: '/workspace/project/.context/.last_record',
        artifacts: '/workspace/project/artifacts',
      },
      trackedContextDisplayPaths: {
        projectFile: '.project.yaml',
        quickStart: '.context/quick-start.md',
        state: '.context/state.yaml',
        conversations: '.context/conversations/',
        knowledge: 'knowledge/',
        tasks: 'tasks/',
        lastRecord: '.context/.last_record',
        artifacts: 'artifacts/',
      },
      rawConversationsDir: '/outside/conversations',
      trackedConversationsDir: '/workspace/project/.context/conversations',
      sidecarOnlyPaths: [],
      projectBoundaryViolations: [],
      repoBoundaryViolations: [],
    })).toThrow('Path escapes project root');
  });

  it('preserves the configured tracked conversation display path for public_distilled', () => {
    const contextPlan = resolveContextPolicyPlan({
      projectName: 'Public Project',
      projectPath: '/workspace/public-project',
      repoRoot: '/workspace/public-project',
      projectYaml: {
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
        },
        agent_context: {
          conversations: 'runtime/conversations/',
        },
      },
    });

    const routing = resolveConversationRoutingPlan(contextPlan);
    const lines = buildConversationRoutingStatusLines(routing, 'tracked_legacy_present');

    expect(routing.tracked_conversations_display_dir).toBe('runtime/conversations/');
    expect(lines.join('\n')).toContain('runtime/conversations/');
  });

  it('detects tracked legacy transcript history for public_distilled projects', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'agenticos-routing-'));
    await mkdir(join(projectRoot, '.context', 'conversations'), { recursive: true });
    await writeFile(join(projectRoot, '.context', 'conversations', '2026-04-13.md'), '# legacy\n', 'utf-8');

    const contextPlan = resolveContextPolicyPlan({
      projectName: 'Public Project',
      projectPath: projectRoot,
      repoRoot: projectRoot,
      projectYaml: {
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
        },
      },
    });

    const status = await detectLegacyTrackedTranscriptStatus(contextPlan);
    const lines = buildConversationRoutingStatusLines(resolveConversationRoutingPlan(contextPlan), status);

    expect(status).toBe('tracked_legacy_present');
    expect(lines.join('\n')).toContain('historical tracked evidence');
  });

  it('detects nested tracked legacy transcript history for public_distilled projects', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'agenticos-routing-nested-'));
    await mkdir(join(projectRoot, '.context', 'conversations', 'nested'), { recursive: true });
    await writeFile(join(projectRoot, '.context', 'conversations', 'nested', '2026-04-13.md'), '# legacy\n', 'utf-8');

    const contextPlan = resolveContextPolicyPlan({
      projectName: 'Public Project',
      projectPath: projectRoot,
      repoRoot: projectRoot,
      projectYaml: {
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
        },
      },
    });

    await expect(detectLegacyTrackedTranscriptStatus(contextPlan)).resolves.toBe('tracked_legacy_present');
  });

  it('returns none when public_distilled tracked legacy transcript directory is empty or missing', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'agenticos-routing-empty-'));
    await mkdir(join(projectRoot, '.context', 'conversations'), { recursive: true });
    const contextPlan = resolveContextPolicyPlan({
      projectName: 'Public Project',
      projectPath: projectRoot,
      repoRoot: projectRoot,
      projectYaml: {
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
        },
      },
    });

    await expect(detectLegacyTrackedTranscriptStatus(contextPlan)).resolves.toBe('none');
  });

  it('returns none when public_distilled tracked legacy transcript directory is missing', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'agenticos-routing-missing-'));
    const contextPlan = resolveContextPolicyPlan({
      projectName: 'Public Project',
      projectPath: projectRoot,
      repoRoot: projectRoot,
      projectYaml: {
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
        },
      },
    });

    await expect(detectLegacyTrackedTranscriptStatus(contextPlan)).resolves.toBe('none');
  });

  it('returns none for non-public-distilled transcript status checks', async () => {
    const contextPlan = resolveContextPolicyPlan({
      projectName: 'Local Project',
      projectPath: '/workspace/local-project',
      projectYaml: {
        source_control: {
          topology: 'local_directory_only',
          context_publication_policy: 'local_private',
        },
      },
    });

    await expect(detectLegacyTrackedTranscriptStatus(contextPlan, { tracked_transcript_dirty: true })).resolves.toBe('none');
  });

  it('returns tracked_legacy_dirty when public_distilled tracked transcripts are dirty', async () => {
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

    await expect(detectLegacyTrackedTranscriptStatus(contextPlan, { tracked_transcript_dirty: true })).resolves.toBe('tracked_legacy_dirty');
  });

  it('detects public raw routing misconfiguration even when paths differ only by trailing slash', async () => {
    const contextPlan = resolveContextPolicyPlan({
      projectName: 'Public Project',
      projectPath: '/workspace/public-project',
      repoRoot: '/workspace/public-project',
      projectYaml: {
        source_control: {
          topology: 'github_versioned',
          context_publication_policy: 'public_distilled',
        },
        agent_context: {
          conversations: '.private/conversations/',
        },
      },
    });

    await expect(detectLegacyTrackedTranscriptStatus(contextPlan)).resolves.toBe('misconfigured_public_raw_target');
  });

  it('renders status lines for dirty and misconfigured public transcript states', () => {
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
    const routing = resolveConversationRoutingPlan(contextPlan);

    expect(buildConversationRoutingStatusLines(routing, 'tracked_legacy_dirty').join('\n')).toContain('publishing them would leak');
    expect(buildConversationRoutingStatusLines(routing, 'misconfigured_public_raw_target').join('\n')).toContain('misconfigured');
  });

  it('uses the default tracked conversation display path when status fallbacks receive none', () => {
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
    const routing = {
      ...resolveConversationRoutingPlan(contextPlan),
      tracked_conversations_display_dir: null,
    };

    expect(buildConversationRoutingStatusLines(routing, 'tracked_legacy_present').join('\n')).toContain('.context/conversations/');
    expect(buildConversationRoutingStatusLines(routing, 'tracked_legacy_dirty').join('\n')).toContain('.context/conversations/');
  });

  it('renders no status lines for non-public policies', () => {
    const contextPlan = resolveContextPolicyPlan({
      projectName: 'Local Project',
      projectPath: '/workspace/local-project',
      projectYaml: {
        source_control: {
          topology: 'local_directory_only',
          context_publication_policy: 'local_private',
        },
      },
    });

    expect(buildConversationRoutingStatusLines(resolveConversationRoutingPlan(contextPlan), 'none')).toEqual([]);
  });
});
