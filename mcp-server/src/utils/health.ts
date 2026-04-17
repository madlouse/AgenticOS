import { exec } from 'child_process';
import { readFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import yaml from 'yaml';
import { checkStandardKitUpgrade } from './standard-kit.js';
import { analyzeCanonicalRepoSync, type CanonicalRepoSyncDetails } from './canonical-checkout-sync.js';
import { resolveManagedProjectContextDisplayPaths, resolveManagedProjectContextPaths } from './agent-context-paths.js';
import { resolveGuardrailProjectTarget, type GuardrailProjectTarget } from './repo-boundary.js';
import { validateGuardrailRepoIdentity } from './guardrail-repo-identity.js';
import { assessVersionedEntrySurfaceState } from './versioned-entry-surface-state.js';
import { extractLatestIssueBootstrap, loadLatestGuardrailState } from './guardrail-evidence.js';
import { getAgenticOSHome } from './registry.js';
import { assessIssueBootstrapContinuity, type IssueBootstrapContinuityAssessment } from './issue-bootstrap-continuity.js';
import { deriveExpectedWorktreeRoot, inspectProjectWorktreeTopology, type WorktreeTopologyInspection } from './worktree-topology.js';

export interface HealthArgs {
  repo_path: string;
  project_path?: string;
  remote_base_branch?: string;
  checkout_role?: 'canonical';
  check_standard_kit?: boolean;
}

export interface HealthGate {
  gate: 'repo_sync' | 'entry_surface_refresh' | 'versioned_entry_surface_state' | 'guardrail_evidence' | 'issue_bootstrap_continuity' | 'worktree_topology' | 'standard_kit';
  status: 'PASS' | 'WARN' | 'BLOCK';
  summary: string;
}

export interface HealthResult {
  command: 'agenticos_health';
  status: 'PASS' | 'WARN' | 'BLOCK';
  repo_path: string;
  project_path: string | null;
  remote_base_branch: string;
  checkout_role: 'canonical';
  checked_at: string;
  gates: HealthGate[];
  repo_sync?: CanonicalRepoSyncDetails;
  worktree_topology?: WorktreeTopologyInspection;
  issue_bootstrap_continuity?: IssueBootstrapContinuityAssessment;
  recovery_actions?: string[];
}

function execCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

function combineHealthStatus(gates: HealthGate[]): 'PASS' | 'WARN' | 'BLOCK' {
  if (gates.some((gate) => gate.status === 'BLOCK')) return 'BLOCK';
  if (gates.some((gate) => gate.status === 'WARN')) return 'WARN';
  return 'PASS';
}

async function readProjectYaml(projectPath?: string): Promise<any | null> {
  if (!projectPath) return null;

  try {
    return yaml.parse(await readFile(join(projectPath, '.project.yaml'), 'utf-8')) || {};
  } catch {
    return null;
  }
}

function resolveRuntimeManagedEntries(projectYaml: any | null): string[] {
  if (!projectYaml) {
    return ['CLAUDE.md', 'AGENTS.md'];
  }

  const contextPaths = resolveManagedProjectContextDisplayPaths(projectYaml);
  const toRelative = (path: string): string => path.replace(/\\/g, '/').replace(/^\.\/+/, '');

  return [
    toRelative(contextPaths.quickStartPath),
    toRelative(contextPaths.statePath),
    toRelative(contextPaths.markerPath),
    toRelative(contextPaths.conversationsDir),
    'CLAUDE.md',
    'AGENTS.md',
  ];
}

async function readState(projectPath?: string, projectYaml?: any | null): Promise<any | null> {
  if (!projectPath) return null;

  try {
    const statePath = projectYaml
      ? resolveManagedProjectContextPaths(projectPath, projectYaml).statePath
      : join(projectPath, '.context', 'state.yaml');
    return yaml.parse(await readFile(statePath, 'utf-8')) || {};
  } catch {
    return null;
  }
}

function buildEntrySurfaceGate(state: any | null): HealthGate {
  if (!state) {
    return {
      gate: 'entry_surface_refresh',
      status: 'WARN',
      summary: 'Project state could not be read, so entry-surface freshness was not proven.',
    };
  }

  if (state.entry_surface_refresh?.refreshed_at || state.session?.last_entry_surface_refresh) {
    return {
      gate: 'entry_surface_refresh',
      status: 'PASS',
      summary: 'Entry surfaces have explicit refresh metadata.',
    };
  }

  return {
    gate: 'entry_surface_refresh',
    status: 'WARN',
    summary: 'Entry surfaces do not yet have explicit refresh metadata.',
  };
}

function buildGuardrailGate(state: any | null): HealthGate {
  if (!state) {
    return {
      gate: 'guardrail_evidence',
      status: 'WARN',
      summary: 'Project state could not be read, so guardrail visibility was not proven.',
    };
  }

  if (state.guardrail_evidence?.last_command) {
    return {
      gate: 'guardrail_evidence',
      status: 'PASS',
      summary: `Latest guardrail evidence is present (${state.guardrail_evidence.last_command}).`,
    };
  }

  return {
    gate: 'guardrail_evidence',
    status: 'WARN',
    summary: 'No persisted guardrail evidence is present yet.',
  };
}

async function buildIssueBootstrapContinuityGate(args: HealthArgs, projectYaml: any | null, state: any | null): Promise<{ gate: HealthGate; continuity: IssueBootstrapContinuityAssessment } | null> {
  if (!args.project_path || state === null) return null;
  if (projectYaml?.source_control?.topology !== 'github_versioned') return null;

  const latestBootstrap = extractLatestIssueBootstrap(state);
  const continuity = await assessIssueBootstrapContinuity({
    bootstrap: latestBootstrap,
    currentRepoPath: args.repo_path,
    projectPath: args.project_path,
  });

  const gateStatus = continuity.status === 'current'
    ? 'PASS'
    : continuity.status === 'historical_for_current_checkout'
      ? 'WARN'
      : 'BLOCK';

  return {
    gate: {
      gate: 'issue_bootstrap_continuity',
      status: gateStatus,
      summary: continuity.summary,
    },
    continuity,
  };
}

async function buildWorktreeTopologyGate(args: HealthArgs, projectYaml: any | null): Promise<{ gate: HealthGate; topology: WorktreeTopologyInspection } | null> {
  if (!args.project_path) return null;
  if (projectYaml?.source_control?.topology !== 'github_versioned') return null;

  const projectId = String(projectYaml?.meta?.id || '').trim();
  if (!projectId) {
    return {
      gate: {
        gate: 'worktree_topology',
        status: 'BLOCK',
        summary: 'Worktree topology could not be checked because the project is missing meta.id.',
      },
      topology: {
        applies: true,
        status: 'BLOCK',
        summary: 'Worktree topology could not be checked because the project is missing meta.id.',
        expected_worktree_root: null,
        worktrees: [],
        counts: {
          canonical_main: 0,
          project_scoped: 0,
          misplaced_clean: 0,
          misplaced_dirty: 0,
        },
        inspection_errors: ['missing meta.id for github_versioned project'],
      },
    };
  }

  const topology = await inspectProjectWorktreeTopology({
    repoPath: args.repo_path,
    canonicalProjectPath: args.project_path,
    expectedWorktreeRoot: deriveExpectedWorktreeRoot(getAgenticOSHome(), projectId),
  });

  return {
    gate: {
      gate: 'worktree_topology',
      status: topology.status,
      summary: topology.summary,
    },
    topology,
  };
}

async function buildStandardKitGate(args: HealthArgs): Promise<HealthGate | null> {
  if (!args.check_standard_kit) return null;
  if (!args.project_path) {
    return {
      gate: 'standard_kit',
      status: 'WARN',
      summary: 'Standard-kit drift check was requested without a project_path.',
    };
  }

  const result = await checkStandardKitUpgrade({ project_path: args.project_path });
  const hasMissingRequired = result.missing_required_files.length > 0;
  const hasStaleGenerated = result.generated_files.some((file) => file.status !== 'current');
  const hasTemplateDrift = result.copied_templates.some((file) => file.status !== 'matches_canonical');

  if (!hasMissingRequired && !hasStaleGenerated && !hasTemplateDrift) {
    return {
      gate: 'standard_kit',
      status: 'PASS',
      summary: 'Standard-kit files match the canonical kit.',
    };
  }

  return {
    gate: 'standard_kit',
    status: 'WARN',
    summary: 'Standard-kit drift was detected and should be reviewed before starting work.',
  };
}

async function resolveTrustedProjectPath(args: {
  repoPath: string;
  explicitProjectPath?: string;
  targetProject: GuardrailProjectTarget | null;
  resolutionSource: 'explicit_project_path' | 'repo_path_match' | 'session_project' | null;
}): Promise<{ effectiveProjectPath: string | null; repoIdentityError: string | null }> {
  const { repoPath, explicitProjectPath, targetProject, resolutionSource } = args;
  const initialProjectPath = explicitProjectPath || targetProject?.path || null;
  const requiresRepoIdentityProof = resolutionSource === 'repo_path_match' || resolutionSource === 'session_project';
  if (!targetProject || targetProject.topology !== 'github_versioned' || !requiresRepoIdentityProof) {
    return {
      effectiveProjectPath: initialProjectPath,
      repoIdentityError: null,
    };
  }

  try {
    const gitWorktreeRoot = (await execCommand(`git -C "${repoPath}" rev-parse --show-toplevel`)).trim();
    const gitCommonDir = resolve(gitWorktreeRoot, (await execCommand(`git -C "${repoPath}" rev-parse --git-common-dir`)).trim());
    const gitCommonRepoRoot = dirname(gitCommonDir);
    const gitRemoteOrigin = await execCommand(`git -C "${repoPath}" config --get remote.origin.url`).catch(() => '');
    const repoIdentity = validateGuardrailRepoIdentity({
      projectId: targetProject.id,
      projectYamlPath: targetProject.projectYamlPath,
      declaredGithubRepo: targetProject.githubRepo,
      declaredSourceRepoRoots: targetProject.sourceRepoRoots,
      sourceRepoRootsDeclared: targetProject.sourceRepoRootsDeclared,
      expectedWorktreeRoot: targetProject.expectedWorktreeRoot,
      gitWorktreeRoot,
      gitCommonRepoRoot,
      gitRemoteOrigin,
    });
    if (!repoIdentity.ok) {
      return {
        effectiveProjectPath: null,
        repoIdentityError: repoIdentity.message as string,
      };
    }
  } catch (error) {
    return {
      effectiveProjectPath: null,
      /* c8 ignore next -- execCommand and repo identity validation only throw Error instances here */
      repoIdentityError: error instanceof Error ? error.message : 'failed to validate repo identity for the resolved managed project',
    };
  }

  return {
    effectiveProjectPath: initialProjectPath,
    repoIdentityError: null,
  };
}

export async function runHealthCheck(args: HealthArgs): Promise<HealthResult> {
  if (!args?.repo_path) {
    throw new Error('repo_path is required.');
  }

  const remoteBaseBranch = args.remote_base_branch || 'origin/main';
  const checkoutRole = args.checkout_role || 'canonical';
  const checkedAt = new Date().toISOString();
  const projectResolution = await resolveGuardrailProjectTarget({
    commandName: 'agenticos_health',
    repoPath: args.repo_path,
    projectPath: args.project_path,
  });
  const trustedProject = await resolveTrustedProjectPath({
    repoPath: args.repo_path,
    explicitProjectPath: args.project_path,
    targetProject: projectResolution.targetProject,
    resolutionSource: projectResolution.resolutionSource,
  });
  const effectiveProjectPath = trustedProject.effectiveProjectPath;

  const repoStatus = await execCommand(`git -C "${args.repo_path}" status --short --branch --untracked-files=all`);
  const resolvedProjectPath = effectiveProjectPath ?? undefined;
  const projectYaml = await readProjectYaml(resolvedProjectPath);
  const state = await readState(resolvedProjectPath, projectYaml);
  const displayState = effectiveProjectPath && projectResolution.targetProject?.statePath
    ? await loadLatestGuardrailState({
        project_id: projectResolution.targetProject.id,
        committed_state_path: projectResolution.targetProject.statePath,
      }).then((loaded) => loaded.state).catch(() => state)
    : state;
  const repoSync = analyzeCanonicalRepoSync({
    statusOutput: repoStatus,
    remoteBaseBranch,
    runtimeManagedEntries: resolveRuntimeManagedEntries(projectYaml),
  });
  const versionedEntrySurfaceState = assessVersionedEntrySurfaceState({
    projectYaml,
    state,
    projectPath: resolvedProjectPath,
  });
  const effectiveArgs = {
    ...args,
    project_path: resolvedProjectPath,
  };
  const worktreeTopologyGate = await buildWorktreeTopologyGate(effectiveArgs, projectYaml);
  const bootstrapContinuityGate = await buildIssueBootstrapContinuityGate(
    effectiveArgs,
    effectiveProjectPath ? projectYaml : null,
    displayState,
  );

  const gates: HealthGate[] = [
    {
      gate: 'repo_sync',
      status: repoSync.status,
      summary: repoSync.summary,
    },
    buildEntrySurfaceGate(state),
  ];

  if (versionedEntrySurfaceState.applies) {
    gates.push({
      gate: 'versioned_entry_surface_state',
      status: versionedEntrySurfaceState.status,
      summary: versionedEntrySurfaceState.summary,
    });
  }

  gates.push(
    buildGuardrailGate(state),
  );

  if (bootstrapContinuityGate) {
    gates.push(bootstrapContinuityGate.gate);
  }

  if (worktreeTopologyGate) {
    gates.push(worktreeTopologyGate.gate);
  }

  const standardKitGate = await buildStandardKitGate(effectiveArgs);
  if (standardKitGate) {
    gates.push(standardKitGate);
  }

  return {
    command: 'agenticos_health',
    status: combineHealthStatus(gates),
    repo_path: args.repo_path,
    project_path: effectiveProjectPath || null,
    remote_base_branch: remoteBaseBranch,
    checkout_role: checkoutRole,
    checked_at: checkedAt,
    gates,
    repo_sync: repoSync.details,
    worktree_topology: worktreeTopologyGate?.topology,
    issue_bootstrap_continuity: bootstrapContinuityGate?.continuity,
    recovery_actions: [
      ...repoSync.recovery_actions,
      ...(trustedProject.repoIdentityError
        ? [`verify git repo identity before treating repo_path as a managed project: ${trustedProject.repoIdentityError}`]
        : []),
      ...(bootstrapContinuityGate?.continuity.status && bootstrapContinuityGate.continuity.status !== 'current'
        ? bootstrapContinuityGate.continuity.recovery_actions
        : []),
      ...(worktreeTopologyGate?.topology.status === 'WARN' && worktreeTopologyGate.topology.counts.misplaced_clean > 0
        ? ['recreate misplaced clean worktrees under the derived project-scoped worktree root and remove the old paths']
        : []),
      ...(worktreeTopologyGate?.topology.status === 'BLOCK' && worktreeTopologyGate.topology.counts.misplaced_dirty > 0
        ? ['protect dirty misplaced worktrees first, then recreate them under the derived project-scoped worktree root before removing the old paths']
        : []),
      ...(worktreeTopologyGate?.topology.status === 'BLOCK'
        && worktreeTopologyGate.topology.counts.misplaced_dirty === 0
        && worktreeTopologyGate.topology.inspection_errors.some((error) => error.includes('missing meta.id'))
        ? ['restore project meta.id before relying on derived project-scoped worktree-root checks']
        : []),
      ...(worktreeTopologyGate?.topology.status === 'BLOCK'
        && worktreeTopologyGate.topology.counts.misplaced_dirty === 0
        && worktreeTopologyGate.topology.inspection_errors.length > 0
        && !worktreeTopologyGate.topology.inspection_errors.some((error) => error.includes('missing meta.id'))
        ? ['inspect git worktree topology failures and restore accurate worktree visibility before trusting this checkout']
        : []),
    ],
  };
}
