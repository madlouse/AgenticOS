export interface SessionProjectBinding {
  projectId: string;
  projectName: string;
  projectPath: string;
  boundAt: string;
}

let currentSessionProject: SessionProjectBinding | null = null;

export function bindSessionProject(binding: Omit<SessionProjectBinding, 'boundAt'> & { boundAt?: string }): SessionProjectBinding {
  currentSessionProject = {
    ...binding,
    boundAt: binding.boundAt || new Date().toISOString(),
  };
  return currentSessionProject;
}

export function getSessionProjectBinding(): SessionProjectBinding | null {
  return currentSessionProject;
}

export function clearSessionProjectBinding(): void {
  currentSessionProject = null;
}
