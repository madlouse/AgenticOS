import { existsSync } from 'fs';
import { isAbsolute, normalize } from 'path';
import { execFile } from 'child_process';
import { getAgenticOSHome } from './registry.js';

export interface SessionProjectBinding {
  projectId: string;
  projectName: string;
  projectPath: string;
  boundAt: string;
}

export interface PwdAlignmentResult {
  success: boolean;
  instruction: string | null;
  warning: string | null;
}

let currentSessionProject: SessionProjectBinding | null = null;

export function bindSessionProject(
  binding: Omit<SessionProjectBinding, 'boundAt'> & { boundAt?: string }
): SessionProjectBinding {
  const fullBinding: SessionProjectBinding = {
    ...binding,
    boundAt: binding.boundAt || new Date().toISOString(),
  };

  currentSessionProject = fullBinding;
  return fullBinding;
}

export function getSessionProjectBinding(): SessionProjectBinding | null {
  return currentSessionProject;
}

export function clearSessionProjectBinding(): void {
  currentSessionProject = null;
}

export function validatePathSecurity(targetPath: string): { valid: boolean; error?: string } {
  if (!isAbsolute(targetPath)) {
    return { valid: false, error: 'Path must be absolute' };
  }

  const normalized = normalize(targetPath);
  if (normalized.includes('..')) {
    return { valid: false, error: 'Path traversal (..) is not allowed' };
  }

  return { valid: true };
}

export function validatePathInAgenticosHome(targetPath: string): { valid: boolean; error?: string; warning?: string } {
  const home = getAgenticOSHome();

  if (!isAbsolute(targetPath)) {
    return { valid: false, error: 'Path must be absolute' };
  }

  const normalized = normalize(targetPath);
  if (normalized.includes('..')) {
    return { valid: false, error: 'Path traversal (..) is not allowed' };
  }

  if (!targetPath.startsWith(home)) {
    return { valid: true, warning: `Path is not under AGENTICOS_HOME (${home})` };
  }

  return { valid: true };
}

export function detectAgentType(): 'claude-code' | 'codex' | 'other' {
  if (process.env.CLAUDE_CODE !== undefined) return 'claude-code';
  if (process.env.CODEX !== undefined) return 'codex';
  return 'other';
}

export async function checkIsGitRepo(dirPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('git', ['-C', dirPath, 'rev-parse', '--git-dir'], (error) => {
      resolve(error === null);
    });
  });
}

async function verifyDirectoryAccessible(dirPath: string): Promise<boolean> {
  // Verify the directory exists and is accessible by running pwd in a subshell
  return new Promise((resolve) => {
    execFile('sh', ['-c', `cd "${dirPath}" && pwd`], (error, stdout) => {
      if (error) {
        resolve(false);
      } else {
        const verifiedPwd = stdout.trim();
        resolve(verifiedPwd === dirPath);
      }
    });
  });
}

export async function alignPwd(projectPath: string): Promise<PwdAlignmentResult> {
  const security = validatePathSecurity(projectPath);
  if (!security.valid) {
    return {
      success: false,
      instruction: null,
      warning: `[WARN] PWD alignment skipped: ${security.error}`,
    };
  }

  const homeSecurity = validatePathInAgenticosHome(projectPath);

  if (!existsSync(projectPath)) {
    return {
      success: false,
      instruction: null,
      warning: '[WARN] PWD alignment skipped: target directory does not exist',
    };
  }

  const agentType = detectAgentType();

  let instruction: string | null = null;
  if (agentType === 'claude-code') {
    // Direct cd approach - more reliably executed by LLM/agent
    instruction = `cd ${projectPath} && claude`;
  } else if (agentType === 'codex') {
    instruction = `codex -C ${projectPath}`;
  } else {
    instruction = `cd ${projectPath}`;
  }

  // Verify directory is accessible (subshell cd succeeds)
  const accessible = await verifyDirectoryAccessible(projectPath);

  if (accessible) {
    return {
      success: true,
      instruction,
      warning: homeSecurity.warning || null,
    };
  }

  // Directory not accessible
  return {
    success: false,
    instruction,
    warning: `[WARN] PWD alignment failed. Directory not accessible: ${projectPath}. Please run: ${instruction}`,
  };
}