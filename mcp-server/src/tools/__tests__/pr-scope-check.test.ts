import { beforeEach, describe, expect, it, vi } from 'vitest';

const execAsyncMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const yamlMock = vi.hoisted(() => ({
  parse: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn(() => execAsyncMock),
}));

vi.mock('fs/promises', () => ({
  readFile: readFileMock,
}));

vi.mock('yaml', () => ({
  default: yamlMock,
}));

const persistGuardrailEvidenceMock = vi.hoisted(() => vi.fn().mockResolvedValue({
  attempted: true,
  persisted: true,
  project_id: 'agenticos',
  state_path: '/repo/.context/state.yaml',
}));
const resolveGuardrailProjectTargetMock = vi.hoisted(() => vi.fn());

vi.mock('../../utils/guardrail-evidence.js', () => ({
  persistGuardrailEvidence: persistGuardrailEvidenceMock,
}));

vi.mock('../../utils/repo-boundary.js', () => ({
  resolveGuardrailProjectTarget: resolveGuardrailProjectTargetMock,
}));

import { runPrScopeCheck } from '../pr-scope-check.js';

function mockGitResponses(responses: Record<string, string>): void {
  execAsyncMock.mockImplementation(async (cmd: string) => {
    for (const [pattern, stdout] of Object.entries(responses)) {
      if (cmd.includes(pattern)) {
        return { stdout, stderr: '' };
      }
    }
    throw new Error(`Unexpected command: ${cmd}`);
  });
}

describe('runPrScopeCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFileMock.mockResolvedValue(JSON.stringify({
      meta: { id: 'agenticos', name: 'AgenticOS' },
      source_control: {
        topology: 'local_directory_only',
        context_publication_policy: 'local_private',
      },
    }));
    yamlMock.parse.mockImplementation((content: string) => {
      try { return JSON.parse(content); } catch { return undefined; }
    });
    persistGuardrailEvidenceMock.mockResolvedValue({
      attempted: true,
      persisted: true,
      project_id: 'agenticos',
      state_path: '/repo/.context/state.yaml',
    });
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos',
      resolutionSource: 'repo_path_match',
      resolutionErrors: [],
      targetProject: {
        id: 'agenticos',
        name: 'AgenticOS',
        path: '/repo',
        statePath: '/repo/.context/state.yaml',
        projectYamlPath: '/repo/.project.yaml',
        sourceRepoRoots: ['/repo'],
        sourceRepoRootsDeclared: true,
      },
    });
  });

  it('returns PASS when commits and files stay within the intended issue scope', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --git-common-dir': '/repo/.git\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'log --format=%s origin/main..HEAD': 'feat(mcp-server): add agenticos_branch_bootstrap helper (#36)\n',
      'diff --name-only origin/main...HEAD': 'projects/agenticos/mcp-server/src/tools/branch-bootstrap.ts\nprojects/agenticos/mcp-server/src/tools/__tests__/branch-bootstrap.test.ts\n',
    });

    const result = JSON.parse(await runPrScopeCheck({
      issue_id: '36',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/**', 'projects/agenticos/mcp-server/src/index.ts'],
      expected_issue_scope: 'single_guardrail_feature',
    })) as { status: string; runtime_managed_files: string[]; unexpected_files: string[]; unrelated_commit_subjects: string[]; persistence?: { persisted: boolean } };

    expect(result.status).toBe('PASS');
    expect(result.runtime_managed_files).toEqual([]);
    expect(result.unexpected_files).toEqual([]);
    expect(result.unrelated_commit_subjects).toEqual([]);
    expect(result.persistence?.persisted).toBe(true);
    expect(persistGuardrailEvidenceMock).toHaveBeenCalledTimes(1);
  });

  it('returns PASS when declared exact file paths contain dots', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --git-common-dir': '/repo/.git\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'log --format=%s origin/main..HEAD': 'fix(mcp-server): preserve literal dots in pr scope matching (#114)\n',
      'diff --name-only origin/main...HEAD': 'README.md\nprojects/agenticos/mcp-server/src/tools/__tests__/edit-guard.test.ts\n',
    });

    const result = JSON.parse(await runPrScopeCheck({
      issue_id: '114',
      repo_path: '/repo',
      declared_target_files: [
        'README.md',
        'projects/agenticos/mcp-server/src/tools/__tests__/edit-guard.test.ts',
      ],
      expected_issue_scope: 'pr_scope_exact_file_match',
    })) as { status: string; unexpected_files: string[] };

    expect(result.status).toBe('PASS');
    expect(result.unexpected_files).toEqual([]);
  });

  it('returns PASS when a clean issue branch commit omits the issue marker in the subject', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --git-common-dir': '/repo/.git\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'log --format=%s origin/main..HEAD': 'feat: preserve teams session and hotel booking guardrails\n',
      'diff --name-only origin/main...HEAD': 'README.md\nprojects/agenticos/mcp-server/src/tools/pr-scope-check.ts\n',
    });

    const result = JSON.parse(await runPrScopeCheck({
      issue_id: '296',
      repo_path: '/repo',
      declared_target_files: [
        'README.md',
        'projects/agenticos/mcp-server/src/tools/pr-scope-check.ts',
      ],
      expected_issue_scope: 'clean_release_branch',
    })) as { status: string; unrelated_commit_subjects: string[]; unexpected_files: string[] };

    expect(result.status).toBe('PASS');
    expect(result.unrelated_commit_subjects).toEqual([]);
    expect(result.unexpected_files).toEqual([]);
  });

  it('returns BLOCK when commit subjects do not match the current issue', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --git-common-dir': '/repo/.git\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'log --format=%s origin/main..HEAD': 'fix(record): defensively parse JSON-stringified array args (fixes #24)\n',
      'diff --name-only origin/main...HEAD': 'projects/agenticos/mcp-server/src/tools/preflight.ts\n',
    });

    const result = JSON.parse(await runPrScopeCheck({
      issue_id: '36',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/**'],
      expected_issue_scope: 'single_guardrail_feature',
    })) as { status: string; unrelated_commit_subjects: string[]; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.unrelated_commit_subjects).toHaveLength(1);
    expect(result.block_reasons[0]).toContain('unrelated commits');
  });

  it('returns BLOCK when changed files escape the declared target scope', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --git-common-dir': '/repo/.git\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'log --format=%s origin/main..HEAD': 'feat(mcp-server): add agenticos_pr_scope_check (#36)\n',
      'diff --name-only origin/main...HEAD': 'projects/agenticos/mcp-server/src/tools/pr-scope-check.ts\nREADME.md\n',
    });

    const result = JSON.parse(await runPrScopeCheck({
      issue_id: '36',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/**'],
      expected_issue_scope: 'single_guardrail_feature',
    })) as { status: string; unexpected_files: string[]; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.unexpected_files).toContain('README.md');
    expect(result.block_reasons.join(' ')).toContain('declared target scope');
  });

  it('returns PASS when the diff is runtime-managed only', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos',
      resolutionSource: 'repo_path_match',
      resolutionErrors: [],
      targetProject: {
        id: 'agenticos',
        name: 'AgenticOS',
        path: '/repo/worktrees/issue-171',
        statePath: '/repo/worktrees/issue-171/standards/.context/state.yaml',
        projectYamlPath: '/repo/worktrees/issue-171/.project.yaml',
        sourceRepoRoots: ['/repo'],
        sourceRepoRootsDeclared: true,
      },
    });
    readFileMock.mockResolvedValue(JSON.stringify({
      meta: { id: 'agenticos', name: 'AgenticOS' },
      source_control: {
        topology: 'local_directory_only',
        context_publication_policy: 'local_private',
      },
      agent_context: {
        current_state: 'standards/.context/state.yaml',
        conversations: 'standards/.context/conversations/',
        last_record_marker: 'standards/.context/.last_record',
      },
    }));

    mockGitResponses({
      'rev-parse --show-toplevel': '/repo/worktrees/issue-171\n',
      'rev-parse --git-common-dir': '/repo/.git\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'log --format=%s origin/main..HEAD': 'feat(mcp-server): isolate runtime review surfaces (#171)\n',
      'diff --name-only origin/main...HEAD': 'standards/.context/state.yaml\nstandards/.context/.last_record\n',
    });

    const result = JSON.parse(await runPrScopeCheck({
      issue_id: '171',
      repo_path: '/repo/worktrees/issue-171',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/**'],
      expected_issue_scope: 'runtime_review_surface',
    })) as { status: string; runtime_managed_files: string[]; unexpected_files: string[] };

    expect(result.status).toBe('PASS');
    expect(result.runtime_managed_files).toEqual([
      'standards/.context/state.yaml',
      'standards/.context/.last_record',
    ]);
    expect(result.unexpected_files).toEqual([]);
  });

  it('returns BLOCK when runtime-managed files are mixed into a normal product review slice', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos',
      resolutionSource: 'repo_path_match',
      resolutionErrors: [],
      targetProject: {
        id: 'agenticos',
        name: 'AgenticOS',
        path: '/repo/worktrees/issue-171',
        statePath: '/repo/worktrees/issue-171/standards/.context/state.yaml',
        projectYamlPath: '/repo/worktrees/issue-171/.project.yaml',
        sourceRepoRoots: ['/repo'],
        sourceRepoRootsDeclared: true,
      },
    });
    readFileMock.mockResolvedValue(JSON.stringify({
      meta: { id: 'agenticos', name: 'AgenticOS' },
      source_control: {
        topology: 'local_directory_only',
        context_publication_policy: 'local_private',
      },
      agent_context: {
        current_state: 'standards/.context/state.yaml',
        conversations: 'standards/.context/conversations/',
        last_record_marker: 'standards/.context/.last_record',
      },
    }));

    mockGitResponses({
      'rev-parse --show-toplevel': '/repo/worktrees/issue-171\n',
      'rev-parse --git-common-dir': '/repo/.git\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'log --format=%s origin/main..HEAD': 'feat(mcp-server): isolate runtime review surfaces (#171)\n',
      'diff --name-only origin/main...HEAD': 'projects/agenticos/mcp-server/src/tools/save.ts\nstandards/.context/state.yaml\n',
    });

    const result = JSON.parse(await runPrScopeCheck({
      issue_id: '171',
      repo_path: '/repo/worktrees/issue-171',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/**'],
      expected_issue_scope: 'runtime_review_surface',
    })) as { status: string; runtime_managed_files: string[]; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.runtime_managed_files).toEqual(['standards/.context/state.yaml']);
    expect(result.block_reasons.join(' ')).toContain('runtime-managed files are mixed');
  });

  it('returns BLOCK when private raw transcript paths appear in tracked review scope for public_distilled projects', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos',
      resolutionSource: 'repo_path_match',
      resolutionErrors: [],
      targetProject: {
        id: 'agenticos',
        name: 'AgenticOS',
        path: '/repo/worktrees/issue-245',
        statePath: '/repo/worktrees/issue-245/standards/.context/state.yaml',
        projectYamlPath: '/repo/worktrees/issue-245/.project.yaml',
        sourceRepoRoots: ['/repo/worktrees/issue-245'],
        sourceRepoRootsDeclared: true,
      },
    });
    readFileMock.mockResolvedValue(JSON.stringify({
      meta: { id: 'agenticos', name: 'AgenticOS' },
      source_control: {
        topology: 'github_versioned',
        context_publication_policy: 'public_distilled',
      },
      agent_context: {
        current_state: 'standards/.context/state.yaml',
        conversations: 'standards/.context/conversations/',
        last_record_marker: 'standards/.context/.last_record',
      },
    }));

    mockGitResponses({
      'rev-parse --show-toplevel': '/repo/worktrees/issue-245\n',
      'rev-parse --git-common-dir': '/repo/.git\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'log --format=%s origin/main..HEAD': 'feat(mcp-server): isolate public raw transcripts (#245)\n',
      'diff --name-only origin/main...HEAD': '.private/conversations/2026-04-13.md\n',
    });

    const result = JSON.parse(await runPrScopeCheck({
      issue_id: '245',
      repo_path: '/repo/worktrees/issue-245',
      declared_target_files: ['projects/agenticos/mcp-server/src/**'],
      expected_issue_scope: 'public_distilled_transcript_isolation',
    })) as { status: string; private_raw_transcript_files: string[]; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.private_raw_transcript_files).toEqual(['.private/conversations/2026-04-13.md']);
    expect(result.block_reasons.join(' ')).toContain('private raw transcript paths appear in tracked review scope');
  });

  it('blocks nested-project tracked transcript diffs using repo-relative review paths', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'nested-public-project',
      resolutionSource: 'repo_path_match',
      resolutionErrors: [],
      targetProject: {
        id: 'nested-public-project',
        name: 'Nested Public Project',
        path: '/repo/projects/app',
        statePath: '/repo/projects/app/runtime/state.yaml',
        projectYamlPath: '/repo/projects/app/.project.yaml',
        sourceRepoRoots: ['/repo'],
        sourceRepoRootsDeclared: true,
      },
    });
    readFileMock.mockResolvedValue(JSON.stringify({
      meta: { id: 'nested-public-project', name: 'Nested Public Project' },
      source_control: {
        topology: 'github_versioned',
        context_publication_policy: 'public_distilled',
      },
      agent_context: {
        current_state: 'runtime/state.yaml',
        conversations: 'runtime/conversations/',
        last_record_marker: 'runtime/.last_record',
      },
    }));

    mockGitResponses({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --git-common-dir': '/repo/.git\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'log --format=%s origin/main..HEAD': 'feat(mcp-server): isolate nested public raw transcripts (#245)\n',
      'diff --name-only origin/main...HEAD': 'projects/app/runtime/conversations/2026-04-13.md\n',
    });

    const result = JSON.parse(await runPrScopeCheck({
      issue_id: '245',
      repo_path: '/repo',
      declared_target_files: ['projects/app/mcp-server/src/**'],
      expected_issue_scope: 'nested_public_distilled_transcript_isolation',
    })) as { status: string; private_raw_transcript_files: string[]; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.private_raw_transcript_files).toEqual(['projects/app/runtime/conversations/2026-04-13.md']);
    expect(result.block_reasons.join(' ')).toContain('private raw transcript paths appear in tracked review scope');
  });

  it('returns BLOCK when the branch is not comparable to the intended remote base', async () => {
    execAsyncMock.mockRejectedValue(new Error('bad ref'));

    const result = JSON.parse(await runPrScopeCheck({
      issue_id: '36',
      repo_path: '/repo',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/**'],
      expected_issue_scope: 'single_guardrail_feature',
    })) as { status: string; branch_ancestry_verified: boolean; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.branch_ancestry_verified).toBe(false);
    expect(result.block_reasons[0]).toContain('not comparable');
  });

  it('returns PASS when the worktree root is declared even if the common repo root differs', async () => {
    resolveGuardrailProjectTargetMock.mockResolvedValue({
      activeProjectId: 'agenticos',
      resolutionSource: 'repo_path_match',
      resolutionErrors: [],
      targetProject: {
        id: 'agenticos',
        name: 'AgenticOS',
        path: '/repo/worktrees/issue-160',
        statePath: '/repo/worktrees/issue-160/.context/state.yaml',
        projectYamlPath: '/repo/worktrees/issue-160/.project.yaml',
        sourceRepoRoots: ['/repo/worktrees/issue-160'],
        sourceRepoRootsDeclared: true,
      },
    });
    mockGitResponses({
      'rev-parse --show-toplevel': '/repo/worktrees/issue-160\n',
      'rev-parse --git-common-dir': '/external/.git\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'log --format=%s origin/main..HEAD': 'fix(mcp-server): enforce source repo bindings (#160)\n',
      'diff --name-only origin/main...HEAD': 'projects/agenticos/mcp-server/src/tools/preflight.ts\n',
    });

    const result = JSON.parse(await runPrScopeCheck({
      issue_id: '160',
      repo_path: '/repo/worktrees/issue-160',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/**'],
      expected_issue_scope: 'repo_boundary_enforcement',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('PASS');
    expect(result.block_reasons).toEqual([]);
  });

  it('returns BLOCK when neither the worktree root nor the common repo root is declared for the target project', async () => {
    mockGitResponses({
      'rev-parse --show-toplevel': '/wrong/worktrees/issue-160\n',
      'rev-parse --git-common-dir': '/external/.git\n',
      'rev-parse origin/main': 'base999\n',
      'merge-base HEAD origin/main': 'base999\n',
      'log --format=%s origin/main..HEAD': 'fix(mcp-server): enforce source repo bindings (#160)\n',
      'diff --name-only origin/main...HEAD': 'projects/agenticos/mcp-server/src/tools/preflight.ts\n',
    });

    const result = JSON.parse(await runPrScopeCheck({
      issue_id: '160',
      repo_path: '/wrong/worktrees/issue-160',
      declared_target_files: ['projects/agenticos/mcp-server/src/tools/**'],
      expected_issue_scope: 'repo_boundary_enforcement',
    })) as { status: string; block_reasons: string[] };

    expect(result.status).toBe('BLOCK');
    expect(result.block_reasons.join(' ')).toContain('neither git worktree root');
  });
});
