interface ArchiveContract {
  version?: number;
  kind?: string;
  managed_project?: boolean;
  execution_mode?: string;
  replacement_project?: string;
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
