import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import yaml from 'yaml';
import { getAgenticOSHome } from './registry.js';
import { detectCanonicalMainWriteProtection } from './canonical-main-guard.js';
import { type PreflightResult, type StateYamlSchema } from './yaml-schemas.js';
import { resolveProjectTarget } from './repo-boundary.js';

export type GuardrailCommand =
  | 'agenticos_preflight'
  | 'agenticos_branch_bootstrap'
  | 'agenticos_pr_scope_check';

export interface IssueBootstrapAdditionalContextEntry {
  path: string;
  reason: string;
}

export interface IssueBootstrapRecord {
  recorded_at?: string;
  issue_id?: string | null;
  issue_title?: string | null;
  issue_body?: string | null;
  labels?: string[];
  linked_artifacts?: string[];
  startup_context_paths?: string[];
  additional_context?: IssueBootstrapAdditionalContextEntry[];
  repo_path?: string | null;
  project_path?: string | null;
  current_branch?: string | null;
  workspace_type?: 'main' | 'isolated_worktree' | null;
  stages?: {
    context_reset_performed?: boolean;
    project_hot_load_performed?: boolean;
    issue_payload_attached?: boolean;
  };
}

export interface IssueBootstrapState {
  updated_at?: string;
  latest?: IssueBootstrapRecord | null;
}

interface GuardrailEvidenceState {
  updated_at?: string;
  last_command?: GuardrailCommand;
  preflight?: PreflightResult;
  branch_bootstrap?: Record<string, unknown>;
  pr_scope_check?: Record<string, unknown>;
}

type GuardrailEvidenceSlot = 'preflight' | 'branch_bootstrap' | 'pr_scope_check';

interface StateYaml {
  guardrail_evidence?: GuardrailEvidenceState;
  issue_bootstrap?: IssueBootstrapState;
  [key: string]: unknown;
}

export interface LoadedGuardrailState {
  source: 'runtime' | 'committed' | null;
  state: {
    guardrail_evidence?: GuardrailEvidenceState;
    issue_bootstrap?: IssueBootstrapState;
    [key: string]: unknown;
  };
  state_path: string | null;
}

export interface GuardrailPersistenceResult {
  attempted: boolean;
  persisted: boolean;
  project_id?: string;
  state_path?: string;
  reason?: string;
}

interface PersistGuardrailEvidenceArgs {
  command: GuardrailCommand;
  repo_path?: string;
  project_path?: string;
  payload: Record<string, unknown>;
}

interface PersistIssueBootstrapEvidenceArgs {
  repo_path?: string;
  project_path?: string;
  payload: IssueBootstrapRecord;
}

interface LoadLatestGuardrailStateArgs {
  project_id: string;
  committed_state_path?: string;
}

function getCommandSlot(command: GuardrailCommand): GuardrailEvidenceSlot {
  switch (command) {
    case 'agenticos_preflight':
      return 'preflight';
    case 'agenticos_branch_bootstrap':
      return 'branch_bootstrap';
    case 'agenticos_pr_scope_check':
      return 'pr_scope_check';
  }
}

function getProjectGuardrailRuntimeDir(projectId: string): string {
  return join(getAgenticOSHome(), '.agent-workspace', 'projects', encodeURIComponent(projectId));
}

function getProjectGuardrailRuntimeStatePath(projectId: string): string {
  return join(getProjectGuardrailRuntimeDir(projectId), 'guardrail-state.yaml');
}

function getProjectGuardrailRuntimeLockPath(projectId: string): string {
  return join(getProjectGuardrailRuntimeDir(projectId), 'guardrail-state.lock');
}

const GUARDRAIL_LOCK_STALE_MS = 30_000;

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function readStateYaml(path: string): Promise<StateYaml | null> {
  try {
    const content = await readFile(path, 'utf-8');
    const parsed = yaml.parse(content);
    return parsed && typeof parsed === 'object' ? parsed as StateYaml : null;
  } catch {
    return null;
  }
}

async function ensureRuntimeWriteAllowed(): Promise<void> {
  const writeProtection = await detectCanonicalMainWriteProtection(getAgenticOSHome());
  if (writeProtection.blocked) {
    throw new Error(writeProtection.reason);
  }
}

async function reapStaleGuardrailRuntimeLock(lockPath: string): Promise<boolean> {
  try {
    const lockStat = await stat(lockPath);
    if ((Date.now() - lockStat.mtimeMs) <= GUARDRAIL_LOCK_STALE_MS) {
      return false;
    }
    await rm(lockPath, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

async function withProjectGuardrailRuntimeLock<T>(
  projectId: string,
  callback: (runtimeStatePath: string) => Promise<T>,
): Promise<T> {
  await ensureRuntimeWriteAllowed();

  const runtimeDir = getProjectGuardrailRuntimeDir(projectId);
  const lockPath = getProjectGuardrailRuntimeLockPath(projectId);
  await mkdir(runtimeDir, { recursive: true });

  let locked = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await mkdir(lockPath);
      locked = true;
      break;
    } catch {
      const reapedStaleLock = await reapStaleGuardrailRuntimeLock(lockPath);
      if (reapedStaleLock) {
        continue;
      }
      await sleep(10);
    }
  }

  if (!locked) {
    throw new Error(`failed to acquire guardrail runtime lock at ${lockPath}`);
  }

  try {
    return await callback(getProjectGuardrailRuntimeStatePath(projectId));
  } finally {
    await rm(lockPath, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function writeRuntimeGuardrailState(
  projectId: string,
  mutate: (state: StateYaml, runtimeStatePath: string) => void | Promise<void>,
): Promise<string> {
  return await withProjectGuardrailRuntimeLock(projectId, async (runtimeStatePath) => {
    const state = (await readStateYaml(runtimeStatePath)) || {};
    await mutate(state, runtimeStatePath);
    const tempPath = `${runtimeStatePath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tempPath, yaml.stringify(state), 'utf-8');
    await rename(tempPath, runtimeStatePath);
    return runtimeStatePath;
  });
}

function mergeGuardrailEvidenceState(
  runtimeGuardrail: GuardrailEvidenceState | undefined,
  committedGuardrail: GuardrailEvidenceState | undefined,
): GuardrailEvidenceState | undefined {
  if (!runtimeGuardrail && !committedGuardrail) {
    return undefined;
  }

  return {
    ...(committedGuardrail || {}),
    ...(runtimeGuardrail || {}),
    preflight: runtimeGuardrail?.preflight ?? committedGuardrail?.preflight,
    branch_bootstrap: runtimeGuardrail?.branch_bootstrap ?? committedGuardrail?.branch_bootstrap,
    pr_scope_check: runtimeGuardrail?.pr_scope_check ?? committedGuardrail?.pr_scope_check,
  };
}

function mergeGuardrailState(runtimeState: StateYaml, committedState: StateYaml | null): StateYaml {
  return {
    ...(committedState || {}),
    ...runtimeState,
    guardrail_evidence: mergeGuardrailEvidenceState(runtimeState?.guardrail_evidence, committedState?.guardrail_evidence),
    issue_bootstrap: runtimeState?.issue_bootstrap ?? committedState?.issue_bootstrap,
  };
}

export async function loadLatestGuardrailState(
  args: LoadLatestGuardrailStateArgs,
): Promise<LoadedGuardrailState> {
  const runtimeStatePath = getProjectGuardrailRuntimeStatePath(args.project_id);
  const runtimeState = await readStateYaml(runtimeStatePath);
  const committedStatePath = typeof args.committed_state_path === 'string' && args.committed_state_path.length > 0
    ? args.committed_state_path
    : null;
  const committedState = committedStatePath
    ? await readStateYaml(committedStatePath)
    : null;

  if (runtimeState) {
    return {
      source: 'runtime',
      state: mergeGuardrailState(runtimeState, committedState),
      state_path: runtimeStatePath,
    };
  }

  if (committedStatePath && committedState) {
    return {
      source: 'committed',
      state: committedState,
      state_path: committedStatePath,
    };
  }

  return {
    source: null,
    state: {},
    state_path: runtimeStatePath,
  };
}

export async function persistGuardrailEvidence(
  args: PersistGuardrailEvidenceArgs,
): Promise<GuardrailPersistenceResult> {
  const { command, repo_path, project_path, payload } = args;

  if (!repo_path) {
    return {
      attempted: false,
      persisted: false,
      reason: 'repo_path is required for guardrail evidence persistence',
    };
  }

  const project = await resolveProjectTarget(repo_path, project_path);
  if (!project) {
    return {
      attempted: true,
      persisted: false,
      reason: project_path
        ? `project_path is not a resolvable AgenticOS project: ${project_path}`
        : `repo_path is not within a resolvable AgenticOS project: ${repo_path}`,
    };
  }

  try {
    const statePath = await writeRuntimeGuardrailState(project.id, async (state) => {
      if (!state.guardrail_evidence) {
        state.guardrail_evidence = {};
      }

      const recordedAt = new Date().toISOString();
      const slot = getCommandSlot(command);

      state.guardrail_evidence.updated_at = recordedAt;
      state.guardrail_evidence.last_command = command;
      state.guardrail_evidence[slot] = {
        command,
        recorded_at: recordedAt,
        repo_path,
        ...payload,
      };
    });

    return {
      attempted: true,
      persisted: true,
      project_id: project.id,
      state_path: statePath,
    };
  } catch (error) {
    return {
      attempted: true,
      persisted: false,
      project_id: project.id,
      state_path: getProjectGuardrailRuntimeStatePath(project.id),
      reason: error instanceof Error ? error.message : 'failed to persist runtime guardrail evidence',
    };
  }
}

export function extractLatestIssueBootstrap(state: StateYaml | null | undefined): IssueBootstrapRecord | null {
  if (!state?.issue_bootstrap?.latest || typeof state.issue_bootstrap.latest !== 'object') {
    return null;
  }
  return state.issue_bootstrap.latest;
}

export async function persistIssueBootstrapEvidence(
  args: PersistIssueBootstrapEvidenceArgs,
): Promise<GuardrailPersistenceResult> {
  const { repo_path, project_path, payload } = args;

  if (!repo_path) {
    return {
      attempted: false,
      persisted: false,
      reason: 'repo_path is required for issue bootstrap persistence',
    };
  }

  const project = await resolveProjectTarget(repo_path, project_path);
  if (!project) {
    return {
      attempted: true,
      persisted: false,
      reason: project_path
        ? `project_path is not a resolvable AgenticOS project: ${project_path}`
        : `repo_path is not within a resolvable AgenticOS project: ${repo_path}`,
    };
  }

  try {
    const statePath = await writeRuntimeGuardrailState(project.id, async (state) => {
      const recordedAt = payload.recorded_at || new Date().toISOString();
      state.issue_bootstrap = {
        updated_at: recordedAt,
        latest: {
          ...payload,
          recorded_at: recordedAt,
          project_path: payload.project_path || project.path,
          repo_path: payload.repo_path || repo_path,
        },
      };
    });

    return {
      attempted: true,
      persisted: true,
      project_id: project.id,
      state_path: statePath,
    };
  } catch (error) {
    return {
      attempted: true,
      persisted: false,
      project_id: project.id,
      state_path: getProjectGuardrailRuntimeStatePath(project.id),
      reason: error instanceof Error ? error.message : 'failed to persist runtime issue bootstrap evidence',
    };
  }
}
