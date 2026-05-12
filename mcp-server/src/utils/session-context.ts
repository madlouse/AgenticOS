import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, isAbsolute } from 'path';
import yaml from 'yaml';
import { getAgenticOSHome } from './registry.js';

export interface SessionProjectBinding {
  projectId: string;
  projectName: string;
  projectPath: string;
  boundAt: string;
}

export interface SessionBindingRecord {
  projectId: string;
  projectName: string;
  projectPath: string;
  boundAt: string;
  sessionId: string;
}

export interface PwdAlignmentResult {
  success: boolean;
  instruction: string | null;
  warning: string | null;
}

let currentSessionProject: SessionProjectBinding | null = null;

export function bindSessionProject(
  binding: Omit<SessionProjectBinding, 'boundAt'> & { boundAt?: string },
  options?: { persist?: boolean; sessionId?: string }
): SessionProjectBinding {
  const fullBinding: SessionProjectBinding = {
    ...binding,
    boundAt: binding.boundAt || new Date().toISOString(),
  };

  currentSessionProject = fullBinding;

  // Async persistence is handled separately via bindSessionProjectAsync
  return fullBinding;
}

export async function bindSessionProjectAsync(
  binding: Omit<SessionProjectBinding, 'boundAt'> & { boundAt?: string },
  options?: { persist?: boolean; sessionId?: string }
): Promise<SessionProjectBinding> {
  const sessionId = options?.sessionId || 'default';
  const fullBinding: SessionProjectBinding = {
    ...binding,
    boundAt: binding.boundAt || new Date().toISOString(),
  };

  currentSessionProject = fullBinding;

  if (options?.persist !== false) {
    const record: SessionBindingRecord = {
      ...fullBinding,
      sessionId,
    };
    await writeSessionBindingAtomic(sessionId, record);
  }

  return fullBinding;
}

export function getSessionProjectBinding(): SessionProjectBinding | null {
  return currentSessionProject;
}

export function clearSessionProjectBinding(): void {
  currentSessionProject = null;
}

export function validatePathSecurity(targetPath: string): { valid: boolean; error?: string } {
  const home = getAgenticOSHome();

  // Must be absolute
  if (!isAbsolute(targetPath)) {
    return { valid: false, error: 'Path must be absolute' };
  }

  // Must be under AGENTICOS_HOME
  if (!targetPath.startsWith(home)) {
    return { valid: false, error: `Path must be under AGENTICOS_HOME (${home})` };
  }

  // Must not contain .. traversal
  const normalized = join(targetPath);
  if (normalized.includes('..')) {
    return { valid: false, error: 'Path traversal (..) is not allowed' };
  }

  return { valid: true };
}

async function writeSessionBindingAtomic(
  sessionId: string,
  binding: SessionBindingRecord
): Promise<void> {
  const sessionsDir = join(
    getAgenticOSHome(),
    '.agent-workspace',
    'sessions',
    sessionId
  );

  // Security check
  const security = validatePathSecurity(binding.projectPath);
  if (!security.valid) {
    throw new Error(`Security validation failed: ${security.error}`);
  }

  await mkdir(sessionsDir, { recursive: true });

  const filePath = join(sessionsDir, 'active-project');
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;

  await writeFile(tempPath, yaml.stringify(binding), 'utf-8');
  await rename(tempPath, filePath);
}

export async function getSessionBinding(sessionId: string): Promise<SessionBindingRecord | null> {
  const filePath = join(
    getAgenticOSHome(),
    '.agent-workspace',
    'sessions',
    sessionId,
    'active-project'
  );

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    return yaml.parse(content) as SessionBindingRecord;
  } catch {
    return null;
  }
}

export function detectAgentType(): 'claude-code' | 'codex' | 'other' {
  if (process.env.CLAUDE_CODE !== undefined) return 'claude-code';
  if (process.env.CODEX !== undefined) return 'codex';
  return 'other';
}

export async function checkIsGitRepo(dirPath: string): Promise<boolean> {
  const { execFile } = await import('child_process');
  return new Promise((resolve) => {
    execFile('git', ['-C', dirPath, 'rev-parse', '--git-dir'], (error) => {
      resolve(error === null);
    });
  });
}

export async function alignPwd(projectPath: string): Promise<PwdAlignmentResult> {
  // Security check
  const security = validatePathSecurity(projectPath);
  if (!security.valid) {
    return {
      success: false,
      instruction: null,
      warning: `[WARN] PWD alignment skipped: ${security.error}`,
    };
  }

  // Check if directory exists and is accessible
  if (!existsSync(projectPath)) {
    return {
      success: false,
      instruction: null,
      warning: '[WARN] PWD alignment skipped: target directory does not exist',
    };
  }

  // Generate agent-specific instruction
  const agentType = detectAgentType();
  const isGitRepo = await checkIsGitRepo(projectPath);

  let instruction: string | null = null;

  if (agentType === 'claude-code') {
    if (isGitRepo) {
      instruction = `EnterWorktree path="${projectPath}"`;
    } else {
      instruction = `cd ${projectPath}`;
    }
  } else if (agentType === 'codex') {
    instruction = `codex -C ${projectPath}`;
  } else {
    instruction = `cd ${projectPath}`;
  }

  return {
    success: true,
    instruction,
    warning: null,
  };
}
