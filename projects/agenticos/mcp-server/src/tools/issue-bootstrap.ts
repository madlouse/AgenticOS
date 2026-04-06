import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { exec } from 'child_process';
import { dirname, join, resolve } from 'path';
import { promisify } from 'util';
import yaml from 'yaml';
import { persistIssueBootstrapEvidence, type GuardrailPersistenceResult, type IssueBootstrapAdditionalContextEntry } from '../utils/guardrail-evidence.js';
import { resolveGuardrailProjectTarget } from '../utils/repo-boundary.js';
import { resolveManagedProjectContextPaths } from '../utils/project-target.js';

const execAsync = promisify(exec);

type BootstrapStatus = 'RECORDED' | 'BLOCK';
type WorkspaceType = 'main' | 'isolated_worktree';

interface IssueBootstrapArgs {
  issue_id?: string;
  issue_title?: string;
  issue_body?: string;
  labels?: string[];
  linked_artifacts?: string[];
  additional_context?: IssueBootstrapAdditionalContextEntry[];
  context_reset_performed?: boolean;
  project_hot_load_performed?: boolean;
  issue_payload_attached?: boolean;
  repo_path?: string;
  project_path?: string;
}

interface IssueBootstrapResult {
  command: 'agenticos_issue_bootstrap';
  status: BootstrapStatus;
  summary: string;
  active_project: string | null;
  target_project: {
    id: string;
    name: string;
    path: string;
    state_path: string;
    project_yaml_path: string;
  } | null;
  startup_context_paths: string[];
  block_reasons: string[];
  evidence: {
    issue_id: string | null;
    issue_title: string | null;
    repo_path: string | null;
    project_path: string | null;
    current_branch: string | null;
    workspace_type: WorkspaceType | null;
    context_reset_performed: boolean;
    project_hot_load_performed: boolean;
    issue_payload_attached: boolean;
    labels: string[];
    linked_artifacts: string[];
    additional_context: IssueBootstrapAdditionalContextEntry[];
  };
  persistence?: GuardrailPersistenceResult;
}

async function runGit(repoPath: string, args: string): Promise<string> {
  const { stdout } = await execAsync(`git -C "${repoPath}" ${args}`);
  return stdout.trim();
}

async function detectWorkspaceType(repoPath: string): Promise<WorkspaceType> {
  try {
    const output = await runGit(repoPath, 'worktree list --porcelain');
    const worktreeLines = output
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.replace(/^worktree\s+/, '').trim());

    if (worktreeLines.length > 0 && worktreeLines[0] === repoPath) {
      return 'main';
    }
    return 'isolated_worktree';
  } catch {
    return 'main';
  }
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => value.length > 0);
}

function normalizeAdditionalContext(values: unknown): IssueBootstrapAdditionalContextEntry[] {
  if (!Array.isArray(values)) return [];

  return values
    .map((value) => {
      if (!value || typeof value !== 'object') return null;
      const path = String((value as any).path || '').trim();
      const reason = String((value as any).reason || '').trim();
      if (!path || !reason) return null;
      return { path, reason };
    })
    .filter((value): value is IssueBootstrapAdditionalContextEntry => value !== null);
}

export async function runIssueBootstrap(args: IssueBootstrapArgs): Promise<string> {
  const {
    issue_id,
    issue_title,
    issue_body,
    labels = [],
    linked_artifacts = [],
    additional_context = [],
    context_reset_performed = false,
    project_hot_load_performed = false,
    issue_payload_attached = false,
    repo_path,
    project_path,
  } = args ?? {};

  const result: IssueBootstrapResult = {
    command: 'agenticos_issue_bootstrap',
    status: 'BLOCK',
    summary: '',
    active_project: null,
    target_project: null,
    startup_context_paths: [],
    block_reasons: [],
    evidence: {
      issue_id: issue_id || null,
      issue_title: issue_title || null,
      repo_path: repo_path || null,
      project_path: project_path || null,
      current_branch: null,
      workspace_type: null,
      context_reset_performed,
      project_hot_load_performed,
      issue_payload_attached,
      labels: normalizeStringArray(labels),
      linked_artifacts: normalizeStringArray(linked_artifacts),
      additional_context: normalizeAdditionalContext(additional_context),
    },
  };

  if (!repo_path) {
    result.block_reasons.push('repo_path is required');
  }
  if (!issue_id) {
    result.block_reasons.push('issue_id is required');
  }
  if (!issue_title) {
    result.block_reasons.push('issue_title is required');
  }
  if (!context_reset_performed) {
    result.block_reasons.push('context_reset_performed must be true before recording issue bootstrap');
  }
  if (!project_hot_load_performed) {
    result.block_reasons.push('project_hot_load_performed must be true before recording issue bootstrap');
  }
  if (!issue_payload_attached) {
    result.block_reasons.push('issue_payload_attached must be true before recording issue bootstrap');
  }

  const projectResolution = await resolveGuardrailProjectTarget({
    commandName: 'agenticos_issue_bootstrap',
    repoPath: repo_path,
    projectPath: project_path,
  });
  result.active_project = projectResolution.activeProjectId;

  if (!projectResolution.targetProject) {
    result.block_reasons.push(...projectResolution.resolutionErrors);
  } else {
    result.target_project = {
      id: projectResolution.targetProject.id,
      name: projectResolution.targetProject.name,
      path: projectResolution.targetProject.path,
      state_path: projectResolution.targetProject.statePath,
      project_yaml_path: projectResolution.targetProject.projectYamlPath,
    };
  }

  let startupContextPaths: string[] = [];

  if (repo_path && result.target_project) {
    try {
      const gitWorktreeRoot = await runGit(repo_path, 'rev-parse --show-toplevel');
      const gitCommonDir = resolve(gitWorktreeRoot, await runGit(repo_path, 'rev-parse --git-common-dir'));
      const gitCommonRepoRoot = dirname(gitCommonDir);
      result.evidence.current_branch = await runGit(repo_path, 'rev-parse --abbrev-ref HEAD');
      result.evidence.workspace_type = await detectWorkspaceType(repo_path);

      const declaredSourceRepoRoots = projectResolution.targetProject?.sourceRepoRoots || [];
      const sourceRootsDeclared = projectResolution.targetProject?.sourceRepoRootsDeclared || false;
      if (!sourceRootsDeclared || declaredSourceRepoRoots.length === 0) {
        result.block_reasons.push(
          `target project "${projectResolution.targetProject?.id}" is missing execution.source_repo_roots in ${projectResolution.targetProject?.projectYamlPath}`,
        );
      } else if (!declaredSourceRepoRoots.includes(gitCommonRepoRoot)) {
        result.block_reasons.push(
          `git common repo root "${gitCommonRepoRoot}" is not declared for target project "${projectResolution.targetProject?.id}"`,
        );
      }

      const projectYaml = yaml.parse(await readFile(result.target_project.project_yaml_path, 'utf-8')) || {};
      const contextPaths = resolveManagedProjectContextPaths(result.target_project.path, projectYaml);
      startupContextPaths = [
        result.target_project.project_yaml_path,
        contextPaths.quickStartPath,
        contextPaths.statePath,
        join(result.target_project.path, 'AGENTS.md'),
        join(result.target_project.path, 'CLAUDE.md'),
      ].filter((path, index, all) => existsSync(path) && all.indexOf(path) === index);
      result.startup_context_paths = startupContextPaths;
      result.evidence.project_path = result.target_project.path;
    } catch (error) {
      result.block_reasons.push(error instanceof Error ? error.message : 'failed to resolve git or project startup context for issue bootstrap');
    }
  }

  if (result.startup_context_paths.length === 0 && result.target_project) {
    result.block_reasons.push('no startup context paths could be resolved for the target project');
  }

  if (result.block_reasons.length > 0) {
    result.status = 'BLOCK';
    result.summary = result.block_reasons[0];
    return JSON.stringify(result, null, 2);
  }

  result.status = 'RECORDED';
  result.summary = `issue bootstrap recorded for #${issue_id}`;
  result.persistence = await persistIssueBootstrapEvidence({
    repo_path,
    project_path: result.target_project?.path || project_path,
    payload: {
      issue_id,
      issue_title,
      issue_body: issue_body || null,
      labels: result.evidence.labels,
      linked_artifacts: result.evidence.linked_artifacts,
      startup_context_paths: startupContextPaths,
      additional_context: result.evidence.additional_context,
      repo_path,
      project_path: result.target_project?.path || project_path || null,
      current_branch: result.evidence.current_branch,
      workspace_type: result.evidence.workspace_type,
      stages: {
        context_reset_performed,
        project_hot_load_performed,
        issue_payload_attached,
      },
    },
  });

  return JSON.stringify(result, null, 2);
}
