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
  agentType: 'claude-code' | 'codex' | 'other';
  instruction: string | null;
  instructionKind: 'current-session' | 'new-session' | 'manual-cd' | null;
  warning: string | null;
  observedMcpProcessPwd: string;
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
  // Must be absolute
  if (!isAbsolute(targetPath)) {
    return { valid: false, error: 'Path must be absolute' };
  }

  // Must not contain .. traversal - use normalize() to detect actual ..
  const normalized = normalize(targetPath);
  if (normalized.includes('..')) {
    return { valid: false, error: 'Path traversal (..) is not allowed' };
  }

  return { valid: true };
}

export function validatePathInAgenticosHome(targetPath: string): { valid: boolean; error?: string; warning?: string } {
  const home = getAgenticOSHome();

  // Must be absolute
  if (!isAbsolute(targetPath)) {
    return { valid: false, error: 'Path must be absolute' };
  }

  // Must not contain .. traversal
  const normalized = normalize(targetPath);
  if (normalized.includes('..')) {
    return { valid: false, error: 'Path traversal (..) is not allowed' };
  }

  // Advisory check: path should be under AGENTICOS_HOME
  if (!targetPath.startsWith(home)) {
    return { valid: true, warning: `Path is not under AGENTICOS_HOME (${home})` };
  }

  return { valid: true };
}

export function detectAgentType(): 'claude-code' | 'codex' | 'other' {
  if (process.env.CLAUDE_CODE !== undefined) return 'claude-code';
  if (
    process.env.CODEX !== undefined ||
    process.env.CODEX_CI !== undefined ||
    process.env.CODEX_THREAD_ID !== undefined ||
    process.env.CODEX_MANAGED_BY_NPM !== undefined
  ) return 'codex';
  return 'other';
}

export async function checkIsGitRepo(dirPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('git', ['-C', dirPath, 'rev-parse', '--git-dir'], (error) => {
      resolve(error === null);
    });
  });
}

export async function alignPwd(projectPath: string): Promise<PwdAlignmentResult> {
  const agentType = detectAgentType();
  const observedMcpProcessPwd = process.cwd();

  // Security check
  const security = validatePathSecurity(projectPath);
  if (!security.valid) {
    return {
      success: false,
      agentType,
      instruction: null,
      instructionKind: null,
      warning: `[WARN] PWD alignment skipped: ${security.error}`,
      observedMcpProcessPwd,
    };
  }

  // Advisory AGENTICOS_HOME check
  const homeSecurity = validatePathInAgenticosHome(projectPath);

  // Check if directory exists and is accessible
  if (!existsSync(projectPath)) {
    return {
      success: false,
      agentType,
      instruction: null,
      instructionKind: null,
      warning: '[WARN] PWD alignment skipped: target directory does not exist',
      observedMcpProcessPwd,
    };
  }

  let instruction: string | null = null;
  let instructionKind: PwdAlignmentResult['instructionKind'] = null;

  if (agentType === 'claude-code') {
    instruction = `cd ${projectPath}`;
    instructionKind = 'current-session';
  } else if (agentType === 'codex') {
    instruction = `codex -C ${projectPath}`;
    instructionKind = 'new-session';
  } else {
    instruction = `cd ${projectPath}`;
    instructionKind = 'manual-cd';
  }

  return {
    success: true,
    agentType,
    instruction,
    instructionKind,
    warning: homeSecurity.warning || null,
    observedMcpProcessPwd,
  };
}
