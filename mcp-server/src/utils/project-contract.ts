interface ArchiveContract {
  version?: number;
  kind?: string;
  managed_project?: boolean;
  execution_mode?: string;
  replacement_project?: string;
}

export type ProjectTopology = 'local_directory_only' | 'github_versioned';
export type ContextPublicationPolicy = 'local_private' | 'private_continuity' | 'public_distilled';

interface SourceControlContract {
  topology?: ProjectTopology;
  context_publication_policy?: ContextPublicationPolicy;
  github_repo?: string;
  branch_strategy?: string;
}

export function isValidContextPublicationPolicy(value: unknown): value is ContextPublicationPolicy {
  return value === 'local_private' || value === 'private_continuity' || value === 'public_distilled';
}

export function validateContextPublicationPolicy(projectName: string, projectYaml: any): { ok: true; policy: ContextPublicationPolicy } | { ok: false; message: string } {
  const contract = getSourceControlContract(projectYaml);
  const topology = contract?.topology;
  const policy = contract?.context_publication_policy;

  if (topology !== 'local_directory_only' && topology !== 'github_versioned') {
    return {
      ok: false,
      message: `Project "${projectName}" must declare source_control.topology before validating source_control.context_publication_policy.`,
    };
  }

  if (!isValidContextPublicationPolicy(policy)) {
    return {
      ok: false,
      message: `Project "${projectName}" is missing source_control.context_publication_policy. Use "local_private", "private_continuity", or "public_distilled".`,
    };
  }

  if (topology === 'local_directory_only' && policy !== 'local_private') {
    return {
      ok: false,
      message: `Project "${projectName}" uses topology="local_directory_only" and must use source_control.context_publication_policy="local_private".`,
    };
  }

  if (topology === 'github_versioned' && policy === 'local_private') {
    return {
      ok: false,
      message: `Project "${projectName}" uses topology="github_versioned" and must use source_control.context_publication_policy="private_continuity" or "public_distilled".`,
    };
  }

  return { ok: true, policy };
}

export function getArchiveContract(projectYaml: any): ArchiveContract | null {
  const contract = projectYaml?.archive_contract;
  if (!contract || typeof contract !== 'object') {
    return null;
  }
  return contract as ArchiveContract;
}

export function isArchivedReferenceProject(projectYaml: any, registryStatus?: 'active' | 'archived'): boolean {
  const contract = getArchiveContract(projectYaml);
  if (registryStatus === 'archived') {
    return true;
  }
  if (!contract) {
    return false;
  }
  return contract.kind === 'archived_reference'
    || contract.managed_project === false
    || contract.execution_mode === 'reference_only';
}

export function buildArchivedReferenceMessage(projectName: string, replacementProject?: string): string {
  const suffix = replacementProject
    ? ` Use "${replacementProject}" instead.`
    : '';
  return `Project "${projectName}" is archived reference content, not an active managed project.${suffix}`;
}

export function getSourceControlContract(projectYaml: any): SourceControlContract | null {
  const contract = projectYaml?.source_control;
  if (!contract || typeof contract !== 'object') {
    return null;
  }
  return contract as SourceControlContract;
}

function getDeclaredSourceRepoRoots(projectYaml: any): string[] {
  if (!Array.isArray(projectYaml?.execution?.source_repo_roots)) {
    return [];
  }

  return projectYaml.execution.source_repo_roots
    .filter((item: unknown): item is string => typeof item === 'string')
    .map((item: string) => item.trim())
    .filter((item: string) => item.length > 0);
}

export function buildProjectTopologyInitializationMessage(projectName: string): string {
  return `Project "${projectName}" has not completed source-control topology initialization. Re-run agenticos_init for this project with normalize_existing=true and topology="local_directory_only", or normalize_existing=true, topology="github_versioned", and github_repo="OWNER/REPO".`;
}

export function validateManagedProjectTopology(projectName: string, projectYaml: any): { ok: true; topology: ProjectTopology } | { ok: false; message: string } {
  const contract = getSourceControlContract(projectYaml);
  const topology = contract?.topology;

  if (!topology) {
    return {
      ok: false,
      message: buildProjectTopologyInitializationMessage(projectName),
    };
  }

  if (topology === 'local_directory_only') {
    return { ok: true, topology };
  }

  if (topology === 'github_versioned') {
    if (!contract?.github_repo || contract.github_repo.trim().length === 0) {
      return {
        ok: false,
        message: `Project "${projectName}" is marked github_versioned but missing source_control.github_repo. Re-run agenticos_init with normalize_existing=true, topology="github_versioned", and github_repo="OWNER/REPO".`,
      };
    }

    if (contract.branch_strategy !== 'github_flow') {
      return {
        ok: false,
        message: `Project "${projectName}" is marked github_versioned but missing source_control.branch_strategy="github_flow". Re-run agenticos_init with normalize_existing=true and topology="github_versioned" to normalize the project for GitHub Flow.`,
      };
    }

    if (getDeclaredSourceRepoRoots(projectYaml).length === 0) {
      return {
        ok: false,
        message: `Project "${projectName}" is marked github_versioned but missing execution.source_repo_roots. Re-run agenticos_init with normalize_existing=true and topology="github_versioned" to write the required repo binding.`,
      };
    }

    return { ok: true, topology };
  }

  return {
    ok: false,
    message: `Project "${projectName}" declares unsupported source_control.topology "${String(topology)}". Supported values are "local_directory_only" and "github_versioned".`,
  };
}
