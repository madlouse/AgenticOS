// Shared YAML schema interfaces for AgenticOS configuration files.
// These represent the actual shape of .project.yaml and standards/.context/state.yaml.

import type { GuardrailCommand } from './guardrail-evidence.js';

export interface PreflightResult {
  command?: string;
  recorded_at?: string;
  repo_path?: string;
  issue_id?: string | null;
  target_project_id?: string | null;
  active_project?: string | null;
  git_common_repo_root?: string | null;
  git_remote_origin?: string | null;
  remote_base_branch?: string;
  declared_target_files?: string[];
  expected_issue_scope?: string;
  result?: {
    status?: string;
    summary?: string;
    issue_id?: string | null;
    declared_target_files?: string[];
    commit_count?: number;
    changed_files?: string[];
    runtime_managed_files?: string[];
    private_raw_transcript_files?: string[];
    unexpected_files?: string[];
    unrelated_commit_subjects?: string[];
    branch_ancestry_verified?: boolean;
    remote_base_branch?: string;
    branch_fork_point?: string;
    expected_issue_scope?: string;
    block_reasons?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ProjectYamlMeta {
  name?: string;
  id?: string;
  description?: string;
  created?: string;
  version?: string;
}

export interface ProjectYamlSourceControl {
  topology?: 'local_directory_only' | 'github_versioned';
  context_publication_policy?: 'local_private' | 'private_continuity' | 'public_distilled';
  github_repo?: string;
  branch_strategy?: string;
}

export interface ProjectYamlAgentContext {
  quick_start?: string;
  current_state?: string;
  conversations?: string;
  last_record_marker?: string;
  knowledge?: string;
  tasks?: string;
  artifacts?: string;
  [key: string]: unknown;
}

export interface ProjectYamlMemoryContract {
  version?: number;
  quick_start_role?: string;
  state_role?: string;
  conversations_role?: string;
  knowledge_role?: string;
  tasks_role?: string;
  artifacts_role?: string;
  [key: string]: unknown;
}

export interface ProjectYamlStatus {
  phase?: string;
  last_updated?: string;
  next_action?: string;
  [key: string]: unknown;
}

export interface ProjectYamlExecution {
  source_repo_roots?: string[];
  [key: string]: unknown;
}

export interface ProjectYamlArchiveContract {
  version?: number;
  kind?: string;
  managed_project?: boolean;
  execution_mode?: string;
  replacement_project?: string;
  [key: string]: unknown;
}

export interface ProjectYamlIssueBootstrapRecord {
  updated_at?: string;
  latest?: {
    issue_id?: string;
    issue_title?: string;
    issue_body?: string;
    labels?: string[];
    linked_artifacts?: string[];
    startup_context_paths?: string[];
    additional_context?: Array<{ path: string; reason: string }>;
    repo_path?: string | null;
    project_path?: string | null;
    current_branch?: string | null;
    workspace_type?: 'main' | 'isolated_worktree' | null;
    stages?: {
      context_reset_performed?: boolean;
      project_hot_load_performed?: boolean;
      issue_payload_attached?: boolean;
    };
    recorded_at?: string;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

export interface ProjectYamlEntrySurfaceRefresh {
  refreshed_at?: string;
  issue_id?: string | null;
  summary?: string;
  status?: string;
  current_focus?: string;
  report_paths?: string[];
  recommended_entry_documents?: string[];
  [key: string]: unknown;
}

/** The full shape of a .project.yaml file. */
export interface ProjectYamlSchema {
  meta?: ProjectYamlMeta;
  source_control?: ProjectYamlSourceControl;
  agent_context?: ProjectYamlAgentContext;
  memory_contract?: ProjectYamlMemoryContract;
  status?: ProjectYamlStatus;
  execution?: ProjectYamlExecution;
  archive_contract?: ProjectYamlArchiveContract;
  issue_bootstrap?: ProjectYamlIssueBootstrapRecord;
  entry_surface_refresh?: ProjectYamlEntrySurfaceRefresh;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// State YAML schema
// ---------------------------------------------------------------------------

export interface StateYamlSession {
  id?: string;
  started?: string;
  agent?: string;
  last_backup?: string;
  last_entry_surface_refresh?: string;
  [key: string]: unknown;
}

export interface StateYamlWorkingMemory {
  facts?: string[];
  decisions?: string[];
  pending?: string[];
  [key: string]: unknown;
}

export interface StateYamlCurrentTask {
  title?: string;
  status?: string;
  next_step?: string;
  updated?: string;
  [key: string]: unknown;
}

export interface StateYamlLoadedContext extends Array<string> {}

export interface StateYamlIssueBootstrapState {
  updated_at?: string;
  latest?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface StateYamlGuardrailEvidenceState {
  updated_at?: string;
  last_command?: GuardrailCommand;
  preflight?: PreflightResult;
  branch_bootstrap?: Record<string, unknown>;
  pr_scope_check?: Record<string, unknown>;
  [key: string]: unknown;
}

/** The full shape of a standards/.context/state.yaml file. */
export interface StateYamlSchema {
  issue_bootstrap?: StateYamlIssueBootstrapState;
  working_memory?: StateYamlWorkingMemory;
  session?: StateYamlSession;
  current_task?: StateYamlCurrentTask;
  loaded_context?: StateYamlLoadedContext;
  guardrail_evidence?: StateYamlGuardrailEvidenceState;
  entry_surface_refresh?: ProjectYamlEntrySurfaceRefresh;
  [key: string]: unknown;
}
