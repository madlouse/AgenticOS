import { exec } from 'child_process';
import { readFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'yaml';
import { checkStandardKitUpgrade } from './standard-kit.js';
import { analyzeCanonicalRepoSync, type CanonicalRepoSyncDetails } from './canonical-checkout-sync.js';
import { resolveManagedProjectContextDisplayPaths, resolveManagedProjectContextPaths } from './agent-context-paths.js';
import { assessVersionedEntrySurfaceState } from './versioned-entry-surface-state.js';

export interface HealthArgs {
  repo_path: string;
  project_path?: string;
  remote_base_branch?: string;
  checkout_role?: 'canonical';
  check_standard_kit?: boolean;
}

export interface HealthGate {
  gate: 'repo_sync' | 'entry_surface_refresh' | 'versioned_entry_surface_state' | 'guardrail_evidence' | 'standard_kit';
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

export async function runHealthCheck(args: HealthArgs): Promise<HealthResult> {
  if (!args?.repo_path) {
    throw new Error('repo_path is required.');
  }

  const remoteBaseBranch = args.remote_base_branch || 'origin/main';
  const checkoutRole = args.checkout_role || 'canonical';
  const checkedAt = new Date().toISOString();

  const repoStatus = await execCommand(`git -C "${args.repo_path}" status --short --branch --untracked-files=all`);
  const projectYaml = await readProjectYaml(args.project_path);
  const state = await readState(args.project_path, projectYaml);
  const repoSync = analyzeCanonicalRepoSync({
    statusOutput: repoStatus,
    remoteBaseBranch,
    runtimeManagedEntries: resolveRuntimeManagedEntries(projectYaml),
  });
  const versionedEntrySurfaceState = assessVersionedEntrySurfaceState({
    projectYaml,
    state,
    projectPath: args.project_path,
  });

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

  const standardKitGate = await buildStandardKitGate(args);
  if (standardKitGate) {
    gates.push(standardKitGate);
  }

  return {
    command: 'agenticos_health',
    status: combineHealthStatus(gates),
    repo_path: args.repo_path,
    project_path: args.project_path || null,
    remote_base_branch: remoteBaseBranch,
    checkout_role: checkoutRole,
    checked_at: checkedAt,
    gates,
    repo_sync: repoSync.details,
    recovery_actions: repoSync.recovery_actions,
  };
}
