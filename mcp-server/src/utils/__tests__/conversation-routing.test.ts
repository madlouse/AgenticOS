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
    expect(routing.tracked_conversations_display_dir).toBeNull();
    expect(routing.tracked_recovery_contract).toBe('git_distilled');
    expect(routing.is_sidecar).toBe(true);
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
});
