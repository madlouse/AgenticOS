import { mkdir, readFile, rename, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join, isAbsolute, normalize } from 'path';
import { execFile } from 'child_process';
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

function getSessionLockPath(sessionId: string): string {
  return join(getAgenticOSHome(), '.agent-workspace', 'sessions', `${sessionId}.lock`);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withSessionLock<T>(sessionId: string, callback: () => Promise<T>): Promise<T> {
  const lockPath = getSessionLockPath(sessionId);

  let locked = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await mkdir(lockPath);
      locked = true;
      break;
    } catch {
      await sleep(10);
    }
  }

  if (!locked) {
    throw new Error(`failed to acquire session lock for ${sessionId}`);
  }

  try {
    return await callback();
  } finally {
    // Clean up lock - ignore errors since lock cleanup is best-effort
    try {
      await rm(lockPath, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  }
}

async function writeSessionBindingAtomic(
  sessionId: string,
  binding: SessionBindingRecord
): Promise<void> {
  // Security check - AGENTICOS_HOME required for session binding
  const security = validatePathInAgenticosHome(binding.projectPath);
  if (!security.valid) {
    throw new Error(`Security validation failed: ${security.error}`);
  }

  await withSessionLock(sessionId, async () => {
    const sessionsDir = join(
      getAgenticOSHome(),
      '.agent-workspace',
      'sessions',
      sessionId
    );

    await mkdir(sessionsDir, { recursive: true });

    const filePath = join(sessionsDir, 'active-project');
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;

    try {
      await writeFile(tempPath, yaml.stringify(binding), 'utf-8');
      await rename(tempPath, filePath);
    } catch (error) {
      // Clean up temp file on failure - best effort
      try { await rm(tempPath, { force: true }); } catch { /* ignore */ }
      throw error;
    }
  });
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

  // Generate agent-specific instruction
  const isGitRepo = await checkIsGitRepo(projectPath);

  let instruction: string | null = null;
  let instructionKind: PwdAlignmentResult['instructionKind'] = null;

  if (agentType === 'claude-code') {
    if (isGitRepo) {
      instruction = `EnterWorktree path="${projectPath}"`;
      instructionKind = 'current-session';
    } else {
      instruction = `cd ${projectPath}`;
      instructionKind = 'manual-cd';
    }
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
