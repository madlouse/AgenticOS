import { existsSync } from 'fs';
import { isAbsolute, normalize, relative } from 'path';
import { execFile } from 'child_process';
import { getAgenticOSHome } from './registry.js';

export interface SessionProjectBinding {
  projectId: string;
  projectName: string;
  projectPath: string;
  boundAt: string;
}

export interface SessionOriginContext {
  cwd: string | null;
  source: 'agent-input' | 'mcp-process' | 'unknown';
  capturedAt: string;
  warning: string | null;
}

export interface SessionContextState {
  activeProject: SessionProjectBinding | null;
  previousProject: SessionProjectBinding | null;
  origin: SessionOriginContext | null;
  expectedWorkdir: string | null;
  switchedOutAt: string | null;
}

export interface SwitchOutSessionResult {
  hadActiveProject: boolean;
  exitedProject: SessionProjectBinding | null;
  previousProject: SessionProjectBinding | null;
  origin: SessionOriginContext | null;
  targetWorkdir: string | null;
}

export interface PwdAlignmentResult {
  success: boolean;
  agentType: 'claude-code' | 'codex' | 'other';
  instruction: string | null;
  instructionKind: 'per-call' | 'new-session' | 'manual-cd' | null;
  warning: string | null;
  observedMcpProcessPwd: string;
}

let currentSessionProject: SessionProjectBinding | null = null;
let previousSessionProject: SessionProjectBinding | null = null;
let sessionOriginContext: SessionOriginContext | null = null;
let expectedSessionWorkdir: string | null = null;
let sessionSwitchedOutAt: string | null = null;

function captureOriginContext(originCwd?: string | null): SessionOriginContext {
  const capturedAt = new Date().toISOString();
  const trimmedOrigin = typeof originCwd === 'string' ? originCwd.trim() : '';
  const candidate = trimmedOrigin || process.cwd();
  const source: SessionOriginContext['source'] = trimmedOrigin ? 'agent-input' : 'mcp-process';
  const validation = validatePathSecurity(candidate);

  return {
    cwd: validation.valid ? candidate : null,
    source: validation.valid ? source : 'unknown',
    capturedAt,
    warning: validation.valid ? null : validation.error!,
  };
}

export function bindSessionProject(
  binding: Omit<SessionProjectBinding, 'boundAt'> & { boundAt?: string },
  options: { originCwd?: string | null } = {},
): SessionProjectBinding {
  const fullBinding: SessionProjectBinding = {
    ...binding,
    boundAt: binding.boundAt || new Date().toISOString(),
  };

  if (!sessionOriginContext) {
    sessionOriginContext = captureOriginContext(options.originCwd);
  }
  previousSessionProject = currentSessionProject;
  currentSessionProject = fullBinding;
  expectedSessionWorkdir = fullBinding.projectPath;
  sessionSwitchedOutAt = null;
  return fullBinding;
}

export function getSessionProjectBinding(): SessionProjectBinding | null {
  return currentSessionProject;
}

export function getSessionContextState(): SessionContextState {
  return {
    activeProject: currentSessionProject,
    previousProject: previousSessionProject,
    origin: sessionOriginContext,
    expectedWorkdir: expectedSessionWorkdir,
    switchedOutAt: sessionSwitchedOutAt,
  };
}

export function switchOutSessionProject(): SwitchOutSessionResult {
  const exitedProject = currentSessionProject;
  const result: SwitchOutSessionResult = {
    hadActiveProject: currentSessionProject !== null,
    exitedProject,
    previousProject: previousSessionProject,
    origin: sessionOriginContext,
    targetWorkdir: sessionOriginContext?.cwd || null,
  };

  currentSessionProject = null;
  previousSessionProject = null;
  expectedSessionWorkdir = result.targetWorkdir;
  sessionSwitchedOutAt = new Date().toISOString();
  return result;
}

export function clearSessionProjectBinding(): void {
  currentSessionProject = null;
  previousSessionProject = null;
  sessionOriginContext = null;
  expectedSessionWorkdir = null;
  sessionSwitchedOutAt = null;
}

export function containsControlCharacters(value: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(value);
}

export function validatePathSecurity(targetPath: string): { valid: boolean; error?: string } {
  if (containsControlCharacters(targetPath)) {
    return { valid: false, error: 'Path must not contain control characters' };
  }

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

  if (containsControlCharacters(targetPath)) {
    return { valid: false, error: 'Path must not contain control characters' };
  }

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
  const relativeToHome = relative(home, targetPath);
  const isInsideHome = relativeToHome === '' || (!relativeToHome.startsWith('..') && !isAbsolute(relativeToHome));
  if (!isInsideHome) {
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

export function shellQuote(value: string): string {
  if (value.length === 0) return "''";
  return `'${value.replace(/'/g, "'\\''")}'`;
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
  const quotedProjectPath = shellQuote(projectPath);

  if (agentType === 'claude-code') {
    instruction = `cd ${quotedProjectPath} && <command>`;
    instructionKind = 'per-call';
  } else if (agentType === 'codex') {
    instruction = `codex -C ${quotedProjectPath}`;
    instructionKind = 'new-session';
  } else {
    instruction = `cd ${quotedProjectPath}`;
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
